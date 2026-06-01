import fs from 'fs';
import path from 'path';

// Define the shape structures to match your component
interface SECTickerItem {
  ticker?: string;
  title?: string;
  cik_str?: number;
}

interface NormalizedTicker {
  symbol: string;
  fullName: string;
}

// Global server-side Set cache for O(1) lookups
let VALID_TICKERS_SET: Set<string> | null = null;

function initializeTickerRegistry() {
  if (VALID_TICKERS_SET) return VALID_TICKERS_SET;

  try {
    // 1. Adjust paths to where your JSON files live relative to this script
    // (Assuming they are stored in your project's public folder or a local directory)
    const publicDir = path.join(process.cwd(), 'public');
    
    const secPath = path.join(publicDir, 'company_tickers.json');
    const etfPath = path.join(publicDir, 'etf_tickers.json');

    const secRaw = fs.readFileSync(secPath, 'utf-8');
    const etfRaw = fs.readFileSync(etfPath, 'utf-8');

    const secData: Record<string, SECTickerItem> = JSON.parse(secRaw);
    const etfData: NormalizedTicker[] = JSON.parse(etfRaw);

    // 2. Mirror your exact frontend normalization logic
    const secNormalized = Object.values(secData).map((item) => ({
      symbol: String(item.ticker || '').toUpperCase().trim(),
      fullName: String(item.title || '').trim()
    }));

    const combinedSymbols = [...secNormalized, ...etfData]
      .map(item => String(item.symbol || '').toUpperCase().trim())
      .filter(Boolean);

    // 3. Store into the static Set
    VALID_TICKERS_SET = new Set(combinedSymbols);
    console.log(`📦 Backend Ticker Registry loaded successfully with ${VALID_TICKERS_SET.size} symbols.`);
    
    return VALID_TICKERS_SET;
  } catch (error) {
    console.error("❌ Failed to initialize backend ticker database registry:", error);
    // Fallback to empty set so server doesn't crash completely
    VALID_TICKERS_SET = new Set();
    return VALID_TICKERS_SET;
  }
}

/**
 * Validates whether a ticker exists within the joint SEC and ETF registries.
 */
export function isValidTicker(ticker: string): boolean {
  const registry = VALID_TICKERS_SET || initializeTickerRegistry();
  return registry.has(ticker.toUpperCase().trim());
}