// Vercel Edge function: experimental streaming proxy for provider -> client via SSE
// NOTES:
// - Edge runtime uses Web APIs (Request, Response, ReadableStream).
// - This implementation attempts to forward a provider streaming response as SSE.
// - Vercel may buffer or impose time limits; this is experimental and not as reliable
//   as a long-running Node server. Use a dedicated host for production streaming.
export const config = { runtime: 'edge' };

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function extractTextFromString(s: string): string {
  if (!s) return '';
  const trimmed = s.trim();
  // Try to parse JSON and extract common fields
  try {
    const obj = JSON.parse(trimmed);
    const parts: string[] = [];
    (function collect(o: any) {
      if (!o) return;
      if (typeof o === 'string') { parts.push(o); return; }
      if (Array.isArray(o)) { for (const it of o) collect(it); return; }
      if (typeof o === 'object') {
        if (typeof o.delta === 'string') parts.push(o.delta);
        if (typeof o.content === 'string') parts.push(o.content);
        if (typeof o.text === 'string') parts.push(o.text);
        if (Array.isArray(o.choices)) { for (const c of o.choices) collect(c); }
        for (const k of Object.keys(o)) collect(o[k]);
      }
    })(obj);
    if (parts.length) return parts.join('');
  } catch (e) {
    // ignore
  }
  // Fallback: strip JSON-like tokens and common metadata
  let out = s.replace(/\{[^}]*\}/g, ' ');
  out = out.replace(/"[^"]+"\s*:\s*"[^"]*"/g, ' ');
  out = out.replace(/\b(object|usage|time_info|system_fingerprint|id|created)\b/gi, ' ');
  out = out.replace(/\bfp_[A-Za-z0-9_\-]+\b/g, ' ');
  out = out.replace(/event:\s*done/gi, ' ');
  out = out.replace(/[{},\[\]]+/g, ' ');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
    const env = { CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY, CEREBRAS_API_URL: process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions' };
    if (!env.CEREBRAS_API_KEY) return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 500 });

    const payload = await req.json().catch(() => null);
    if (!payload || !Array.isArray(payload.messages)) return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400 });

    // Ask provider for a streaming response
    const apiUrl = env.CEREBRAS_API_URL;
    const providerResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({ model: payload.model || process.env.CEREBRAS_MODEL || 'llama-3.3-70b', messages: payload.messages, stream: true })
    });

    if (!providerResp.ok) {
      const txt = await providerResp.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'provider_error', status: providerResp.status, body: txt }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    // Build a readable stream that proxies sanitized text as SSE (data: ...\n\n)
    const providerBody = providerResp.body;
    if (!providerBody) return new Response(JSON.stringify({ error: 'no_stream' }), { status: 502 });

    const stream = new ReadableStream({
      async start(controller) {
        const reader = providerBody.getReader();
        let done = false;
        let buffer = '';
        while (!done) {
          const { value, done: rdone } = await reader.read();
          if (value) {
            const chunk = textDecoder.decode(value, { stream: true });
            // gather chunk and attempt to extract readable text
            buffer += chunk;
            // try to split into lines or JSON-like parts
            const parts = buffer.split(/\r?\n/).filter(Boolean);
            // keep last partial as buffer
            if (!buffer.endsWith('\n')) buffer = parts.pop() || ''; else buffer = '';
            for (const p of parts) {
              const text = extractTextFromString(p);
              if (text) {
                const sse = `data: ${text}\n\n`;
                controller.enqueue(textEncoder.encode(sse));
              }
            }
          }
          done = rdone;
        }
        // flush any remaining buffer
        if (buffer) {
          const text = extractTextFromString(buffer);
          if (text) controller.enqueue(textEncoder.encode(`data: ${text}\n\n`));
        }
        // end event
        controller.enqueue(textEncoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
