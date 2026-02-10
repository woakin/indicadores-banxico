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
  },
  {
    id: "SP74665",
    category: "macro",
    title: "Macro: Inflación General (%)",
    type: "percent",
    decimals: 2,
    periodicity: "Mensual",
    description: "Variación mensual del Índice Nacional de Precios al Consumidor"
  }
];

// Alpha Vantage Catalog
export const AV_CATALOG = [
  { id: "AV_XAU", title: "Oro (Spot)", type: "currency", currency: "USD", decimals: 2, periodicity: "Tiempo Real", figure: "Precio por Onza" },
  { id: "AV_XAG", title: "Plata (Spot)", type: "currency", currency: "USD", decimals: 2, periodicity: "Tiempo Real", figure: "Precio por Onza" },
  { id: "AV_WTI", title: "Petróleo WTI", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "Barril" },
  { id: "AV_BRENT", title: "Petróleo Brent", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "Barril" },
  { id: "AV_NATURAL_GAS", title: "Gas Natural", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "MMBtu" },
  { id: "AV_COPPER", title: "Cobre", type: "currency", currency: "USD", decimals: 4, periodicity: "Mensual", figure: "TM" },
  { id: "AV_ALUMINUM", title: "Aluminio", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "TM" },
  { id: "AV_WHEAT", title: "Trigo", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Bushel" },
  { id: "AV_CORN", title: "Maíz", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Bushel" },
  { id: "AV_COTTON", title: "Algodón", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "AV_SUGAR", title: "Azúcar", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "AV_COFFEE", title: "Café", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "AV_ALL_COMMODITIES", title: "Índice Commodities", type: "number", decimals: 2, periodicity: "Mensual", figure: "Índice Global" }
];

// INEGI Catalog (Common Indicators)
export const INEGI_CATALOG = [
  { id: "INEGI_1002000001", title: "Población total", type: "number", decimals: 0, periodicity: "Cada 5 años", figure: "Personas", description: "Población total en México (Censo/Conteo)" },
  { id: "INEGI_6207061433", title: "Tasa de Desocupación", type: "percent", decimals: 2, periodicity: "Mensual", figure: "Tasa", description: "Porcentaje de la Población Económicamente Activa que se encuentra sin trabajar" },
  { id: "INEGI_6200205259", title: "PIB Trimestral (Var. Anual %)", type: "percent", decimals: 1, periodicity: "Trimestral", figure: "Variación", description: "Producto Interno Bruto, variación porcentual real respecto al mismo trimestre del año anterior" },
  { id: "INEGI_444644", title: "Confianza del Consumidor", type: "number", decimals: 1, periodicity: "Mensual", figure: "Índice", description: "Indicador de Confianza del Consumidor (Puntos)" }
];

// Banxico SIE Series ID format: Sxyyyyy (S + 1 letter + 5 digits)
// Alpha Vantage format: AV_<SYMBOL> (e.g. AV_AAPL, AV_BTC, AV_CL=F)
// INEGI format: INEGI_<ID> (e.g. INEGI_1002000001)
export const SERIES_ID_REGEX = /^(S[FPGHLMNRST]\d{5,8}|AV_[A-Z0-9.=:\-]+|INEGI_\d+)$/i;

export const BANXICO_API_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1";
export const ALPHAVANTAGE_API_BASE = "https://www.alphavantage.co/query";
export const INEGI_API_BASE = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml";

export const BANXICO_SIE_URLS = {
  API: "https://www.banxico.org.mx/SieAPIRest/service/v1/",
  CATALOG: "https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries"
};

export const INEGI_URLS = {
  TOKEN_GEN: "https://www.inegi.org.mx/servicios/api_indicadores.html",
  CONSTRUCTOR: "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/CONSTRUCTOR/es/00/BISE/2.0"
};
