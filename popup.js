import { DEFAULT_SERIES } from './constants.js';

const $ = s => document.querySelector(s);

let currentUdiValue = null;
let currentUdiDate = null;
let currentMode = "udisToPesos";


// --- General UI Functions ---
function showToast(msg, duration = 1500) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado");
  } catch (e) {
    showToast("Error al copiar");
  }
}

// --- Data Formatting ---

function fmtValue(cfg, datoStr) {
  if (!datoStr || datoStr === "N/E") return "—";
  const x = Number(datoStr.replace(",", "."));
  if (!isFinite(x)) return datoStr;

  if (cfg.type === "currency") {
    return x.toLocaleString("es-MX", {
      style: "currency",
      currency: cfg.currency || "MXN",
      minimumFractionDigits: cfg.decimals ?? 2,
      maximumFractionDigits: cfg.decimals ?? 4
    });
  }
  if (cfg.type === "percent") {
    return (x / 100).toLocaleString("es-MX", {
      style: "percent",
      minimumFractionDigits: cfg.decimals ?? 2,
      maximumFractionDigits: cfg.decimals ?? 4
    });
  }
  return x.toLocaleString("es-MX", {
    minimumFractionDigits: cfg.decimals ?? 0,
    maximumFractionDigits: cfg.decimals ?? 6
  });
}

function fmtDate(dateStr, periodicity) {
  if (!dateStr || dateStr === "—") return "—";

  let date;
  if (dateStr.match(/^\d{2}\/\d{4}$/)) {
    const [month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, 1);
  } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    return dateStr;
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

function render(rows, warn = false) {
  const warningEl = $("#warning");
  if (warningEl) warningEl.style.display = warn ? "block" : "none";

  const container = $("#indicatorCards");
  if (!container) return;
  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = '<p class="muted" style="text-align:center">No hay indicadores seleccionados.</p>';
    return;
  }

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
      title.style.borderBottom = "1px dotted var(--border)";
      title.style.cursor = "help";
      title.title = r.config.description;
    }

    const date = document.createElement("div");
    date.className = "card-date";
    date.textContent = r.date;

    info.appendChild(title);
    info.appendChild(date);
    card.appendChild(info);

    // Right side: Value and Actions
    const data = document.createElement("div");
    data.className = "card-data";

    const value = document.createElement("div");
    value.className = "card-value";
    value.textContent = r.value;
    data.appendChild(value);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "icon-btn";
    copyBtn.innerHTML = "📋";
    copyBtn.title = "Copiar valor";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(r.value);
    });

    actions.appendChild(copyBtn);

    if (r.date !== "Sin datos" && r.date !== "—") {
      const graphBtn = document.createElement("button");
      graphBtn.className = "icon-btn";
      graphBtn.innerHTML = "📈";
      graphBtn.title = "Ver gráfico histórico";
      graphBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showHistoricalView(r.id, r.name, r.config);
      });
      actions.appendChild(graphBtn);
    }

    data.appendChild(actions);
    card.appendChild(data);

    container.appendChild(card);
  }
}

