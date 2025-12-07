// onboarding.js – versión final con edición manual efectiva
(() => {
  const $ = s => document.querySelector(s);
  const say = t => { const m = $("#msg"); if (m) m.textContent = t || ""; };

  const defaultSeries = [
    { id: "SF43783", title: "TIIE a 28 días (%)", type: "percent", currency: "MXN", decimals: 4, periodicity: "Diaria", figure: "Sin tipo" },
    { id: "SF43718", title: "Tipo de cambio Pesos por dólar (FIX)", type: "currency", currency: "MXN", decimals: 4, periodicity: "Diaria", figure: "Sin tipo" }
  ];

  function updateFormatControls(forceManual = false) {
    const hasToken = !!$("#token").value.trim();
    if (forceManual || !hasToken) {
      $("#manualFormat").style.display = "flex";
      $("#autoFormatNote").style.display = "none";
      $("#manualFormatNote").style.display = "block";
    } else {
      $("#manualFormat").style.display = "none";
      $("#autoFormatNote").style.display = "block";
      $("#manualFormatNote").style.display = "none";
    }
  }

  chrome.storage.local.get(["sieToken", "sieSeries"], ({ sieToken = "", sieSeries = [] }) => {
    $("#token").value = sieToken;
    updateFormatControls();

    if (!Array.isArray(sieSeries) || sieSeries.length === 0) {
      chrome.storage.local.set({ sieSeries: defaultSeries }, () => renderSelected(defaultSeries));
    } else {
      renderSelected(sieSeries);
    }
  });

  $("#save")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    await chrome.storage.local.set({ sieToken: t });
    say(t ? "Token guardado." : "Token borrado.");
    updateFormatControls();
  });

  $("#test")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    if (!t) { say("Ingresa un token SIE."); return; }
    say("Probando token…");
    try {
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store" });
      say(r.ok ? "Token válido." : `HTTP ${r.status}`);
    } catch (e) { say(`Error: ${e.message}`); }
  });

  $("#open")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  });

  $("#addById")?.addEventListener("click", async () => {
    const id = $("#seriesId").value.trim().toUpperCase();
    if (!/^S[FPGHLMNRST]\d{3,}$/i.test(id)) {
      say("ID inválido. Ejemplos: SF43718, SL11298, SG25…");
      return;
    }

    const st = await chrome.storage.local.get(["sieToken", "sieSeries"]);
    let list = Array.isArray(st.sieSeries) ? st.sieSeries : [];
    const existingIndex = list.findIndex(s => s.id === id);
    const isEdit = existingIndex !== -1;

    let title = id;
    let type = "number";
    let currency = undefined;
    let decimals = 2;
    let periodicity = "Desconocida";
    let figure = "Sin tipo";
    const hasToken = !!st.sieToken?.trim();
    const isManual = $("#manualFormat").style.display.includes("flex");

    if (hasToken && !isEdit && !isManual) {
      try {
        const metaUrl = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${id}?mediaType=json&token=${encodeURIComponent(st.sieToken)}`;
        const metaRes = await fetch(metaUrl, { cache: "no-store" });
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          const serie = metaJson?.bmx?.series?.[0];
          if (serie) {
            title = serie.titulo || id;
            periodicity = serie.periodicidad || "Desconocida";
            figure = serie.cifra || "Sin tipo";

            const texto = `${(serie.unidad || "")} ${(serie.cifra || "")}`.toLowerCase();

            if (texto.includes("porcentaje") || texto.includes("por ciento") || texto.includes("%")) {
              type = "percent";
              decimals = 4;
            } else if (texto.includes("pesos") || texto.includes("dólares") || texto.includes("millones") || texto.includes("miles")) {
              type = "currency";
              currency = texto.includes("dólares") ? "USD" : "MXN";
              decimals = texto.includes("miles") || texto.includes("millones") ? 0 : 2;
            } else if (texto.includes("índice") || texto.includes("udis")) {
              type = "number";
              decimals = 4;
            } else {
              type = "number";
              decimals = 2;
            }
          }
        }
      } catch (e) { /* silencioso */ }
    } else {
      type = $("#seriesType").value;
      currency = $("#seriesCurrency").value.trim().toUpperCase() || undefined;
      decimals = Number($("#seriesDecimals").value) || 2;
      if (isEdit) {
        title = list[existingIndex].title;
        periodicity = list[existingIndex].periodicity;
        figure = list[existingIndex].figure;
      }
    }

    const item = { id, title, type, currency, decimals, periodicity, figure };

    if (isEdit) {
      list[existingIndex] = item;
      say("Serie actualizada.");
    } else {
      list.push(item);
      say(isManual ? "Serie añadida manualmente." : "Serie añadida con metadatos automáticos.");
    }

    await chrome.storage.local.set({ sieSeries: list });
    renderSelected(list);
    $("#seriesId").value = "";
    $("#seriesType").value = "number";
    $("#seriesCurrency").value = "";
    $("#seriesDecimals").value = "2";
  });

  $("#saveSel")?.addEventListener("click", () => say("Selección guardada."));

  function renderSelected(list) {
    const box = $("#selected");
    box.innerHTML = "";
    if (!list?.length) {
      box.innerHTML = `<span class="row-sub">Aún no tienes series seleccionadas.</span>`;
    } else {
      const wrap = document.createElement("div");
      wrap.className = "chips";
      for (const s of list) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = `${s.title} (${s.id})`;
        const editBtn = document.createElement("button");
        editBtn.className = "chip-x";
        editBtn.textContent = "✎";
        editBtn.title = "Editar formato";
        editBtn.addEventListener("click", () => {
          $("#seriesId").value = s.id;
          $("#seriesType").value = s.type || "number";
          $("#seriesCurrency").value = s.currency || "";
          $("#seriesDecimals").value = s.decimals ?? 2;
          updateFormatControls(true);  // Fuerza modo manual
          say("Edita los valores y presiona Añadir para guardar cambios.");
        });
        const x = document.createElement("button");
        x.className = "chip-x";
        x.textContent = "×";
        x.addEventListener("click", async () => {
          const st = await chrome.storage.local.get("sieSeries");
          const next = (st.sieSeries || []).filter(v => v.id !== s.id);
          await chrome.storage.local.set({ sieSeries: next });
          renderSelected(next);
        });
        chip.appendChild(editBtn);
        chip.appendChild(x);
        wrap.appendChild(chip);
      }
      box.appendChild(wrap);
    }

    // Preview
    const prev = $("#preview");
    prev.innerHTML = "";
    if (!list?.length) {
      prev.innerHTML = `<tr><td colspan="3"><span class="row-sub">Sin series</span></td></tr>`;
      return;
    }
    const ejemplo = 12345.67;
    for (const s of list) {
      let valEj = ejemplo.toLocaleString("es-MX", {minimumFractionDigits: s.decimals ?? 2, maximumFractionDigits: s.decimals ?? 2});
      if (s.type === "currency") {
        valEj = ejemplo.toLocaleString("es-MX", {style: "currency", currency: s.currency || "MXN", minimumFractionDigits: s.decimals ?? 2, maximumFractionDigits: s.decimals ?? 2});
      } else if (s.type === "percent") {
        valEj = (ejemplo / 100).toLocaleString("es-MX", {style: "percent", minimumFractionDigits: s.decimals ?? 2, maximumFractionDigits: s.decimals ?? 2});
      }
      const fechaEj = s.periodicity?.toLowerCase().includes("mensual") ? "Dic 2025" : "08/12/2025";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${s.title} (${s.id})</td><td>${valEj}</td><td>${fechaEj}</td>`;
      prev.appendChild(tr);
    }
  }
})();