const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

async function fetchOportuno(idsCsv, token) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${idsCsv}/datos/oportuno?mediaType=json&token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

function render(rows, warn = false) {
  $("#warning").style.display = warn ? "block" : "none";
  const tb = $("#tbody"); tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.name)}</td><td>${esc(r.value)}</td><td>${esc(r.date)}</td>`;
    tb.append(tr);
  }
}

async function refresh() {
  const { sieToken, sieSeries } = await chrome.storage.local.get(["sieToken", "sieSeries"]);

  if (!sieToken) {
    render([{ name: "Configura tu token en Onboarding", value: "—", date: "—" }], true);
    return;
  }

  let list = Array.isArray(sieSeries) ? sieSeries : [];
  if (list.length === 0) {
    list = [
      { id: "SF43783", title: "TIIE a 28 días (%)", type: "percent", currency: "MXN", decimals: 4, periodicity: "Diaria" },
      { id: "SF43718", title: "Tipo de cambio Pesos por dólar (FIX)", type: "currency", currency: "MXN", decimals: 4, periodicity: "Diaria" }
    ];
  }

  try {
    const idsCsv = list.map(s => s.id).join(",");
    const data = await fetchOportuno(idsCsv, sieToken);
    const byId = new Map((data?.bmx?.series || []).map(s => [s.idSerie, s]));

    const rows = list.map(cfg => {
      const s = byId.get(cfg.id);
      const d = s?.datos?.[0];
      const value = fmtValue(cfg, d?.dato);
      const date = fmtDate(d?.fecha, cfg.periodicity);
      return { name: cfg.title || cfg.id, value, date };
    });

    render(rows, false);
  } catch (e) {
    render(list.map(cfg => ({ name: cfg.title || cfg.id, value: "—", date: `Error: ${e.message}` })), false);
  }
}

$("#refresh")?.addEventListener("click", refresh);
refresh();