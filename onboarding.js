// Añadir series por ID + defaults iniciales
(() => {
  const $ = s => document.querySelector(s);
  const say = t => { const m = $("#msg"); if (m) m.textContent = t || ""; };

  // Series por default (solo se aplican si no existe nada guardado)
  const defaultSeries = [
    {
      id: "SF43783",
      title: "TIIE a 28 días (%)",
      type: "percent",
      currency: "MXN",
      decimals: 4
    },
    {
      id: "SF43718",
      title: "Tipo de cambio Pesos por dólar (FIX)",
      type: "currency",
      currency: "MXN",
      decimals: 4
    }
  ];

  // Carga inicial + defaults
  chrome.storage.local.get(["sieToken", "sieSeries"], ({ sieToken = "", sieSeries = [] }) => {
    $("#token").value = sieToken;

    // Si no hay series guardadas, insertamos las default
    if (!Array.isArray(sieSeries) || sieSeries.length === 0) {
      chrome.storage.local.set({ sieSeries: defaultSeries }, () => {
        renderSelected(defaultSeries);
      });
    } else {
      renderSelected(sieSeries);
    }
  });

  // === El resto del código queda igual ===
  $("#save")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    await chrome.storage.local.set({ sieToken: t });
    say(t ? "Token guardado." : "Token borrado.");
  });

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

  $("#open")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  });

  $("#addById")?.addEventListener("click", async () => {
    const id = $("#seriesId").value.trim().toUpperCase();
    const type = $("#seriesType").value;
    const currency = $("#seriesCurrency").value.trim().toUpperCase() || undefined;
    const decimals = Number($("#seriesDecimals").value);
    if (!/^S[FH]\d{3,}$/.test(id)) { say("ID inválido. Formato: SFxxxxx."); return; }

    const st = await chrome.storage.local.get(["sieToken", "sieSeries"]);
    const list = Array.isArray(st.sieSeries) ? st.sieSeries : [];
    if (list.find(s => s.id === id)) { say("Ya está en la lista."); return; }

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
      const x = document.createElement("button"); x.className = "chip-x"; x.textContent = "×";
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
