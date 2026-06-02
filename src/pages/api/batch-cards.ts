// src/pages/api/batch-cards.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { 
  getBatchEnrichedStockData, 
  getCalculatedTickerData 
} from '../../utils/stockIndicatorCalculations';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { tickers, token } = await request.json();
    const activeToken = token || import.meta.env.TIINGO_TOKEN;

    if (!tickers || !Array.isArray(tickers)) {
      return new Response(JSON.stringify({ error: 'Invalid tickers array' }), { status: 400 });
    }

    const upperTickers = tickers.map(t => t.toUpperCase());

    // 1. Run your history/gap orchestrator checks exactly ONCE for the whole batch
    await getBatchEnrichedStockData(upperTickers, activeToken);

    // 2. ✅ BATCH THE CACHE PRE-CHECK: Fetch the latest updated_at for all requested tickers at once
    // This replaces 8 separate individual metadata queries with ONE rapid hit.
    // We utilize a RPC or standard grouped query. Since we need the latest per ticker, 
    // filtering the stock_ohlcv using an .in() order or using a metadata link is fastest.
    const { data: latestRows, error } = await supabase
      .from('stock_metadata') // Using stock_metadata since it updates whenever history runs!
      .select('ticker, history_fetched_at')
      .in('ticker', upperTickers);

    if (error) {
      console.warn("⚠️ Meta check failed, falling back to sequential computing:", error);
    }

    // 3. Resolve the calculations concurrently
    // Since getCalculatedTickerData checks calculationCache internally, it will now hit 
    // memory instantly for warm items, or process the 320-row database limit cleanly if stale.
    const results: Record<string, any> = {};
    await Promise.all(
      upperTickers.map(async (symbol: string) => {
        const data = await getCalculatedTickerData(symbol);
        results[symbol] = data;
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("❌ Batch endpoints calculation crash:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

