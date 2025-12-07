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

function render(rows, warn=false) {
  $("#warning").style.display = warn ? "block" : "none";
  const tb = $("#tbody"); tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.name)}</td><td>${esc(r.value)}</td><td>${esc(r.date)}</td>`;
    tb.append(tr);
  }
}

async function refresh() {
  const { sieToken, sieSeries } = await chrome.storage.local.get(["sieToken","sieSeries"]);

  if (!sieToken) {
    render([{name:"Configura tu token en Onboarding", value:"—", date:"—"}], true);
    return;
  }

  const list = Array.isArray(sieSeries) && sieSeries.length ? sieSeries : [
    { id:"SF61745",  title:"Tasa objetivo",                        type:"percent",  decimals:2 },
    { id:"SF60648",  title:"TIIE a 28 días",                       type:"percent",  decimals:4 },
    { id:"SF60633",  title:"CETES a 28 días",                      type:"percent",  decimals:2 },
    { id:"SF331451", title:"Fondeo bancario (TIIE de fondeo 1 día)", type:"percent", decimals:4 },
    { id:"SF43718",  title:"Tipo de cambio FIX (USD/MXN)",         type:"currency", currency:"MXN", decimals:4 },
    { id:"SF60653",  title:"Tipo de cambio para pagos (USD/MXN)",  type:"currency", currency:"MXN", decimals:4 }
  ];

  try {
    const idsCsv = list.map(s => s.id).join(",");
    const data = await fetchOportuno(idsCsv, sieToken);
    const byId = new Map((data?.bmx?.series || []).map(s => [s.idSerie, s]));

    const rows = list.map(cfg => {
      const s = byId.get(cfg.id);
      const d = s?.datos?.[0];
      return { name: cfg.title || cfg.id, value: fmtValue(cfg, d?.dato), date: d?.fecha || "—" };
    });
    render(rows, false);
  } catch (e) {
    render(list.map(cfg => ({ name: cfg.title || cfg.id, value: "—", date: `Error: ${e.message}` })), false);
  }
}

$("#refresh")?.addEventListener("click", refresh);
refresh();
