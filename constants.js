// Shared constants across all extension files

export const DEFAULT_SERIES = [
  {
    id: "SF61745",
    title: "Tasa objetivo Banxico (%)",
    type: "percent",
    currency: "MXN",
    decimals: 2,
    periodicity: "Diaria",
    figure: "Sin tipo",
    description: "Tasa de referencia del Banco de México para operaciones de mercado abierto"
  },
  {
    id: "SF43783",
    title: "TIIE a 28 días (%)",
    type: "percent",
    currency: "MXN",
    decimals: 2,
    periodicity: "Diaria",
    figure: "Sin tipo",
    description: "Tasa de interés interbancaria de equilibrio a plazo de 28 días"
  },
  {
    id: "SF60633",
    title: "CETES a 28 días (%)",
    type: "percent",
    currency: "MXN",
    decimals: 2,
    periodicity: "Semanal",
    figure: "Sin tipo",
    description: "Tasa de rendimiento de Certificados de la Tesorería a 28 días"
  },
  {
    id: "SF43718",
    title: "Tipo de cambio FIX (MXN/USD)",
    type: "currency",
    currency: "MXN",
    decimals: 4,
    periodicity: "Diaria",
    figure: "Sin tipo",
    description: "Tipo de cambio fijo del peso mexicano respecto al dólar estadounidense"
  },
  {
    id: "SP30579",
    title: "INPC (índice)",
    type: "number",
    decimals: 2,
    periodicity: "Quincenal",
    figure: "Sin tipo",
    description: "Índice Nacional de Precios al Consumidor base 2010"
  },
  {
    id: "SP68257",
    title: "Valor de UDIS",
    type: "currency",
    currency: "MXN",
    decimals: 4,
    periodicity: "Diaria",
    figure: "Sin tipo",
    description: "Valor de la Unidad de Inversión ajustada por inflación"
  },
  {
    id: "SF43671",
    title: "Pasivo Base Monetaria (millones de MXN)",
    type: "currency",
    currency: "MXN",
    decimals: 0,
    periodicity: "Semanal",
    figure: "Sin tipo",
    description: "Base monetaria (dinero en circulación + reservas bancarias)"
  }
];

export const ANALYSIS_SERIES = [
  {
    id: "SR14447",
    category: "expectation",
    title: "Eco: PIB (Expectativa 2025 %)",
    type: "percent",
    decimals: 2,
    periodicity: "Mensual",
    description: "Expectativa de crecimiento del PIB (Cierre de año 2025) - Media Encuesta Banxico"
  },
  {
    id: "SR14138",
    category: "expectation",
    title: "Eco: Inflación (Expectativa 2025 %)",
    type: "percent",
    decimals: 2,
    periodicity: "Mensual",
    description: "Expectativa de Inflación General (Cierre de año 2025) - Media Encuesta Banxico"
  },
  {
    id: "SR17692",
    category: "macro",
    title: "Macro: IGAE (Índice)",
    type: "number",
    decimals: 2,
    periodicity: "Mensual",
    description: "Indicador Global de Actividad Económica (Base 2018)"
  },
  {
    id: "SE27803",
    category: "macro",
    title: "Macro: Ingresos por Remesas (MDD)",
    type: "number",
    decimals: 2,
    periodicity: "Mensual",
    description: "Monto mensual de ingresos por remesas en millones de dólares"
  }
];

// Banxico SIE Series ID format: Sxyyyyy (S + 1 letter + 5 digits)
export const SERIES_ID_REGEX = /^S[FPGHLMNRST]\d{5}$/i;

export const BANXICO_API_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1";

export const BANXICO_SIE_URLS = {
  API: "https://www.banxico.org.mx/SieAPIRest/service/v1/",
  CATALOG: "https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries"
};
