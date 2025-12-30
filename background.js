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

    // Ensure required monitoring series are included
    let ids = list.map(s => s.id);
    const required = ["SP1", "SP68257", "SF61745", "SP74665"];
    required.forEach(id => {
        if (!ids.includes(id)) ids.push(id);
    });

    try {
        console.log(`[Background] Fetching data for IDs: ${ids.join(",")}`);
        const data = await fetchOportuno(ids.join(","), sieToken);
        const seriesResults = data?.bmx?.series || [];

        if (seriesResults.length === 0) {
            console.warn("[Background] No series data returned from API. Full response:", JSON.stringify(data));
        } else {
            console.log("[Background] First series sample:", JSON.stringify(seriesResults[0]));
        }

        await chrome.storage.local.set({
            cachedSeriesData: seriesResults,
            lastUpdated: Date.now()
        });
        console.log("[Background] Refresh complete. Data stored successfully.");
        return { success: true };
    } catch (e) {
        console.error("[Background] Refresh failed:", e);
        return { success: false, error: e.message };
    }
}

// --- Alarm Management ---

chrome.alarms.create("refresh-data", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refresh-data") {
        refreshDashboardData();
    }
});

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
