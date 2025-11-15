// Note: avoid importing Angular libraries here to keep the server lightweight for local dev
import express from 'express';
// @ts-ignore - multer types may not be installed
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs';
// Load dotenv in development only and avoid overwriting an existing PORT
// that may be explicitly set when launching the process. We avoid a top-level
// unconditional import because some dev scripts set env vars before starting
// the process and we don't want dotenv to overwrite them.
try {
  if (!process.env['NODE_ENV'] || process.env['NODE_ENV'] === 'development') {
    // Require lazily so this file can still be imported as an ES module in other runtimes
    // without forcing dotenv to run.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = require('dotenv');
    dotenv.config({ override: false });
  }
} catch (e) {
  // ignore if dotenv isn't available in some runner environments
}
import { createClient } from '@supabase/supabase-js';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  // Resolve the browser distribution folder depending on how the server is run.
  // When running the built SSR bundle it usually lives at dist/terracare-angular/server,
  // and the browser assets are at dist/terracare-angular/browser. When running server.ts
  // directly during development the dist folder may not exist; check several locations.
  const candidates = [
    resolve(serverDistFolder, 'dist', 'terracare-angular', 'browser'), // common when running from project root after build
    resolve(serverDistFolder, 'dist', 'browser'), // alternative
    resolve(serverDistFolder, 'browser'), // older layout
    resolve(serverDistFolder, '..', 'browser'), // previous relative used
  ];
  let browserDistFolder = candidates.find(p => fs.existsSync(p)) || resolve(serverDistFolder, 'browser');
  const indexHtml = join(browserDistFolder, 'index.html');
  console.log('[server] Using browserDistFolder ->', browserDistFolder);

  // Note: For development we serve the static browser bundle and use
  // the Express routes for API. Full Angular SSR requires a built
  // server bundle (dist/*/server). Serving static index.html is
  // sufficient for local development and keeps the server TypeScript
  // runnable without an SSR build.

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Security headers
  server.use(helmet({
    contentSecurityPolicy: false, // Disable CSP by default (tune if you add strict CSP)
    crossOriginEmbedderPolicy: false,
  }));

  // Basic rate-limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // limit each IP
    standardHeaders: true,
    legacyHeaders: false,
  });
  server.use('/api/', apiLimiter);

  // Body parsers for API routes. Capture the raw body for better dev diagnostics
  // (the `verify` hook stores the raw payload to `req.rawBody` so we can log
  // it when parsing fails). Keep a reasonable limit to avoid excessive memory use.
  server.use(express.json({ limit: '5mb', verify: (req: any, _res, buf, encoding) => {
    try { req.rawBody = buf && buf.length ? buf.toString((encoding as any) || 'utf8') : ''; } catch (e) { req.rawBody = ''; }
  }}));
  server.use(express.urlencoded({ extended: true }));
  // Handle JSON parse errors from body-parser and return a friendly 400
  server.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
    if (err && err.type === 'entity.parse.failed') {
      console.warn('[server] JSON parse error:', err.message || err);
      // Log the raw body (first 1024 chars) to help diagnose PowerShell/curl quoting issues.
      try {
        const raw = (req as any).rawBody;
        if (raw && raw.length) {
          console.warn('[server] Raw request body (truncated 1024 chars):', raw.slice(0, 1024));
        }
      } catch (e) {}
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    return next(err);
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  // Tight CORS: allow only configured origins
  const isProd = process.env['NODE_ENV'] === 'production';
  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || (isProd ? '' : 'http://localhost:4200'))
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  server.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // --- Supabase server client (service role) ---
  const SUPABASE_URL = process.env['SUPABASE_URL'] ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const SUPABASE_ANON_FALLBACK = process.env['SUPABASE_ANON_KEY'] ?? '';

  const serverClient = (SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_FALLBACK))
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_FALLBACK)
    : null;

  // Disable server-side AI endpoints by default; set ENABLE_SERVER_AI=true in env to re-enable.
  const ENABLE_SERVER_AI = (process.env['ENABLE_SERVER_AI'] === 'true');

  // Minimal auth middleware: requires Bearer token and verifies it with Supabase
  async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      if (!serverClient) {
        return res.status(500).json({ error: 'Server missing Supabase configuration' });
      }
      const auth = req.headers['authorization'] || '';
      const token = Array.isArray(auth) ? auth[0] : auth;
      const match = token?.match(/^Bearer\s+(.+)$/i);
      const jwt = match?.[1];
      if (!jwt) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await serverClient.auth.getUser(jwt);
      if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
      // attach user for downstream handlers
      (res.locals as any).user = data.user;
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // In development, allow requests to proceed without a valid JWT so developers
  // can test AI endpoints locally without completing auth flows. In production
  // we still require a valid JWT.
  async function maybeRequireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (process.env['NODE_ENV'] === 'production') return requireAuth(req, res, next);
    try {
      // If a JWT is present, try to validate it; otherwise attach a dev user
      const auth = req.headers['authorization'] || '';
      const token = Array.isArray(auth) ? auth[0] : auth;
      const match = token?.match(/^Bearer\s+(.+)$/i);
      const jwt = match?.[1];
      if (jwt && serverClient) {
        const { data, error } = await serverClient.auth.getUser(jwt);
        if (!error && data?.user) {
          (res.locals as any).user = data.user;
          return next();
        }
      }
      // Dev fallback user (non-sensitive id). Persistence to DB will be skipped if serverClient is not configured.
      (res.locals as any).user = { id: 'dev-user' };
      return next();
    } catch (e) {
      // On any error, still allow in dev but log
      console.warn('maybeRequireAuth warning:', (e as any)?.message || e);
      (res.locals as any).user = { id: 'dev-user' };
      return next();
    }
  }

  // Health check
  server.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Dev-only: initialize storage bucket if missing (requires service role key)
  server.post('/api/storage/init', async (req, res) => {
    try {
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) return res.status(403).json({ error: 'Not allowed in production' });
      // Require admin token in dev to prevent arbitrary access
      const adminToken = process.env['ADMIN_TOKEN'] || '';
      if (adminToken) {
        const provided = (req.headers['x-admin-token'] as string | undefined) || '';
        if (provided !== adminToken) return res.status(403).json({ error: 'Forbidden' });
      }
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
      }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Try to get the bucket (allow specifying bucketId via body for flexibility)
  const bucketId = (req.body && typeof req.body.bucketId === 'string' && req.body.bucketId) || 'forum-attachments';
      const { data: bucket, error: getErr } = await (adminClient as any).storage.getBucket(bucketId);
      if (!bucket) {
        // Create the bucket as public with common mime types
        const { error: createErr } = await (adminClient as any).storage.createBucket(bucketId, {
          public: true,
          fileSizeLimit: '52428800', // 50MB
          allowedMimeTypes: ['image/*', 'video/*', 'text/plain']
        });
        if (createErr) return res.status(500).json({ error: createErr.message });
      }
      return res.json({ ok: true, bucket: bucketId });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'init failed' });
    }
  });

  // Dev-only: check if a storage bucket exists
  server.get('/api/storage/bucket/:id', async (req, res) => {
    try {
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) return res.status(403).json({ error: 'Not allowed in production' });
      const adminToken = process.env['ADMIN_TOKEN'] || '';
      if (adminToken) {
        const provided = (req.headers['x-admin-token'] as string | undefined) || '';
        if (provided !== adminToken) return res.status(403).json({ error: 'Forbidden' });
      }
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
      }
      const bucketId = req.params['id'];
      if (!bucketId) return res.status(400).json({ error: 'bucket id required' });
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: bucket } = await (adminClient as any).storage.getBucket(bucketId);
      return res.json({ exists: !!bucket, bucket: bucketId });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'check failed' });
    }
  });

  // Dev-only: expose server-side Supabase project URL for diagnostics (no secrets)
  server.get('/api/storage/info', (_req, res) => {
    const isProd = process.env['NODE_ENV'] === 'production';
    if (isProd) return res.status(403).json({ error: 'Not allowed in production' });
    return res.json({ supabaseUrl: SUPABASE_URL || null });
  });

  if (ENABLE_SERVER_AI) {
  // AI Chat proxy endpoint — forwards to Cerebras.ai from server-side to keep API key secret
  // Content filter helper (simple blocklist)
  const aiBlocklist = [/\b(seed\s+phrase|private\s+key|password|ssn|credit\s*card)\b/i];
  function checkContentSafety(messages: any[]): { ok: boolean; reason?: string } {
    for (const m of messages) {
      const text = String(m?.content || '');
      if (text.length > 5000) return { ok: false, reason: 'message too long' };
      for (const rx of aiBlocklist) {
        if (rx.test(text)) return { ok: false, reason: 'message contains disallowed content' };
      }
    }
    return { ok: true };
  }

  // Per-user rate limiter for AI endpoints (short window)
  const createAiLimiter = (windowMs = 60_000, max = 20) => rateLimit({
    windowMs,
    max,
    keyGenerator: (req: any) => {
      try { const uid = (req as any).userId || (req as any).headers['x-user-id'] || req.ip; return String(uid); } catch { return req.ip; }
    }
  });

  // POST: non-streaming chat (authenticated)
  server.post('/api/ai/chat', maybeRequireAuth, createAiLimiter(), async (req, res) => {
    try {
      const CEREBRAS_API_KEY = process.env['CEREBRAS_API_KEY'];
      if (!CEREBRAS_API_KEY) return res.status(500).json({ error: 'CEREBRAS_API_KEY not configured on server' });
      const payload = req.body || {};
      if (!Array.isArray(payload.messages)) return res.status(400).json({ error: 'messages array required' });
      const safe = checkContentSafety(payload.messages);
      if (!safe.ok) return res.status(400).json({ error: safe.reason });

      const apiUrl = 'https://api.cerebras.ai/v1/chat/completions';
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: payload.model || 'llama-3.3-70b',
          messages: payload.messages,
          max_tokens: payload.max_tokens ?? 2048,
          temperature: payload.temperature ?? 0.2,
          top_p: payload.top_p ?? 1,
          stream: false
        })
      });

      const data = await resp.json();

      // Save a copy of the conversation for the authenticated user (best-effort)
      try {
        const user = (res.locals as any).user;
        if (serverClient && user) {
          await serverClient.from('ai_conversations').insert([{ user_id: user.id, model: payload.model || 'llama-3.3-70b', messages: payload.messages }]);
        }
      } catch (e) { /* ignore persistence errors */ }

      return res.status(resp.status).json(data);
    } catch (e: any) {
      console.error('AI proxy error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'AI proxy failed' });
    }
  });

  // POST: streaming chat - proxy streaming response as SSE to client (authenticated)
  server.post('/api/ai/chat/stream', maybeRequireAuth, createAiLimiter(60_000, 10), async (req, res) => {
    try {
      const CEREBRAS_API_KEY = process.env['CEREBRAS_API_KEY'];
      if (!CEREBRAS_API_KEY) return res.status(500).json({ error: 'CEREBRAS_API_KEY not configured on server' });
      const payload = req.body || {};
      if (!Array.isArray(payload.messages)) return res.status(400).json({ error: 'messages array required' });
      const safe = checkContentSafety(payload.messages);
      if (!safe.ok) return res.status(400).json({ error: safe.reason });

      const apiUrl = 'https://api.cerebras.ai/v1/chat/completions';
      // Request streaming response from provider
      const providerResp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: payload.model || 'llama-3.3-70b',
          messages: payload.messages,
          max_tokens: payload.max_tokens ?? 2048,
          temperature: payload.temperature ?? 0.2,
          top_p: payload.top_p ?? 1,
          stream: true
        })
      });

      // If provider returned non-2xx, read the body and return a clear HTTP error
      if (!providerResp.ok) {
        const text = await providerResp.text();
        console.warn('[ai] provider non-2xx response', providerResp.status, text && text.slice ? text.slice(0, 200) : text);
        // Return a 502 Bad Gateway with provider status and body for clarity
        return res.status(502).json({ error: 'provider_error', status: providerResp.status, body: text });
      }

      // Setup SSE headers (provider responded ok and stream expected)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      if (!providerResp.body) {
        const text = await providerResp.text();
        res.write(`data: ${JSON.stringify({ error: 'no stream', body: text })}\n\n`);
        return res.end();
      }

      const reader = providerResp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      // Helper to send a single SSE data event containing the provided text (preserves newlines)
      function writeSseData(res: express.Response, text: string) {
        if (text == null) return;
        const cleaned = extractTextFromString(String(text));
        const single = String(cleaned).replace(/\r?\n+/g, ' ').trim();
        if (!single) return;
        // Emit a single SSE data event containing only the cleaned plain text
        try {
          res.write(`data: ${single}\n\n`);
        } catch (e) {
          // ignore write errors
        }
      }

      // Determine streaming mode: 'final' | 'buffered' | 'stream'
      // Allow control via query param ?mode=final|buffered|stream or header 'x-stream-mode'
  const requestedMode = ((req.query as any)['mode'] || req.headers['x-stream-mode'] || 'buffered') as string;
  const mode = String(requestedMode).toLowerCase();
      const BUFFER_MS = 100; // debounce window for buffered mode
      let buffer = '';
      let finalBuffer = '';
      let flushTimer: NodeJS.Timeout | null = null;
      function flushBuffer() {
        if (!buffer) return;
        writeSseData(res, buffer);
        buffer = '';
      }
      function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => { flushTimer = null; flushBuffer(); }, BUFFER_MS);
      }

      // Attempt to extract readable text from a potentially JSON-wrapped string
      function extractTextFromString(s: string): string {
        if (!s) return '';
        const trimmed = s.trim();
        // If the whole string is valid JSON, parse and extract
        try {
          const obj = JSON.parse(trimmed);
          const parts = [] as string[];
          function collect(obj2: any) {
            if (!obj2) return;
            if (typeof obj2 === 'string') { parts.push(obj2); return; }
            if (typeof obj2 === 'number' || typeof obj2 === 'boolean') { parts.push(String(obj2)); return; }
            if (Array.isArray(obj2)) { for (const it of obj2) collect(it); return; }
            if (typeof obj2 === 'object') {
              if (typeof obj2.delta === 'string') parts.push(obj2.delta);
              if (typeof obj2.content === 'string') parts.push(obj2.content);
              if (typeof obj2.text === 'string') parts.push(obj2.text);
              if (Array.isArray(obj2.choices)) { for (const ch of obj2.choices) { collect(ch?.delta); collect(ch?.message); } }
              for (const k of Object.keys(obj2)) { try { collect(obj2[k]); } catch {} }
            }
          }
          collect(obj);
          if (parts.length) return parts.join('');
        } catch (e) {
          // ignore
        }
  // If not parseable as JSON, attempt to find JSON substrings and extract
        const jsonMatches = String(s).match(/\{[^}]*\}/g) || [];
        const parts: string[] = [];
        for (const m of jsonMatches) {
          try {
            const obj = JSON.parse(m);
            if (typeof obj.delta === 'string') parts.push(obj.delta);
            else if (typeof obj.content === 'string') parts.push(obj.content);
            else if (typeof obj.text === 'string') parts.push(obj.text);
            else if (Array.isArray(obj.choices)) {
              for (const ch of obj.choices) {
                if (ch?.delta) { if (typeof ch.delta === 'string') parts.push(ch.delta); else parts.push(JSON.stringify(ch.delta)); }
                if (ch?.message && typeof ch.message.content === 'string') parts.push(ch.message.content);
              }
            }
          } catch (e) {
            // not json - skip
          }
        }
        if (parts.length) return parts.join('');
        // fallback: aggressively strip JSON-looking metadata and known provider fields
        let out = String(s);
        // remove explicit JSON blocks
        out = out.replace(/\{[^}]*\}/g, ' ');
        // remove quoted key:value pairs like "object":"..." or "system_fingerprint":"fp_..."
        out = out.replace(/"[^"]+"\s*:\s*"[^"]*"/g, ' ');
        // remove numeric or object fields like usage: { ... } already removed above but try to remove leftover labels
        out = out.replace(/\b(object|usage|time_info|system_fingerprint|id|created|completion_tokens|prompt_tokens|total_tokens)\b/gi, ' ');
        // remove fingerprint tokens like fp_96d06d87d0ffbc02e8e8
        out = out.replace(/\bfp_[A-Za-z0-9_\-]+\b/g, ' ');
        // remove sequences like event: done or data: {}
        out = out.replace(/event:\s*done/gi, ' ');
        out = out.replace(/data:\s*\{\s*\}/gi, ' ');
        // collapse punctuation glitches and excess commas/braces
        out = out.replace(/[{},\[\]]+/g, ' ');
        // collapse whitespace
        out = out.replace(/\s{2,}/g, ' ').trim();
        return out;
      }
      // Helper: try to parse a provider chunk and extract text deltas
      function extractTextDeltasFromChunk(raw: string): string[] {
        const out: string[] = [];
        // First try simple newline-separated SSE/data frames
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/i);
          const jsonPart = m ? m[1] : line;
          // Try to parse as JSON
          try {
            const obj = JSON.parse(jsonPart);
            // If this parsed object looks like a provider metadata/frame object (no textual fields)
            // skip it. Provider streaming shapes often include object:"chat.completion.chunk" and
            // other metadata we don't want to forward verbatim to the client as text.
            const looksLikeMeta = obj && typeof obj === 'object' && (obj.object === 'chat.completion.chunk' || obj.hasOwnProperty('id')) && !objHasText(obj);
            if (looksLikeMeta) continue;
            // Common provider streaming shape: { choices: [ { delta: { content: '...' } }, ... ] }
            if (Array.isArray(obj?.choices)) {
              for (const ch of obj.choices) {
                const delta = ch?.delta;
                if (typeof delta === 'string') {
                  // delta may be a JSON-serialized string containing nested provider frames; try to parse inner JSON
                  const inner = tryParseNested(delta);
                  if (inner !== null) {
                    out.push(...extractTextDeltasFromChunk(JSON.stringify(inner)));
                  } else {
                    out.push(delta);
                  }
                } else if (delta && typeof delta === 'object') {
                  if (typeof delta.content === 'string') out.push(delta.content);
                  else if (typeof delta.text === 'string') out.push(delta.text);
                }
                if (ch?.message && typeof ch.message?.content === 'string') out.push(ch.message.content);
              }
              continue;
            }
            if (obj && typeof obj.delta === 'string') {
              const inner = tryParseNested(obj.delta);
              if (inner !== null) { out.push(...extractTextDeltasFromChunk(JSON.stringify(inner))); }
              else { out.push(obj.delta); }
              continue;
            }
            if (typeof obj?.content === 'string') {
              const inner = tryParseNested(obj.content);
              if (inner !== null) { out.push(...extractTextDeltasFromChunk(JSON.stringify(inner))); }
              else { out.push(obj.content); }
              continue;
            }
          } catch (e) {
            // not JSON - fall through to more aggressive splitting below
          }

          // If this line couldn't be parsed as JSON, try splitting on 'data:' tokens to handle
          // concatenated frames like '{...} data: {...}' that don't contain newlines.
          const parts = line.split(/\bdata:\s*/i).map(p => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            for (const p of parts) {
              try {
                const obj = JSON.parse(p);
                // If choices/delta/content are serialized JSON strings, normalize them
                // Skip provider metadata-only frames
                const looksLikeMeta = obj && typeof obj === 'object' && (obj.object === 'chat.completion.chunk' || obj.hasOwnProperty('id')) && !objHasText(obj);
                if (looksLikeMeta) continue;
                // extract as above
                if (Array.isArray(obj?.choices)) {
                  for (const ch of obj.choices) {
                    const delta = ch?.delta;
                    if (typeof delta === 'string') {
                      const inner = tryParseNested(delta);
                      if (inner !== null) out.push(...extractTextDeltasFromChunk(JSON.stringify(inner)));
                      else out.push(delta);
                    } else if (delta && typeof delta === 'object') {
                      if (typeof delta.content === 'string') out.push(delta.content);
                      else if (typeof delta.text === 'string') out.push(delta.text);
                    }
                    if (ch?.message && typeof ch.message?.content === 'string') out.push(ch.message.content);
                  }
                  continue;
                }
                if (obj && typeof obj.delta === 'string') {
                  const inner = tryParseNested(obj.delta);
                  if (inner !== null) { out.push(...extractTextDeltasFromChunk(JSON.stringify(inner))); }
                  else { out.push(obj.delta); }
                  continue;
                }
                if (typeof obj?.content === 'string') {
                  const inner = tryParseNested(obj.content);
                  if (inner !== null) { out.push(...extractTextDeltasFromChunk(JSON.stringify(inner))); }
                  else { out.push(obj.content); }
                  continue;
                }
              } catch (e) {
                // ignore
              }
            }
            // after attempting parts, skip adding raw line
            continue;
          }

          // fallback: push the raw line
          // If the raw line looks like a JSON metadata blob (starts with { and contains id/object), skip it
          if (/^\s*\{/.test(jsonPart) && /"id"|"object"|"system_fingerprint"/.test(jsonPart)) {
            // try to parse and extract text; if none found, skip
            try {
              const obj = JSON.parse(jsonPart);
              // attempt to extract textual fields
              if (Array.isArray(obj?.choices)) {
                for (const ch of obj.choices) {
                  const delta = ch?.delta;
                  if (typeof delta === 'string') out.push(delta);
                  else if (delta && typeof delta === 'object') {
                    if (typeof delta.content === 'string') out.push(delta.content);
                    else if (typeof delta.text === 'string') out.push(delta.text);
                  }
                  if (ch?.message && typeof ch.message?.content === 'string') out.push(ch.message.content);
                }
              }
            } catch (e) {
              // ignore parse errors and skip
            }
            continue;
          }
          out.push(jsonPart);
        }
        return out;
      }

      // Try to parse a string that may itself be JSON-serialized. Returns parsed object or null.
      function tryParseNested(s: string): any | null {
        if (!s || typeof s !== 'string') return null;
        const trimmed = s.trim();
        // Quick heuristic: if it contains JSON-like keys such as "id" or "choices" then try parse
        if (!/^\{/.test(trimmed) && !/\"id\"/.test(trimmed) && !/\"choices\"/.test(trimmed)) return null;
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          // may be double-encoded (e.g., "{\"id\":...}"), try unescaping
          try {
            const unescaped = trimmed.replace(/\\"/g, '"');
            return JSON.parse(unescaped);
          } catch (e2) {
            return null;
          }
        }
      }

      // Helper: determine if a parsed provider object contains any obvious textual fields
      function objHasText(obj: any): boolean {
        if (!obj) return false;
        if (typeof obj === 'string') return true;
        if (typeof obj?.content === 'string' && obj.content.trim().length) return true;
        if (typeof obj?.text === 'string' && obj.text.trim().length) return true;
        if (Array.isArray(obj?.choices)) {
          for (const ch of obj.choices) {
            if (typeof ch?.delta === 'string' && ch.delta.trim().length) return true;
            if (typeof ch?.message?.content === 'string' && ch.message.content.trim().length) return true;
            if (objHasText(ch?.delta) || objHasText(ch?.message)) return true;
          }
        }
        return false;
      }

      while (!done) {
        const { value, done: rdone } = await reader.read();
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const deltas = extractTextDeltasFromChunk(chunk);
          if (deltas.length) {
            // Map any JSON-wrapped delta strings like '{"delta":"Hello"}' to their inner text
            const mapped = deltas.map(d => {
              if (!d || typeof d !== 'string') return String(d || '');
              const s = d.trim();
              if (/^\{/.test(s)) {
                try {
                  const obj = JSON.parse(s);
                  if (typeof obj.delta === 'string') return obj.delta;
                  if (typeof obj.content === 'string') return obj.content;
                  if (typeof obj.text === 'string') return obj.text;
                } catch (e) {
                  // ignore parse errors and fallthrough to return original string
                }
              }
              return d;
            });
            // Coalesce into single text piece
            const text = mapped.join('');
            if (mode === 'stream') {
              // immediate streaming: send as soon as we have text
              writeSseData(res, text);
            } else if (mode === 'buffered') {
              // buffered streaming: aggregate and flush on debounce
              buffer += text;
              scheduleFlush();
            } else if (mode === 'final') {
              // final mode: accumulate and send only at end
              finalBuffer += text;
            } else {
              // default fallback to buffered
              buffer += text;
              scheduleFlush();
            }
          }
        }
        done = rdone;
      }

      // Flush any remaining buffered text before ending the stream
      try {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (mode === 'buffered') flushBuffer();
        if (mode === 'final' && finalBuffer) writeSseData(res, finalBuffer);
      } catch (e) {}

      // End of stream
      res.write('event: done\ndata: {}\n\n');
      return res.end();
    } catch (e: any) {
      console.error('AI stream proxy error', e?.message || e);
      try { res.write(`data: ${JSON.stringify({ error: e?.message || 'stream failed' })}\n\n`); } catch {}
      return res.end();
    }
  });

  }

  // Conversation history endpoints (authenticated)
  // In-memory fallback store for local development when Supabase isn't configured
  const devConversationsStore = new Map<string, Array<any>>();

  server.post('/api/ai/conversations', maybeRequireAuth, async (req, res) => {
    try {
      console.log('[api] POST /api/ai/conversations - user=', (res.locals as any).user?.id, 'serverClient=', !!serverClient);
      const user = (res.locals as any).user;
      const payload = req.body || {};
      if (!Array.isArray(payload.messages)) return res.status(400).json({ error: 'messages array required' });
      // If Supabase server client is not available, use a local in-memory fallback so
      // developers can still save and retrieve conversations during local testing.
      if (!serverClient) {
        const list = devConversationsStore.get(user.id) || [];
        const row = { id: `dev-${Date.now()}`, user_id: user.id, model: payload.model || 'llama-3.3-70b', messages: payload.messages, created_at: new Date().toISOString() };
        list.unshift(row);
        devConversationsStore.set(user.id, list.slice(0, 200));
        console.log('[api] Saved conversation to dev store for user=', user.id);
        return res.status(201).json(row);
      }
      try {
        const { data, error } = await serverClient.from('ai_conversations').insert([{ user_id: user.id, model: payload.model || 'llama-3.3-70b', messages: payload.messages }]).select('*').single();
        if (error) {
          console.error('[api] Supabase insert error:', error);
          // If persistence failed, fall back to in-memory store when not in production so dev flow continues.
          if (process.env['NODE_ENV'] !== 'production') {
            const list = devConversationsStore.get(user.id) || [];
            const row = { id: `dev-${Date.now()}`, user_id: user.id, model: payload.model || 'llama-3.3-70b', messages: payload.messages, created_at: new Date().toISOString(), warning: error.message };
            list.unshift(row);
            devConversationsStore.set(user.id, list.slice(0, 200));
            console.log('[api] Persist failed; saved to dev store for user=', user.id);
            return res.status(201).json(row);
          }
          return res.status(500).json({ error: error.message });
        }
        console.log('[api] Persisted conversation for user=', user.id, 'id=', (data as any)?.id);
        return res.status(201).json(data);
      } catch (e: any) {
        console.error('[api] Exception while persisting conversation:', e?.message || e);
        if (process.env['NODE_ENV'] !== 'production') {
          const list = devConversationsStore.get(user.id) || [];
          const row = { id: `dev-${Date.now()}`, user_id: user.id, model: payload.model || 'llama-3.3-70b', messages: payload.messages, created_at: new Date().toISOString(), warning: e?.message || 'exception' };
          list.unshift(row);
          devConversationsStore.set(user.id, list.slice(0, 200));
          console.log('[api] Exception persisted to dev store for user=', user.id);
          return res.status(201).json(row);
        }
        return res.status(500).json({ error: e?.message || 'persist exception' });
      }
    } catch (e: any) {
      console.error('[api] POST /api/ai/conversations error:', e?.message || e);
      return res.status(500).json({ error: e?.message || 'save failed' });
    }
  });

  server.get('/api/ai/conversations', maybeRequireAuth, async (req, res) => {
    try {
      console.log('[api] GET /api/ai/conversations - user=', (res.locals as any).user?.id, 'serverClient=', !!serverClient);
      const user = (res.locals as any).user;
      if (!serverClient) {
        // Return in-memory stored conversations for the dev user
        const list = devConversationsStore.get(user.id) || [];
        console.log('[api] Returning', list.length, 'dev conversations for user=', user.id);
        return res.json(list.slice(0, 50));
      }
      const { data, error } = await serverClient.from('ai_conversations').select('id, model, messages, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'list failed' });
    }
  });

  // Knowledge API - GET all items
  server.get('/api/knowledge', async (_req, res) => {
    try {
      if (!serverClient) {
        return res.status(500).json({ error: 'Server not configured for Supabase. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
      }
      const { data, error } = await serverClient
        .from('knowledge')
        .select('title, description, category')
        .order('title', { ascending: true });

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Unexpected server error' });
    }
  });

  // Public challenges endpoint - returns public challenges for landing/browse
  server.get('/api/challenges', async (_req, res) => {
    try {
      if (!serverClient) {
        // Dev fallback: return a few sample challenges so UI and chatbot can function locally
        const sample = [
          { id: 'demo-plant', title: 'Plant 5 Native Trees', description: 'Plant five native trees in your area and upload photos as proof.' },
          { id: 'demo-zero-waste', title: 'Zero‑Waste Week', description: 'Track your waste for a full week and share tips you used to reduce it.' },
          { id: 'demo-cleanup', title: 'Community Cleanup', description: 'Join a local cleanup event and upload a group photo.' },
        ];
        return res.json(sample);
      }

      const { data, error } = await serverClient
        .from('challenges')
        .select('id, title, description, visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed to load challenges' });
    }
  });

  // Authenticated: return this user's joined/active challenges and progress (dev-friendly)
  server.get('/api/ai/my-challenges', maybeRequireAuth, async (req, res) => {
    try {
      const user = (res.locals as any).user;
      // If Supabase not configured, return a small dev sample tied to the dev user
      if (!serverClient) {
        const sampleActive = [
          { id: 'demo-plant', title: 'Plant 5 Native Trees', joined_at: new Date().toISOString(), progress: 40, tasks: [ { id: 't1', done: true, text: 'Select species' }, { id: 't2', done: false, text: 'Plant trees' } ] },
        ];
        return res.json(sampleActive);
      }

      // Try to read challenge participants or user_challenges table for this user
      const { data, error } = await serverClient
        .from('challenge_participants')
        .select('challenge_id, joined_at, progress, tasks')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false });

      if (error) {
        // fallback: attempt user_challenges
        const { data: alt, error: altErr } = await serverClient.from('user_challenges').select('challenge_id, joined_at, progress, tasks').eq('user_id', user.id).order('joined_at', { ascending: false });
        if (altErr) return res.status(500).json({ error: altErr.message || 'could not load joined challenges' });
        return res.json(alt || []);
      }

      return res.json(data || []);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed to load my challenges' });
    }
  });

  // Knowledge API - POST create item
  server.post('/api/knowledge', requireAuth, async (req, res) => {
    try {
      if (!serverClient) {
        return res.status(500).json({ error: 'Server not configured for Supabase. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
      }
      const { title, description, category } = req.body || {};
      if (!title || !description) {
        return res.status(400).json({ error: 'title and description are required' });
      }
      const { data, error } = await serverClient
        .from('knowledge')
        .insert([{ title, description, category: category ?? null }])
        .select('title, description, category')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Unexpected server error' });
    }
  });

  // Challenges API - mark challenge completed (server-side insert, verifies JWT)
  server.post('/api/challenges/complete', requireAuth, async (req, res) => {
    try {
      if (!serverClient) {
        return res.status(500).json({ error: 'Server not configured for Supabase. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
      }
      // If the server client is not using the service role key, the insert may still be blocked by RLS.
      // Provide a clearer message so the frontend can guide setup.
      const usingServiceRole = !!SUPABASE_SERVICE_ROLE_KEY;
      const user = (res.locals as any).user;
      const { challenge_id, points, proof_url, filename, file_type } = req.body || {};
      if (!challenge_id) return res.status(400).json({ error: 'challenge_id required' });

      // Determine points: prefer provided, else read base_points from challenge, else default 10
      let pts = Number(points);
      if (!Number.isFinite(pts)) {
        const { data: ch } = await serverClient.from('challenges').select('base_points').eq('id', challenge_id).maybeSingle();
        if (ch && typeof (ch as any).base_points === 'number') pts = Number((ch as any).base_points);
        else pts = 10;
      }
      pts = Math.max(1, Math.min(100, Math.round(pts)));

      const historyRow = {
        challenge_id,
        user_id: user.id,
        action: 'completed',
        points: pts,
        details: { proof_url: proof_url || null, filename: filename || null, type: file_type || null },
        occurred_at: new Date().toISOString(),
      } as any;

      // Idempotency: if already completed, treat as success
      const { data: existing, error: existingErr } = await serverClient
        .from('challenge_history')
        .select('id')
        .eq('challenge_id', challenge_id)
        .eq('user_id', user.id)
        .eq('action', 'completed')
        .limit(1);
      if (!existingErr && Array.isArray(existing) && existing.length) {
        // ensure participant progress is maxed
        try { await serverClient.from('challenge_participants').update({ progress: 100 }).eq('user_id', user.id).eq('challenge_id', challenge_id); } catch {}
        // recalc score just in case
        try { await (serverClient as any).rpc('fn_recalc_user_score', { target_user: user.id }); } catch {}
        return res.status(200).json({ ok: true, alreadyCompleted: true });
      }

      const { error: histErr } = await serverClient.from('challenge_history').insert(historyRow);
      if (histErr) {
        const code = (histErr as any).code || '';
        const msg = (histErr.message || '').toLowerCase();
        const dup = code === '23505' || msg.includes('duplicate') || msg.includes('unique');
        if (dup) {
          try { await (serverClient as any).rpc('fn_recalc_user_score', { target_user: user.id }); } catch {}
          return res.status(200).json({ ok: true, alreadyCompleted: true });
        }
        const rls = msg.includes('rls') || msg.includes('permission') || msg.includes('denied') || msg.includes('forbidden') || msg.includes('policy');
        if (rls && !usingServiceRole) {
          return res.status(501).json({ error: 'RLS blocked and server not using service role. Set SUPABASE_SERVICE_ROLE_KEY on the server.' });
        }
        return res.status(500).json({ error: histErr.message });
      }

      // Best-effort: set participant progress to 100
      try { await serverClient.from('challenge_participants').update({ progress: 100 }).eq('user_id', user.id).eq('challenge_id', challenge_id); } catch {}

      // Recalculate score after new history row
      try { await (serverClient as any).rpc('fn_recalc_user_score', { target_user: user.id }); } catch {}
      return res.status(201).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Unexpected server error' });
    }
  });

  // Proofs API - server-side upload using service role; returns public URL
  server.post('/api/proofs/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!serverClient || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(501).json({ error: 'Server not using service role. Set SUPABASE_SERVICE_ROLE_KEY.' });
      }
      const user = (res.locals as any).user;
      const challengeId = String((req.body?.challengeId ?? '')).trim();
      if (!challengeId) return res.status(400).json({ error: 'challengeId required' });
  const file = (req as any).file as any;
      if (!file) return res.status(400).json({ error: 'file required' });

      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      const safeName = (file.originalname || 'proof').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `proofs/${user.id}/${challengeId}/${Date.now()}-${safeName}`;
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // Ensure bucket exists (best-effort)
      try { await (adminClient as any).storage.createBucket('challenge-proofs', { public: true }); } catch {}
      const { error: upErr } = await (adminClient as any).storage
        .from('challenge-proofs')
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      if (upErr) return res.status(500).json({ error: upErr.message });
      const { data } = (adminClient as any).storage.from('challenge-proofs').getPublicUrl(path);
      const kind = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('video/') ? 'video' : 'file';
      return res.status(201).json({ url: data.publicUrl, path, type: kind });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'upload failed' });
    }
  });

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // Serve static SPA index for all non-API routes in development.
  server.get('*', (req, res) => {
    try {
      const indexPath = join(browserDistFolder, 'index.html');
      return res.sendFile(indexPath);
    } catch (err: any) {
      console.error('Failed to serve index.html', err?.message || err);
      return res.status(500).send('<!doctype html><html><body><h1>Server error</h1><p>Unable to render the application.</p></body></html>');
    }
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
