import { DEFAULT_SERIES, BANXICO_API_BASE } from './constants.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

// Toast notification for copy feedback
function showToast(msg, duration = 1500) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

// Copy value to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado");
  } catch (e) {
    showToast("Error al copiar");
  }
}

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
  } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(dateStr);
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

function render(rows, warn = false) {
  $("#warning").style.display = warn ? "block" : "none";
  const tb = $("#tbody"); tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    
    // Name cell with tooltip
    const nameCell = document.createElement("td");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = r.name;
    if (r.description || r.periodicity) {
      nameSpan.style.borderBottom = "1px dotted #cbd5e1";
      nameSpan.style.cursor = "help";
      const tooltip = [];
      if (r.description) tooltip.push(r.description);
      if (r.periodicity) tooltip.push(`Periodicidad: ${r.periodicity}`);
      nameSpan.title = tooltip.join("\n");
    }
    nameCell.appendChild(nameSpan);
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
      return { name: cfg.title || cfg.id, value, date: resolvedDate, description: cfg.description, periodicity: cfg.periodicity };
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

$("#refresh")?.addEventListener("click", refresh);
refresh();