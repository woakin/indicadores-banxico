// Añadir series por ID, sin catálogo. Valida con token si está disponible.
(() => {
  const $ = s => document.querySelector(s);
  const say = t => { const m = $("#msg"); if (m) m.textContent = t || ""; };

  // Carga inicial
  chrome.storage.local.get(["sieToken","sieSeries"], ({ sieToken="", sieSeries=[] }) => {
    $("#token").value = sieToken;
    renderSelected(sieSeries);
  });

  // Guardar token
  $("#save")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    await chrome.storage.local.set({ sieToken: t });
    say(t ? "Token guardado." : "Token borrado.");
  });

  // Probar token con FIX oportuno y token en query (evita preflight)
  $("#test")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    if (!t) { say("Ingresa un token SIE."); return; }
    say("Probando token…");
    try {
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store", redirect: "follow" });
      say(r.ok ? "Token válido." : `HTTP ${r.status}`);
    } catch (e) { say(`Error: ${e.message}`); }
  });

  // Abrir popup
  $("#open")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  });

  // Añadir por ID
  $("#addById")?.addEventListener("click", async () => {
    const id = $("#seriesId").value.trim().toUpperCase();
    const type = $("#seriesType").value;
    const currency = $("#seriesCurrency").value.trim().toUpperCase() || undefined;
    const decimals = Number($("#seriesDecimals").value);

    if (!/^S[FH]\d{3,}$/.test(id)) { say("ID inválido. Formato: SFxxxxx."); return; }

    // lee existentes
    const st = await chrome.storage.local.get(["sieToken","sieSeries"]);
    const list = Array.isArray(st.sieSeries) ? st.sieSeries : [];
    if (list.find(s => s.id === id)) { say("Ya está en la lista."); return; }

    // si hay token, intenta obtener título oficial
    let title = id;
    if (st.sieToken) {
      try {
        const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${id}/datos/oportuno?mediaType=json&token=${encodeURIComponent(st.sieToken)}`;
        const r = await fetch(url, { cache: "no-store", redirect: "follow" });
        if (r.ok) {
          const j = await r.json();
          title = j?.bmx?.series?.[0]?.titulo || j?.bmx?.series?.[0]?.idSerie || id;
        }
      } catch { /* silencioso */ }
    }

    const item = { id, title, type, currency, decimals: Number.isFinite(decimals) ? decimals : 2 };
    const next = [...list, item];
    await chrome.storage.local.set({ sieSeries: next });
    renderSelected(next);
    say("Serie añadida.");
    $("#seriesId").value = "";
  });

  // Guardar selección (confirmación visual; ya se persiste al añadir/quitar)
  $("#saveSel")?.addEventListener("click", () => say("Selección guardada."));

  function renderSelected(list) {
    const box = $("#selected"); box.innerHTML = "";
    if (!list?.length) {
      box.innerHTML = `<span class="row-sub">Aún no tienes series seleccionadas.</span>`;
      return;
    }
    const wrap = document.createElement("div"); wrap.className = "chips";
    for (const s of list) {
      const chip = document.createElement("span"); chip.className = "chip";
      chip.textContent = `${s.title} (${s.id})`;
      const x = document.createElement("button"); x.className="chip-x"; x.textContent="×";
      x.addEventListener("click", async () => {
        const st = await chrome.storage.local.get("sieSeries");
        const next = (st.sieSeries || []).filter(v => v.id !== s.id);
        await chrome.storage.local.set({ sieSeries: next });
        renderSelected(next);
      });
      chip.appendChild(x);
      wrap.appendChild(chip);
    }
    box.appendChild(wrap);
  }
})();
