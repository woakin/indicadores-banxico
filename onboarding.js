import { DEFAULT_SERIES, SERIES_ID_REGEX, BANXICO_API_BASE, INEGI_API_BASE, YF_CATALOG, INEGI_CATALOG, BANXICO_CATALOG, DEFAULT_STOCKS, SUGGESTED_TICKERS } from './constants.js';

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // --- State ---
  let activeProvider = "config";
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

    if (ops) {
      ops.classList.toggle("locked", isLocked);
      const content = ops.querySelector('.locked-content');
      const notice = ops.querySelector('.unlock-notice');

      if (isLocked) {
        if (content) content.classList.add('blur-[4px]', 'opacity-50', 'pointer-events-none');
        if (notice) notice.classList.remove('hidden');
      } else {
        if (content) content.classList.remove('blur-[4px]', 'opacity-50', 'pointer-events-none');
        if (notice) notice.classList.add('hidden');
      }
    }

    if (status) status.classList.toggle("online", !isLocked);
  }

  function switchProvider(brand) {
    activeProvider = brand;
    $$("button[data-provider]").forEach(l => {
      l.classList.remove("bg-white/10", "text-white");
      l.classList.add("text-text-muted", "hover:bg-white/5");
      const dot = l.querySelector(".rounded-full");
      if (dot) dot.classList.replace("bg-success", "bg-primary");
      if (dot) dot.classList.add("animate-pulse");
    });

    const activeLink = $(`button[data-provider="${brand}"]`);
    if (activeLink) {
      activeLink.classList.remove("text-text-muted", "hover:bg-white/5");
      activeLink.classList.add("bg-white/10", "text-white");
      const dot = activeLink.querySelector(".rounded-full");
      if (dot) dot.classList.replace("bg-primary", "bg-success");
      if (dot) dot.classList.remove("animate-pulse");
    }

    $$(".provider-view").forEach(v => v.classList.add("hidden"));
    $(`#view${brand.charAt(0).toUpperCase() + brand.slice(1)}`)?.classList.remove("hidden");
  }

  // --- Initialization ---
  chrome.storage.local.get(["sieToken", "inegiToken", "sieSeries", "customStocks"], (data) => {
    sieToken = data.sieToken || "";
    inegiToken = data.inegiToken || "";
    sieSeries = data.sieSeries || [];
    const legacyStocks = data.customStocks || [];

    // MIGRATION SCRIPT
    if (legacyStocks.length > 0) {
      const migrated = legacyStocks.map(s => ({
        id: `YF_${s.id}`,
        title: s.title,
        type: "number",
        decimals: 2,
        periodicity: "Diaria",
        figure: "Dato",
        isFavorite: true
      }));
      // Append only if not already in sieSeries
      migrated.forEach(m => {
        if (!sieSeries.some(str => str.id === m.id)) {
          sieSeries.push(m);
        }
      });
      chrome.storage.local.set({ sieSeries: sieSeries, customStocks: [] });
    }

    // Fill inputs
    if ($("#token")) $("#token").value = sieToken;
    if ($("#inegiToken")) $("#inegiToken").value = inegiToken;

    // Set locked states
    setLock("banxico", !sieToken);
    setLock("inegi", !inegiToken);

    // Initial render
    // By design, Mi Tablero starts empty on first install
    renderSelected(sieSeries);
    renderBanxicoCatalog();
    renderYfCatalog();
    renderInegiCatalog();
    renderSuggestedStocks();

    // Explorer filter setup
    setupExplorerFilters();
  });

  // --- Sidebar Events ---
  $$("button[data-provider]").forEach(link => {
    link.addEventListener("click", (e) => {
      const p = e.currentTarget.getAttribute("data-provider");
      if (p) switchProvider(p);
    });
  });

  function setupExplorerFilters() {
    $$(".explorer-filter").forEach(btn => {
      btn.addEventListener("click", (e) => {
        // Update active class
        $$(".explorer-filter").forEach(b => {
          b.classList.remove("bg-primary/10", "text-primary");
          b.classList.add("text-text-muted", "hover:bg-white/5");
        });
        e.currentTarget.classList.remove("text-text-muted", "hover:bg-white/5");
        e.currentTarget.classList.add("bg-primary/10", "text-primary");

        const filter = e.currentTarget.getAttribute("data-filter");
        $$(".explorer-card").forEach(card => {
          if (filter === "all" || card.getAttribute("data-category") === filter) {
            card.style.display = "block";
          } else {
            card.style.display = "none";
          }
        });
      });
    });
  }

  // --- Connection Logic (Banxico) ---
  $("#saveBanxico")?.addEventListener("click", async () => {
    const btn = $("#saveBanxico");
    const t = $("#token").value.trim();
    const msg = $("#msgSie");
    if (!t) {
      msg.classList.remove("hidden");
      msg.textContent = "⚠️ Ingresa tu Token.";
      return;
    }

    btn.disabled = true;
    msg.classList.remove("hidden");
    msg.textContent = "⏳ Validando credenciales seguras...";

    try {
      const url = `${BANXICO_API_BASE}/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        sieToken = t;
        await chrome.storage.local.set({ sieToken });
        msg.textContent = "✅ ¡Conectado! Catálogo desbloqueado.";
        setLock("banxico", false);
        updateGlobalMsg("Integración de Banxico activada.");
      } else {
        msg.textContent = `❌ Error ${r.status}. Token inválido.`;
      }
    } catch (e) {
      msg.textContent = "❌ Error de red.";
    } finally {
      btn.disabled = false;
    }
  });

  // --- Connection Logic (INEGI) ---
  $("#saveInegi")?.addEventListener("click", async () => {
    const btn = $("#saveInegi");
    const t = $("#inegiToken").value.trim();
    const msg = $("#msgInegi");
    if (!t) {
      msg.classList.remove("hidden");
      msg.textContent = "⚠️ Ingresa tu Token.";
      return;
    }

    btn.disabled = true;
    msg.classList.remove("hidden");
    msg.textContent = "⏳ Validando credenciales seguras...";

    try {
      const url = `${INEGI_API_BASE}/INDICATOR/1002000001/es/00/true/BISE/2.0/${encodeURIComponent(t)}?type=json`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        inegiToken = t;
        await chrome.storage.local.set({ inegiToken });
        msg.textContent = "✅ ¡Conectado! Catálogo desbloqueado.";
        setLock("inegi", false);
        updateGlobalMsg("Integración de INEGI activada.");
      } else {
        msg.textContent = `❌ Error ${r.status}. Token inválido.`;
      }
    } catch (e) {
      msg.textContent = "❌ Error de red.";
    } finally {
      btn.disabled = false;
    }
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
    $("#seriesMsg").textContent = "✅ ¡Añadido a tu tablero principal!";
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
        msg.textContent = "⏳ Extrayendo información del indicador...";
        // Fetch metadata using CL_INDICATOR (Key of Indicators)
        // URL Pattern: .../CL_INDICATOR/[ID]/es/BISE/2.0/[TOKEN]?type=json
        const metaUrl = `${INEGI_API_BASE}/CL_INDICATOR/${rawId}/es/BISE/2.0/${encodeURIComponent(inegiToken)}?type=json`;
        const r = await fetch(metaUrl);
        const json = await r.json();

        // Structure: { CODE: [{ value: "...", Description: "..." }] }
        // Note: The structure might vary, but usually it's under CODE or Series
        const meta = json?.CODE?.[0];

        if (meta) {
          item.title = meta.Description || item.title;
          const lowerTitle = item.title.toLowerCase();
          if (lowerTitle.includes("tasa") || lowerTitle.includes("porcentaje") || lowerTitle.includes("variación")) {
            item.type = "percent";
          } else if (lowerTitle.includes("pesos") || lowerTitle.includes("dólares")) {
            item.type = "currency";
            item.currency = "MXN"; // Default to MXN
          }
        }
      } catch (e) {
        console.warn("Error fetching INEGI metadata:", e);
      }
    }

    sieSeries.push(item);
    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
    $("#inegiIdInput").value = "";
    msg.textContent = "✅ ¡Añadido a tu tablero principal!";
  });

  // --- Adding Custom Yahoo Finance Indicator Cards ---
  $("#addAvById")?.addEventListener("click", async () => {
    const rawId = $("#avIdInput").value.trim().toUpperCase();
    if (!rawId) return;
    const id = `YF_${rawId}`;
    const msg = $("#avMsg");

    if (sieSeries.some(s => s.id === id)) {
      msg.textContent = "⚠️ Esta serie ya existe.";
      return;
    }

    const item = {
      id,
      title: rawId,
      type: "number",
      decimals: 2,
      periodicity: "Diaria",
      figure: "Dato"
    };

    msg.textContent = "⏳ Consultando mercados en tiempo real...";
    try {
      // Direct YF query to fetch basic meta
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${rawId}`);
      if (r.ok) {
        const data = await r.json();
        const quote = data.quotes?.[0];
        if (quote && quote.symbol === rawId) {
          item.title = quote.shortname || quote.longname || rawId;
          const qt = quote.quoteType;
          if (qt === "CURRENCY" || qt === "CRYPTOCURRENCY" || qt === "EQUITY" || qt === "ETF") {
            item.type = "currency";
            item.currency = quote.currency || "USD";
          }
        }
      }
    } catch (e) { }

    sieSeries.push(item);
    await chrome.storage.local.set({ sieSeries });
    renderSelected(sieSeries);
    $("#avIdInput").value = "";
    msg.textContent = "✅ ¡Añadido a tu tablero principal!";
  });

  // --- Adding Custom Stocks ---
  $("#addStockBtn")?.addEventListener("click", async () => {
    // Force uppercase and remove whitespace
    const ticker = $("#stockInput").value.trim().toUpperCase().replace(/\s/g, "");
    const msg = $("#stockMsg");

    if (!ticker) {
      msg.textContent = "❌ Escribe un ticker (ej. AMXL.MX)";
      return;
    }

    const id = `YF_${ticker}`;
    if (sieSeries.some(s => s.id === id)) {
      msg.textContent = "⚠️ Este ticker ya está en la lista.";
      return;
    }

    msg.textContent = "⏳ Consultando mercados en tiempo real...";
    try {
      const symQuery = encodeURIComponent(ticker);
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symQuery}?interval=1d&range=1d`, { cache: "no-store", headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error("Ticker no encontrado en Yahoo Finance.");

      const json = await r.json();
      const meta = json.chart.result[0].meta;
      const title = meta.shortName || ticker;

      const item = {
        id,
        title,
        type: "number",
        decimals: 2,
        periodicity: "Diaria",
        figure: "Dato",
        isFavorite: false
      };

      sieSeries.push(item);
      await chrome.storage.local.set({ sieSeries });
      renderSelected(sieSeries);
      $("#stockInput").value = "";
      msg.textContent = "✅ Ticker añadido a tu tablero principal.";
    } catch (e) {
      msg.textContent = "❌ " + e.message;
    }
  });

  $("#toggleStockHelp")?.addEventListener("click", () => {
    const helpText = $("#stockHelpText");
    if (helpText) {
      helpText.classList.toggle("hidden");
    }
  });

  function renderSuggestedStocks() {
    const container = $("#stocksButtons");
    if (!container) return;
    container.innerHTML = "";
    SUGGESTED_TICKERS.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "text-xs font-semibold bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-text-muted hover:text-white px-3 py-1.5 rounded-full transition-all";
      btn.textContent = `+ ${item.title}`;
      btn.addEventListener("click", async () => {
        const id = item.id.startsWith("YF_") ? item.id : `YF_${item.id}`;

        if (sieSeries.find(s => s.id === id)) {
          updateGlobalMsg("Ya está en tu tablero.");
          return;
        }

        const mappedItem = {
          id: id,
          title: item.title,
          type: "number",
          decimals: 2,
          periodicity: "Diaria",
          figure: "Dato",
          isFavorite: false
        };

        sieSeries.push(mappedItem);
        await chrome.storage.local.set({ sieSeries });
        renderSelected(sieSeries);
        updateGlobalMsg(`Añadido: ${item.title}`);
      });
      container.appendChild(btn);
    });
  }

  function renderBanxicoCatalog() {
    const container = $("#banxicoButtons");
    if (!container) return;
    container.innerHTML = "";
    BANXICO_CATALOG.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "text-xs font-semibold bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-text-muted hover:text-white px-3 py-1.5 rounded-full transition-all";
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

  function renderYfCatalog() {
    const container = $("#avButtons");
    if (!container) return;
    container.innerHTML = "";
    YF_CATALOG.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "text-xs font-semibold bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-text-muted hover:text-white px-3 py-1.5 rounded-full transition-all";
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
      btn.className = "text-xs font-semibold bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-text-muted hover:text-white px-3 py-1.5 rounded-full transition-all";
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

    const emptyState = $("#selectedEmptyState");
    const emptyStateHTML = emptyState ? emptyState.outerHTML : '';
    container.innerHTML = emptyStateHTML;

    const newEmptyState = $("#selectedEmptyState");
    if (!list || list.length === 0) {
      if (newEmptyState) newEmptyState.classList.remove("hidden");
      return;
    }
    if (newEmptyState) newEmptyState.classList.add("hidden");

    list.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "bg-background-dark border border-white/5 p-3 rounded-lg flex items-center gap-3 transition-colors hover:border-white/20 cursor-grab active:cursor-grabbing";
      el.draggable = true;

      const isMX = !s.id.startsWith("YF_") && !s.id.startsWith("INEGI_");
      const isAV = s.id.startsWith("YF_");
      const isInegi = s.id.startsWith("INEGI_");

      let badgeLabel = "SIE";
      let badgeClass = "bg-primary/20 text-primary";
      if (isAV) { badgeLabel = "YF"; badgeClass = "bg-success/20 text-success"; }
      if (isInegi) { badgeLabel = "INEGI"; badgeClass = "bg-white/10 text-white"; }

      const sourceBadge = `<span class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0 ${badgeClass}">${badgeLabel}</span>`;
      const favStarHtml = s.isFavorite
        ? `<span class="material-symbols-outlined text-warning text-lg text-glow-warning">star</span>`
        : `<span class="material-symbols-outlined text-lg">star</span>`;

      el.innerHTML = `
        <span class="material-symbols-outlined text-white/20 text-lg hover:text-white/60 transition-colors shrink-0">drag_indicator</span>
        <div class="flex flex-col min-w-0 flex-1 pr-2 cursor-pointer edit-card" title="Clic para editar">
          <div class="text-sm font-semibold text-white flex items-center mb-0.5 min-w-0">
            <span class="truncate flex-1 text-left">${s.title}</span>${sourceBadge}
          </div>
          <div class="text-[11px] text-text-muted font-mono truncate">${s.id}</div>
        </div>
        <div class="flex gap-1.5 shrink-0 items-center">
          <!-- Favorite Star -->
          <button class="favorite-toggle w-7 h-7 flex items-center justify-center rounded transition-colors ${s.isFavorite ? 'text-warning' : 'text-text-muted hover:text-white hover:bg-white/10'}" title="Añadir a Marquee Superior">
            ${favStarHtml}
          </button>
          <div class="w-px h-4 bg-white/10 mx-1"></div>
          <button class="text-text-muted hover:text-white hover:bg-warning/20 hover:text-danger w-7 h-7 flex items-center justify-center rounded transition-colors delete" title="Quitar">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      `;

      // --- Drag and Drop Events ---
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i);
        el.classList.add('opacity-40', 'scale-[0.98]');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('opacity-40', 'scale-[0.98]');
        container.querySelectorAll('.border-t-primary').forEach(c => c.classList.remove('border-t-primary', 'border-t-2', 'border-t'));
        container.querySelectorAll('.border-b-primary').forEach(c => c.classList.remove('border-b-primary', 'border-b-2', 'border-b'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        el.classList.remove('border-t-primary', 'border-t-2', 'border-t', 'border-b-primary', 'border-b-2', 'border-b');
        if (e.clientY < midY) {
          el.classList.add('border-t-primary', 'border-t-2');
        } else {
          el.classList.add('border-b-primary', 'border-b-2');
        }
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('border-t-primary', 'border-t-2', 'border-t', 'border-b-primary', 'border-b-2', 'border-b');
      });

      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('border-t-primary', 'border-t-2', 'border-t', 'border-b-primary', 'border-b-2', 'border-b');
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (draggedIndex === i || isNaN(draggedIndex)) return;

        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let insertIndex = i;

        // If dropping below the middle line, insert after the target
        if (e.clientY >= midY) {
          insertIndex++;
        }

        // Compensate index shift if moving item from top to bottom
        if (draggedIndex < insertIndex) {
          insertIndex--;
        }

        const draggedItem = sieSeries.splice(draggedIndex, 1)[0];
        sieSeries.splice(insertIndex, 0, draggedItem);

        await chrome.storage.local.set({ sieSeries });
        renderSelected(sieSeries);
      });

      // --- Actions ---
      el.querySelector(".favorite-toggle")?.addEventListener("click", async () => {
        sieSeries[i].isFavorite = !sieSeries[i].isFavorite;
        await chrome.storage.local.set({ sieSeries });
        renderSelected(sieSeries);
        if (sieSeries[i].isFavorite) {
          updateGlobalMsg(`⭐ Añadido al Ticker Superior`);
        } else {
          updateGlobalMsg(`Removido del Ticker Superior`);
        }
      });

      // Click on text block to Edit
      el.querySelector(".edit-card")?.addEventListener("click", () => edit(i));

      el.querySelector(".delete")?.addEventListener("click", () => del(i));

      container.appendChild(el);
    });
  }

  function edit(idx) {
    const s = sieSeries[idx];
    editingIndex = idx;
    const isAV = s.id.startsWith("YF_");
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

  // --- Modals ---
  const helpModal = $("#inegiHelpModal");
  const openHelpBtn = $("#openInegiHelp");
  const closeHelpBtn = $("#closeInegiHelp");

  if (openHelpBtn && helpModal) {
    openHelpBtn.addEventListener("click", (e) => {
      e.preventDefault();
      helpModal.classList.remove("hidden");
      helpModal.classList.add("flex");
    });
  }

  if (closeHelpBtn && helpModal) {
    closeHelpBtn.addEventListener("click", () => {
      helpModal.classList.add("hidden");
      helpModal.classList.remove("flex");
    });
  }

  // Close on backdrop click
  if (helpModal) {
    helpModal.addEventListener("click", (e) => {
      if (e.target === helpModal) {
        helpModal.classList.add("hidden");
        helpModal.classList.remove("flex");
      }
    });
  }

})();
