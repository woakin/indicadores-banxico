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
  $("#warning").style.display = warn ? "block" : "none";
  const tb = $("#tbody"); tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");

    // Name cell
    const nameCell = document.createElement("td");
    nameCell.textContent = r.name;
    if (r.description || r.periodicity) {
      nameCell.style.borderBottom = "1px dotted #cbd5e1";
      nameCell.style.cursor = "help";
      const tooltip = [];
      if (r.description) tooltip.push(r.description);
      if (r.periodicity) tooltip.push(`Periodicidad: ${r.periodicity}`);
      nameCell.title = tooltip.join("\n");
    }
    tr.appendChild(nameCell);

    // Value cell
    const valueCell = document.createElement("td");
    const valueDiv = document.createElement("div");
    valueDiv.className = "value-cell";

    const valueSpan = document.createElement("span");
    valueSpan.textContent = r.value;
    valueDiv.appendChild(valueSpan);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "📋";
    copyBtn.title = "Copiar valor";
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      copyToClipboard(r.value);
    });

    valueDiv.appendChild(copyBtn);
    valueCell.appendChild(valueDiv);
    tr.appendChild(valueCell);

    // Date cell
    const dateCell = document.createElement("td");
    dateCell.textContent = r.date;
    tr.appendChild(dateCell);

    // Graph button cell
    const graphCell = document.createElement("td");
    if (r.date !== "Sin datos" && r.date !== "—") {
      const detailBtn = document.createElement("button");
      detailBtn.className = "copy-btn";
      detailBtn.textContent = "📈";
      detailBtn.title = "Ver gráfico histórico";
      detailBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showHistoricalView(r.id, r.name, r.config);
      });
      graphCell.appendChild(detailBtn);
    }
    tr.appendChild(graphCell);
    tb.append(tr);
  }
}

async function refresh(force = false) {
  document.body.classList.add("loading");

  if (force) {
    showToast("Actualizando datos...");
    await chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
  }

  const { sieToken, sieSeries, lastUpdated, cachedSeriesData } = await chrome.storage.local.get([
    "sieToken", "sieSeries", "lastUpdated", "cachedSeriesData"
  ]);

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
    const res = await chrome.runtime.sendMessage({ type: "REFRESH_DATA" });
    if (!res?.success) {
      render([{ name: "Error al obtener datos", value: "—", date: res?.error || "Error" }], false);
      document.body.classList.remove("loading");
      return;
    }
    // Call refresh again to load from the now-populated storage
    return refresh(false);
  }

  const byId = new Map(cachedSeriesData.map(s => [s.idSerie, s]));
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

  modeLabel.innerHTML = currentMode === "pesosToUdis" ? "Pesos &rarr; UDIs" : "UDIs &rarr; Pesos";

  if (amountStr === "") {
    resultArea.textContent = "Ingrese un monto";
    dateArea.textContent = currentUdiDate ? `Valor al ${currentUdiDate}` : "";
    return;
  }
  if (isNaN(amount) || amount < 0) {
    resultArea.textContent = "Monto inválido";
    return;
  }

  if (currentMode === "pesosToUdis") {
    const res = amount / currentUdiValue;
    resultArea.textContent = res.toLocaleString("es-MX", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " UDIs";
  } else {
    const res = amount * currentUdiValue;
    resultArea.textContent = res.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }
  dateArea.textContent = `Valor al ${currentUdiDate}`;
}

function updateRealRateMonitor(targetRateSerie, inflationSerie) {
  const targetObs = latestValidObservation(targetRateSerie.datos);
  const inflationObs = latestValidObservation(inflationSerie.datos);
  if (!targetObs || !inflationObs) return;

  const nominal = parseFloat(targetObs.dato.replace(",", "."));
  const inflation = parseFloat(inflationObs.dato.replace(",", "."));
  const realRate = nominal - inflation;

  const fmt = (v) => v.toLocaleString("es-MX", { minimumFractionDigits: 2 }) + "%";
  $("#nominalRateValue").textContent = fmt(nominal);
  $("#nominalInflationValue").textContent = fmt(inflation);
  $("#realRateLabel").textContent = (realRate >= 0 ? "+" : "") + fmt(realRate) + " Real";
  $("#realRateLabel").className = "badge " + (realRate >= 0 ? "positive" : "negative");

  if (realRate > 0) $("#realRateDescription").textContent = "¡Ganas valor! Superas la inflación.";
  else if (realRate < 0) $("#realRateDescription").textContent = "Pierdes valor frente a la inflación.";
  else $("#realRateDescription").textContent = "Mantienes el valor de tu dinero.";

  if (nominal > 0) {
    const infP = Math.min(100, (inflation / nominal) * 100);
    $("#realRateInflationBar").style.width = `${infP}%`;
    $("#realRateProfitBar").style.width = `${Math.max(0, 100 - infP)}%`;
  }
}

// --- Historical View ---

async function showHistoricalView(seriesId, title, config) {
  $("#mainView").style.display = "none";
  $("#historicalView").style.display = "block";
  $("#historicalTitle").textContent = title;

  const end = new Date();
  const start = new Date();
  start.setMonth(end.getMonth() - 1);
  $("#endDate").value = end.toISOString().slice(0, 10);
  $("#startDate").value = start.toISOString().slice(0, 10);

  const update = async () => {
    document.body.classList.add("loading");
    $("#historicalError").textContent = "";
    $("#historicalTableContainer").innerHTML = "";

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "FETCH_HISTORICAL",
        seriesId,
        startDate: $("#startDate").value,
        endDate: $("#endDate").value
      });

      if (!resp.success) throw new Error(resp.error);

      const data = resp.data;
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Fecha</th><th>Valor</th></tr></thead>";
      const tbody = document.createElement("tbody");
      for (let i = data.length - 1; i >= 0; i--) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDate(data[i].fecha, config.periodicity)}</td><td style="text-align:right">${fmtValue(config, data[i].dato)}</td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      $("#historicalTableContainer").appendChild(table);
    } catch (e) {
      $("#historicalError").textContent = e.message;
    } finally {
      document.body.classList.remove("loading");
    }
  };

  $("#updateHistory").onclick = update;
  update();
}

// --- Events ---

$("#refresh")?.addEventListener("click", () => refresh(true));
$("#backToList")?.addEventListener("click", () => {
  $("#historicalView").style.display = "none";
  $("#mainView").style.display = "block";
});

$("#calcAmount")?.addEventListener("input", updateCalculator);
$("#swapMode")?.addEventListener("click", () => {
  currentMode = (currentMode === "pesosToUdis") ? "udisToPesos" : "pesosToUdis";
  updateCalculator();
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
    $("#fiscalResultContainer").style.display = "block";
  } catch (e) {
    showToast(e.message);
  } finally {
    document.body.classList.remove("loading");
  }
}

$("#calculateFiscal")?.addEventListener("click", calculateFiscalUpdate);

// Initial Load
refresh();