import { DEFAULT_SERIES, BANXICO_API_BASE } from './constants.js';

const $ = s => document.querySelector(s);


// --- General UI Functions ---
function showToast(msg, duration = 1500) {
  const toast = $("#toast");
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

// --- Banxico API & Data Formatting ---
async function fetchOportuno(idsCsv, token) {
  const url = `${BANXICO_API_BASE}/series/${idsCsv}/datos?mediaType=json&token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    if (r.status === 401) throw new Error("Token SIE inválido o expirado");
    if (r.status === 404) throw new Error("Serie no encontrada");
    throw new Error(`Error HTTP ${r.status}`);
  }
  return r.json();
}

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

// Pick the most recent observation that has a numeric value (skip N/E or empty)
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
    
    // Name cell with tooltip
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
    
    // Value cell with copy button
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
    // Only show detail button if there is data for the series
    if (r.date !== "Sin datos" && r.date !== "—") {
      const detailBtn = document.createElement("button");
      detailBtn.className = "copy-btn"; // Re-use style for a clean look
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

async function refresh() {
  document.body.classList.add("loading");
  const { sieToken, sieSeries, lastUpdated } = await chrome.storage.local.get(["sieToken", "sieSeries", "lastUpdated"]);

  // Update last updated badge
  if (lastUpdated) {
    const mins = Math.floor((Date.now() - lastUpdated) / 60000);
    const label = mins < 1 ? "Hace unos segundos" : mins === 1 ? "Hace 1 minuto" : `Hace ${mins} minutos`;
    const badge = document.getElementById("lastUpdated");
    if (badge) badge.textContent = `Actualizado: ${label}`;
  }

  if (!sieToken) {
    render([{ name: "Configura tu token en Onboarding", value: "—", date: "—" }], true);
    document.body.classList.remove("loading");
    return;
  }

  let list = Array.isArray(sieSeries) ? sieSeries : [];
  if (list.length === 0) {
    list = DEFAULT_SERIES;
  }

  try {
    const idsCsv = list.map(s => s.id).join(",");
    const data = await fetchOportuno(idsCsv, sieToken);
    const byId = new Map((data?.bmx?.series || []).map(s => [s.idSerie, s]));

    const rows = list.map(cfg => {
      const s = byId.get(cfg.id);
      if (!s) {
        return { name: cfg.title || cfg.id, value: "—", date: "Sin datos", description: cfg.description, periodicity: cfg.periodicity };
      }

      const datos = Array.isArray(s.datos) ? s.datos : [];
      const latest = latestValidObservation(datos);
      const value = fmtValue(cfg, latest?.dato);
      const date = fmtDate(latest?.fecha, cfg.periodicity);
      const resolvedDate = latest ? (date || "Sin datos") : "Sin datos";      
      return { id: cfg.id, name: cfg.title || cfg.id, value, date: resolvedDate, description: cfg.description, periodicity: cfg.periodicity, config: cfg };
    });

    render(rows, false);
    
    // Save last updated timestamp
    await chrome.storage.local.set({ lastUpdated: Date.now() });
  } catch (e) {
    render(list.map(cfg => ({ name: cfg.title || cfg.id, value: "—", date: `Error: ${e.message}` })), false);
  } finally {
    document.body.classList.remove("loading");
  }
}

// --- Historical View Logic ---

async function fetchHistoricalData(seriesId, token, startDate, endDate) {
  const url = `${BANXICO_API_BASE}/series/${seriesId}/datos/${startDate}/${endDate}?mediaType=json&token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Token SIE inválido o expirado.");
    if (response.status === 404) throw new Error("No se encontraron datos para este rango de fechas.");
    throw new Error(`Error en la API de Banxico: ${response.statusText}`);
  }
  const data = await response.json();
  const seriesData = data.bmx?.series?.[0]?.datos;
  if (!seriesData || seriesData.length === 0) {
    throw new Error("No se encontraron datos para este rango de fechas.");
  }
  return seriesData;
}

function renderHistoricalTable(data, config) {
  const container = $("#historicalTableContainer");
  if (!data || data.length === 0) {
    container.innerHTML = ""; // Limpiamos por si acaso.
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>Fecha</th><th>Valor</th></tr></thead>`;
  const tbody = document.createElement("tbody");

  // Iteramos en reversa para mostrar los más recientes primero
  for (let i = data.length - 1; i >= 0; i--) {
    const point = data[i];
    const tr = document.createElement("tr");
    const dateCell = document.createElement("td");
    const valueCell = document.createElement("td");

    dateCell.textContent = fmtDate(point.fecha, config.periodicity);
    valueCell.textContent = fmtValue(config, point.dato);
    valueCell.style.textAlign = "right";

    tr.appendChild(dateCell);
    tr.appendChild(valueCell);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = ""; // Limpiar contenido anterior
  container.appendChild(table);
}

async function updateHistoricalView() {
  const view = $("#historicalView");
  const seriesId = view.dataset.seriesId;
  const config = JSON.parse(view.dataset.config);
  const startDate = $("#startDate").value;
  const endDate = $("#endDate").value;

  document.body.classList.add('loading');
  $("#historicalError").textContent = "";
  // Ocultar todos los contenedores de contenido antes de la llamada a la API
  $("#historicalTableContainer").innerHTML = "";
  $("#historicalTableContainer").style.display = "none";
  $("#noDataMessage").style.display = "none";

  try {
    const { sieToken } = await chrome.storage.local.get("sieToken");
    if (!sieToken) throw new Error("Falta el token de la API.");
    
    const historicalData = await fetchHistoricalData(seriesId, sieToken, startDate, endDate);
    $("#historicalTableContainer").style.display = "block";
    renderHistoricalTable(historicalData, config);
  } catch (error) {
    // Si el error es "No se encontraron datos", mostramos el mensaje amigable.
    if (error.message.includes("No se encontraron datos")) {
      $("#noDataMessage").style.display = "block";
    } else {
      $("#historicalError").textContent = `Error: ${error.message}`;
    }
  } finally {
    document.body.classList.remove('loading');
  }
}

function showHistoricalView(seriesId, seriesTitle, seriesConfig) {
  $("#mainView").style.display = "none";
  $("#historicalView").style.display = "block";

  const view = $("#historicalView");
  view.dataset.seriesId = seriesId;
  view.dataset.config = JSON.stringify(seriesConfig); // Guardamos la config para formatear valores

  $("#historicalTitle").textContent = seriesTitle;

  // Rango de fechas por defecto: último mes
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 1);
  $("#endDate").value = endDate.toISOString().slice(0, 10);
  $("#startDate").value = startDate.toISOString().slice(0, 10);

  updateHistoricalView();
}

// --- Event Listeners ---
$("#refresh")?.addEventListener("click", refresh);
$("#backToList")?.addEventListener("click", () => {
  $("#historicalView").style.display = "none";
  $("#mainView").style.display = "block";
});
$("#updateHistory")?.addEventListener("click", updateHistoricalView);

refresh();