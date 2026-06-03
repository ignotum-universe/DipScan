// src/utils/stockIndicatorCalculations.ts
import { supabase } from '../lib/supabase';
import { sma, vwap } from 'fast-technical-indicators';
import yahooFinance from 'yahoo-finance2';
import { fetchHistoricalData } from './historicalBackfill';
import { isValidTicker } from './tickerValidator';
const yf = new yahooFinance();

export interface StockData {
  trading_date: string;
  close_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  sma200: number | null;
  rollingVwap: number | null;
}

export interface VolumeProfileBin {
  priceBin: number;
  volume: number;
}

const US_MARKET_HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-11-27', // Black Friday (early close — treat as closed)
  '2026-12-25', // Christmas
]);

const calculationCache = new Map<string, { updatedAt: string; result: any }>();
const reconciliationInFlight = new Set<string>();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 1. ROLLING VWAP CALCULATOR (Eliminates the anchor date bug)
export function calculateRollingVWAP(data: any[], period: number = 20): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  // We need enough historical bars to fulfill the rolling window period
  if (!data || data.length < period) return result;

  // Calculate moving VWAP using a rolling summation window
  for (let i = period - 1; i < data.length; i++) {
    let totalVolumePrice = 0;
    let totalVolume = 0;

    // Sum up typical prices weighted by volume across our window frame
    for (let j = i - period + 1; j <= i; j++) {
      const day = data[j];
      const typicalPrice = (day.high_price + day.low_price + day.close_price) / 3;

      totalVolumePrice += typicalPrice * day.volume;
      totalVolume += day.volume;
    }

    // Protect against division by zero on low volume holidays
    result[i] = totalVolume > 0 ? parseFloat((totalVolumePrice / totalVolume).toFixed(2)) : null;
  }

  return result;
}

// 2. VOLUME PROFILE CALCULATOR
export function calculateVolumeProfile(data: any[], binsCount: number = 24): VolumeProfileBin[] {
  if (!data || data.length === 0) return [];

  const highs = data.map(d => d.high_price);
  const lows = data.map(d => d.low_price);

  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const binSize = (maxPrice - minPrice) / binsCount;

  // Initialize bins
  const bins: VolumeProfileBin[] = Array.from({ length: binsCount }, (_, i) => ({
    priceBin: parseFloat((minPrice + (i * binSize) + (binSize / 2)).toFixed(2)),
    volume: 0
  }));

  // Distribute volume into bins based on candle range overlap
  data.forEach(day => {
    const range = day.high_price - day.low_price;
    if (range === 0) {
      const exactBin = Math.min(Math.floor((day.close_price - minPrice) / binSize), binsCount - 1);
      if (exactBin >= 0) bins[exactBin].volume += day.volume;
      return;
    }

    // Allocate share of volume proportionally to bins overlapping the high-low range
    for (let i = 0; i < binsCount; i++) {
      const binBottom = minPrice + (i * binSize);
      const binTop = binBottom + binSize;

      const overlapStart = Math.max(day.low_price, binBottom);
      const overlapEnd = Math.min(day.high_price, binTop);

      if (overlapStart < overlapEnd) {
        const overlapFactor = (overlapEnd - overlapStart) / range;
        bins[i].volume += day.volume * overlapFactor;
      }
    }
  });

  // Round volume figures cleanly
  return bins.map(b => ({ ...b, volume: Math.round(b.volume) }));
}

// 2b. AVERAGE TRUE RANGE (ATR) CALCULATOR
export function calculateATR(data: any[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (!data || data.length <= period) return result;

  const tr: number[] = new Array(data.length).fill(0);

  // Step 1: Calculate True Range (TR) for all candles
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high_price;
    const low = data[i].low_price;
    const prevClose = data[i - 1].close_price;

    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
  }

  // Step 2: Calculate Initial ATR using simple SMA of the first window
  let firstATRSum = 0;
  for (let i = 1; i <= period; i++) {
    firstATRSum += tr[i];
  }
  let currentATR = firstATRSum / period;
  result[period] = parseFloat(currentATR.toFixed(2));

  // Step 3: Wilders Smoothing Technique for remaining bars
  for (let i = period + 1; i < data.length; i++) {
    currentATR = ((currentATR * (period - 1)) + tr[i]) / period;
    result[i] = parseFloat(currentATR.toFixed(2));
  }

  return result;
}



//CALCULATE VPVR POINT OF CONTROL AND HIGH VOLUME NODE
export interface VolumeProfileBin {
  priceBin: number;
  volume: number;
}

