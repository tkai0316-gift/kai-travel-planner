export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin || origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // Origin check
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403 });
    }

    // Rate limit: 10 req / IP / minute
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
    const count = parseInt((await env.KV.get(rlKey)) || '0');
    if (count >= 10) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    await env.KV.put(rlKey, String(count + 1), { expirationTtl: 120 });

    // POST /api/share
    if (request.method === 'POST' && url.pathname === '/api/share') {
      let body;
      try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const id = nanoid();
      await env.KV.put(`share:${id}`, JSON.stringify(body), { expirationTtl: 30 * 24 * 60 * 60 });
      return new Response(JSON.stringify({ id }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // GET /api/share/:id
    const match = url.pathname.match(/^\/api\/share\/([a-z0-9_-]+)$/i);
    if (request.method === 'GET' && match) {
      const raw = await env.KV.get(`share:${match[1]}`);
      if (!raw) return new Response(JSON.stringify({ error: 'Share link expired or not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      return new Response(raw, { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response('Not Found', { status: 404 });
  },
};

function nanoid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}
