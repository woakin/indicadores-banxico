import { DEFAULT_SERIES, ANALYSIS_SERIES, AV_CATALOG } from './constants.js';

const $ = s => document.querySelector(s);

let currentUdiValue = null;
let currentUdiDate = null;
let currentMode = "udisToPesos";
let activeTabId = "marketView";


// --- General UI Functions ---
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

// --- Data Formatting ---

function fmtValue(cfg, datoStr) {
  if (!datoStr || datoStr === "N/E") return "—";

  // Replace comma with dot for decimal handling, then clean non-numeric chars
  const cleanStr = datoStr.replace(",", ".").replace(/[^0-9.-]/g, "");
  const x = Number(cleanStr);
  if (isNaN(x)) return datoStr;

  const d = cfg.decimals !== undefined ? cfg.decimals : 2;

  if (cfg.type === "currency") {
    return x.toLocaleString("es-MX", {
      style: "currency",
      currency: cfg.currency || "MXN",
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }
  if (cfg.type === "percent") {
    return (x / 100).toLocaleString("es-MX", {
      style: "percent",
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }
  return x.toLocaleString("es-MX", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function fmtDate(dateStr, periodicity) {
  if (!dateStr || dateStr === "—") return "—";

  const parts = dateStr.split("/");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  if (periodicity === "Mensual" || periodicity === "Quincenal") {
    // Handling MM/YYYY or DD/MM/YYYY
    if (parts.length === 2) { // MM/YYYY
      const monthIndex = parseInt(parts[0]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${parts[1]}`;
      }
    } else if (parts.length === 3) { // DD/MM/YYYY
      const monthIndex = parseInt(parts[1]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${parts[2]}`;
      }
    }
  }

  // Fallback to original logic for other formats or if periodicity doesn't match
  let date;
  if (dateStr.match(/^\d{2}\/\d{4}$/)) { // MM/YYYY
    const [month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, 1);
  } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) { // DD/MM/YYYY
    const [day, month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    return dateStr; // Return original string if no match
  }

  if (isNaN(date.getTime())) return "—";

  const opts = (periodicity?.toLowerCase().includes("mensual"))
    ? { month: "short", year: "numeric" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };

  return date.toLocaleDateString("es-MX", opts);
}

function latestValidObservation(datos) {
  if (!Array.isArray(datos) || datos.length === 0) return undefined;
  for (let i = datos.length - 1; i >= 0; i -= 1) {
    const obs = datos[i];
    const raw = (obs?.dato || "").trim().toUpperCase();
    if (raw && raw !== "N/E") return obs;
  }
  return undefined;
}

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
    container.innerHTML = '<p class="muted" style="text-align:center">No hay indicadores seleccionados.</p>';
    return;
  }

  const parseDmx = (d) => {
    if (!d || typeof d !== 'string') return new Date(0);
    const p = d.split("/");
    return p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : new Date(p[1], p[0] - 1, 1);
  };

  for (const r of rows) {
    const card = document.createElement("div");
    card.className = "indicator-card";

    // Left side: Name and Date
    const info = document.createElement("div");
    info.className = "card-info";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = r.name;
    if (r.config?.description) {
      title.title = r.config.description;
    }

    const date = document.createElement("div");
    date.className = "card-date";
    date.textContent = r.date;

    info.appendChild(title);
    info.appendChild(date);

    // Error Indicator
    if (r.error) {
      const errIcon = document.createElement("span");
      errIcon.textContent = "⚠️";
      errIcon.style.cursor = "help";
      errIcon.title = `Error: ${r.error} (Mostrando último dato guardado)`;
      errIcon.style.marginLeft = "6px";
      info.appendChild(errIcon);
    }

    card.appendChild(info);

    // Right side: Value, Variation, Actions
    const data = document.createElement("div");
    data.className = "card-data";

    const valueRow = document.createElement("div");
    valueRow.style.display = "flex";
    valueRow.style.alignItems = "center";
    valueRow.style.gap = "8px";

    const value = document.createElement("div");
    value.className = "card-value";
    value.style.fontFamily = "'Manrope', sans-serif";
    value.style.fontWeight = "700";
    value.textContent = r.value;

    // Volatility Badge
    let delta = r.variation;
    const canCalculate = r.val && r.prev && r.date && r.prevDate;

    if (delta !== null && delta !== undefined || canCalculate) {
      try {
        if (delta === null || delta === undefined) {
          const v1 = parseFloat(r.val.replace(",", "."));
          const v2 = parseFloat(r.prev.replace(",", "."));
          delta = ((v1 - v2) / v2) * 100;
        }

        const badge = document.createElement("span");
        badge.className = "variation-badge";

        let labelText = "vs cierre";
        if (r.date && r.prevDate) {
          const d1 = parseDmx(r.date);
          const d2 = parseDmx(r.prevDate);
          const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
          if (diffDays > 25) labelText = "anualizada";
          else if (diffDays > 3) labelText = "sem ant.";
        } else if (r.id?.startsWith("AV_")) {
          labelText = "hoy";
        }

        const icon = delta > 0 ? "↑" : delta < 0 ? "↓" : "";
        const color = delta > 0 ? "var(--secondary)" : delta < 0 ? "var(--destructive)" : "var(--text-muted)";

        badge.style.color = color;
        badge.innerHTML = `${icon} ${Math.abs(delta).toFixed(2)}% <small style="opacity:0.7; font-weight:400; margin-left:2px">${labelText}</small>`;
        valueRow.appendChild(value);
        valueRow.appendChild(badge);
      } catch (err) {
        console.warn("[Popup] Variation display failed:", err);
        valueRow.appendChild(value);
      }
    } else {
      valueRow.appendChild(value);
    }

    data.appendChild(valueRow);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "icon-btn";
    copyBtn.innerHTML = "📋";
    copyBtn.title = "Copiar Excel-Ready ([VALOR]\\t[FECHA])";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(r.value, r.date);
    });

    actions.appendChild(copyBtn);

    if (r.date !== "Sin datos" && r.date !== "—") {
      const graphBtn = document.createElement("button");
      graphBtn.className = "icon-btn";
      graphBtn.innerHTML = "📈";
      graphBtn.title = "Ver historial";
      graphBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showHistoricalView(r.id, r.name, r.config);
      });
      actions.appendChild(graphBtn);
    }

    actions.style.marginTop = "4px";
    data.appendChild(actions);
    card.appendChild(data);
    container.appendChild(card);
  }
}

