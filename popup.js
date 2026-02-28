import { DEFAULT_SERIES, ANALYSIS_SERIES, YF_CATALOG } from './constants.js';
import { fmtValue, fmtDate, latestValidObservation } from './utils.js';

const $ = s => document.querySelector(s);

let currentUdiValue = null;
let currentUdiDate = null;
let currentMode = "udisToPesos";
let activeTabId = "marketView";


// --- General UI Functions ---
function setLoading(isLoad, text = "Cargando...") {
  const textEl = $("#loadingText");
  if (isLoad) {
    if (textEl) textEl.textContent = text;
    document.body.classList.add("loading");
  } else {
    document.body.classList.remove("loading");
  }
}

function showToast(msg, duration = 1500) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

async function copyToClipboard(val, date) {
  try {
    // Excel-Ready: [VALOR]\t[FECHA], clean symbols
    const cleanVal = val.replace(/[$,%]/g, "").replace(/\s/g, "");
    const text = `${cleanVal}\t${date}`;
    await navigator.clipboard.writeText(text);
    showToast("Excel-Ready: " + cleanVal);
  } catch (e) {
    showToast("Error al copiar");
  }
}

function getYahooFinanceUrl(id, name) {
  let yfSymbol = null;
  if (id) {
    if (id.startsWith("YF_")) {
      yfSymbol = id.replace("YF_", "");
    }
  } else {
    // Fallback for default items without ID
    if (name === "S&P 500") yfSymbol = "^GSPC";
    else if (name === "USD/MXN") yfSymbol = "MXN=X";
  }

  return yfSymbol ? `https://finance.yahoo.com/quote/${yfSymbol}` : null;
}

// --- Data Formatting ---
// (Moved to utils.js)

// --- Main View Rendering ---

function render(rows, containerOrWarn = false) {
  let container = $("#indicatorCards");
  let warn = false;

  if (containerOrWarn instanceof HTMLElement) {
    container = containerOrWarn;
  } else {
    warn = !!containerOrWarn;
  }

  const warningEl = $("#warning");
  if (warningEl) warningEl.style.display = warn ? "block" : "none";

  if (!container) return;
  container.innerHTML = "";

  if (rows.length === 0) {
    if (warn) {
      container.innerHTML = `
        <div class="empty-state">
           <div class="empty-state-icon">👋</div>
           <h4>Bienvenido a Indicadores HUB</h4>
           <p>Para comenzar, necesitas configurar tus conexiones a las APIs oficiales. Son gratuitas y seguras.</p>
           <button class="btn" onclick="chrome.tabs.create({ url: 'onboarding.html'})">Configurar ahora</button>
        </div>`;
    } else {
      container.innerHTML = '<p class="muted" style="text-align:center">No hay indicadores seleccionados.</p>';
    }
    return;
  }

  const parseDmx = (d) => {
    if (!d || typeof d !== 'string') return new Date(0);
    const p = d.split("/");
    return p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : new Date(p[1], p[0] - 1, 1);
  };

  for (const r of rows) {
    const card = document.createElement("div");
    const yfUrl = getYahooFinanceUrl(r.id, r.name);

    if (yfUrl) {
      card.className = "indicator-card group hover:border-primary/50 cursor-pointer transition-colors";
      card.title = "Haz clic para ver más en Yahoo Finance";
      card.addEventListener("click", () => {
        window.open(yfUrl, "_blank", "noopener,noreferrer");
      });
    } else {
      card.className = "indicator-card";
    }

    // Left side: Name and Date
    const info = document.createElement("div");
    info.className = "card-info";

    const titleContainer = document.createElement("div");
    titleContainer.className = "flex items-start justify-between w-full mb-2";

    const title = document.createElement("div");
    title.className = yfUrl
      ? "text-[10px] leading-tight font-bold text-text-muted transition-colors group-hover:text-primary uppercase tracking-wide pr-2"
      : "text-[10px] leading-tight font-bold text-text-muted uppercase tracking-wide pr-2";
    title.textContent = r.name;
    if (r.config?.description) {
      title.title = r.config.description;
    }
    titleContainer.appendChild(title);

    if (r.id) {
      const isYF = r.id.startsWith("YF_");
      const isInegi = r.id.startsWith("INEGI_");

      let badgeLabel = "Banxico";
      let badgeClass = "source-mx";
      if (isYF) { badgeLabel = "Yahoo Finance"; badgeClass = "source-yf"; }
      if (isInegi) { badgeLabel = "INEGI"; badgeClass = "source-yf"; }

      const badge = document.createElement("span");
      badge.className = `badge-source ${badgeClass}`;
      badge.textContent = badgeLabel;
      titleContainer.appendChild(badge);
    }

    info.appendChild(titleContainer);

    // Error Indicator (if any)
    if (r.error) {
      const errIcon = document.createElement("span");
      errIcon.textContent = "⚠️";
      errIcon.className = "text-danger ml-1 text-xs cursor-help";
      errIcon.title = `Error: ${r.error}`;
      info.appendChild(errIcon);
    }

    card.appendChild(info);

    // Value on its own row
    const value = document.createElement("div");
    // mb-2 separates it cleanly from the bottom row. tabular-nums ensures digits align. break-words handles super long numbers.
    value.className = "text-[22px] font-bold text-white leading-tight tracking-tight my-2 tabular-nums break-words";
    value.textContent = r.value;
    card.appendChild(value);

    // Bottom container for Date and Actions
    const bottomRow = document.createElement("div");
    bottomRow.className = "flex items-center justify-between w-full mt-auto pt-1";

    // Date
    const date = document.createElement("div");
    date.className = "text-[10px] text-text-muted font-medium tracking-wide";
    date.textContent = r.date;
    bottomRow.appendChild(date);

    // Actions
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-1.5 shrink-0";

    // Copy Button
    const copyBtn = document.createElement("button");
    const originalCopyClasses = "flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors active:scale-95";
    const successCopyClasses = "flex items-center justify-center w-8 h-8 rounded-lg bg-success/20 text-success border border-success/50 transition-colors";

    copyBtn.className = originalCopyClasses;
    copyBtn.innerHTML = "<span class='material-symbols-outlined text-[17px]'>content_copy</span>";
    copyBtn.title = "Copiar valor";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await copyToClipboard(r.value, r.date);

      // Visual feedback
      copyBtn.className = successCopyClasses;
      copyBtn.innerHTML = "<span class='material-symbols-outlined text-[17px]'>check</span>";

      setTimeout(() => {
        copyBtn.className = originalCopyClasses;
        copyBtn.innerHTML = "<span class='material-symbols-outlined text-[17px]'>content_copy</span>";
      }, 2000);
    });

    // Chart Button
    const graphBtn = document.createElement("button");
    graphBtn.className = "flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors active:scale-95";
    graphBtn.innerHTML = "<span class='material-symbols-outlined text-[17px]'>show_chart</span>";
    graphBtn.title = "Analizar tendencias";
    if (r.date !== "Sin datos" && r.date !== "—") {
      graphBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        showHistoricalView(r.id, r.name, r.config);
      });
    } else {
      graphBtn.style.opacity = "0.3";
      graphBtn.style.cursor = "not-allowed";
    }

    actions.appendChild(copyBtn);
    actions.appendChild(graphBtn);

    bottomRow.appendChild(actions);
    card.appendChild(bottomRow);

    container.appendChild(card);
  }
}

