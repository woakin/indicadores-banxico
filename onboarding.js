import { DEFAULT_SERIES, SERIES_ID_REGEX, BANXICO_API_BASE, ALPHAVANTAGE_API_BASE, INEGI_API_BASE, AV_CATALOG, INEGI_CATALOG } from './constants.js';

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // --- State ---
  let activeProvider = "banxico";
  let sieToken = "";
  let avToken = "";
  let inegiToken = "";
  let sieSeries = [];
  let editingIndex = null;

  // --- UI Helpers ---
  const updateGlobalMsg = (txt) => { const el = $("#globalMsg"); if (el) el.textContent = txt || ""; };

  function setLock(provider, isLocked) {
    const ops = $(`#${provider}Ops`);
    const status = $(`#status${provider.charAt(0).toUpperCase() + provider.slice(1)}`);
    if (ops) ops.classList.toggle("locked", isLocked);
    if (status) status.classList.toggle("online", !isLocked);
  }

  function switchProvider(brand) {
    activeProvider = brand;
    $$(".nav-link").forEach(l => l.classList.remove("active"));
    $(`.nav-link[data-provider="${brand}"]`)?.classList.add("active");

    $$(".provider-view").forEach(v => v.classList.add("hidden"));
    $(`#view${brand.charAt(0).toUpperCase() + brand.slice(1)}`)?.classList.remove("hidden");

    const titles = { banxico: "Banxico (México)", av: "Alpha Vantage (Global)", inegi: "INEGI (Estadísticas)" };
    $("#providerTitle").textContent = titles[brand] || "Configuración";
  }

  // --- Initialization ---
  chrome.storage.local.get(["sieToken", "avToken", "inegiToken", "sieSeries"], (data) => {
    sieToken = data.sieToken || "";
    avToken = data.avToken || "";
    inegiToken = data.inegiToken || "";
    sieSeries = data.sieSeries || [];

    // Fill inputs
    if ($("#token")) $("#token").value = sieToken;
    if ($("#avToken")) $("#avToken").value = avToken;
    if ($("#inegiToken")) $("#inegiToken").value = inegiToken;

    // Set locked states
    setLock("banxico", !sieToken);
    setLock("av", !avToken);
    setLock("inegi", !inegiToken);

    // Initial render
    if (sieSeries.length === 0) {
      sieSeries = DEFAULT_SERIES;
      chrome.storage.local.set({ sieSeries });
    }
    renderSelected(sieSeries);
    renderAvCatalog();
    renderInegiCatalog();
  });

  // --- Sidebar Events ---
  $$(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      const p = e.currentTarget.getAttribute("data-provider");
      if (p) switchProvider(p);
    });
  });

  // --- Connection Logic (Banxico) ---
  $("#testSie")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    const msg = $("#msgSie");
    if (!t) { msg.textContent = "⚠️ Ingresa un token."; return; }
    msg.textContent = "⏳ Probando...";
    try {
      const url = `${BANXICO_API_BASE}/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        msg.textContent = "✅ Conexión exitosa.";
        setLock("banxico", false);
      } else {
        msg.textContent = `❌ Error ${r.status}`;
      }
    } catch (e) { msg.textContent = "❌ Error de red."; }
  });

  $("#saveBanxico")?.addEventListener("click", async () => {
    sieToken = $("#token").value.trim();
    await chrome.storage.local.set({ sieToken });
    setLock("banxico", !sieToken);
    updateGlobalMsg("Configuración de Banxico guardada.");
  });

  // --- Connection Logic (AV) ---
  $("#testAv")?.addEventListener("click", async () => {
    const t = $("#avToken").value.trim();
    const msg = $("#msgAv");
    if (!t) { msg.textContent = "⚠️ Ingresa una Key."; return; }
    msg.textContent = "⏳ Probando...";
    try {
      const url = `${ALPHAVANTAGE_API_BASE}?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store" });
      const json = await r.json();
      if (json["Error Message"]) throw new Error("Key inválida.");
      msg.textContent = "✅ Conexión exitosa.";
      setLock("av", false);
    } catch (e) { msg.textContent = `❌ ${e.message}`; }
  });

  $("#saveAv")?.addEventListener("click", async () => {
    avToken = $("#avToken").value.trim();
    await chrome.storage.local.set({ avToken });
    setLock("av", !avToken);
    updateGlobalMsg("Configuración de Alpha Vantage guardada.");
  });

  // --- Connection Logic (INEGI) ---
  $("#testInegi")?.addEventListener("click", async () => {
    const t = $("#inegiToken").value.trim();
    const msg = $("#msgInegi");
    if (!t) { msg.textContent = "⚠️ Ingresa tu Token."; return; }
    msg.textContent = "⏳ Probando...";
    try {
      const url = `${INEGI_API_BASE}/INDICATOR/1002000001/es/00/true/BISE/2.0/${encodeURIComponent(t)}?type=json`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        msg.textContent = "✅ Conexión exitosa.";
        setLock("inegi", false);
      } else {
        msg.textContent = `❌ Error ${r.status}`;
      }
    } catch (e) { msg.textContent = "❌ Error de red."; }
  });

  $("#saveInegi")?.addEventListener("click", async () => {
    inegiToken = $("#inegiToken").value.trim();
    await chrome.storage.local.set({ inegiToken });
    setLock("inegi", !inegiToken);
    updateGlobalMsg("Configuración de INEGI guardada.");
  });

  // --- Adding Indicators ---
  $("#addById")?.addEventListener("click", async () => {
    const id = $("#seriesId").value.trim().toUpperCase();
    const type = $("#seriesType").value;
    if (!SERIES_ID_REGEX.test(id)) {
      $("#seriesMsg").textContent = "❌ ID inválido.";
      return;
    }

    if (editingIndex === null && sieSeries.some(s => s.id === id)) {
      $("#seriesMsg").textContent = "⚠️ Esta serie ya existe.";
      return;
    }

    // Basic heuristic for periodicity/figure based on common Banxico IDs
    const item = {
      id,
      title: id,
      type,
      currency: type === 'currency' ? 'MXN' : undefined,
      decimals: 2,
      periodicity: "Diaria",
      figure: "Sin tipo"
    };

    // Try to get metadata if possible
    if (activeProvider === "banxico" && sieToken) {
      try {
        const r = await fetch(`${BANXICO_API_BASE}/series/${id}?mediaType=json&token=${encodeURIComponent(sieToken)}`);
        const json = await r.json();
        const meta = json?.bmx?.series?.[0];
        if (meta) {
          item.title = meta.titulo || id;
          item.periodicity = meta.periodicidad || "Desconocida";
          item.figure = meta.cifra || "Sin tipo";

          // Auto-format suggestion
          const text = `${meta.unidad || ""} ${meta.cifra || ""}`.toLowerCase();
          if (text.includes("%") || text.includes("porcentaje")) {
            item.type = "percent";
            item.decimals = 4;
          } else if (text.includes("pesos") || text.includes("dólares")) {
            item.type = "currency";
            item.currency = text.includes("dólares") ? "USD" : "MXN";
          }
        }
      } catch (e) { }
    } else if (activeProvider === "av" && avToken) {
      try {
        const r = await fetch(`${ALPHAVANTAGE_API_BASE}?function=SYMBOL_SEARCH&keywords=${id.replace("AV_", "")}&apikey=${encodeURIComponent(avToken)}`);
        const json = await r.json();
        const best = json?.bestMatches?.[0];
        if (best) {
          item.title = best["2. name"] || id;
          item.currency = best["8. currency"] || "USD";
        }
      } catch (e) { }
    }

    if (editingIndex !== null) {
      sieSeries[editingIndex] = { ...sieSeries[editingIndex], ...item, id: sieSeries[editingIndex].id }; // preserve original ID in edit
      editingIndex = null;
      $("#addById").textContent = "Añadir";
    } else {
      sieSeries.push(item);
    }

    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
    $("#seriesId").value = "";
    $("#seriesMsg").textContent = "✅ Guardado.";
  });

  $("#addInegiById")?.addEventListener("click", async () => {
    const rawId = $("#inegiIdInput").value.trim();
    const id = `INEGI_${rawId}`;
    const msg = $("#inegiMsg");

    if (!rawId || isNaN(rawId)) {
      msg.textContent = "❌ ID numérico inválido.";
      return;
    }

    if (sieSeries.some(s => s.id === id)) {
      msg.textContent = "⚠️ Esta serie ya existe.";
      return;
    }

    const item = {
      id,
      title: `Indicador INEGI ${rawId}`,
      type: "number",
      decimals: 2,
      periodicity: "Variable",
      figure: "Dato"
    };

    if (inegiToken) {
      try {
        const url = `${INEGI_API_BASE}/INDICATOR/${rawId}/es/00/true/BISE/2.0/${encodeURIComponent(inegiToken)}?type=json`;
        const r = await fetch(url);
        const json = await r.json();
        // INEGI no suele dar el nombre del indicador en el JSON de datos sin metadatos CL_INDICATOR
        // Por ahora lo dejamos así y el usuario puede ver el ID.
      } catch (e) { }
    }

    sieSeries.push(item);
    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
    $("#inegiIdInput").value = "";
    msg.textContent = "✅ Guardado.";
  });

  function renderAvCatalog() {
    const container = $("#avButtons");
    if (!container) return;
    container.innerHTML = "";
    AV_CATALOG.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "chip-btn";
      btn.textContent = `+ ${item.title}`;
      btn.addEventListener("click", async () => {
        if (sieSeries.find(s => s.id === item.id)) {
          updateGlobalMsg("Ya está en tu tablero.");
          return;
        }
        sieSeries.push(item);
        await chrome.storage.local.set({ sieSeries });
        renderSelected(sieSeries);
        updateGlobalMsg(`Añadido: ${item.title}`);
      });
      container.appendChild(btn);
    });
  }

  function renderInegiCatalog() {
    const container = $("#inegiButtons");
    if (!container) return;
    container.innerHTML = "";
    INEGI_CATALOG.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "chip-btn";
      btn.textContent = `+ ${item.title}`;
      btn.addEventListener("click", async () => {
        if (sieSeries.find(s => s.id === item.id)) {
          updateGlobalMsg("Ya está en tu tablero.");
          return;
        }
        sieSeries.push(item);
        await chrome.storage.local.set({ sieSeries });
        renderSelected(sieSeries);
        updateGlobalMsg(`Añadido: ${item.title}`);
      });
      container.appendChild(btn);
    });
  }

  function renderSelected(list) {
    const container = $("#selected");
    if (!container) return;
    container.innerHTML = "";

    list.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "selected-item";

      const isMX = !s.id.startsWith("AV_") && !s.id.startsWith("INEGI_");
      const isAV = s.id.startsWith("AV_");
      const isInegi = s.id.startsWith("INEGI_");

      let badgeLabel = "SIE";
      let badgeClass = "source-mx";
      if (isAV) { badgeLabel = "AV"; badgeClass = "source-av"; }
      if (isInegi) { badgeLabel = "INEGI"; badgeClass = "source-av"; }

      const sourceBadge = `<span class="badge-source ${badgeClass}">${badgeLabel}</span>`;

      el.innerHTML = `
        <div class="selected-item-info">
          <div class="selected-item-title">${s.title}${sourceBadge}</div>
          <div class="selected-item-id">${s.id}</div>
        </div>
        <div class="actions">
          <button class="action-btn move-up" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="action-btn move-down" title="Bajar" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="action-btn edit" title="Editar">✎</button>
          <button class="action-btn delete" title="Quitar">×</button>
        </div>
      `;

      el.querySelector(".move-up")?.addEventListener("click", () => move(i, -1));
      el.querySelector(".move-down")?.addEventListener("click", () => move(i, 1));
      el.querySelector(".edit")?.addEventListener("click", () => edit(i));
      el.querySelector(".delete")?.addEventListener("click", () => del(i));

      container.appendChild(el);
    });
  }

  function edit(idx) {
    const s = sieSeries[idx];
    editingIndex = idx;
    const isAV = s.id.startsWith("AV_");
    switchProvider(isAV ? "av" : "banxico");

    $("#seriesId").value = s.id;
    $("#seriesType").value = s.type || "number";
    $("#addById").textContent = "Actualizar";
    updateGlobalMsg(`Editando: ${s.title}`);
  }

  async function move(idx, step) {
    const target = idx + step;
    [sieSeries[idx], sieSeries[target]] = [sieSeries[target], sieSeries[idx]];
    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
  }

  async function del(idx) {
    sieSeries.splice(idx, 1);
    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
  }

})();
