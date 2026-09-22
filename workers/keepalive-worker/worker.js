/**
 * Cloudflare Worker — Supabase Keepalive Cron
 * Pings JobHunter backend keepalive endpoint which INSERTs into keepalive_pings table.
 * Any DB write counts as activity and prevents Supabase free-tier pause after 7 days.
 *
 * Deploy:
 *   cd workers/keepalive-worker
 *   npm i -g wrangler            # or bunx wrangler
 *   wrangler login
 *   # edit wrangler.toml -> KEEPALIVE_URL
 *   wrangler secret put KEEPALIVE_TOKEN  # optional, only if backend has KEEPALIVE_TOKEN set
 *   wrangler deploy
 *
 * Test manually:
 *   curl https://jobhunter-supabase-keepalive.<your-subdomain>.workers.dev/ping
 *   curl https://your-backend.onrender.com/api/keepalive
 *   wrangler tail  # live logs
 */

export default {
  // Cron trigger — Cloudflare calls scheduled() per wrangler.toml crons
  async scheduled(event, env, ctx) {
    ctx.waitUntil(doPing(env, 'cron'));
  },

  // HTTP fetch — so you can manually trigger via browser/curl for testing
  // GET /  -> pings backend and returns result
  // GET /ping -> same
  // GET /health -> worker health (no ping)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ status: 'ok', worker: 'jobhunter-supabase-keepalive', timestamp: new Date().toISOString() });
    }

    // Manual ping trigger
    if (url.pathname === '/' || url.pathname === '/ping' || url.pathname === '/trigger') {
      const result = await doPing(env, 'manual-fetch');
      return json(result, result.ok ? 200 : 502);
    }

    return json({ error: 'Not found', usage: 'GET / or /ping to trigger keepalive, GET /health for worker health' }, 404);
  },
};

async function doPing(env, source) {
  const targetUrl = env.KEEPALIVE_URL || 'https://your-backend.onrender.com/api/keepalive';
  const token = env.KEEPALIVE_TOKEN || '';

  const headers = {
    'User-Agent': 'jobhunter-keepalive-worker/1.0 (+cloudflare-cron)',
    'x-keepalive-source': source,
    'Accept': 'application/json',
  };
  if (token) headers['x-keepalive-token'] = token;

  // Add source as query param too (backend reads both)
  const url = new URL(targetUrl);
  url.searchParams.set('source', source);

  const started = Date.now();
  try {
    // Try POST first (more explicit write), fallback to GET
    let res = await fetch(url.toString(), { method: 'POST', headers });
    if (!res.ok && res.status === 404) {
      // Some deployments may only allow GET
      res = await fetch(url.toString(), { method: 'GET', headers });
    }
    const latency = Date.now() - started;
    const body = await safeJson(res);
    console.log(`[keepalive] ${source} -> ${targetUrl} : ${res.status} in ${latency}ms`, body);

    return {
      ok: res.ok,
      status: res.status,
      latency_ms: latency,
      target: targetUrl,
      source,
      response: body,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const latency = Date.now() - started;
    console.error(`[keepalive] ${source} -> ${targetUrl} failed in ${latency}ms:`, err.message);
    return {
      ok: false,
      status: 0,
      latency_ms: latency,
      target: targetUrl,
      source,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000), status: res.status, statusText: res.statusText };
  }
}