export interface VPVRMetrics {
  bins: VolumeProfileBin[];
  poc: { price: number; volume: number };
  highVolumeNodes: VolumeProfileBin[];
  lowestNode?: number;
  highestNode?: number;
}

export function extractVPVRMetrics(bins: VolumeProfileBin[]): VPVRMetrics {
  if (!bins || bins.length === 0) {
    return { bins: [], poc: { price: 0, volume: 0 }, highVolumeNodes: [], lowestNode: 0, highestNode: 0 };
  }

  // 1. Find the Point of Control (POC)
  let maxVol = -1;
  let pocBin = bins[0];

  bins.forEach(bin => {
    if (bin.volume > maxVol) {
      maxVol = bin.volume;
      pocBin = bin;
    }
  });

  const poc = { price: pocBin.priceBin, volume: pocBin.volume };

  // 2. Identify High-Volume Nodes (HVNs) via local peak detection
  const avgVolume = bins.reduce((sum, b) => sum + b.volume, 0) / bins.length;
  const highVolumeNodes: VolumeProfileBin[] = [];

  for (let i = 0; i < bins.length; i++) {
    const currentVol = bins[i].volume;
    const prevVol = i > 0 ? bins[i - 1].volume : 0;
    const nextVol = i < bins.length - 1 ? bins[i + 1].volume : 0;

    if (currentVol > prevVol && currentVol > nextVol && currentVol > avgVolume * 1.2) {
      highVolumeNodes.push(bins[i]);
    }
  }

  // --- ADDED FIX: CALCULATE ABSOLUTE PRICE BOUNDARIES ---
  // If we have local peaks, find the lowest and highest price locations among them.
  // We use [...highVolumeNodes] to clone it so we don't mutate our collection state.
  const priceSortedNodes = [...highVolumeNodes].sort((a, b) => a.priceBin - b.priceBin);

  const lowestNode = priceSortedNodes.length > 0 ? priceSortedNodes[0].priceBin : 0;
  const highestNode = priceSortedNodes.length > 0 ? priceSortedNodes[priceSortedNodes.length - 1].priceBin : 0;

  // Sort High-Volume Nodes by volume descending for your standard frontend map loops
  highVolumeNodes.sort((a, b) => b.volume - a.volume);

  // 3. Return everything back to the server data pipeline
  return {
    bins,
    poc,
    highVolumeNodes,
    lowestNode,   // <-- Added
    highestNode   // <-- Added
  };
}

// --- 1. TYPE DEFINITIONS & HELPER FUNCTIONS (OUTSIDE THE ORCHESTRATOR) ---

interface MarketState {
  isOpen: boolean;
  effectiveTime: Date;
}

export function getEasternMarketState(): MarketState {
  const now = new Date();

  // ✅ Get ET date components directly without reparsing
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const get = (type: string) => etParts.find(p => p.type === type)?.value ?? '';

  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hours = parseInt(get('hour'));
  const minutes = parseInt(get('minute'));
  const timeAsMinutes = hours * 60 + minutes;
  const todayET = `${get('year')}-${get('month')}-${get('day')}`;

  const marketOpenMinutes = 9 * 60 + 30;
  const marketCloseMinutes = 16 * 60;
  const isWeekday = day >= 1 && day <= 5;
  const isHoliday = US_MARKET_HOLIDAYS_2026.has(todayET);

  const prevTradingDayClose = (from: Date): Date => {
    const d = new Date(from);
    do {
      d.setUTCDate(d.getUTCDate() - 1);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const dow = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
      if (dow >= 1 && dow <= 5 && !US_MARKET_HOLIDAYS_2026.has(dateStr)) break;
    } while (true);
    // Return as a UTC date representing 4pm ET
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return new Date(`${dateStr}T21:00:00.000Z`); // 4pm ET = 21:00 UTC (EDT)
  };

  //Check it's weekend or holiday
  if (!isWeekday || isHoliday) {
    return { isOpen: false, effectiveTime: prevTradingDayClose(now) };
  }

  //Check if it's pre-market on a weekday
  if (timeAsMinutes < marketOpenMinutes) {
    return { isOpen: false, effectiveTime: prevTradingDayClose(now) };
  }

  //Check if it's post-market on a weekday
  if (timeAsMinutes >= marketCloseMinutes) {
    const dateStr = todayET;
    return { isOpen: false, effectiveTime: new Date(`${dateStr}T20:00:00.000Z`) }; // 4pm ET
  }

  return { isOpen: true, effectiveTime: now };
}

