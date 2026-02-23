import { DEFAULT_SERIES, BANXICO_API_BASE, INEGI_API_BASE, YIELD_CURVE_SERIES } from './constants.js';
import { latestValidObservation } from './utils.js';

// --- Background Fetch Logic ---

// Note: Binance Crypto API was deprecated in favor of unified Yahoo Finance.

async function fetchYahooMarketTicker(symbols = ["^GSPC", "^IXIC"]) {
    try {
        const fetchAsset = async (sym) => {
            try {
                const symQuery = encodeURIComponent(sym);
                const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symQuery}?interval=1d&range=1d`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (!r.ok) return null;
                const json = await r.json();
                const meta = json.chart?.result?.[0]?.meta;
                if (!meta) return null;
                const price = meta.regularMarketPrice;
                const prev = meta.chartPreviousClose;
                if (price === undefined || prev === undefined) return null;
                const change = ((price - prev) / prev) * 100;
                return { symbol: sym, price: price.toFixed(2), change: change.toFixed(2) };
            } catch (err) {
                console.warn(`[Background] Failed to fetch ticker: ${sym}`, err);
                return null;
            }
        };

        const results = await Promise.all(symbols.map(sym => fetchAsset(sym)));

        return results.filter(r => r !== null);
    } catch (e) {
        console.error("[Background] Yahoo Market Ticker fetch failed:", e);
        throw e;
    }
}

async function fetchEconomicCalendar() {
    try {
        const { cachedCalendar, calendarLastUpdated } = await chrome.storage.local.get([
            "cachedCalendar", "calendarLastUpdated"
        ]);

        // Return cache if it's less than 60 minutes old (3600000 ms)
        if (cachedCalendar && calendarLastUpdated && (Date.now() - calendarLastUpdated < 3600000)) {
            console.log("[Background] Serving Calendar from cache...");
            return cachedCalendar;
        }

        const url = 'https://www.myfxbook.com/rss/forex-economic-calendar-events';
        const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: "no-store"
        });

        if (!r.ok) {
            console.error(`[Background] Calendar fetch responded with HTTP ${r.status} ${r.statusText}`);
            throw new Error(`Error fetching calendar XML: HTTP ${r.status}`);
        }

        const xmlText = await r.text();

        // Simple regex parser since DOMParser is not available in Manifest V3 Service Workers
        const events = [];
        const itemsRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemsRegex.exec(xmlText)) !== null) {
            const itemBlock = match[1];

            const extract = (tag) => {
                const tagRegex = new RegExp(`<${tag}>([^<]+)<\/${tag}>`);
                const m = itemBlock.match(tagRegex);
                return m ? m[1].trim() : "";
            };

            const title = extract("title");
            const link = extract("link");
            const dateStr = extract("pubDate"); // e.g. Sat, 21 Feb 2026 00:00 GMT

            // Extract Country from the URL slug (e.g. .../taiwan/...)
            let country = "";
            try {
                const urlParts = link.split('/forex-economic-calendar/');
                if (urlParts.length > 1) {
                    const countrySlug = urlParts[1].split('/')[0].toLowerCase();
                    // Basic map for common countries
                    const countryMap = {
                        "united-states": "USD", "mexico": "MXN", "euro-zone": "EUR",
                        "japan": "JPY", "great-britain": "GBP", "canada": "CAD",
                        "australia": "AUD", "new-zealand": "NZD", "switzerland": "CHF", "china": "CNY"
                    };
                    country = countryMap[countrySlug] || countrySlug.toUpperCase();
                }
            } catch (e) {
                // Ignore parsing errors for country
            }

            const desc = itemBlock.match(/<description>([\s\S]*?)<\/description>/);
            if (!desc) continue;

            // tds[0] = Time left, tds[1] = Impact, tds[2] = Previous, tds[3] = Consensus, tds[4] = Actual
            const tdsMatches = [...desc[1].matchAll(/&#60;td.*?&#62;(.*?)&#60;\/td&#62;/g)];
            if (tdsMatches.length < 5) continue;

            const impactRaw = tdsMatches[1][1].trim();
            const previous = tdsMatches[2][1].trim();
            const forecast = tdsMatches[3][1].trim();

            let impact = "Low";
            if (impactRaw.includes("High")) impact = "High";
            else if (impactRaw.includes("Medium")) impact = "Medium";

            // Passthrough ISO Date processing (MyFxBook pubDate is RFC-1123 format)
            let isoDateStr = dateStr;
            try { isoDateStr = new Date(dateStr).toISOString(); } catch (e) { }

            // Filter logic: Only High Impact for USD or MXN
            if (impact === "High" && (country === "USD" || country === "MXN")) {
                events.push({ title, country, date: isoDateStr, time: "", forecast, previous });
            }
        }

        const result = events;
        await chrome.storage.local.set({
            cachedCalendar: result,
            calendarLastUpdated: Date.now()
        });

        return result;
    } catch (e) {
        console.error("[Background] Calendar fetch failed:", e);

        // Fallback to cache if available
        const { cachedCalendar } = await chrome.storage.local.get(["cachedCalendar"]);
        if (cachedCalendar) {
            console.log("[Background] Returning stale calendar cache due to fetch error.");
            return cachedCalendar;
        }

        throw e;
    }
}

async function fetchOportuno(idsCsv, token) {
    const url = `${BANXICO_API_BASE}/series/${idsCsv}/datos/oportuno?mediaType=json&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
        if (r.status === 401) throw new Error("Token SIE inválido");
        if (r.status === 404) throw new Error("Serie no encontrada");
        throw new Error(`Error HTTP ${r.status}`);
    }
    return r.json();
}

async function fetchLastN(id, token, n = 20) {
    const url = `${BANXICO_API_BASE}/series/${id}/datos/last/${n}?mediaType=json&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Error HTTP ${r.status}`);
    return r.json();
}

