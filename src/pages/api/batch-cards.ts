// src/pages/api/batch-cards.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { 
  getBatchEnrichedStockData, 
  getCalculatedTickerData 
} from '../../utils/stockIndicatorCalculations';
import { checkRateLimit } from '../../lib/ratelimit';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const { allowed, retryAfter } = checkRateLimit(clientAddress);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
    try {
    const { tickers } = await request.json();
    const DEFAULT_STOCKS = ["GDX", "GOOG", "VOO", "CHA"];
    
    // Check if user is logged in
    const userToken = cookies.get('tiingo_token')?.value;
    
    // Check if the requested tickers are ONLY the default ones
    const isOnlyDefault = tickers.every((t: string) => DEFAULT_STOCKS.includes(t.toUpperCase()));

    // AUTH GATE:
    // If no token AND they are trying to fetch non-default stocks -> 401
    if (!userToken && !isOnlyDefault) {
       return new Response(JSON.stringify({ error: 'Token required for custom tickers' }), { status: 401 });
    }

    // Determine which token to use
    // Use user token if present, otherwise fallback to master token (only if safe)
    const activeToken = userToken || import.meta.env.TIINGO_TOKEN;

    if (!tickers || !Array.isArray(tickers)) {
      return new Response(JSON.stringify({ error: 'Invalid tickers array' }), { status: 400 });
    }

    const upperTickers = tickers.map((t: string) => t.toUpperCase());

    // Proceed with the rest of your logic...
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

