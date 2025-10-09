import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env['SUPABASE_URL'] || '';
  const service = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const anon = process.env['SUPABASE_ANON_KEY'];
  if (!url || !(service || anon)) return null;
  return createClient(url, service || anon!);
}

async function handleGet() {
  const client = getClient();
  if (!client) return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
  const { data, error } = await client
    .from('knowledge')
    .select('title, description, category')
    .order('title', { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function requireAuth(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

async function handlePost(req: Request) {
  const jwt = await requireAuth(req);
  if (!jwt) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const client = getClient();
  if (!client) return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
  // Validate user token (lightweight) - supabase-js on edge runtime uses fetch
  const { data: userData, error: userErr } = await client.auth.getUser(jwt);
  if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { title, description, category } = body;
  if (!title || !description) return new Response(JSON.stringify({ error: 'title and description are required' }), { status: 400 });
  const { data, error } = await client
    .from('knowledge')
    .insert([{ title, description, category: category ?? null }])
    .select('title, description, category')
    .single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  try {
    switch (req.method) {
      case 'GET': return withCors(await handleGet());
      case 'POST': return withCors(await handlePost(req));
      default: return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));
    }
  } catch (e: any) {
    return withCors(new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500 }));
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function withCors(res: Response) {
  const h = new Headers(res.headers);
  const c = corsHeaders();
  Object.entries(c).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}