async function fetchBanxicoSeries(ids, token) {
    if (ids.length === 0) return [];

    const formatItem = (s) => {
        const latest = latestValidObservation(s.datos);
        const prev = s.datos && s.datos.length > 1 ? s.datos[s.datos.length - 2] : null;

        let variation = null;
        if (latest && prev) {
            const v1 = parseFloat(latest.dato.replace(",", "."));
            const v2 = parseFloat(prev.dato.replace(",", "."));
            if (!isNaN(v1) && !isNaN(v2) && v2 !== 0) {
                variation = ((v1 - v2) / v2) * 100;
            }
        }

        return {
            id: s.idSerie,
            title: s.titulo,
            val: latest ? latest.dato : "—",
            date: latest ? latest.fecha : "—",
            prev: prev ? prev.dato : null,
            prevDate: prev ? prev.fecha : null,
            variation
        };
    };

    // 1. Try batch fetch first (more efficient)
    try {
        const json = await fetchOportuno(ids.join(","), token);
        if (json.bmx?.series) {
            const results = json.bmx.series.map(formatItem);

            // If any series has no observations (val === "—"), retry that specific one with last/20
            for (let i = 0; i < results.length; i++) {
                if (results[i].val === "—") {
                    try {
                        const deepJson = await fetchLastN(results[i].id, token, 20);
                        if (deepJson.bmx?.series?.[0]) {
                            results[i] = formatItem(deepJson.bmx.series[0]);
                        }
                    } catch (e) { console.warn(`[Background] Deep fetch failed for ${results[i].id}`); }
                }
            }
            return results;
        }
    } catch (err) {
        console.warn(`[Background] Batch fetch failed. Isolating...`);
    }

    // 2. Fallback: Individual fetch (resilient to toxic IDs)
    const finalResults = [];
    for (const id of ids) {
        try {
            // Use last/20 directly for individual retries to be sure
            const json = await fetchLastN(id, token, 20);
            if (json.bmx?.series?.[0]) {
                finalResults.push(formatItem(json.bmx.series[0]));
            } else {
                finalResults.push({ id, error: "Serie sin datos" });
            }
        } catch (indErr) {
            console.error(`[Background] Permanent failure for ${id}:`, indErr.message);
            finalResults.push({ id, error: indErr.message });
        }
    }
    return finalResults;
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

async function fetchYfProxy(yfId) {
    const symbol = yfId.replace("YF_", "").toUpperCase();

    try {
        const symQuery = encodeURIComponent(symbol);
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symQuery}?interval=1d&range=1d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: "no-store"
        });
        if (!r.ok) throw new Error("Símbolo no encontrado");

        const json = await r.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta || meta.regularMarketPrice === undefined) throw new Error("Símbolo no encontrado");

        return {
            val: meta.regularMarketPrice.toString(),
            date: new Date(meta.regularMarketTime * 1000).toISOString().split("T")[0],
            source: "YF_PROXY"
        };
    } catch (e) {
        console.error(`[Background] YF Proxy failed for symbol ${symbol}:`, e);
        throw new Error("Límite o error de red al buscar el ticker global.");
    }
}