// Rounds down any ET date to its nearest 5-minute market interval boundary
function getIntervalBlockStart(date: Date): Date {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
}


// --- 2. DATABASE SYNC ENGINE ---

export async function syncBatchToSupabase(tiingoData: any[], effectiveTime: Date) {
  if (!tiingoData || tiingoData.length === 0) return null;

  const rows = tiingoData.map(day => {
    const isLive = day.last !== undefined;
    const rowTicker = (day.ticker || "").toUpperCase();

    return {
      ticker: rowTicker,
      trading_date: isLive ? effectiveTime.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : day.date.split('T')[0],

      // Map adjusted parameters for historical EOD data, fallback to raw for live
      open_price: isLive ? day.open : (day.adjOpen ?? day.open),
      high_price: isLive ? day.high : (day.adjHigh ?? day.high),
      low_price: isLive ? day.low : (day.adjLow ?? day.low),
      close_price: isLive ? (day.tngoLast || day.last) : (day.adjClose ?? day.close),
      volume: isLive ? day.volume : (day.adjVolume ?? day.volume),

      updated_at: effectiveTime.toISOString()
    };
  });

  return await supabase.from('stock_ohlcv').upsert(rows, { onConflict: 'ticker, trading_date' });
}

// --- SERVERLESS DISTRIBUTED LOCK HELPERS ---

/**
 * Attempts to atomically lock tickers in the database.
 * Returns an array of tickers that were SUCCESSFULLY locked by this request.
 */
/**
 * Attempts to atomically lock tickers in the database using an upsert.
 * Safely handles tickers that do not exist yet in the stock_metadata table.
 */
async function acquireDistributedLocks(tickers: string[]): Promise<string[]> {
  const now = new Date();
  const lockTimeoutLimit = new Date(now.getTime() - 10000); // 10-second safety window

  // 1. Fetch current rows to see what is already locked by someone else
  const { data: existingMeta } = await supabase
    .from('stock_metadata')
    .select('ticker, fetch_locked_at')
    .in('ticker', tickers);

  const activeLocks = new Set(
    (existingMeta ?? [])
      .filter(row => row.fetch_locked_at && new Date(row.fetch_locked_at) > lockTimeoutLimit)
      .map(row => row.ticker.toUpperCase())
  );

  // 2. Filter out what is legitimately locked. The rest are safe to claim/insert.
  const tickersToClaim = tickers.filter(t => !activeLocks.has(t));

  if (tickersToClaim.length === 0) return [];

  // 3. Perform an atomic upsert to lock them
  const rowsToUpsert = tickersToClaim.map(ticker => ({
    ticker,
    fetch_locked_at: now.toISOString(),
    history_fetched_at: now.toISOString() // satisfying any NOT NULL requirements
  }));

  const { data, error } = await supabase
    .from('stock_metadata')
    .upsert(rowsToUpsert, { onConflict: 'ticker' })
    .select('ticker');

  if (error || !data) {
    console.error("❌ Error acquiring distributed locks via upsert:", error);
    return [];
  }

  return data.map(row => row.ticker.toUpperCase());
}

/**
 * Releases the database lock for specific tickers.
 */
async function releaseDistributedLocks(tickers: string[]) {
  if (tickers.length === 0) return;
  
  await supabase
    .from('stock_metadata')
    .update({ fetch_locked_at: null })
    .in('ticker', tickers);
}


// --- 3. THE MAIN ORCHESTRATOR ---

