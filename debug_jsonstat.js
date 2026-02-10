
// Paste this in the Console to test JSON-stat
// Replace 'TU_TOKEN' if needed (code fetches it from storage)

chrome.storage.local.get("inegiToken", async ({ inegiToken }) => {
    const ids = ["444557", "444884", "1002000001"]; // Test broken BIE and working BISE
    const sources = ["BISE", "BIE"]; // We still need to guess source?

    for (const id of ids) {
        console.log(`\n--- Testing ID: ${id} ---`);
        for (const source of sources) {
            // URL format from user: https://www.inegi.org.mx/JSONSTAT/[Id]/[Lang]/[Geo]/[Recent]/[Source]/[Token]?type=jsonStat
            const url = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/JSONSTAT/${id}/es/00/true/${source}/2.0/${inegiToken}?type=jsonStat`;

            console.log(`Trying ${source}...`);
            try {
                const r = await fetch(url);
                console.log(`${source} Status: ${r.status}`);
                if (r.ok) {
                    const json = await r.json();
                    console.log(`${source} Response:`, json);

                    // JSON-stat structure check
                    if (json.dataset) {
                        console.log("Found dataset!");
                        console.log("Label:", json.dataset.label); // Should be title
                        console.log("Source:", json.dataset.source);
                        console.log("Dimensions:", json.dataset.dimension); // Should have units?
                    }
                } else {
                    // Check if it returns a text error
                    const text = await r.text();
                    console.log(`${source} Error Body:`, text.substring(0, 100));
                }
            } catch (e) {
                console.error(`${source} Fetch Error:`, e);
            }
        }
    }
});
