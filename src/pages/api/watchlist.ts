// src/pages/api/watchlist.ts
import type { APIRoute } from 'astro';
import { checkRateLimit } from '../../lib/ratelimit';

const TICKER_REGEX = /^[A-Z]{1,5}$/;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const { allowed, retryAfter } = checkRateLimit(clientAddress);

  if (!allowed) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter)
        }
      }
    );
  }
  try {
    const body = await request.json();
    const { action } = body;

    //Purge existing watchlist, replace with old watchlist
    if (action === 'CLEAR_ALL_DATA') {
      // Delete both httpOnly cookies from the server side
      cookies.delete('watchlist', { path: '/' });
      cookies.delete('tiingo_token', { path: '/' });
      
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // NEW BLOCK: Allow client to securely drop or check session tokens
    if (action === 'SYNC_TOKEN') {
  const userToken = typeof body.token === 'string' ? body.token.trim() : '';
  if (!userToken) return new Response(JSON.stringify({ ok: false, error: 'Token is required' }), { status: 400 });

  try {
    // 1. Validate the token against Tiingo's API from your server
    const tiingoRes = await fetch('https://api.tiingo.com/tiingo/daily/aapl', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${userToken}`
      }
    });

    // 2. If Tiingo rejects it, bail out before saving anything
    if (!tiingoRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid Tiingo token' }), { status: 401 });
    }

    // 3. If valid, proceed with setting the cookie
    cookies.set('tiingo_token', userToken, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return new Response(JSON.stringify({ ok: true }));

  } catch (err) {
    // Handle network errors or Tiingo downtime
    console.error('Tiingo validation error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Failed to validate token' }), { status: 500 });
  }
}

    if (action === 'SET_LIST') {
      const { watchlist: incomingList } = body;

      if (!Array.isArray(incomingList)) {
        return new Response(JSON.stringify({ ok: false, error: 'Malformed list format' }), { status: 400 });
      }

      // Sanitize the list the same way you do your fallback list
      const sanitizedList = incomingList
        .map(t => (typeof t === 'string' ? t.trim().toUpperCase() : ''))
        .filter(t => TICKER_REGEX.test(t))
        .slice(0, 40); // Hard clamp to max 40 tickers

      const uniqueList = [...new Set(sanitizedList)];

      cookies.set('watchlist', JSON.stringify(uniqueList), {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      return new Response(
        JSON.stringify({ ok: true, watchlist: uniqueList }), 
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';

    //ONLY ALLOW 40 TICKERS TO EXIST IN WATCHLIST
    const MAX_TICKERS = 40;

    if (action === 'ADD' && !TICKER_REGEX.test(ticker)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid ticker format' }), { status: 400 });
    }

    const cookieWatchlist = cookies.get('watchlist')?.json();
    let watchlist: string[] = Array.isArray(cookieWatchlist) ? cookieWatchlist : ["GDX", "TSLA", "VOO", "XLP"]
    watchlist = watchlist
    .map(t => typeof t === 'string' ? t.trim().toUpperCase() : '') // Ensure strings onl
    .filter(t => TICKER_REGEX.test(t));                           // Strip out illegal characters
    watchlist = [...new Set(watchlist)];

    if (action === 'ADD') {
  if (!TICKER_REGEX.test(ticker)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid ticker format' }), { status: 400 });
  }

  // Double-check existence against our cleaned, deduped array
  if (watchlist.includes(ticker)) {
    return new Response(JSON.stringify({ ok: false, error: 'Ticker already in watchlist' }), { status: 400 });
  }

  if (watchlist.length >= MAX_TICKERS) {
    return new Response(JSON.stringify({ ok: false, error: 'Limit reached.' }), { status: 400 });
  }
      watchlist.unshift(ticker);
    } else if (action === 'DELETE') {
      watchlist = watchlist.filter(s => s !== ticker);
    }

    cookies.set('watchlist', JSON.stringify(watchlist), {
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true, // Prevents client-side JS modification of this cookie
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        watchlist, 
        added: action === 'ADD' // True if they just added one, false if they deleted one
      }), 
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error("Watchlist API Error:", e);
    return new Response(JSON.stringify({ ok: false, error: 'Internal Error' }), { status: 500 });
  }
};