export async function getBatchEnrichedStockData(tickers: string[], token: string) {
  // 1. SANITIZATION GUARD: Keep only valid symbols from joint json databases
  const upperTickers = tickers
    .map(t => (t || "").trim().toUpperCase())
    .filter(t => isValidTicker(t)); // 👈 Filters out user-injected gibberish
    
  // 2. Early exit if the incoming list contains absolutely zero real assets
  if (upperTickers.length === 0) {
    console.log("⚠️ Watchlist sanitization stripped out all provided tickers (Gibberish detected). Aborting batch operation.");
    return;
  }

  const { isOpen: marketIsOpen, effectiveTime } = getEasternMarketState();
  const currentBlockStart = getIntervalBlockStart(effectiveTime);
  const todayETString = effectiveTime.toLocaleDateString("en-CA", { 
    timeZone: "America/New_York" 
  });

  // 1. DETERMINE THE LAST COMPLETED TRADING SESSION
  // If market is open right now, history must be fully reconciled up to yesterday.
  // If market is closed, history must be reconciled up to today's date.
  let lastExpectedClosedTradingDay = todayETString;
  if (marketIsOpen) {
    const prevDate = new Date(effectiveTime);
    // Rewind 1 day. Your internal history engine loops over weekends/holidays, 
    // so providing a date string from yesterday provides an accurate lower-bound check.
    prevDate.setDate(prevDate.getDate() - 1);
    lastExpectedClosedTradingDay = prevDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }

  // 2. FETCH LATEST RECORDED DATE PER TICKER (Instead of counting total rows)
  const historyDateResults = await Promise.all(
    upperTickers.map(ticker =>
      supabase
        .from('stock_ohlcv')
        .select('trading_date')
        .eq('ticker', ticker)
        .order('trading_date', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => ({ ticker, latestTradingDate: data?.trading_date || null }))
    )
  );

  const { data: metaRows } = await supabase
    .from('stock_metadata')
    .select('ticker, history_fetched_at, live_unsupported, calculated_metrics') 
    .in('ticker', upperTickers);

  const unsupportedTickers = new Set(
    metaRows?.filter(r => r.live_unsupported).map(r => r.ticker.toUpperCase()) ?? []
  );

  const liveEligibleTickers = upperTickers.filter(t => !unsupportedTickers.has(t));

  // 3. DETECT UNINITIALIZED TICKERS, STALE GAPS, OR MISSING CACHE BLOCKS
  const metaMap = new Map(metaRows?.map(m => [m.ticker.toUpperCase(), m]));

  const needsHistory = historyDateResults
    .filter(r => {
      const upperT = r.ticker.toUpperCase();
      const metaRecord = metaMap.get(upperT);

      // Case A: Ticker has no raw history rows at all
      if (!r.latestTradingDate) return true;

      // Case B: Ticker raw data hasn't been updated since previous trading days
      if (r.latestTradingDate < lastExpectedClosedTradingDay) return true;

      // Case C: The raw rows are here, but the metrics column is broken/null!
      // This catches existing stocks that need their analytics compiled.
      if (!metaRecord || metaRecord.calculated_metrics === null) return true;

      return false;
    })
    .map(r => r.ticker);

  // ✅ Parallel backfill execution for missing chunks
  if (needsHistory.length > 0) {
    console.log(`📡 Backfilling or repairing history for: ${needsHistory.join(', ')}`);
    await Promise.allSettled(
      needsHistory.map(ticker => fetchHistoricalData(ticker, effectiveTime))
    );

    // ✅ Track latest backfill timestamp safely 
    const { error: upsertError } = await supabase
      .from('stock_metadata')
      .upsert(
        needsHistory.map(ticker => ({
          ticker,
          history_fetched_at: new Date().toISOString()
        })),
        { onConflict: 'ticker' }
      );

    if (upsertError) {
      console.error("❌ Failed to update stock_metadata history sync tracking:", upsertError);
    } else {
      console.log("✅ stock_metadata backfill timestamps updated for:", needsHistory);
    }
  }

  // ==========================================
  // BLOCK A: MARKET IS CLOSED (EOD RECONCILIATION)
  // ==========================================
  if (!marketIsOpen) {
    console.log("🔒 Market is closed. Checking for unreconciled EOD prices...");

    const todayCloseUTC = new Date(`${todayETString}T20:00:00.000Z`);

    const { data: latestRows } = await supabase
      .from('stock_ohlcv')
      .select('ticker, updated_at')
      .in('ticker', liveEligibleTickers)
      .eq('trading_date', todayETString);

    const rowMap = new Map<string, string>();
    latestRows?.forEach(row => rowMap.set(row.ticker.toUpperCase(), row.updated_at));

    const staleTickers = liveEligibleTickers.filter(ticker => {
      const updatedAt = rowMap.get(ticker);
      return !updatedAt || new Date(updatedAt) < todayCloseUTC;
    });

    if (staleTickers.length > 0) {
      const lockKey = staleTickers.slice().sort().join(',');

      if (reconciliationInFlight.has(lockKey)) {
        console.log(`⏳ Reconciliation already in flight for: ${lockKey}. Skipping duplicate.`);
        return;
      }

      reconciliationInFlight.add(lockKey);
      console.log(`🔄 Fetching final EOD prices for: ${staleTickers.join(', ')}`);

      try {
        const eodResponse = await fetch(`https://api.tiingo.com/iex/?tickers=${staleTickers.join(',')}`, {
          headers: { "Authorization": `Token ${token}` }
        });
        const eodData = await eodResponse.json();
        if (Array.isArray(eodData)) {
          await syncBatchToSupabase(eodData, effectiveTime);
          console.log(`✅ EOD prices reconciled for: ${staleTickers.join(', ')}`);
        }
      } catch (e) {
        console.error("❌ EOD reconciliation fetch failed:", e);
      } finally {
        reconciliationInFlight.delete(lockKey);
      }
    } else {
      console.log("✅ All tickers have today's close price. No reconciliation needed.");
    }

    return; 
  }

  // ==========================================
  // BLOCK B: MARKET IS OPEN (SERVERLESS DISTRIBUTED LOCK WITH DB POLLING)
  // ==========================================

  const { data: latestRows } = await supabase
    .from('stock_ohlcv')
    .select('ticker, updated_at')
    .in('ticker', upperTickers)
    .eq('trading_date', todayETString);

  const { data: currentMeta } = await supabase
    .from('stock_metadata')
    .select('ticker, fetch_locked_at')
    .in('ticker', liveEligibleTickers);

  const rowMap = new Map<string, string>();
  latestRows?.forEach(row => rowMap.set(row.ticker.toUpperCase(), row.updated_at));

  const lockMap = new Map<string, string | null>();
  currentMeta?.forEach(row => lockMap.set(row.ticker.toUpperCase(), row.fetch_locked_at));

  const staleTickers: string[] = [];
  const activeInFlightTickers: string[] = [];

  const lockTimeoutLimit = new Date(new Date().getTime() - 10000);

  for (const ticker of liveEligibleTickers) {
    const updatedAt = rowMap.get(ticker);
    let isStale = false;

    if (!updatedAt) {
      isStale = true;
    } else {
      const latestUpdateET = new Date(updatedAt);
      if (marketIsOpen && latestUpdateET.getTime() < currentBlockStart.getTime()) isStale = true;
    }

    if (isStale) {
      const lockTimeStr = lockMap.get(ticker);
      const hasActiveLock = lockTimeStr && new Date(lockTimeStr) > lockTimeoutLimit;

      if (hasActiveLock) {
        activeInFlightTickers.push(ticker);
      } else {
        staleTickers.push(ticker);
      }
    }
  }

  if (unsupportedTickers.size > 0) {
    console.log(`ℹ️ Skipping live fetch for unsupported OTC tickers: ${Array.from(unsupportedTickers).join(', ')}`);
  }

  if (activeInFlightTickers.length > 0 && staleTickers.length === 0) {
    console.log(`⏳ [Serverless] Fetch in flight on another instance for: [${activeInFlightTickers.join(', ')}]. Polling DB...`);
    
    const maxRetries = 25; 
    const pollInterval = 100; 
    let retries = 0;
    let locked = true;

    while (retries < maxRetries && locked) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      retries++;
      
      const { data: checkMeta } = await supabase
        .from('stock_metadata')
        .select('ticker, fetch_locked_at')
        .in('ticker', activeInFlightTickers);

      locked = (checkMeta ?? []).some(row => row.fetch_locked_at && new Date(row.fetch_locked_at) > lockTimeoutLimit);
    }
  }

  if (staleTickers.length > 0) {
    const tickersToFetch = await acquireDistributedLocks(staleTickers);

    if (tickersToFetch.length > 0) {
      const tickerParam = tickersToFetch.join(',');
      console.log(`📡 [Serverless Lock Claimed] Fetching live prices for: [${tickerParam}]`);

      try {
        const liveResponse = await fetch(`https://api.tiingo.com/iex/?tickers=${tickerParam}`, {
          headers: { "Authorization": `Token ${token}` }
        });
        const liveData = await liveResponse.json();

        if (Array.isArray(liveData)) {
          await syncBatchToSupabase(liveData, effectiveTime);
          console.log(`✅ Synced batch live prices for: [${tickerParam}]`);

          const unsupported = tickersToFetch.filter(t => {
            const returned = liveData.find((d: any) => d.ticker.toUpperCase() === t);
            if (!returned) return true;
            const returnedDate = returned.timestamp?.split('T')[0];
            const todayET = effectiveTime.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
            return returnedDate !== todayET;
          });

          if (unsupported.length > 0) {
            await supabase.from('stock_metadata').upsert(
              unsupported.map(ticker => ({ 
                ticker, 
                live_unsupported: true,
                history_fetched_at: new Date().toISOString()
              })),
              { onConflict: 'ticker' }
            );
            console.log(`🚫 Marked as live-unsupported: ${unsupported.join(', ')}`);
          }
        }
      } catch (e) {
        console.error(`❌ Batch fetch failed for [${tickerParam}]:`, e);
      } finally {
        await releaseDistributedLocks(tickersToFetch);
      }
    } else {
      console.log(`⏳ Live fetch already in flight for requested tickers: [${staleTickers.join(', ')}]. Skipping duplicate call.`);
    }
  }}

