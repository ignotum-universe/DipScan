import YahooFinance from 'yahoo-finance2';
import { supabase } from '../lib/supabase';
import { computeMetricsFromRows } from './stockIndicatorCalculations'; // Method A from earlier

const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export async function fetchHistoricalData(
  ticker: string,
  effectiveTime: any // Changed to any to handle mixed types safely
): Promise<void> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 320);

  // Parse safety window: Ensure effectiveTime is an actual Date instance
  const safeEffectiveTime = effectiveTime instanceof Date ? effectiveTime : new Date();

  try {
    ticker = ticker.trim().toUpperCase();
    console.log(`📡 Querying Yahoo Finance Chart API for ${ticker}...`);

    const result = await yf.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!result?.quotes || result.quotes.length === 0) {
      console.warn(`⚠️ No historical data returned from Yahoo Finance for ${ticker}`);
      return;
    }

    // 1. Map historical rows cleanly
    const formattedData = result.quotes
      .filter((day: any) => day.date != null)
      .map((day: any) => ({
        ticker: ticker,
        trading_date: day.date.toISOString().split('T')[0],
        open_price:  day.adjopen  ?? day.open,
        high_price:  day.adjhigh  ?? day.high,
        low_price:   day.adjlow   ?? day.low,
        close_price: day.adjclose ?? day.close,
        volume: day.volume,
        updated_at: safeEffectiveTime.toISOString()
      }));

    // 2. Clear out any bad single-row placeholders and write history rows
    const { error: upsertError } = await supabase
      .from('stock_ohlcv')
      .upsert(formattedData, { onConflict: 'ticker, trading_date' });

    if (upsertError) {
      console.error(`❌ Supabase failed to insert OHLCV history for ${ticker}:`, upsertError);
      throw upsertError;
    }

    console.log(`✅ Stored history rows in stock_ohlcv for ${ticker}. Reading complete block for math...`);

// 3. Pure Database Pull: Get a clean, unified block of up to 320 rows
const { data: unifiedDbRows, error: fetchError } = await supabase
  .from('stock_ohlcv')
  .select('*')
  .eq('ticker', ticker)
  .order('trading_date', { ascending: false })
  .limit(320);

if (fetchError || !unifiedDbRows || unifiedDbRows.length === 0) {
  console.error(`❌ Could not retrieve combined rows for math calculation on ${ticker}`);
  return;
}

// 4. Pass the database-verified rows directly to your shared engine!
// (Note: computeMetricsFromRows handles its own array reversing internally)
const finalizedMetrics = computeMetricsFromRows(unifiedDbRows);

// 5. Update metadata and save computed metrics securely
const { error: metaError } = await supabase
  .from('stock_metadata')
  .upsert({
    ticker: ticker,
    calculated_metrics: finalizedMetrics,
    history_fetched_at: new Date().toISOString(),
    fetch_locked_at: null
  }, { onConflict: 'ticker' });

    if (metaError) {
      console.error(`❌ Supabase rejected metadata calculation save for ${ticker}:`, metaError.message);
    } else {
      console.log(`🚀 Statically saved pre-calculated indicators to stock_metadata for ${ticker}`);
    }

  } catch (err) {
    console.error(`❌ Critical failure inside fetchHistoricalData for ${ticker}:`, err);
    throw err;
  }
}