// src/pages/api/card/[ticker].ts
import type { APIRoute } from 'astro';
import { getBatchEnrichedStockData, getCalculatedTickerData } from '../../../utils/stockIndicatorCalculations';

export const GET: APIRoute = async ({ params, request }) => {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'No ticker' }), { status: 400 });
  }

  // Read header token from the client request
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  // Crucial: Dynamic single card fetching requires a user token. 
  // No backdoor usage of your environment variables!
  if (!token || token === 'null' || token === 'undefined') {
    return new Response(JSON.stringify({ error: 'Unauthorized: Custom tickers require your own token.' }), { status: 401 });
  }

  await getBatchEnrichedStockData([ticker], token);
  const data = await getCalculatedTickerData(ticker);

  return new Response(JSON.stringify({ ticker, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
};