async function refresh(force = false) {
  // Silent refresh doesn't show the full body loader
  if (force) setLoading(true, "Sincronizando datos...");

  const storage = await chrome.storage.local.get([
    "sieToken", "inegiToken", "sieSeries", "lastUpdated", "cachedSeriesData"
  ]);
  const { sieToken, inegiToken, sieSeries, lastUpdated, cachedSeriesData } = storage;

  // 1. SILENT Warning Toggle (Don't block the whole UI)
  const showSieWarning = !sieToken;

  // 2. Immediate Render from Cache (if available)
  if (cachedSeriesData && cachedSeriesData.length > 0) {
    console.log("[Popup] Rendering from cache...");
    renderData(cachedSeriesData, sieSeries, lastUpdated);

    // Toggle warning if sieToken is missing
    const warningEl = $("#warning");
    if (warningEl) warningEl.style.display = showSieWarning ? "block" : "none";

    // Check Age for Silent Update (1 hour = 3600000ms)
    const isStale = lastUpdated && (Date.now() - lastUpdated > 3600000);
    if (isStale && !force) {
      console.log("[Popup] Cache is stale, triggering silent refresh...");
      chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
    }
  } else if (!sieToken && !inegiToken) {
    // No cache AND no tokens: show configuration prompt
    render([], true);
    setLoading(false);
    return;
  } else {
    // No data at all, but we have some token, force a visible refresh
    console.log("[Popup] No cached data, forcing initial refresh...");
    chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
    if (!force) return refresh(true);
  }

  // Mandatory series check for old formats or missing critical data
  const mandatory = ["SP68257", "SF61745", "SP74665", "SP30579", "SR14447", "SR14138", "SR17692", "SE27803", "SF43783"];
  const byId = new Map(cachedSeriesData?.map(s => [s.id, s]) || []);
  const hasAllMandatory = mandatory.every(id => byId.has(id));
  const isOldFormat = cachedSeriesData?.some(s => s.idSerie && !s.id);

  if (!force && (isOldFormat || !hasAllMandatory)) {
    console.warn("[Popup] Missing mandatory data or old format. Triggering background refresh...");
    chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
    return refresh(true); // Enter force mode to show loader and prevent re-entry
  }

  // If we are in force mode, we already triggered REFRESH_DATA or were called with it
  if (force) {
    console.log("[Popup] Force mode: ensuring background is working...");
    chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
  }

  setLoading(false);
}

