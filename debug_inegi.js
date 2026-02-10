
// Updated Test Script for JSON-stat (4 Variations)
chrome.storage.local.get("inegiToken", async ({ inegiToken }) => {
    // 444557 (BIE)
    const id = "444557";
    const source = "BIE";

    console.log(`\n--- Testing JSON-stat Variations for ${id} (${source}) ---`);

    // Variation 1: Standard INDICATOR endpoint with type=jsonStat
    const url1 = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/${id}/es/00/true/${source}/2.0/${inegiToken}?type=jsonStat`;

    // Variation 2: JSONSTAT method (with Version 2.0 and API path)
    const url2 = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/JSONSTAT/${id}/es/00/true/${source}/2.0/${inegiToken}?type=jsonStat`;

    // Variation 3: JSONSTAT method (WITHOUT Version and API path)
    const url3 = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/JSONSTAT/${id}/es/00/true/${source}/${inegiToken}?type=jsonStat`;

    // Variation 4: Root JSONSTAT endpoint (from your snippet)
    const url4 = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/JSONSTAT/${id}/es/00/true/${source}/${inegiToken}?type=jsonStat`.replace("app/api/indicadores/desarrolladores/jsonxml/", "");

    const urls = [
        { name: "Var 1 (INDICATOR path)", url: url1 },
        { name: "Var 2 (JSONSTAT path + Ver)", url: url2 },
        { name: "Var 3 (JSONSTAT path - No Ver)", url: url3 },
        { name: "Var 4 (Root JSONSTAT path)", url: url4 }
    ];

    for (const test of urls) {
        console.log(`\nTesting ${test.name}...`);
        console.log(`URL: ${test.url}`);
        try {
            const r = await fetch(test.url);
            console.log(`Status: ${r.status}`);
            const text = await r.text();

            try {
                const json = JSON.parse(text);
                if (json.dataset) {
                    console.log(`%c[SUCCESS] JSON-stat Dataset Found!`, "color: green; font-weight: bold;");
                    console.log("Label:", json.dataset.label);
                } else {
                    console.log("Parsed JSON but no dataset property:", json);
                }
            } catch (e) {
                console.log(`Response is NOT JSON. Start: ${text.substring(0, 50)}...`);
            }
        } catch (e) {
            console.error(`Exception:`, e);
        }
    }
});
