// Vercel serverless function: /api/health
export default async function handler(_req: Request): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