async function refresh(force = false) {
  // Silent refresh doesn't show the full body loader
  if (force) document.body.classList.add("loading");

  const storage = await chrome.storage.local.get([
    "sieToken", "avToken", "sieSeries", "lastUpdated", "cachedSeriesData"
  ]);
  const { sieToken, avToken, sieSeries, lastUpdated, cachedSeriesData } = storage;

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
  } else if (!sieToken && !avToken) {
    // No cache AND no tokens: show configuration prompt
    render([{ name: "Configura tus Tokens", value: "—", date: "Haz clic en Configuración" }], true);
    document.body.classList.remove("loading");
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

  document.body.classList.remove("loading");
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

  // Synchronization: Merge storage data with latest DEFAULT_SERIES and AV_CATALOG metadata
  const allMetadata = [...DEFAULT_SERIES, ...AV_CATALOG];
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

  // Check for Alpha Vantage Rate Limits in ANY row (Indicator Cards)
  const hasRateLimit = rows.some(r => r.error && r.error.includes("Límite"));
  const rateNotice = $("#rateLimitNotice");
  if (rateNotice) rateNotice.style.display = hasRateLimit ? "block" : "none";

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
  $("#inflLabel").textContent = `Inflación: ${fmt(inflation)}`;
  $("#targetLabel").textContent = `Tasa Objetivo: ${fmt(nominal)}`;

  const label = $("#realRateLabel");
  label.textContent = (realRate >= 0 ? "+" : "") + fmt(realRate) + " Real";
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
    if (realRate >= 0) {
      profitBar.style.background = "var(--secondary)"; // Alasha Green
      label.style.background = "var(--secondary)";
      label.style.color = "#FFFFFF";
    } else {
      profitBar.style.background = "var(--destructive)"; // Destructive Red
      label.style.background = "var(--destructive)";
      label.style.color = "#FFFFFF";
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
    $(`#${v}`)?.style && ($(`#${v}`).style.display = "none");
  });

  historyView?.style && (historyView.style.display = "block");
  if (titleEl) titleEl.textContent = title;

  // Clear State
  tableContainer.innerHTML = "";
  errorEl.textContent = "";

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
    document.body.classList.add("loading");
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
    } catch (e) {
      errorEl.textContent = e.message;
    } finally {
      document.body.classList.remove("loading");
    }
  };

  $("#historicalUpdate").onclick = update;
  update();
}

// --- Events ---

$("#refresh")?.addEventListener("click", () => refresh(true));

$("#backToMain")?.addEventListener("click", () => {
  $("#historicalView")?.style && ($("#historicalView").style.display = "none");
  $(`#${activeTabId}`)?.style && ($(`#${activeTabId}`).style.display = "block");
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
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;
    activeTabId = target;

    views.forEach(v => {
      const el = $(`#${v}`);
      if (el?.style) el.style.display = v === target ? "block" : "none";
    });

    $("#historicalView")?.style && ($("#historicalView").style.display = "none");
  });
});

async function calculateFiscalUpdate() {
  const amount = parseFloat($("#fiscalAmount").value);
  const startM = $("#fiscalInitialDate").value;
  const endM = $("#fiscalFinalDate").value;

  if (isNaN(amount) || !startM || !endM) return showToast("Completa los campos");

  showToast("Calculando...");
  document.body.classList.add("loading");

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
    if (!obsI || !obsF) throw new Error("Índice no disponible para el periodo");

    const factor = parseFloat(obsF.dato.replace(",", ".")) / parseFloat(obsI.dato.replace(",", "."));
    $("#fiscalFactor").textContent = factor.toFixed(6);
    $("#fiscalUpdatedAmount").textContent = (amount * factor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const resContainer = $("#fiscalResultContainer");
    if (resContainer) resContainer.style.display = "grid";
  } catch (e) {
    showToast(e.message);
  } finally {
    document.body.classList.remove("loading");
  }
}

$("#calculateFiscal")?.addEventListener("click", calculateFiscalUpdate);

// Initial Load
loadCalculatorState();
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