async function fetchYfHistoricalProxy(yfId) {
    const symbol = yfId.replace("YF_", "").toUpperCase();

    try {
        const symQuery = encodeURIComponent(symbol);
        // Yahoo historical data. We'll ask for 1mo or 3mo to be safe.
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symQuery}?interval=1d&range=3mo`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: "no-store"
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const json = await r.json();
        const result = json.chart?.result?.[0];

        if (!result || !result.timestamp || !result.indicators.quote[0].close) {
            throw new Error("Datos históricos no encontrados.");
        }

        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        const data = [];

        // Return newest first, just like the old AV function did
        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (closes[i] !== null && closes[i] !== undefined) {
                data.push({
                    fecha: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
                    dato: closes[i].toFixed(4)
                });
            }
        }
        return data;

    } catch (e) {
        console.error(`[Background] YF Historical Proxy failed for ${symbol}:`, e);
        throw new Error("No se pudieron cargar datos históricos globales.");
    }
}

async function fetchInegiSeries(inegiId, token) {
    const id = inegiId.replace("INEGI_", "");
    const urls = [
        `${INEGI_API_BASE}/INDICATOR/${id}/es/00/true/BISE/2.0/${encodeURIComponent(token)}?type=json`,
        `${INEGI_API_BASE}/INDICATOR/${id}/es/00/true/BIE/2.0/${encodeURIComponent(token)}?type=json`
    ];

    for (const url of urls) {
        try {
            const r = await fetch(url, { cache: "no-store" });
            if (r.ok) {
                const json = await r.json();
                const obs = json.Series?.[0]?.OBSERVATIONS?.[0];
                if (obs) {
                    return {
                        val: obs.OBS_VALUE,
                        date: obs.TIME_PERIOD,
                        source: "INEGI"
                    };
                }
            }
        } catch (e) {
            console.warn(`[Background] INEGI fetch failed for ${url}`);
        }
    }
    throw new Error("No se obtuvieron datos de INEGI (ni en BISE ni en BIE).");
}

async function fetchInegiHistorical(inegiId, token) {
    const id = inegiId.replace("INEGI_", "");
    const urls = [
        `${INEGI_API_BASE}/INDICATOR/${id}/es/00/false/BISE/2.0/${encodeURIComponent(token)}?type=json`,
        `${INEGI_API_BASE}/INDICATOR/${id}/es/00/false/BIE/2.0/${encodeURIComponent(token)}?type=json`
    ];

    for (const url of urls) {
        try {
            const r = await fetch(url, { cache: "no-store" });
            if (r.ok) {
                const json = await r.json();
                const observations = json.Series?.[0]?.OBSERVATIONS;
                if (observations && Array.isArray(observations)) {
                    return observations.map(obs => ({
                        fecha: obs.TIME_PERIOD,
                        dato: obs.OBS_VALUE
                    }));
                }
            }
        } catch (e) {
            console.warn(`[Background] INEGI historical fetch failed for ${url}`);
        }
    }
    throw new Error("No se encontraron datos históricos en INEGI.");
}

let isRefreshing = false;
let lastRefreshStart = 0;

async function refreshDashboardData() {
    const now = Date.now();
    if (isRefreshing && (now - lastRefreshStart < 120000)) {
        console.log("[Background] Refresh already in progress, skipping...");
        return { success: false, error: "Actualización en curso" };
    }
    isRefreshing = true;
    lastRefreshStart = now;
    try {
        console.log("[Background] Refreshing dashboard data...");
        const { sieToken, inegiToken, sieSeries, cachedSeriesData } = await chrome.storage.local.get(["sieToken", "inegiToken", "sieSeries", "cachedSeriesData"]);

        const prevMap = new Map(cachedSeriesData?.map(s => [s.id, s.val]) || []);
        const prevDateMap = new Map(cachedSeriesData?.map(s => [s.id, s.date]) || []);

        // Master cache map to update
        const cacheMap = new Map(cachedSeriesData?.map(s => [s.id, s]) || []);

        // Helper to save current state
        const saveCache = async () => {
            await chrome.storage.local.set({
                cachedSeriesData: Array.from(cacheMap.values()),
                lastUpdated: Date.now()
            });
        };

        let list = (Array.isArray(sieSeries) && sieSeries.length > 0) ? sieSeries : DEFAULT_SERIES;
        const required = ["SP68257", "SF61745", "SP74665", "SP30579", "SR14447", "SR14138", "SR17692", "SE27803", "SF43783", ...DEFAULT_SERIES.map(s => s.id)];
        let ids = [...new Set([...list.map(s => s.id), ...required])].filter(id => !!id);

        const yfIds = ids.filter(id => id.startsWith("YF_"));
        const inegiIds = ids.filter(id => id.startsWith("INEGI_"));
        const banxicoIds = ids.filter(id => !id.startsWith("YF_") && !id.startsWith("INEGI_"));

        // 1. Fetch Banxico (Batch)
        if (banxicoIds.length > 0 && sieToken) {
            try {
                const banxicoResults = await fetchBanxicoSeries(banxicoIds, sieToken);
                banxicoResults.forEach(r => cacheMap.set(r.id, { ...r, error: r.error || null }));
                await saveCache();
            } catch (e) {
                console.error("[Background] Banxico refresh failed:", e);
            }
        }

        // 2. Fetch Yahoo Finance / Commodities (Sequential)
        if (yfIds.length > 0) {
            for (let i = 0; i < yfIds.length; i++) {
                const id = yfIds[i];
                try {
                    const yfData = await fetchYfProxy(id);
                    const cachedVal = prevMap.get(id);
                    const cachedDate = prevDateMap.get(id);
                    let prevVal = (cachedVal && cachedVal !== yfData.val) ? cachedVal : null;
                    let prevDate = (cachedDate && cachedDate !== yfData.date) ? cachedDate : null;

                    cacheMap.set(id, {
                        id,
                        val: yfData.val,
                        date: yfData.date,
                        prev: prevVal,
                        prevDate: prevDate,
                        source: yfData.source,
                        error: null
                    });
                    await saveCache();

                    // Delay between requests, but not after the last one
                    if (i < yfIds.length - 1) await new Promise(r => setTimeout(r, 2000));
                } catch (e) {
                    cacheMap.set(id, { id, error: e.message });
                    await saveCache();
                }
            }
        }

        // 3. Fetch INEGI (Sequential)
        if (inegiIds.length > 0) {
            if (!inegiToken) {
                inegiIds.forEach(id => cacheMap.set(id, { id, error: "Falta Token INEGI" }));
                await saveCache();
            } else {
                console.log(`[Background] Fetching ${inegiIds.length} INEGI series...`);
                for (let i = 0; i < inegiIds.length; i++) {
                    const id = inegiIds[i];
                    try {
                        const inegiData = await fetchInegiSeries(id, inegiToken);
                        const cachedVal = prevMap.get(id);
                        const cachedDate = prevDateMap.get(id);
                        let prevVal = (cachedVal && cachedVal !== inegiData.val) ? cachedVal : null;
                        let prevDate = (cachedDate && cachedDate !== inegiData.date) ? cachedDate : null;

                        cacheMap.set(id, {
                            id,
                            val: inegiData.val,
                            date: inegiData.date,
                            prev: prevVal,
                            prevDate: prevDate,
                            source: inegiData.source,
                            error: null
                        });
                        await saveCache();

                        if (i < inegiIds.length - 1) await new Promise(r => setTimeout(r, 2000));
                    } catch (e) {
                        console.error(`[Background] Error fetching INEGI ${id}:`, e);
                        cacheMap.set(id, { id, error: e.message });
                        await saveCache();
                    }
                }
            }
        }
        return { success: true };
    } catch (e) {
        console.error("[Background] Refresh error:", e);
        return { success: false, error: e.message };
    } finally {
        isRefreshing = false;
    }
}

// Alarms for periodic refresh
chrome.alarms.create("refreshData", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refreshData") refreshDashboardData();
});

// Volatility Check ALARM (every 30 min)
chrome.alarms.create("checkVolatility", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkVolatility") checkUSDVolatility();
});

async function checkUSDVolatility() {
    try {
        const { volatilityThreshold, lastFixVal } = await chrome.storage.local.get(["volatilityThreshold", "lastFixVal"]);

        const yfId = "YF_MXN=X";
        const yfData = await fetchYfProxy(yfId);
        const currentVal = parseFloat(yfData.val);
        const threshold = parseFloat(volatilityThreshold) || 1.0;

        if (lastFixVal) {
            const prev = parseFloat(lastFixVal);
            const variation = Math.abs(((currentVal - prev) / prev) * 100);

            if (variation >= threshold) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon128.png",
                    title: "Alerta de Volatilidad",
                    message: `Variación del ${variation.toFixed(2)}% en los últimos 30 min.`
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
        refreshDashboardData().then(res => sendResponse(res || { success: false }));
        return true;
    }

    if (request.type === "FETCH_HISTORICAL") {
        const { seriesId } = request;
        const isYf = seriesId.startsWith("YF_");
        const isInegi = seriesId.startsWith("INEGI_");

        if (isYf) {
            fetchYfHistoricalProxy(seriesId)
                .then(data => sendResponse({ success: true, data }))
                .catch(e => sendResponse({ success: false, error: e.message }));
        } else if (isInegi) {
            chrome.storage.local.get("inegiToken").then(({ inegiToken }) => {
                if (!inegiToken) return sendResponse({ success: false, error: "Token INEGI faltante" });
                fetchInegiHistorical(seriesId, inegiToken)
                    .then(data => sendResponse({ success: true, data }))
                    .catch(e => sendResponse({ success: false, error: e.message }));
            });
        } else {
            chrome.storage.local.get("sieToken").then(({ sieToken }) => {
                if (!sieToken) return sendResponse({ success: false, error: "Token SIE faltante" });
                fetchHistoricalData(seriesId, sieToken, request.startDate, request.endDate)
                    .then(data => sendResponse({ success: true, data }))
                    .catch(e => sendResponse({ success: false, error: e.message }));
            });
        }
        return true;
    }

    if (request.type === "FETCH_YIELD_CURVE") {
        chrome.storage.local.get("sieToken").then(({ sieToken }) => {
            if (!sieToken) return sendResponse({ success: false, error: "Para ver la Curva de Rendimientos necesitas configurar el Token SIE de Banxico." });

            const ids = YIELD_CURVE_SERIES.map(s => s.id);
            fetchBanxicoSeries(ids, sieToken)
                .then(data => sendResponse({ success: true, data }))
                .catch(e => sendResponse({ success: false, error: e.message }));
        });
        return true;
    }

    if (request.type === "FETCH_ECONOMIC_CALENDAR") {
        fetchEconomicCalendar()
            .then(data => sendResponse({ success: true, data }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    // Check if the change was triggered by our migration to avoid loops
    if (area === "local" && changes.sieSeries) {
        // If the change was JUST the migration, we might not need to do anything if refreshDashboardData is called anyway
        // But to be safe and simple, let it refresh.
    }

    if (area === "local" && (changes.sieToken || changes.inegiToken || changes.sieSeries)) {
        console.log("[Background] Configuration changed, refreshing data...");
        refreshDashboardData();
    }
});

// --- Migration Logic ---
async function migrateStaleIds() {
    const { sieSeries } = await chrome.storage.local.get("sieSeries");
    if (!sieSeries || !Array.isArray(sieSeries)) return;

    let changed = false;
    const migrations = {
        "INEGI_6207061433": "INEGI_444884", // Old Unemployment -> New Seasonally Adjusted
        "INEGI_6200205259": "INEGI_496092", // Old GDP -> New Annual Variation SA
        "INEGI_444644": "INEGI_454186"      // Old Consumer Confidence -> New Seasonally Adjusted
    };

    const newSeries = sieSeries.map(s => {
        if (migrations[s.id]) {
            console.log(`[Migration] Updating stale ID ${s.id} to ${migrations[s.id]}`);
            changed = true;
            return { ...s, id: migrations[s.id] };
        }
        return s;
    });

    if (changed) {
        await chrome.storage.local.set({ sieSeries: newSeries });
        console.log("[Migration] Stale IDs updated.");
    }
}

// --- Initialization ---
chrome.runtime.onInstalled.addListener((details) => {
    chrome.alarms.create("refresh", { periodInMinutes: 60 });

    // Open onboarding page on fresh install
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({ url: "onboarding.html" });
    }

    migrateStaleIds().then(() => refreshDashboardData());
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refresh") refreshDashboardData();
});

// Initial load
(async () => {
    await migrateStaleIds();
    refreshDashboardData();
})();