function renderData(cachedSeriesData, sieSeries, lastUpdated) {
  if (!cachedSeriesData) cachedSeriesData = [];
  const byId = new Map(cachedSeriesData.map(s => [s.id, s]));

  // Update badge
  const badge = document.getElementById("lastUpdated");
  if (lastUpdated && badge) {
    const mins = Math.floor((Date.now() - lastUpdated) / 60000);
    badge.textContent = `Actualizado: ${mins < 1 ? "Ahora" : "Hace " + mins + " min"}`;
  }

  // Synchronization: Merge storage data with latest DEFAULT_SERIES and YF_CATALOG metadata
  const allMetadata = [...DEFAULT_SERIES, ...YF_CATALOG];
  const currentList = (Array.isArray(sieSeries) && sieSeries.length > 0) ? sieSeries : DEFAULT_SERIES;

  let list = currentList.map(s => {
    const latest = allMetadata.find(d => d.id === s.id);
    return latest ? { ...s, ...latest } : s;
  });

  const rows = list.map(cfg => {
    const s = byId.get(cfg.id);
    if (!s) return { name: cfg.title || cfg.id, value: "—", date: "Sin datos", config: cfg };

    return {
      id: cfg.id,
      name: cfg.title || s.title || cfg.id,
      value: fmtValue(cfg, s.val),
      date: fmtDate(s.date, cfg.periodicity),
      val: s.val,
      prev: s.prev,
      prevDate: s.prevDate,
      variation: s.variation,
      error: s.error,
      config: cfg
    };
  });

  // UDI Calculator dependencies
  const udiSerie = byId.get('SP68257');
  if (udiSerie && udiSerie.val) {
    currentUdiValue = Number(udiSerie.val.replace(",", "."));
    currentUdiDate = fmtDate(udiSerie.date, "diaria");
    updateCalculator();
  }

  // INPC / Health dependencies
  const targetRateSerie = byId.get('SF61745');
  const inflationSerie = byId.get('SP74665');
  const cetesSerie = byId.get('SF60633');
  const tiieSerie = byId.get('SF43783');

  if (targetRateSerie && targetRateSerie.val && inflationSerie && inflationSerie.val) {
    updateRealRateMonitor(targetRateSerie, inflationSerie, cetesSerie, tiieSerie);
  } else {
    const label = $("#realRateLabel");
    if (label) label.textContent = "Cargando...";
  }

  render(rows, $("#indicatorCards"));


  // --- Ticker Update ---
  const favorites = rows.filter(r => r.config.isFavorite);
  renderTicker(favorites);

  // --- Rendering Analysis Tab ---
  const expectationsList = ANALYSIS_SERIES.filter(s => s.category === "expectation");
  const macroList = ANALYSIS_SERIES.filter(s => s.category === "macro");

  const renderAnalysisSection = (list, containerId) => {
    const analysisRows = list.map(cfg => {
      const s = byId.get(cfg.id);
      return {
        id: cfg.id,
        name: cfg.title,
        value: s ? fmtValue(cfg, s.val) : "Sin datos",
        date: s ? fmtDate(s.date, cfg.periodicity) : "—",
        val: s?.val,
        prev: s?.prev,
        prevDate: s?.prevDate,
        config: cfg
      };
    });
    render(analysisRows, $(containerId));
  };

  renderAnalysisSection(expectationsList, "#expectationsCards");
  renderAnalysisSection(macroList, "#macroCards");

  // --- Inflation vs Expectations Comparison ---
  const currentInfl = byId.get('SP74665');
  const expectedInfl = byId.get('SR14138');
  const warningEl = $("#inflationWarning");

  if (currentInfl?.val && expectedInfl?.val && warningEl) {
    const cVal = parseFloat(currentInfl.val.replace(",", "."));
    const eVal = parseFloat(expectedInfl.val.replace(",", "."));

    if (cVal > eVal) {
      warningEl.style.display = "block";
      warningEl.innerHTML = `⚠️ <strong>Dato actual (${cVal.toFixed(2)}%)</strong> por encima del consenso de cierre (${eVal.toFixed(2)}%)`;
    } else {
      warningEl.style.display = "none";
    }
  }
}

// Global state for anti-flicker
let lastRenderedHash = "";

// Reactive Data Link
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cachedSeriesData) {
    const newData = changes.cachedSeriesData.newValue;
    const newHash = JSON.stringify(newData);

    // Only re-render if data actually changed
    if (newHash !== lastRenderedHash) {
      console.log("[Popup] Cache updated, silent re-render...");
      lastRenderedHash = newHash;
      chrome.storage.local.get(["sieSeries", "lastUpdated"]).then(s => {
        renderData(newData, s.sieSeries, s.lastUpdated);
      });
    }
  }
});

// --- Calculator & Monitor ---

