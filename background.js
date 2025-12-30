import { DEFAULT_SERIES, BANXICO_API_BASE } from './constants.js';

// --- Background Fetch Logic ---

async function fetchOportuno(idsCsv, token) {
    const url = `${BANXICO_API_BASE}/series/${idsCsv}/datos/oportuno?mediaType=json&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
        if (r.status === 401) throw new Error("Token SIE inválido o expirado");
        if (r.status === 404) throw new Error("Serie no encontrada");
        throw new Error(`Error HTTP ${r.status}`);
    }
    return r.json();
}

async function fetchHistoricalData(seriesId, token, startDate, endDate) {
    const url = `${BANXICO_API_BASE}/series/${seriesId}/datos/${startDate}/${endDate}?mediaType=json&token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        if (response.status === 401) throw new Error("Token SIE inválido o expirado.");
        if (response.status === 404) throw new Error("No se encontraron datos.");
        throw new Error(`Error: ${response.status}`);
    }
    const data = await response.json();
    const seriesData = data.bmx?.series?.[0]?.datos;
    if (!seriesData || seriesData.length === 0) {
        throw new Error("No se encontraron datos.");
    }
    return seriesData;
}

async function refreshDashboardData() {
    console.log("[Background] Refreshing dashboard data...");
    const { sieToken, sieSeries } = await chrome.storage.local.get(["sieToken", "sieSeries"]);

    if (!sieToken) {
        console.warn("[Background] No token found, skipping background refresh.");
        return;
    }

    let list = Array.isArray(sieSeries) ? sieSeries : DEFAULT_SERIES;

    // Mandatory series (UDI, Health, INPC, Expectations, Macro)
    const required = ["SP68257", "SF61745", "SP74665", "SP30579", "SR14447", "SR14138", "SR17692", "SE27803", "SF43783"];
    let ids = list.map(s => s.id);
    required.forEach(id => {
        if (!ids.includes(id)) ids.push(id);
    });

    try {
        console.log(`[Background] Starting parallel fetch for IDs: ${ids.join(",")}`);
        const now = new Date();
        const fmt = (d) => d.toISOString().split("T")[0];

        const fetchPromises = ids.map(async (id) => {
            try {
                // Determine fetch type and range
                const isExpectation = (id === "SR14447" || id === "SR14138");
                const isMonthly = (id === "SP1" || id === "SP30579" || id === "SP30578" || id === "SP74665" ||
                    id === "SR17692" || id === "SE27803");

                let url;
                if (isExpectation) {
                    url = `${BANXICO_API_BASE}/series/${id}/datos/oportuno?mediaType=json&token=${encodeURIComponent(sieToken)}`;
                } else {
                    const startDate = new Date();
                    if (isMonthly) {
                        startDate.setMonth(now.getMonth() - 15);
                    } else {
                        startDate.setDate(now.getDate() - 45);
                    }
                    url = `${BANXICO_API_BASE}/series/${id}/datos/${fmt(startDate)}/${fmt(now)}?mediaType=json&token=${encodeURIComponent(sieToken)}`;
                }

                console.log(`[Background] Fetching ${id}: ${url}`);

                const r = await fetch(url, { cache: "no-store" });
                if (!r.ok) {
                    console.error(`[Background] Error fetching ${id}: ${r.status}`);
                    return null;
                }

                const json = await r.json();
                const series = json.bmx?.series?.[0];
                if (!series || !series.datos || series.datos.length === 0) {
                    console.warn(`[Background] No data for ${id}`);
                    return null;
                }

                const datos = series.datos;
                const latest = datos[datos.length - 1];
                let prev = null;

                if (isMonthly && datos.length >= 2) {
                    // For monthly/fortnightly, try to get the 13th back (annual) or the oldest available
                    prev = datos.length >= 13 ? datos[datos.length - 13] : datos[0];
                } else if (datos.length > 1) {
                    prev = datos[datos.length - 2];
                }

                return {
                    id: series.idSerie,
                    title: series.titulo,
                    val: latest.dato,
                    date: latest.fecha,
                    prev: prev ? prev.dato : null,
                    prevDate: prev ? prev.fecha : null
                };
            } catch (err) {
                console.error(`[Background] Exception on fetch for ${id}:`, err);
                return null;
            }
        });

        const allResults = await Promise.all(fetchPromises);
        const results = allResults.filter(r => r !== null);

        if (results.length === 0) {
            throw new Error("No se pudo obtener información de ninguna serie. Verifica tu conexión o el Token.");
        }

        await chrome.storage.local.set({
            cachedSeriesData: results,
            lastUpdated: Date.now()
        });

        console.log("[Background] Refresh complete. Stored:", results.length, "series.");
        return { success: true };
    } catch (e) {
        console.error("[Background] Refresh failed:", e);
        return { success: false, error: e.message };
    }
}

// --- Alarm Management ---

chrome.alarms.create("refresh-data", { periodInMinutes: 60 });
chrome.alarms.create("volatility-check", { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refresh-data") {
        refreshDashboardData();
    }
    if (alarm.name === "volatility-check") {
        checkVolatility();
    }
});

async function checkVolatility() {
    console.log("[Background] Running volatility check...");
    const { sieToken, volatThreshold = 0.5, lastFixVal } = await chrome.storage.local.get(["sieToken", "volatThreshold", "lastFixVal"]);
    if (!sieToken) return;

    try {
        const url = `${BANXICO_API_BASE}/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(sieToken)}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;

        const json = await r.json();
        const latestDato = json.bmx?.series?.[0]?.datos?.[0]?.dato;
        if (!latestDato) return;

        const currentVal = parseFloat(latestDato.replace(",", "."));

        if (lastFixVal) {
            const prevVal = parseFloat(lastFixVal);
            const variation = Math.abs((currentVal - prevVal) / prevVal) * 100;
            console.log(`[Background] Volatility: ${variation.toFixed(4)}% (Threshold: ${volatThreshold}%)`);

            if (variation >= parseFloat(volatThreshold)) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon128.png",
                    title: "Alerta de Volatilidad - Alasha",
                    message: `El dólar ha variado un ${variation.toFixed(2)}% en los últimos 30 minutos.`
                });
            }
        }

        await chrome.storage.local.set({ lastFixVal: currentVal });
    } catch (e) {
        console.error("[Background] Volatility check error:", e);
    }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "REFRESH_DATA") {
        refreshDashboardData().then(res => {
            if (!res) sendResponse({ success: false, error: "No se pudo iniciar la actualización (¿Falta Token?)" });
            else sendResponse(res);
        });
        return true; // async
    }

    if (request.type === "FETCH_HISTORICAL") {
        const { seriesId, startDate, endDate } = request;
        chrome.storage.local.get("sieToken").then(({ sieToken }) => {
            if (!sieToken) return sendResponse({ success: false, error: "Token missing" });
            fetchHistoricalData(seriesId, sieToken, startDate, endDate)
                .then(data => sendResponse({ success: true, data }))
                .catch(e => sendResponse({ success: false, error: e.message }));
        });
        return true; // async
    }
});

// --- Lifecycle & Storage Listeners ---

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.sieToken || changes.sieSeries)) {
        console.log("[Background] Configuration changed, refreshing data...");
        refreshDashboardData();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log("[Background] Extension installed.");
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    // Initial fetch
    refreshDashboardData();
});
