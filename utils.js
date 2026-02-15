// Utility functions shared between background and popup scripts

/**
 * Finds the latest valid observation from a list of data points.
 * Skips "N/E" (No Existente) values.
 * @param {Array} datos - Array of data objects { dato, fecha }
 * @returns {Object|undefined} The latest valid observation object or undefined.
 */
export function latestValidObservation(datos) {
  if (!Array.isArray(datos) || datos.length === 0) return undefined;
  for (let i = datos.length - 1; i >= 0; i -= 1) {
    const obs = datos[i];
    const raw = (obs?.dato || "").trim().toUpperCase();
    if (raw && raw !== "N/E") return obs;
  }
  return undefined;
}

/**
 * Formats a numeric value based on configuration.
 * @param {Object} cfg - Configuration object { type, decimals, currency }
 * @param {string|number} datoStr - The value to format
 * @returns {string} Formatted string
 */
export function fmtValue(cfg, datoStr) {
  if (!datoStr || datoStr === "N/E") return "—";

  // Replace comma with dot for decimal handling, then clean non-numeric chars
  // Note: Handle if datoStr is already a number
  const cleanStr = String(datoStr).replace(",", ".").replace(/[^0-9.-]/g, "");
  const x = Number(cleanStr);
  if (isNaN(x)) return datoStr;

  const d = cfg.decimals !== undefined ? cfg.decimals : 2;

  if (cfg.type === "currency") {
    return x.toLocaleString("es-MX", {
      style: "currency",
      currency: cfg.currency || "MXN",
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }
  if (cfg.type === "percent") {
    return (x / 100).toLocaleString("es-MX", {
      style: "percent",
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }
  return x.toLocaleString("es-MX", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

/**
 * Formats a date string based on periodicity.
 * @param {string} dateStr - Date string (e.g., "DD/MM/YYYY")
 * @param {string} periodicity - Periodicity (e.g., "Mensual", "Quincenal")
 * @returns {string} Formatted date
 */
export function fmtDate(dateStr, periodicity) {
  if (!dateStr || dateStr === "—") return "—";

  const parts = dateStr.split("/");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  if (periodicity === "Mensual" || periodicity === "Quincenal") {
    // Handling MM/YYYY or DD/MM/YYYY
    if (parts.length === 2) { // MM/YYYY
      const monthIndex = parseInt(parts[0]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${parts[1]}`;
      }
    } else if (parts.length === 3) { // DD/MM/YYYY
      const monthIndex = parseInt(parts[1]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${parts[2]}`;
      }
    }
  }

  // Fallback to original logic for other formats or if periodicity doesn't match
  let date;
  if (dateStr.match(/^\d{2}\/\d{4}$/)) { // MM/YYYY
    const [month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, 1);
  } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) { // DD/MM/YYYY
    const [day, month, year] = dateStr.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    // Try IS0 (YYYY-MM-DD) fallback
    const isoMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) {
       const [year, month, day] = dateStr.split('-');
       date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
       return dateStr; // Return original string if no match
    }
  }

  if (isNaN(date.getTime())) return "—";

  const opts = (periodicity?.toLowerCase().includes("mensual"))
    ? { month: "short", year: "numeric" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };

  return date.toLocaleDateString("es-MX", opts);
}