export function computeMetricsFromRows(dbData: any[]) {
  if (!dbData || dbData.length === 0) {
    return { 
      chartData: [], 
      volumeProfile: { bins: [], poc: { price: 0, volume: 0 }, highVolumeNodes: [] }, 
      anchorProfile: { bins: [], poc: { price: 0, volume: 0 }, highVolumeNodes: [] },
      volatilityGuard: { currentAtr: 0, atrRatio: 1, isCompressed: false }
    };
  }

  // 1. Sort explicitly by date instead of relying on a raw array reverse. 
  // This guarantees oldest data is at index 0, flowing forward in time.
  const calculationData = [...dbData].sort(
    (a, b) => new Date(a.trading_date).getTime() - new Date(b.trading_date).getTime()
  );

  // 2. Sanitize prices: Ensure strings from the DB are explicitly parsed to floats 
  // and discard any corrupted or undefined records.
  const closePrices = calculationData
    .map(d => (typeof d.close_price === 'string' ? parseFloat(d.close_price) : d.close_price))
    .filter(price => price !== null && price !== undefined && !isNaN(price));
  
  // 3. Prevent runtime errors if a stock somehow has less than 200 days of history
  if (closePrices.length < 200) {
    console.warn(`⚠️ Close prices length (${closePrices.length}) is insufficient for 200-day indicators.`);
  }

  // This will run cleanly and generate your indicators
  const rawSma200 = sma({ period: 200, values: closePrices });

  const sma200 = [
    ...new Array(calculationData.length - rawSma200.length).fill(null),
    ...rawSma200.map(v => parseFloat(v.toFixed(2)))
  ];

  const rollingVwap = calculateRollingVWAP(calculationData, 20);
  const atrSequence = calculateATR(calculationData, 14);

  const recentDataForVPVR = calculationData.slice(-50);
  const vpvrMetrics = extractVPVRMetrics(calculateVolumeProfile(recentDataForVPVR, 24));

  const anchorDataForVPVR = calculationData.slice(-200);
  const anchorMetrics = extractVPVRMetrics(calculateVolumeProfile(anchorDataForVPVR, 24));

  const chartData = calculationData.map((day, i) => ({
    ...day,
    sma200: sma200[i],
    rollingVwap: rollingVwap[i],
    atr: atrSequence[i]
  })).reverse();

  const currentAtr = atrSequence[atrSequence.length - 1] ?? 0;

  const recentAtrValues = atrSequence
    .slice(-50)
    .filter((value): value is number => value !== null && value !== undefined);
  const historicalAtr = recentAtrValues.length > 0
    ? recentAtrValues.reduce((sum, value) => sum + value, 0) / recentAtrValues.length
    : 0;

  const atrRatio = historicalAtr > 0 ? currentAtr / historicalAtr : 1;
  const isCompressed = currentAtr < historicalAtr * 0.8;

  return {
    chartData,
    volumeProfile: vpvrMetrics,
    anchorProfile: anchorMetrics,
    volatilityGuard: {
      currentAtr,
      atrRatio,
      isCompressed
    }
  };
}

export async function getCalculatedTickerData(ticker: string) {
  ticker = ticker.toUpperCase();

  const cached = calculationCache.get(ticker);

  const { data: latestRow } = await supabase
    .from('stock_ohlcv')
    .select('updated_at')
    .eq('ticker', ticker)
    .order('trading_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestUpdatedAt = latestRow?.updated_at;

  if (cached && latestUpdatedAt && cached.updatedAt === latestUpdatedAt) {
    console.log(`⚡ ${ticker} calculation grabbed from cache.`);
    return cached.result;
  }

  const { data: dbData } = await supabase
    .from('stock_ohlcv')
    .select('*')
    .eq('ticker', ticker)
    .order('trading_date', { ascending: false })
    .limit(320);

  // Call our clean extracted engine!
  const result = computeMetricsFromRows(dbData || []);

  if (latestUpdatedAt && dbData && dbData.length > 0) {
    calculationCache.set(ticker, { updatedAt: latestUpdatedAt, result });
    console.log(`🧮 ${ticker} calculated and cached.`);
  }

  return result;
}