function updateCalculator() {
  const amountStr = $("#calcAmount")?.value.trim() || "";
  const amount = parseFloat(amountStr);
  const resultArea = $("#calcResult");
  const dateArea = $("#calcDate");
  const modeLabel = $("#calcModeLabel");

  if (!currentUdiValue || !resultArea) return;

  modeLabel.textContent = currentMode === "pesosToUdis" ? "Pesos → UDIs" : "UDIs → Pesos";

  if (amountStr === "") {
    resultArea.textContent = "El resultado aparecerá aquí";
    resultArea.classList.add("placeholder");
    dateArea.textContent = currentUdiDate ? `Valor al ${currentUdiDate}` : "";
    return;
  }
  if (!currentUdiValue || isNaN(currentUdiValue)) {
    resultArea.textContent = "Obteniendo valor UDI...";
    resultArea.classList.add("placeholder");
    dateArea.textContent = "";
    return;
  }
  if (isNaN(amount) || amount < 0) {
    resultArea.textContent = "Monto inválido";
    resultArea.classList.add("placeholder");
    return;
  }

  resultArea.classList.remove("placeholder");

  if (currentMode === "pesosToUdis") {
    const res = amount / currentUdiValue;
    resultArea.textContent = res.toLocaleString("es-MX", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " UDIs";
  } else {
    const res = amount * currentUdiValue;
    resultArea.textContent = res.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }
  dateArea.textContent = `Valor al ${currentUdiDate}`;
  saveCalculatorState();
}

function saveCalculatorState() {
  const state = {
    udiAmount: $("#calcAmount")?.value,
    udiMode: currentMode,
    fiscalAmount: $("#fiscalAmount")?.value,
    fiscalInitialDate: $("#fiscalInitialDate")?.value,
    fiscalFinalDate: $("#fiscalFinalDate")?.value
  };
  chrome.storage.local.set({ calculatorState: state });
}

async function loadCalculatorState() {
  const { calculatorState } = await chrome.storage.local.get("calculatorState");
  if (calculatorState) {
    if ($("#calcAmount")) $("#calcAmount").value = calculatorState.udiAmount || "";
    if (calculatorState.udiMode) currentMode = calculatorState.udiMode;
    if ($("#fiscalAmount")) $("#fiscalAmount").value = calculatorState.fiscalAmount || "";
    if ($("#fiscalInitialDate")) $("#fiscalInitialDate").value = calculatorState.fiscalInitialDate || "";
    if ($("#fiscalFinalDate")) $("#fiscalFinalDate").value = calculatorState.fiscalFinalDate || "";
    updateCalculator();
  }
}

/**
 * Fisher's exact formula: ((1 + i/100) / (1 + pi/100) - 1) * 100
 */
function calculateRealRate(nominal, inflation) {
  return (((1 + (nominal / 100)) / (1 + (inflation / 100))) - 1) * 100;
}

function updateRealRateMonitor(targetRateSerie, inflationSerie, cetesSerie, tiieSerie) {
  const nominal = parseFloat(targetRateSerie.val.replace(",", "."));
  const inflation = parseFloat(inflationSerie.val.replace(",", "."));
  const realRate = calculateRealRate(nominal, inflation);

  // Spread CETES
  if (cetesSerie && cetesSerie.val) {
    const cetes = parseFloat(cetesSerie.val.replace(",", "."));
    const spread = cetes - nominal;
    const spreadEl = $("#cetesSpread");
    if (spreadEl) {
      spreadEl.textContent = `CETES vs Obj: ${spread > 0 ? "+" : ""}${spread.toFixed(2)}%`;
    }
  }

  // Spread TIIE
  if (tiieSerie && tiieSerie.val) {
    const tiie = parseFloat(tiieSerie.val.replace(",", "."));
    const spread = tiie - nominal;
    const spreadEl = $("#tiieSpread");
    if (spreadEl) {
      const warning = spread > 0.50 ? ' <span title="Spread inusualmente alto (>0.50%)" style="cursor:help">⚠️</span>' : '';
      spreadEl.innerHTML = `TIIE vs Objetivo: ${spread > 0 ? "+" : ""}${spread.toFixed(2)}%${warning}`;
    }
  }

  const fmt = (v) => v.toLocaleString("es-MX", { minimumFractionDigits: 2 }) + "%";
  $("#targetRateDisplay").textContent = `${fmt(nominal)}`;
  $("#inflationDisplay").textContent = `${fmt(inflation)}`;

  const label = $("#realRateLabel");
  const barInflation = $("#realRateInflationBar");
  const barProfit = $("#realRateProfitBar");
  const labelContainer = $("#realRateLabelContainer");
  const labelDot = $("#realRateDot");

  if (!label || !barInflation || !barProfit) return;

  if (inflation > nominal) {
    label.textContent = "-";
  } else {
    label.textContent = fmt(realRate);
  }
  label.className = "badge " + (realRate >= 0 ? "positive" : "negative");

  const desc = $("#realRateDescription");
  if (desc) {
    if (nominal === 0) {
      desc.textContent = "Obteniendo datos de tasa objetivo...";
    } else if (inflation === 0) {
      desc.textContent = "Obteniendo datos de inflación...";
    } else {
      desc.innerHTML = (realRate > 0
        ? "<strong>¡Tu dinero gana poder adquisitivo!</strong>"
        : "<strong>Tu rendimiento es menor a la inflación.</strong> Estás perdiendo valor real.") +
        `<div class="formula-note">Calculado con la Fórmula de Fisher</div>`;
    }
  }

  const inflationBar = $("#realRateInflationBar");
  const profitBar = $("#realRateProfitBar");

  if (nominal > 0) {
    // Proporción: cuánto de la tasa nominal se "come" la inflación
    const infP = Math.min(100, (inflation / nominal) * 100);
    inflationBar.style.width = `${infP}%`;
    profitBar.style.width = `${Math.max(0, 100 - infP)}%`;

    // Colores dinámicos
    // Reset classes
    profitBar.classList.remove("bg-success", "bg-danger", "shadow-[0_0_10px_rgba(29,204,163,0.5)]", "shadow-[0_0_10px_rgba(201,58,86,0.5)]");
    if (labelContainer) labelContainer.classList.remove("text-success", "text-danger");
    if (labelDot) labelDot.classList.remove("bg-success", "bg-danger");

    // Clear legacy inline styles
    profitBar.style.background = "";
    label.style.background = "";
    label.style.color = "";

    if (realRate >= 0) {
      profitBar.classList.add("bg-success", "shadow-[0_0_10px_rgba(29,204,163,0.5)]");
      if (labelContainer) labelContainer.classList.add("text-success");
      if (labelDot) labelDot.classList.add("bg-success");
    } else {
      profitBar.classList.add("bg-danger", "shadow-[0_0_10px_rgba(201,58,86,0.5)]");
      if (labelContainer) labelContainer.classList.add("text-danger");
      if (labelDot) labelDot.classList.add("bg-danger");
    }
  }
}

// --- Historical View (View Switcher) ---

async function showHistoricalView(seriesId, title, config) {
  const historyView = $("#historicalView");
  const tableContainer = $("#historicalTableContainer");
  const errorEl = $("#historicalError");
  const titleEl = $("#historicalTitle");
  const startInput = $("#historicalStartDate");
  const endInput = $("#historicalEndDate");

  // Switch Views - Hide all possible main views
  ["marketView", "analysisView", "calculatorsView", "settingsView"].forEach(v => {
    const el = $(`#${v}`);
    if (el) {
      el.classList.add("hidden");
      el.classList.remove("block");
    }
  });

  if (historyView) {
    historyView.classList.remove("hidden");
    historyView.classList.add("block");
  }
  if (titleEl) titleEl.textContent = title;

  // Clear State
  tableContainer.innerHTML = "";
  errorEl.textContent = "";
  errorEl.classList.add("hidden");

  // Set Default Dates (Last month)
  const end = new Date();
  const start = new Date();
  start.setMonth(end.getMonth() - 1);
  startInput.value = start.toISOString().slice(0, 10);
  endInput.value = end.toISOString().slice(0, 10);

  $("#exportCsv").onclick = () => {
    const data = $("#exportCsv")._data;
    if (!data) return;

    // Excel compatibility: use semicolon or comma? US systems usually comma.
    // However, Mexican systems often use semicolon.
    // We'll stick to comma but ensure values are clean.
    const csvRows = [["Fecha", "Valor"]];
    data.forEach(obs => {
      // Remove % and quotes for safety
      const cleanVal = obs.dato.replace(/[%,]/g, "");
      csvRows.push([obs.fecha, cleanVal]);
    });

    const csvContent = "\ufeff" + csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_");
    const today = new Date().toISOString().slice(0, 10);

    link.setAttribute("href", url);
    link.setAttribute("download", `Historico_${safeTitle}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Exportado");
  };

  const update = async () => {
    setLoading(true, "Analizando tendencias...");
    errorEl.textContent = "";
    tableContainer.innerHTML = "";
    $("#exportCsv").style.display = "none";
    $("#exportCsv")._data = null;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "FETCH_HISTORICAL",
        seriesId,
        startDate: startInput.value,
        endDate: endInput.value
      });

      if (!resp.success) throw new Error(resp.error);

      // Store data for export
      $("#exportCsv")._data = resp.data;
      $("#exportCsv").style.display = "inline-flex";

      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Fecha</th><th style='text-align:right'>Valor</th></tr></thead>";
      const tbody = document.createElement("tbody");
      for (let i = resp.data.length - 1; i >= 0; i--) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDate(resp.data[i].fecha, config.periodicity)}</td><td style="text-align:right">${fmtValue(config, resp.data[i].dato)}</td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      tableContainer.appendChild(table);

      // Render Chart
      renderChart(resp.data, config);
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  };

  $("#historicalUpdate").onclick = update;
  update();
}

let historyChartInstance = null;

function renderChart(data, config) {
  const canvas = document.getElementById("historyChart");
  if (!canvas) return;

  if (historyChartInstance) {
    historyChartInstance.destroy();
  }

  // Data is fetched in reverse normally, sort it chronological for the chart
  const sortedData = [...data].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const labels = sortedData.map(d => fmtDate(d.fecha, config.periodicity));
  const values = sortedData.map(d => parseFloat(d.dato.toString().replace(",", ".")));

  const primaryColor = '#13a4ec'; // Tailwind bg-primary
  const textColor = '#94a3b8'; // Tailwind text-slate-400
  const gridColor = 'rgba(255, 255, 255, 0.05)'; // white/5
  const surfaceColor = '#0f172a'; // Tailwind bg-slate-900

  historyChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: config.title || 'Valor',
        data: values,
        borderColor: primaryColor,
        backgroundColor: primaryColor + '33', // 20% opacity
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#151E31',
          titleColor: '#FFFFFF',
          bodyColor: '#38BDF8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: function (context) {
              return fmtValue(config, context.parsed.y.toString());
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: textColor,
            font: {
              family: "'Inter', sans-serif",
              size: 10
            },
            maxTicksLimit: 4,
            maxRotation: 45,
            autoSkip: true
          }
        },
        y: {
          position: 'right',
          grid: {
            color: gridColor,
            drawBorder: false,
          },
          ticks: {
            color: textColor,
            font: {
              family: "'Inter', sans-serif",
              size: 10
            },
            maxTicksLimit: 5,
            callback: function (value) {
              if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
              if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
              return Number(value).toFixed(2);
            }
          }
        }
      }
    }
  });
}

let yieldCurveChartInstance = null;

async function loadYieldCurve() {
  const container = $("#yieldCurveContainer");
  const errorEl = $("#yieldCurveError");
  if (!container || !errorEl) return;

  try {
    const resp = await chrome.runtime.sendMessage({ type: "FETCH_YIELD_CURVE" });
    if (!resp.success) {
      errorEl.textContent = resp.error;
      errorEl.style.display = "block";
      return;
    }

    // Sort data according to YIELD_CURVE_SERIES order or term
    const YIELD_CURVE_CONFIG = [
      { id: "SF43783", label: "1M", term: 1 },
      { id: "SF43784", label: "3M", term: 3 },
      { id: "SF43785", label: "6M", term: 6 },
      { id: "SF43786", label: "1A", term: 12 },
      { id: "SF43936", label: "3A", term: 36 },
      { id: "SF43939", label: "5A", term: 60 },
      { id: "SF43943", label: "10A", term: 120 },
      { id: "SF43945", label: "20A", term: 240 },
      { id: "SF43947", label: "30A", term: 360 }
    ];

    const chartData = [];
    for (const conf of YIELD_CURVE_CONFIG) {
      const d = resp.data.find(x => x.id === conf.id);
      if (d && d.val !== "—") {
        chartData.push({ x: conf.label, y: parseFloat(d.val.replace(",", ".")) });
      }
    }

    if (chartData.length === 0) throw new Error("No hay datos disponibles para la curva.");

    const canvas = document.getElementById("yieldCurveChart");
    if (!canvas) return;

    if (yieldCurveChartInstance) yieldCurveChartInstance.destroy();

    const computedStyle = getComputedStyle(document.body);
    const primaryColor = computedStyle.getPropertyValue('--primary').trim() || '#3FA69A';
    const textColor = computedStyle.getPropertyValue('--fg').trim() || '#1A3A5C';
    const gridColor = computedStyle.getPropertyValue('--border').trim() || '#E2E8F0';

    yieldCurveChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: chartData.map(d => d.x),
        datasets: [{
          label: 'Rendimiento (%)',
          data: chartData.map(d => d.y),
          borderColor: primaryColor,
          backgroundColor: primaryColor + '33',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: primaryColor,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#151E31',
            titleColor: '#FFFFFF',
            bodyColor: '#38BDF8',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: function (ctx) { return ctx.parsed.y.toFixed(2) + '%'; }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { family: "'Manrope', sans-serif", size: 10 } }
          },
          y: {
            position: 'right',
            grid: { color: 'rgba(255, 255, 255, 0.1)', drawBorder: false },
            ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { family: "'Manrope', sans-serif", size: 10 } }
          }
        }
      }
    });

  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = "block";
  }
}

function renderTicker(favorites) {
  let tickerItems = [];

  if (favorites.length === 0) {
    // Elegant fallback if no favorites
    tickerItems = [
      { name: "S&P 500", val: "---", variation: null },
      { name: "USD/MXN", val: "---", variation: null },
      { name: "Tasa Banxico", val: "---", variation: null }
    ];
  } else {
    tickerItems = favorites.map(f => {
      return {
        id: f.id,
        name: f.name,
        val: f.value,
        variation: f.variation || f.config?.variation // Need to ensure background provides it
      };
    });
  }

  const updateTickerList = (trackElements) => {
    trackElements.forEach(track => {
      track.innerHTML = "";

      tickerItems.forEach(item => {
        let content = `${item.name} ${item.val}`;
        const yfUrl = getYahooFinanceUrl(item.id, item.name);
        let className = "ticker-item";
        if (yfUrl) className += " group cursor-pointer";

        if (item.variation !== undefined && item.variation !== null && !isNaN(item.variation)) {
          const change = parseFloat(item.variation);
          const sign = change > 0 ? "+" : "";
          content += ` (${sign}${change.toFixed(2)}%)`;
          className += change > 0 ? ' up' : change < 0 ? ' down' : '';
        }

        const el = yfUrl ? document.createElement("a") : document.createElement("div");
        el.className = className;

        if (yfUrl) {
          el.href = yfUrl;
          el.target = "_blank";
          el.rel = "noopener noreferrer";
        }

        const titleSpan = document.createElement("span");
        titleSpan.className = yfUrl
          ? "text transition-colors group-hover:text-primary"
          : "text";
        titleSpan.textContent = item.name;

        const valueSpan = document.createElement("span");
        valueSpan.className = "value";
        valueSpan.textContent = content.replace(item.name, "").trim();

        el.appendChild(titleSpan);
        el.appendChild(document.createTextNode(" "));
        el.appendChild(valueSpan);

        track.appendChild(el);
      });
    });
  };

  const tracks = [
    document.querySelector("#combinedTicker .ticker-track:not([aria-hidden])"),
    document.querySelector("#combinedTicker .ticker-track[aria-hidden]")
  ];

  if (tracks[0] && tracks[1]) {
    updateTickerList(tracks);
  }
}

async function loadEconomicCalendar() {
  const container = $("#economicCalendar");
  if (!container) return;

  try {
    const resp = await chrome.runtime.sendMessage({ type: "FETCH_ECONOMIC_CALENDAR" });
    if (!resp.success) throw new Error(resp.error);

    container.innerHTML = "";

    if (resp.data.length === 0) {
      container.innerHTML = `<p class="muted" style="text-align:center">No hay eventos de alto impacto esta semana.</p>`;
      return;
    }

    // Show next 4 events
    const todayStr = new Date().toISOString().split("T")[0]; // Basic comparison

    // Sort by date/time heuristically (assuming XML is semi-sorted or we just show them)
    const upcoming = resp.data.slice(0, 4);

    upcoming.forEach(ev => {
      const item = document.createElement("div");
      item.className = "calendar-item";

      // Parse Date and Time natively
      let displayDate = ev.date;
      let displayTime = ev.time;
      try {
        const d = new Date(ev.date);
        if (!isNaN(d.valueOf())) {
          displayDate = d.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' });
          displayTime = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (e) { }

      // Translate Impact
      let impactLabel = "Impacto Medio";
      let impactClass = "calendar-impact-medium";
      if (ev.impact === "High" || ev.title.includes("High")) {
        impactLabel = "Impacto Alto";
        impactClass = "calendar-impact-high";
      }

      item.innerHTML = `
          <div class="calendar-item-header">
            <span class="calendar-item-title">${ev.title} <strong>(${ev.country})</strong></span>
            <span class="calendar-item-time" style="text-transform: capitalize">${displayDate} <br/> ${displayTime}</span>
          </div>
          <div class="calendar-item-meta">
             <span class="${impactClass}">${impactLabel}</span>
             <span>Prev: ${ev.previous || '--'} | Proy: ${ev.forecast || '--'}</span>
          </div>
        `;
      container.appendChild(item);
    });

  } catch (e) {
    container.innerHTML = `<p class="muted" style="color:var(--destructive); text-align:center">Error cargando calendario</p>`;
  }
}

// --- Events ---

$("#refresh")?.addEventListener("click", () => refresh(true));

$("#backToMain")?.addEventListener("click", () => {
  const hView = $("#historicalView");
  if (hView) {
    hView.classList.add("hidden");
    hView.classList.remove("block");
  }

  const activeView = $(`#${activeTabId}`);
  if (activeView) {
    activeView.classList.remove("hidden");
    activeView.classList.add("block");
  }
});

$("#openAdvancedSettings")?.addEventListener("click", () => {
  chrome.tabs.create({ url: "onboarding.html" });
});

$("#calcAmount")?.addEventListener("input", updateCalculator);
$("#fiscalAmount")?.addEventListener("input", saveCalculatorState);
$("#fiscalInitialDate")?.addEventListener("change", saveCalculatorState);
$("#fiscalFinalDate")?.addEventListener("change", saveCalculatorState);

$("#swapMode")?.addEventListener("click", () => {
  currentMode = (currentMode === "pesosToUdis") ? "udisToPesos" : "pesosToUdis";
  updateCalculator();
  saveCalculatorState();
});

const views = ["marketView", "analysisView", "calculatorsView", "settingsView"];
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("active", "active-alt");
      b.classList.remove("text-background-dark", "text-slate-400"); // Ensure old classes are also removed
      b.classList.add("text-text-muted");
    });

    btn.classList.remove("text-text-muted", "text-slate-500");
    const target = btn.dataset.target;

    btn.classList.add("active", "text-background-dark");

    activeTabId = target;

    views.forEach(v => {
      const el = $(`#${v}`);
      if (el) {
        if (v === target) {
          el.classList.remove("hidden");
          el.classList.add("block");
        } else {
          el.classList.add("hidden");
          el.classList.remove("block");
        }
      }
    });

    $("#historicalView")?.classList.add("hidden");

    if (target === "analysisView") {
      if (!yieldCurveChartInstance) loadYieldCurve();
      loadEconomicCalendar();
    }
  });
});

