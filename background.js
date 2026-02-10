import { DEFAULT_SERIES, BANXICO_API_BASE, ALPHAVANTAGE_API_BASE, INEGI_API_BASE } from './constants.js';

// --- Background Fetch Logic ---

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

function latestValidObservation(datos) {
    if (!Array.isArray(datos) || datos.length === 0) return undefined;
    for (let i = datos.length - 1; i >= 0; i -= 1) {
        const obs = datos[i];
        const raw = (obs?.dato || "").trim().toUpperCase();
        if (raw && raw !== "N/E") return obs;
    }
    return undefined;
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

async function fetchAlphaVantage(avId, token) {
    // avId format: AV_XAU -> symbol: XAU
    const symbol = avId.replace("AV_", "").toUpperCase();

    // Helper to check for common AV errors
    const checkErrors = (json) => {
        if (json["Error Message"]) throw new Error("Símbolo no encontrado");

        const note = json["Note"] || "";
        const info = json["Information"] || "";

        if (note || info) {
            console.warn("[Background] Alpha Vantage notice:", note || info);
            throw new Error("Límite de API excedido (Alpha Vantage)");
        }
    };

    // --- 1. GOLD & SILVER SPOT (Special Endpoint) ---
    if (symbol === "XAU" || symbol === "XAG") {
        const url = `${ALPHAVANTAGE_API_BASE}?function=GOLD_SILVER_SPOT&symbol=${symbol}&apikey=${encodeURIComponent(token)}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        checkErrors(json);

        if (json.price) {
            return {
                val: json.price,
                date: json.date || new Date().toISOString().split("T")[0],
                source: "AV_SPOT"
            };
        }
    }

    // --- 2. TECHNICAL COMMODITIES (WTI, BRENT, GAS, etc.) ---
    const commodities = ["WTI", "BRENT", "NATURAL_GAS", "COPPER", "ALUMINUM", "WHEAT", "CORN", "COTTON", "SUGAR", "COFFEE", "ALL_COMMODITIES"];
    if (commodities.includes(symbol)) {
        try {
            const url = `${ALPHAVANTAGE_API_BASE}?function=${symbol}&apikey=${encodeURIComponent(token)}`;
            const r = await fetch(url, { cache: "no-store" });
            if (r.ok) {
                const json = await r.json();
                checkErrors(json);
                if (json.data && json.data.length > 0) {
                    return {
                        val: json.data[0].value,
                        date: json.data[0].date,
                        source: "AV_COMMODITY"
                    };
                }
            }
        } catch (e) {
            if (e.message.includes("Límite")) throw e;
            console.log(`[Background] Commodity fetch failed for ${symbol}`);
        }
    }

    // --- 3. GLOBAL QUOTE (Stocks, ETFs) ---
    try {
        const url = `${ALPHAVANTAGE_API_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${encodeURIComponent(token)}`;
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
            const json = await r.json();
            checkErrors(json);
            const quote = json["Global Quote"];
            if (quote && quote["05. price"]) {
                return {
                    val: quote["05. price"],
                    date: quote["07. latest trading day"],
                    source: "AV_QUOTE"
                };
            }
        }
    } catch (e) {
        if (e.message.includes("Límite")) throw e;
        console.log(`[Background] GLOBAL_QUOTE failed for ${symbol}, trying CURRENCY...`);
    }

    // --- 4. CURRENCY/CRYPTO EXCHANGE RATE ---
    const url = `${ALPHAVANTAGE_API_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=USD&apikey=${encodeURIComponent(token)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    checkErrors(json);

    const data = json["Realtime Currency Exchange Rate"];
    if (data && data["5. Exchange Rate"]) {
        return {
            val: data["5. Exchange Rate"],
            date: data["6. Last Refreshed"]?.split(" ")[0], // YYYY-MM-DD
            source: "AV_CURRENCY"
        };
    }

    throw new Error("No se encontraron datos para este símbolo");
}

async function fetchAlphaVantageHistorical(avId, token) {
    const symbol = avId.replace("AV_", "").toUpperCase();

    let func = symbol;
    if (symbol === "XAU") func = "GOLD";
    if (symbol === "XAG") func = "SILVER";

    const url = `${ALPHAVANTAGE_API_BASE}?function=${func}&interval=daily&apikey=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    if (json["Information"] || json["Note"]) {
        throw new Error("Límite de API excedido (Alpha Vantage)");
    }

    if (!json.data || !Array.isArray(json.data)) {
        // Fallback for stocks
        const stockUrl = `${ALPHAVANTAGE_API_BASE}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${encodeURIComponent(token)}`;
        const stockResp = await fetch(stockUrl, { cache: "no-store" });
        const stockJson = await stockResp.json();

        if (stockJson["Information"] || stockJson["Note"]) {
            throw new Error("Límite de API excedido (Alpha Vantage)");
        }

        const timeSeries = stockJson["Time Series (Daily)"];
        if (timeSeries) {
            return Object.entries(timeSeries).map(([date, values]) => ({
                fecha: date,
                dato: values["4. close"]
            })).reverse();
        }

        throw new Error("No se encontraron datos históricos.");
    }

    return json.data.map(item => ({
        fecha: item.date,
        dato: item.value
    })).reverse();
}

async function fetchInegiSeries(inegiId, token) {
    const id = inegiId.replace("INEGI_", "");
    const url = `${INEGI_API_BASE}/INDICATOR/${id}/es/00/true/BISE/2.0/${encodeURIComponent(token)}?type=json`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    const obs = json.Series?.[0]?.OBSERVATIONS?.[0];
    if (obs) {
        return {
            val: obs.OBS_VALUE,
            date: obs.TIME_PERIOD,
            source: "INEGI"
        };
    }
    throw new Error("No se obtuvieron datos de INEGI.");
}

async function fetchInegiHistorical(inegiId, token) {
    const id = inegiId.replace("INEGI_", "");
    const url = `${INEGI_API_BASE}/INDICATOR/${id}/es/00/false/BISE/2.0/${encodeURIComponent(token)}?type=json`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    const observations = json.Series?.[0]?.OBSERVATIONS;
    if (observations && Array.isArray(observations)) {
        return observations.map(obs => ({
            fecha: obs.TIME_PERIOD,
            dato: obs.OBS_VALUE
        })); // INEGI generally returns historical in order or enough for chart
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
        const { sieToken, avToken, sieSeries, cachedSeriesData } = await chrome.storage.local.get(["sieToken", "avToken", "sieSeries", "cachedSeriesData"]);

        const prevMap = new Map(cachedSeriesData?.map(s => [s.id, s.val]) || []);
        const prevDateMap = new Map(cachedSeriesData?.map(s => [s.id, s.date]) || []);

        let list = (Array.isArray(sieSeries) && sieSeries.length > 0) ? sieSeries : DEFAULT_SERIES;
        const required = ["SP68257", "SF61745", "SP74665", "SP30579", "SR14447", "SR14138", "SR17692", "SE27803", "SF43783", ...DEFAULT_SERIES.map(s => s.id)];
        let ids = [...new Set([...list.map(s => s.id), ...required])].filter(id => !!id);

        const avIds = ids.filter(id => id.startsWith("AV_"));
        const inegiIds = ids.filter(id => id.startsWith("INEGI_"));
        const banxicoIds = ids.filter(id => !id.startsWith("AV_") && !id.startsWith("INEGI_"));

        if (banxicoIds.length > 0 && sieToken) {
            const banxicoResults = await fetchBanxicoSeries(banxicoIds, sieToken);
            const currentCache = (await chrome.storage.local.get("cachedSeriesData")).cachedSeriesData || [];
            const cacheMap = new Map(currentCache.map(s => [s.id, s]));
            banxicoResults.forEach(r => cacheMap.set(r.id, { ...r, error: r.error || null }));

            await chrome.storage.local.set({
                cachedSeriesData: Array.from(cacheMap.values()),
                lastUpdated: Date.now()
            });
        }

        if (avIds.length > 0 && avToken) {
            for (const id of avIds) {
                try {
                    const avData = await fetchAlphaVantage(id, avToken);
                    const currentCache = (await chrome.storage.local.get("cachedSeriesData")).cachedSeriesData || [];
                    const cacheMap = new Map(currentCache.map(s => [s.id, s]));

                    const cachedVal = prevMap.get(id);
                    const cachedDate = prevDateMap.get(id);
                    let prevVal = (cachedVal && cachedVal !== avData.val) ? cachedVal : null;
                    let prevDate = (cachedDate && cachedDate !== avData.date) ? cachedDate : null;

                    cacheMap.set(id, {
                        id,
                        val: avData.val,
                        date: avData.date,
                        prev: prevVal,
                        prevDate: prevDate,
                        source: avData.source,
                        error: null
                    });

                    await chrome.storage.local.set({
                        cachedSeriesData: Array.from(cacheMap.values()),
                        lastUpdated: Date.now()
                    });

                    if (id !== avIds[avIds.length - 1]) await new Promise(r => setTimeout(r, 15000));
                } catch (e) {
                    const currentCache = (await chrome.storage.local.get("cachedSeriesData")).cachedSeriesData || [];
                    const cacheMap = new Map(currentCache.map(s => [s.id, s]));
                    cacheMap.set(id, { id, error: e.message });
                    await chrome.storage.local.set({ cachedSeriesData: Array.from(cacheMap.values()) });
                    if (e.message.includes("Límite")) break;
                }
            }
        }

        // 3. Fetch INEGI sequentially
        if (inegiIds.length > 0) {
            const { inegiToken } = await chrome.storage.local.get("inegiToken");
            if (inegiToken) {
                console.log(`[Background] Fetching ${inegiIds.length} INEGI series...`);
                for (const id of inegiIds) {
                    try {
                        const inegiData = await fetchInegiSeries(id, inegiToken);
                        const currentCache = (await chrome.storage.local.get("cachedSeriesData")).cachedSeriesData || [];
                        const cacheMap = new Map(currentCache.map(s => [s.id, s]));

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

                        await chrome.storage.local.set({
                            cachedSeriesData: Array.from(cacheMap.values()),
                            lastUpdated: Date.now()
                        });

                        // Small delay for INEGI to be polite
                        if (id !== inegiIds[inegiIds.length - 1]) await new Promise(r => setTimeout(r, 2000));
                    } catch (e) {
                        const currentCache = (await chrome.storage.local.get("cachedSeriesData")).cachedSeriesData || [];
                        const cacheMap = new Map(currentCache.map(s => [s.id, s]));
                        cacheMap.set(id, { id, error: e.message });
                        await chrome.storage.local.set({ cachedSeriesData: Array.from(cacheMap.values()) });
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
        const { avToken, volatilityThreshold, lastFixVal } = await chrome.storage.local.get(["avToken", "volatilityThreshold", "lastFixVal"]);
        if (!avToken) return;

        const avId = "AV_USD_MXN";
        const avData = await fetchAlphaVantage(avId, avToken);
        const currentVal = parseFloat(avData.val);
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
        const isAv = seriesId.startsWith("AV_");
        const isInegi = seriesId.startsWith("INEGI_");

        if (isAv) {
            chrome.storage.local.get("avToken").then(({ avToken }) => {
                if (!avToken) return sendResponse({ success: false, error: "API Key de Alpha Vantage faltante" });
                fetchAlphaVantageHistorical(seriesId, avToken)
                    .then(data => sendResponse({ success: true, data }))
                    .catch(e => sendResponse({ success: false, error: e.message }));
            });
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
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.sieToken || changes.avToken || changes.inegiToken || changes.sieSeries)) {
        console.log("[Background] Configuration changed, refreshing data...");
        refreshDashboardData();
    }
});
