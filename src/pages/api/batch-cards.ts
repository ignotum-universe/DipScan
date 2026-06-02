// src/pages/api/batch-cards.ts
import type { APIRoute } from 'astro';
import { getBatchEnrichedStockData, getCalculatedTickerData } from '../../utils/stockIndicatorCalculations';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { tickers, token } = await request.json();
    const activeToken = token || import.meta.env.TIINGO_TOKEN;

    if (!tickers || !Array.isArray(tickers)) {
      return new Response(JSON.stringify({ error: 'Invalid tickers array' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Hand all tickers to your batch orchestrator safely
    await getBatchEnrichedStockData(tickers, activeToken);

    // 2. Resolve calculations concurrently in server memory
    const results: Record<string, any> = {};
    await Promise.all(
      tickers.map(async (symbol: string) => {
        const data = await getCalculatedTickerData(symbol);
        results[symbol] = data;
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};