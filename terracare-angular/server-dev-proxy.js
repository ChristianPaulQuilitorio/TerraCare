#!/usr/bin/env node
// Lightweight dev-only proxy to support the Angular dev server while the main
// server.ts is being diagnosed. Adds CORS, preflight handling, simple
// in-memory conversation persistence, and forwards chat requests to Cerebras.
// Usage: node -r dotenv/config server-dev-proxy.js

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const DEFAULT_PORT = 4000;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions';

// Allow the Angular dev server origin by default
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',').map(s => s.trim()).filter(Boolean);

// Simple CORS + preflight middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// In-memory conversation store for dev
const devConversations = new Map();

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Helper to call Cerebras (non-streaming)
async function callCerebras(payload) {
  const fetchRes = await fetch(CEREBRAS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await fetchRes.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  // Map common provider auth error into a clearer status for dev UX
  try {
    if (parsed && typeof parsed === 'object') {
      const code = parsed.code || parsed?.error?.code || parsed?.type;
      const message = parsed.message || parsed?.error?.message || JSON.stringify(parsed);
      if (String(code).toLowerCase().includes('wrong_api') || /wrong api key/i.test(message)) {
        return { status: 401, body: { error: 'Invalid Cerebras API key. Set CEREBRAS_API_KEY in your .env or hosting secrets.' } };
      }
    }
  } catch (e) {
    // ignore mapping errors
  }

  return { status: fetchRes.status, body: parsed };
}

// POST /api/ai/chat (non-streaming)
app.post('/api/ai/chat', async (req, res) => {
  try {
    if (!CEREBRAS_API_KEY) return res.status(500).json({ error: 'CEREBRAS_API_KEY not configured' });
    const payload = req.body || {};
    if (!Array.isArray(payload.messages)) return res.status(400).json({ error: 'messages array required' });

    const providerPayload = {
      model: payload.model || process.env.CEREBRAS_MODEL || 'llama-3.3-70b',
      messages: payload.messages,
      max_completion_tokens: payload.max_completion_tokens ?? payload.max_tokens ?? 1024,
      temperature: payload.temperature ?? 0.2,
      top_p: payload.top_p ?? 1,
      stream: false,
    };

    const { status, body } = await callCerebras(providerPayload);
    return res.status(status).json(body);
  } catch (err) {
    console.error('dev proxy error', err);
    return res.status(500).json({ error: err?.message || 'proxy error' });
  }
});

// POST /api/ai/chat/stream -> For dev, we implement a simple non-streaming passthrough
// that returns the full JSON as a single event so the client can still function.
app.post('/api/ai/chat/stream', async (req, res) => {
  try {
    if (!CEREBRAS_API_KEY) return res.status(500).json({ error: 'CEREBRAS_API_KEY not configured' });
    const payload = req.body || {};
    if (!Array.isArray(payload.messages)) return res.status(400).json({ error: 'messages array required' });

    const providerPayload = {
      model: payload.model || process.env.CEREBRAS_MODEL || 'llama-3.3-70b',
      messages: payload.messages,
      max_completion_tokens: payload.max_completion_tokens ?? payload.max_tokens ?? 1024,
      temperature: payload.temperature ?? 0.2,
      top_p: payload.top_p ?? 1,
      stream: false,
    };

    const { status, body } = await callCerebras(providerPayload);

    // Send a very small SSE-style stream: initial data with the full response, then 'done'
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const payloadEvent = { delta: typeof body === 'string' ? body : (body?.choices ?? body) };
    res.write(`data: ${JSON.stringify(payloadEvent).replace(/\n/g, '\\n')}\n\n`);
    res.write('event: done\ndata: {}\n\n');
    return res.end();
  } catch (err) {
    console.error('dev stream proxy error', err);
    try { res.write(`data: ${JSON.stringify({ error: err?.message || 'stream failed' })}\n\n`); } catch {}
    return res.end();
  }
});

// Conversation persistence (dev-only): POST saves, GET lists
app.post('/api/ai/conversations', (req, res) => {
  try {
    const userId = (req.body && req.body.user_id) || 'dev-user';
    const messages = req.body?.messages || [];
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
    const list = devConversations.get(userId) || [];
    const row = { id: `dev-${Date.now()}`, user_id: userId, model: req.body?.model || process.env.CEREBRAS_MODEL || 'llama-3.3-70b', messages, created_at: new Date().toISOString() };
    list.unshift(row);
    devConversations.set(userId, list.slice(0, 200));
    return res.status(201).json(row);
  } catch (err) {
    console.error('conversations save failed', err);
    return res.status(500).json({ error: err?.message || 'save failed' });
  }
});

app.get('/api/ai/conversations', (req, res) => {
  try {
    const userId = (req.query && (req.query.user_id || req.query.userId)) || 'dev-user';
    const list = devConversations.get(userId) || [];
    return res.json(list.slice(0, 50));
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'list failed' });
  }
});

app.listen(PORT, () => console.log(`Dev proxy listening on http://localhost:${PORT}`));
