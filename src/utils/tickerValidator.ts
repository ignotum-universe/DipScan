import secDataRaw from '../public/company_tickers.json';
import etfDataRaw from '../public/etf_tickers.json';

// Define the shape structures
interface SECTickerItem {
  ticker?: string;
  title?: string;
  cik_str?: number;
}

interface NormalizedTicker {
  symbol: string;
  fullName: string;
}

// Perform the transformation at the MODULE level (runs once during build/startup)
const secData = secDataRaw as Record<string, SECTickerItem>;
const etfData = etfDataRaw as NormalizedTicker[];

const secNormalized = Object.values(secData).map((item) => ({
  symbol: String(item.ticker || '').toUpperCase().trim(),
  fullName: String(item.title || '').trim()
}));

const combinedSymbols = [...secNormalized, ...etfData]
  .map(item => String(item.symbol || '').toUpperCase().trim())
  .filter(Boolean);

const VALID_TICKERS_SET = new Set(combinedSymbols);

export function isValidTicker(ticker: string): boolean {
  return VALID_TICKERS_SET.has(ticker.toUpperCase().trim());
}