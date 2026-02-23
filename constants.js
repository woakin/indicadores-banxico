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

// Yahoo Finance Catalog
export const YF_CATALOG = [
  { id: "YF_GC=F", title: "Oro (Spot)", type: "currency", currency: "USD", decimals: 2, periodicity: "Tiempo Real", figure: "Precio por Onza" },
  { id: "YF_SI=F", title: "Plata (Spot)", type: "currency", currency: "USD", decimals: 2, periodicity: "Tiempo Real", figure: "Precio por Onza" },
  { id: "YF_CL=F", title: "Petróleo WTI", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "Barril" },
  { id: "YF_BZ=F", title: "Petróleo Brent", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "Barril" },
  { id: "YF_NG=F", title: "Gas Natural", type: "currency", currency: "USD", decimals: 2, periodicity: "Diaria", figure: "MMBtu" },
  { id: "YF_HG=F", title: "Cobre", type: "currency", currency: "USD", decimals: 4, periodicity: "Mensual", figure: "Lib" },
  { id: "YF_ALI=F", title: "Aluminio", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "TM" },
  { id: "YF_ZW=F", title: "Trigo", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Bushel" },
  { id: "YF_ZC=F", title: "Maíz", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Bushel" },
  { id: "YF_CT=F", title: "Algodón", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "YF_SB=F", title: "Azúcar", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "YF_KC=F", title: "Café", type: "currency", currency: "USD", decimals: 2, periodicity: "Mensual", figure: "Libra" },
  { id: "YF_GSG", title: "Índice Commodities", type: "number", decimals: 2, periodicity: "Mensual", figure: "Índice Global" }
];

// INEGI Catalog (Common Indicators)
export const INEGI_CATALOG = [
  { id: "INEGI_1002000001", title: "Población Total", type: "number", decimals: 0, periodicity: "5 Años", figure: "Personas", description: "Población total en México (Censo/Conteo)" },
  { id: "INEGI_496092", title: "PIB (Var. Anual Desest.)", type: "percent", decimals: 1, periodicity: "Trimestral", figure: "Variación", description: "Producto Interno Bruto, variación porcentual anual (Serie desestacionalizada)" },
  { id: "INEGI_494190", title: "Tasa de Desocupación", type: "percent", decimals: 2, periodicity: "Trimestral", figure: "Porcentaje", description: "Tasa de desocupación laboral a nivel nacional" },
  { id: "INEGI_496101", title: "Actividad Terciaria", type: "percent", decimals: 1, periodicity: "Trimestral", figure: "Variación", description: "Desempeño del sector terciario (Comercio/Servicios)" }
];

// Custom Stocks Default
export const DEFAULT_STOCKS = [
  { id: "^GSPC", title: "S&P 500" },
  { id: "^IXIC", title: "NASDAQ" },
  { id: "MXN=X", title: "USD/MXN" },
  { id: "BTC-USD", title: "Bitcoin" }
];

export const SUGGESTED_TICKERS = [
  ...DEFAULT_STOCKS,
  { id: "ETH-USD", title: "Ethereum" },
  { id: "AMXL.MX", title: "América Móvil" },
  { id: "WALMEX.MX", title: "Walmart México" },
  { id: "NVDA", title: "NVIDIA" },
  { id: "AAPL", title: "Apple" },
  { id: "TLT", title: "iShares 20+ Yr Treasury" }
];

// Yield Curve Series (CETES & Bonos M)
export const YIELD_CURVE_SERIES = [
  { id: "SF43783", label: "1M", term: 1, type: "CETES" },
  { id: "SF43784", label: "3M", term: 3, type: "CETES" },
  { id: "SF43785", label: "6M", term: 6, type: "CETES" },
  { id: "SF43786", label: "1A", term: 12, type: "CETES" },
  { id: "SF43936", label: "3A", term: 36, type: "Bono M" },
  { id: "SF43939", label: "5A", term: 60, type: "Bono M" },
  { id: "SF43943", label: "10A", term: 120, type: "Bono M" },
  { id: "SF43945", label: "20A", term: 240, type: "Bono M" },
  { id: "SF43947", label: "30A", term: 360, type: "Bono M" }
];

// Banxico Suggested Catalog (For easy addition)
export const BANXICO_CATALOG = [
  { id: "SF61745", title: "Tasa objetivo", type: "percent", decimals: 2, periodicity: "Diaria", figure: "Tasa", description: "Tasa de referencia de Banxico" },
  { id: "SF43783", title: "TIIE a 28 días", type: "percent", decimals: 2, periodicity: "Diaria", figure: "Tasa", description: "Tasa de Interés Interbancaria de Equilibrio" },
  { id: "SF43718", title: "Tipo de cambio FIX", type: "currency", currency: "MXN", decimals: 4, periodicity: "Diaria", figure: "Pesos por USD", description: "Tipo de cambio oficial para el pago de obligaciones" },
  { id: "SP74665", title: "Inflación General (Var. Mensual)", type: "percent", decimals: 2, periodicity: "Mensual", figure: "Variación", description: "Variación del Índice Nacional de Precios al Consumidor" },
  { id: "SP68257", title: "Valor de UDIS", type: "currency", currency: "MXN", decimals: 4, periodicity: "Diaria", figure: "Pesos por UDI", description: "Unidad de Inversión ajustada por inflación" },
  { id: "SE27803", title: "Remesas (MDD)", type: "number", decimals: 2, periodicity: "Mensual", figure: "Millones de USD", description: "Ingresos por remesas familiares" },
  { id: "SR17692", title: "IGAE", type: "number", decimals: 2, periodicity: "Mensual", figure: "Índice", description: "Indicador Global de la Actividad Económica" }
];

// Banxico SIE Series ID format: Sxyyyyy (S + 1 letter + 5 digits)
// Yahoo Finance format: YF_<SYMBOL> (e.g. YF_AAPL, YF_BTC, YF_CL=F)
// INEGI format: INEGI_<ID> (e.g. INEGI_1002000001)
export const SERIES_ID_REGEX = /^(S[FPGHLMNRST]\d{5,8}|YF_[A-Z0-9.=:\-]+|INEGI_\d+)$/i;

export const BANXICO_API_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1";
export const INEGI_API_BASE = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml";

export const BANXICO_SIE_URLS = {
  API: "https://www.banxico.org.mx/SieAPIRest/service/v1/",
  CATALOG: "https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries"
};

export const INEGI_URLS = {
  TOKEN_GEN: "https://www.inegi.org.mx/servicios/api_indicadores.html",
  CONSTRUCTOR: "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/CONSTRUCTOR/es/00/BISE/2.0"
};