async function refresh(force = false) {
  document.body.classList.add("loading");

  if (force) {
    showToast("Actualizando datos...");
    await chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
  }

  const storage = await chrome.storage.local.get([
    "sieToken", "sieSeries", "lastUpdated", "cachedSeriesData"
  ]);
  const { sieToken, sieSeries, lastUpdated, cachedSeriesData } = storage;
  console.log("[Popup] Storage retrieved:", { hasToken: !!sieToken, seriesCount: cachedSeriesData?.length });

  // Update badge
  const badge = document.getElementById("lastUpdated");
  if (lastUpdated && badge) {
    const mins = Math.floor((Date.now() - lastUpdated) / 60000);
    badge.textContent = `Actualizado: ${mins < 1 ? "Ahora" : "Hace " + mins + " min"}`;
  }

  if (!sieToken) {
    render([{ name: "Falta configurar Token", value: "—", date: "—" }], true);
    document.body.classList.remove("loading");
    return;
  }

  // If no data yet, trigger a refresh and wait
  if (!cachedSeriesData || cachedSeriesData.length === 0) {
    console.log("[Popup] No cached data found, requesting refresh...");
    const res = await chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
    if (!res?.success) {
      console.error("[Popup] Refresh request failed:", res?.error);
      render([{ name: "Error al obtener datos", value: "—", date: res?.error || "Error desconocido" }], false);
      document.body.classList.remove("loading");
      return;
    }
    console.log("[Popup] Refresh successful, retrying load...");
    // Call refresh again to load from the now-populated storage
    return refresh(false);
  }

  console.log("[Popup] Loading data from storage:", cachedSeriesData.length, "series.");
  if (cachedSeriesData.length > 0) console.log("[Popup] First cached item sample:", JSON.stringify(cachedSeriesData[0]));

  const byId = new Map();
  cachedSeriesData.forEach(s => {
    if (s.idSerie) byId.set(s.idSerie, s);
  });
  let list = Array.isArray(sieSeries) ? sieSeries : DEFAULT_SERIES;

  const rows = list.map(cfg => {
    const s = byId.get(cfg.id);
    if (!s) return { name: cfg.title || cfg.id, value: "—", date: "Sin datos", config: cfg };
    const latest = latestValidObservation(s.datos);
    return {
      id: cfg.id,
      name: cfg.title || cfg.id,
      value: fmtValue(cfg, latest?.dato),
      date: fmtDate(latest?.fecha, cfg.periodicity),
      config: cfg
    };
  });

  // UDI Calculator dependencies
  const udiSerie = byId.get('SP68257');
  if (udiSerie) {
    const udiObs = latestValidObservation(udiSerie.datos);
    if (udiObs) {
      currentUdiValue = Number(udiObs.dato.replace(",", "."));
      currentUdiDate = fmtDate(udiObs.fecha, "diaria");
      updateCalculator();
    }
  }

  // INPC / Health dependencies
  const inpcSerie = byId.get('SP1') || byId.get('SP30579');
  if (inpcSerie) {
    const inpcObs = latestValidObservation(inpcSerie.datos);
    if (inpcObs) {
      const parts = inpcObs.fecha.split("/");
      const maxMonth = `${parts[2]}-${parts[1].padStart(2, '0')}`;
      if ($("#fiscalInitialDate")) $("#fiscalInitialDate").max = maxMonth;
      if ($("#fiscalFinalDate")) $("#fiscalFinalDate").max = maxMonth;
    }
  }

  const targetRateSerie = byId.get('SF61745');
  const inflationSerie = byId.get('SP74665');
  if (targetRateSerie && inflationSerie) {
    updateRealRateMonitor(targetRateSerie, inflationSerie);
  }

  render(rows, false);
  document.body.classList.remove("loading");
}

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

function updateRealRateMonitor(targetRateSerie, inflationSerie) {
  const targetObs = latestValidObservation(targetRateSerie.datos);
  const inflationObs = latestValidObservation(inflationSerie.datos);
  if (!targetObs || !inflationObs) return;

  const nominal = parseFloat(targetObs.dato.replace(",", "."));
  const inflation = parseFloat(inflationObs.dato.replace(",", "."));
  const realRate = calculateRealRate(nominal, inflation);

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
  const mainView = $("#mainView");
  const historyView = $("#historicalView");
  const tableContainer = $("#historicalTableContainer");
  const errorEl = $("#historicalError");
  const titleEl = $("#historicalTitle");
  const startInput = $("#historicalStartDate");
  const endInput = $("#historicalEndDate");

  // Switch Views
  mainView.style.display = "none";
  historyView.style.display = "block";
  titleEl.textContent = title;

  // Clear State
  tableContainer.innerHTML = "";
  errorEl.textContent = "";

  // Set Default Dates (Last month)
  const end = new Date();
  const start = new Date();
  start.setMonth(end.getMonth() - 1);
  startInput.value = start.toISOString().slice(0, 10);
  endInput.value = end.toISOString().slice(0, 10);

  const update = async () => {
    document.body.classList.add("loading");
    errorEl.textContent = "";
    tableContainer.innerHTML = "";

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "FETCH_HISTORICAL",
        seriesId,
        startDate: startInput.value,
        endDate: endInput.value
      });

      if (!resp.success) throw new Error(resp.error);

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
  $("#historicalView").style.display = "none";
  $("#mainView").style.display = "block";
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

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;
    $("#mainView").style.display = target === "mainView" ? "block" : "none";
    $("#fiscalView").style.display = target === "fiscalView" ? "block" : "none";
    $("#historicalView").style.display = "none";
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
    $("#fiscalResultContainer").style.display = "grid";
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
