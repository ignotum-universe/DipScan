import YahooFinance from 'yahoo-finance2';
import { supabase } from '../lib/supabase';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export async function fetchHistoricalData(
  ticker: string,
  effectiveTime: Date
): Promise<void> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 320);

  try {
    const result = await yf.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!result?.quotes || result.quotes.length === 0) {
      console.warn(`⚠️ No historical data found for ${ticker}`);
      return;
    }

    const formattedData = result.quotes
  .filter((day: any) => day.date != null)
  .map((day: any) => ({
    ticker: ticker.toUpperCase(),
    trading_date: day.date.toISOString().split('T')[0],
    open_price: day.open,
    high_price: day.high,
    low_price: day.low,
    close_price: day.adjclose ?? day.close,
    volume: day.volume,
    updated_at: effectiveTime.toISOString()
  }));

await supabase
  .from('stock_ohlcv')
  .upsert(formattedData, { onConflict: 'ticker, trading_date' });

console.log(`✅ Backfilled ${formattedData.length} rows for ${ticker}`);

  } catch (err) {
    console.error(`❌ Failed to backfill ${ticker} via Yahoo Chart API:`, err);
    throw err;
  }
}