async function calculateFiscalUpdate() {
  const amount = parseFloat($("#fiscalAmount").value);
  const startM = $("#fiscalInitialDate").value;
  const endM = $("#fiscalFinalDate").value;

  if (isNaN(amount) || !startM || !endM) return showToast("Completa los campos");

  showToast("Calculando...");
  setLoading(true, "Proyectando monto...");

  try {
    const range = await chrome.runtime.sendMessage({
      type: "FETCH_HISTORICAL",
      seriesId: "SP1",
      startDate: `${startM}-01`,
      endDate: `${endM}-28`
    });

    if (!range.success) throw new Error(range.error);

    const find = (m) => {
      const [y, mm] = m.split("-").map(Number);
      return range.data.find(o => {
        const p = o.fecha.split("/").map(Number);
        return p[1] === mm && p[2] === y;
      });
    };

    const obsI = find(startM);
    const obsF = find(endM);

    if (!obsI || !obsF) {
      if (!obsI && !obsF) throw new Error("INPC no disponible para ambos meses");
      if (!obsI) throw new Error(`INPC de ${startM} no publicado`);
      if (!obsF) throw new Error(`INPC de ${endM} no publicado`);
    }

    const factor = parseFloat(obsF.dato.replace(",", ".")) / parseFloat(obsI.dato.replace(",", "."));
    $("#fiscalFactor").textContent = factor.toFixed(6);
    $("#fiscalUpdatedAmount").textContent = (amount * factor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const resContainer = $("#fiscalResultContainer");
    if (resContainer) resContainer.style.display = "grid";
  } catch (e) {
    showToast(e.message, 3000);
    $("#fiscalFactor").textContent = "N/A";

    const errTextNode = document.createElement("div");
    errTextNode.className = "text-[10px] text-danger font-bold mt-1 leading-tight";
    errTextNode.textContent = e.message;

    const updatedAmtEl = $("#fiscalUpdatedAmount");
    updatedAmtEl.textContent = "Error";
    updatedAmtEl.appendChild(errTextNode);

    const resContainer = $("#fiscalResultContainer");
    if (resContainer) resContainer.style.display = "grid";
  } finally {
    setLoading(false);
  }
}

$("#calculateFiscal")?.addEventListener("click", calculateFiscalUpdate);

// --- Historical FIX Logic ---
$("#findFixBtn")?.addEventListener("click", async () => {
  const date = $("#fixDateInput").value;
  if (!date) return showToast("Selecciona una fecha");

  const btn = $("#findFixBtn");
  const res = $("#fixResult");

  btn.disabled = true;
  btn.textContent = "...";
  setLoading(true, "Consultando Banxico...");

  try {
    const payload = await chrome.runtime.sendMessage({
      type: "FETCH_HISTORICAL",
      seriesId: "SF43718",  // FIX series ID
      startDate: date,
      endDate: date
    });

    if (!payload.success) throw new Error(payload.error);

    let found = false;
    const parts = date.split("-");
    const matchFormat = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const dataPoint = payload.data.find(d => d.fecha === matchFormat);
    if (dataPoint && dataPoint.dato !== "N/E") {
      res.textContent = `$ ${dataPoint.dato} MXN`;
      res.classList.remove("placeholder", "muted");
      res.style.color = 'var(--primary)';
      found = true;
    }

    if (!found) {
      res.textContent = "No hay FIX oficial para este día (Ej. Fin de semana o Festivo)";
      res.classList.add("placeholder");
      res.style.color = '';
    }

  } catch (e) {
    showToast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Buscar";
    setLoading(false);
  }
});

// Initial Load
(function initCalculator() {
  const calcAmountInput = $("#calcAmount");
  if (calcAmountInput && !calcAmountInput.value) {
    calcAmountInput.value = "1";
  }
  loadCalculatorState();
})();

refresh();

// Settings Persistence
chrome.storage.local.get("volatThreshold").then(({ volatThreshold = 0.5 }) => {
  const el = $("#volatThreshold");
  if (el) el.value = volatThreshold;
});

$("#volatThreshold")?.addEventListener("change", (e) => {
  const val = parseFloat(e.target.value) || 0.5;
  chrome.storage.local.set({ volatThreshold: val });
  showToast("Umbral actualizado");
});
