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

  // Admin: register user + create profile using service role (requires SUPABASE_SERVICE_ROLE_KEY)
  // Body: { email, password, full_name?, phone?, address? }
  server.post('/api/auth/register', async (req, res) => {
    try {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(501).json({ error: 'Server not configured with SUPABASE_SERVICE_ROLE_KEY' });
      }
      // If ADMIN_TOKEN is configured, require it to prevent abuse
      const adminToken = process.env['ADMIN_TOKEN'] || '';
      if (adminToken) {
        const provided = (req.headers['x-admin-token'] as string | undefined) || '';
        if (provided !== adminToken) return res.status(403).json({ error: 'Forbidden' });
      }

      const payload = req.body || {};
      const email = String(payload.email || '').trim();
      const password = String(payload.password || '').trim();
      const full_name = payload.full_name || payload.fullName || null;
      const phone = payload.phone || null;
      const address = payload.address || null;
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });

      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Before creating, check whether name is already taken (users metadata/display_name or profiles)
      async function checkNameTaken(name: string) {
        try {
          // check user_metadata.full_name
          try {
            const { data: udata, error: uerr } = await adminClient.from('users').select('id, user_metadata').ilike("user_metadata->>full_name", name).limit(1);
            if (!uerr && Array.isArray(udata) && udata.length) return true;
          } catch (e) {}
          // check user_metadata.display_name
          try {
            const { data: udata2, error: uerr2 } = await adminClient.from('users').select('id, user_metadata').ilike("user_metadata->>display_name", name).limit(1);
            if (!uerr2 && Array.isArray(udata2) && udata2.length) return true;
          } catch (e) {}
          // check top-level display_name
          try {
            const { data: udata3, error: uerr3 } = await adminClient.from('users').select('id, display_name').ilike('display_name', name).limit(1);
            if (!uerr3 && Array.isArray(udata3) && udata3.length) return true;
          } catch (e) {}
          // check profiles
          try {
            const { data: pdata, error: perr } = await adminClient.from('profiles').select('id, full_name').ilike('full_name', name).limit(1);
            if (!perr && Array.isArray(pdata) && pdata.length) return true;
          } catch (e) {}
        } catch (e) {}
        return false;
      }

      // If a display/full name was provided, block duplicate usage early
      const candidateName = (full_name || '').toString().trim();
      if (candidateName) {
        const taken = await checkNameTaken(candidateName);
        if (taken) return res.status(409).json({ error: 'display_name_taken' });
      }

      // Create user via admin API
      let createdUser: any = null;
      try {
        // supabase-js v1/v2 admin method variance — tolerate either shape
        const createResp: any = await (adminClient as any).auth?.admin?.createUser
          ? await (adminClient as any).auth.admin.createUser({ email, password, user_metadata: { full_name, phone, address } })
          : await (adminClient as any).auth.createUser({ email, password, user_metadata: { full_name, phone, address } });
        createdUser = createResp?.data || createResp?.user || createResp;
        // normalize
        if (createdUser && createdUser.user) createdUser = createdUser.user;
      } catch (e: any) {
        // attempt fallback to direct SQL insert into auth.users via RPC is not implemented here
        console.error('[admin register] create user error', e?.message || e);
        return res.status(500).json({ error: e?.message || 'failed to create user' });
      }

      if (!createdUser || !createdUser.id) return res.status(500).json({ error: 'user creation returned no id' });

      // Insert canonical profiles row (best-effort)
      try {
        const profilePayload: any = { id: createdUser.id, user_id: createdUser.id, full_name: full_name ?? null, phone: phone ?? null, address: address ?? null };
        // Try broad insert; ignore errors if column mismatch
        const { error: profErr } = await adminClient.from('profiles').insert([profilePayload]);
        if (profErr) {
          console.warn('[admin register] profile insert warning:', profErr.message || profErr);
        }
      } catch (e: any) {
        console.warn('[admin register] profile insert exception:', e?.message || e);
      }

      // Return created user id (do not return secrets)
      return res.status(201).json({ ok: true, id: createdUser.id });
    } catch (e: any) {
      console.error('[api] /api/auth/register error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'register failed' });
    }
  });

  // Public (but server-protected) endpoint: check whether a full name is already taken
  // Query both auth users' metadata and profiles table using the service role key for reliability.
  // Usage: GET /api/auth/check-name?name=Full%20Name
  server.get('/api/auth/check-name', async (req, res) => {
    try {
      const name = String((req.query['name'] || '')).trim();
      if (!name) return res.status(400).json({ error: 'name query param required' });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(501).json({ error: 'Server not configured with SUPABASE_SERVICE_ROLE_KEY' });
      }
      // If ADMIN_TOKEN is configured, require it to prevent abuse
      const adminToken = process.env['ADMIN_TOKEN'] || '';
      if (adminToken) {
        const provided = (req.headers['x-admin-token'] as string | undefined) || '';
        if (provided !== adminToken) return res.status(403).json({ error: 'Forbidden' });
      }

      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // 1) Check auth users metadata for matching full_name (case-insensitive)
      try {
        // 1) Check user_metadata->>full_name
        try {
          const { data: udata, error: uerr } = await (adminClient as any).from('users').select('id, user_metadata').ilike("user_metadata->>full_name", name).limit(1);
          if (!uerr && Array.isArray(udata) && udata.length) {
            return res.json({ taken: true, source: 'users', field: 'user_metadata.full_name' });
          }
        } catch (e) { /* ignore */ }

        // 2) Check user_metadata->>display_name
        try {
          const { data: udata2, error: uerr2 } = await (adminClient as any).from('users').select('id, user_metadata').ilike("user_metadata->>display_name", name).limit(1);
          if (!uerr2 && Array.isArray(udata2) && udata2.length) {
            return res.json({ taken: true, source: 'users', field: 'user_metadata.display_name' });
          }
        } catch (e) { /* ignore */ }

        // 3) Check a top-level display_name column if present
        try {
          const { data: udata3, error: uerr3 } = await (adminClient as any).from('users').select('id, display_name').ilike('display_name', name).limit(1);
          if (!uerr3 && Array.isArray(udata3) && udata3.length) {
            return res.json({ taken: true, source: 'users', field: 'display_name' });
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        // ignore and continue to profiles
      }

      // 2) Check profiles table
      try {
        const { data: pdata, error: perr } = await (adminClient as any).from('profiles').select('id, full_name').ilike('full_name', name).limit(1);
        if (!perr && Array.isArray(pdata) && pdata.length) {
          return res.json({ taken: true, source: 'profiles' });
        }
      } catch (e) {
        // ignore
      }

      return res.json({ taken: false });
    } catch (e: any) {
      console.error('[api] /api/auth/check-name error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'check failed' });
    }
  });

  // Dev-only: expose server-side Supabase project URL for diagnostics (no secrets)
  server.get('/api/storage/info', (_req, res) => {
    const isProd = process.env['NODE_ENV'] === 'production';
    if (isProd) return res.status(403).json({ error: 'Not allowed in production' });
    return res.json({ supabaseUrl: SUPABASE_URL || null });
  });

  // Dev-only: Supabase status and quick check for the `incidents` table
  server.get('/api/supabase/status', async (_req, res) => {
    const isProd = process.env['NODE_ENV'] === 'production';
    if (isProd) return res.status(403).json({ error: 'Not allowed in production' });
    try {
      const usingServiceRole = !!SUPABASE_SERVICE_ROLE_KEY;
      const usingAnonKey = !!SUPABASE_ANON_FALLBACK;
      const serverClientConfigured = !!serverClient;
      let incidentsTableExists: boolean | null = null;
      let incidentsCheckError: string | null = null;
      if (serverClient) {
        try {
          const { error } = await serverClient.from('incidents').select('id', { head: true, count: 'exact' });
          if (error) {
            incidentsTableExists = false;
            incidentsCheckError = error.message || JSON.stringify(error);
          } else {
            incidentsTableExists = true;
          }
        } catch (e: any) {
          incidentsTableExists = false;
          incidentsCheckError = e?.message || String(e);
        }
      }
      return res.json({ supabaseUrl: SUPABASE_URL || null, usingServiceRole, usingAnonKey, serverClientConfigured, incidentsTableExists, incidentsCheckError });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'status check failed' });
    }
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

  // In-memory incidents store for local development when Supabase isn't configured
  const devIncidentsStore: Array<any> = [];

  // Incidents API - public GET and POST. POST uses maybeRequireAuth so dev users can submit without JWT.
  server.get('/api/incidents', async (req, res) => {
    try {
      if (!serverClient) {
        // Return in-memory incidents (most recent first)
        return res.json(devIncidentsStore.slice(0, 200));
      }
      const { data, error } = await serverClient.from('incidents').select('id, type, title, description, location_text, image_url, lat, lng, created_at, user_id').order('created_at', { ascending: false }).limit(500);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed to load incidents' });
    }
  });

  server.post('/api/incidents', maybeRequireAuth, upload.single('image'), async (req, res) => {
    try {
      const payload = req.body || {};
      const type = String(payload.type || '').trim();
      const title = String(payload.title || '').trim();
      const description = String(payload.description || '').trim();
      const location_text = payload.location_text ? String(payload.location_text).trim() : (payload.location ? String(payload.location).trim() : '');
      // lat/lng are optional now; keep them if present but don't require them
      const lat = payload.lat !== undefined ? (Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null) : null;
      const lng = payload.lng !== undefined ? (Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null) : null;

      if (!type || !title || !description) return res.status(400).json({ error: 'type, title and description are required' });
      if (!location_text) return res.status(400).json({ error: 'location_text (human-readable) is required' });

      const user = (res.locals as any).user;
      // Build insert row but avoid sending explicit created_at and avoid including null lat/lng
      // When running in dev fallback, `maybeRequireAuth` attaches a fake dev user id; do not persist that to DB
      const safeUserId = (user && typeof user.id === 'string' && user.id !== 'dev-user') ? user.id : null;
      // If an image file was uploaded, attempt to persist it to Supabase Storage
      let image_url: string | null = null;
      try {
        const file = (req as any).file as any;
        if (file) {
          // Only attempt server-side upload when a service role key is available
          if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL) {
            const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const bucketId = 'incidents-attachments';
            // Ensure bucket exists (best-effort)
            try { await (adminClient as any).storage.createBucket(bucketId, { public: true }); } catch (e) {}
            const safeName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `incidents/${safeUserId || 'anon'}/${Date.now()}-${safeName}`;
            const { error: upErr } = await (adminClient as any).storage.from(bucketId).upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
            if (!upErr) {
              const { data } = (adminClient as any).storage.from(bucketId).getPublicUrl(path);
              image_url = data?.publicUrl || null;
            } else {
              console.warn('[api] incident image upload error', upErr.message || upErr);
            }
          } else {
            // Supabase not configured for server-side uploads — skip storing file
            console.warn('[api] skipping incident image upload: SUPABASE_SERVICE_ROLE_KEY not set');
          }
        }
      } catch (e) {
        console.warn('[api] incident image handling failed', (e as any)?.message || e);
      }

      const row: any = { type, title, description, location_text, user_id: safeUserId };
      if (image_url) row.image_url = image_url;
      if (lat !== null) row.lat = lat;
      if (lng !== null) row.lng = lng;

      // If Supabase client not configured, save to dev store
      if (!serverClient) {
        row.id = `dev-${Date.now()}`;
        devIncidentsStore.unshift(row);
        return res.status(201).json(row);
      }

      try {
        const { data, error } = await serverClient.from('incidents').insert([row]).select('*').single();
        if (error) {
          // If persistence fails, log full error for diagnostics
          console.error('[api] /api/incidents insert error', error);
          const msg = (error && (error.message || error.details || JSON.stringify(error))) || 'insert_failed';
          // If in development, fallback to in-memory store so UI continues to work
          if (process.env['NODE_ENV'] !== 'production') {
            row.id = `dev-${Date.now()}`;
            devIncidentsStore.unshift(row);
            return res.status(201).json({ warning: msg, ...row });
          }
          // For production, return a helpful error (400 for constraint violations, else 500)
          const lower = String(msg).toLowerCase();
          if (lower.includes('null value in column') || lower.includes('not null')) return res.status(400).json({ error: msg });
          return res.status(500).json({ error: msg });
        }
        return res.status(201).json(data);
      } catch (e: any) {
        console.error('[api] /api/incidents exception', e?.message || e);
        if (process.env['NODE_ENV'] !== 'production') {
          row.id = `dev-${Date.now()}`;
          devIncidentsStore.unshift(row);
          return res.status(201).json({ warning: e?.message || 'exception', ...row });
        }
        return res.status(500).json({ error: e?.message || 'failed to persist incident' });
      }
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed to submit incident' });
    }
  });

  // Delete an incident by id (requires auth or allowed by RLS). Accepts optional { reason }
  server.delete('/api/incidents/:id', maybeRequireAuth, async (req, res) => {
    try {
      let id = String(req.params['id'] || '').trim();
      // allow id in body as fallback (some clients may send body with DELETE)
      try {
        if (!id && req.body && typeof req.body.id === 'string') id = String(req.body.id).trim();
      } catch (e) {}
      console.log('[api] DELETE /api/incidents id=', id);
      if (!id) return res.status(400).json({ error: 'id required' });
      // First: attempt to remove from in-memory dev store (handles dev-* ids created during local-only runs)
      const idxDev = devIncidentsStore.findIndex((r: any) => String(r.id) === id);
      if (idxDev >= 0) {
        const removed = devIncidentsStore.splice(idxDev, 1)[0];
        console.log('[api] deleted dev incident id=', removed.id, '(serverClient=', !!serverClient, ')');
        return res.json({ ok: true, removed, note: 'deleted_from_dev_store' });
      }

      // If Supabase not configured, remove from in-memory dev store (no DB)
      if (!serverClient) {
        const idx = devIncidentsStore.findIndex((r: any) => String(r.id) === id);
        if (idx >= 0) {
          const removed = devIncidentsStore.splice(idx, 1)[0];
          console.log('[api] deleted dev incident id=', removed.id);
          return res.json({ ok: true, removed });
        }
        // attempt tolerant match (e.g., numeric suffix differences)
        const altIdx = devIncidentsStore.findIndex((r: any) => String(r.id).includes(String(id)) || String(id).includes(String(r.id)));
        if (altIdx >= 0) {
          const removed = devIncidentsStore.splice(altIdx, 1)[0];
          console.log('[api] deleted dev incident by alt match id=', removed.id);
          return res.json({ ok: true, removed, note: 'deleted by fuzzy match' });
        }
        console.log('[api] devIncidentsStore ids=', devIncidentsStore.map((r:any)=>r.id));
        return res.status(404).json({ error: 'not_found', devIds: devIncidentsStore.map((r: any) => r.id) });
      }

      const user = (res.locals as any).user;
      // Attempt to inspect the row first (adminClient preferred so RLS won't hide rows)
      const adminClient = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
      const checkClient = adminClient || serverClient;
      try {
        if (checkClient) {
          try {
            const { data: existing, error: existErr } = await checkClient.from('incidents').select('id, user_id, created_at').eq('id', id).maybeSingle();
            if (existErr) {
              // If adminClient failed, log and continue to attempt delete below
              console.warn('[api] pre-delete existence check returned error:', existErr);
            } else if (existing) {
              console.log('[api] pre-delete: incident exists id=', id, 'user_id=', existing.user_id, 'created_at=', existing.created_at);
            } else {
              console.log('[api] pre-delete: incident not found id=', id);
            }
          } catch (e) {
            console.warn('[api] pre-delete select exception', e);
          }
        }
      } catch (e) {}

      // If using service role, attempt an admin delete that bypasses RLS
      if (adminClient) {
        try {
          const { data, error } = await adminClient.from('incidents').delete().eq('id', id).select('*').maybeSingle();
          if (error) {
            console.error('[api] adminClient delete error:', error);
            const msg = error.message || JSON.stringify(error);
            return res.status(500).json({ error: msg, details: process.env['NODE_ENV'] !== 'production' ? error : undefined });
          }
          if (!data) {
            // If pre-delete select showed a row existed but delete returned no data,
            // respond with 403 when RLS/policy may have prevented visibility, else 404
            return res.status(404).json({ error: 'not_found' });
          }
          return res.json({ ok: true, removed: data });
        } catch (e: any) {
          console.error('[api] adminClient delete exception:', e);
          return res.status(500).json({ error: e?.message || 'delete_failed', details: process.env['NODE_ENV'] !== 'production' ? String(e) : undefined });
        }
      }

      // Use regular serverClient (anon or anon-fallback) - rely on policies and maybeRequireAuth
      try {
        const { data, error } = await serverClient.from('incidents').delete().eq('id', id).select('*').maybeSingle();
        if (error) {
          console.error('[api] serverClient delete error:', error);
          const msg = error.message || JSON.stringify(error);
          if (String(msg).toLowerCase().includes('permission') || String(msg).toLowerCase().includes('rls') || String(msg).toLowerCase().includes('forbidden')) {
            return res.status(403).json({ error: msg, details: process.env['NODE_ENV'] !== 'production' ? error : undefined });
          }
          return res.status(500).json({ error: msg, details: process.env['NODE_ENV'] !== 'production' ? error : undefined });
        }
        if (!data) {
          // No row returned by delete — this usually means either the row didn't exist
          // or RLS prevented visibility. Help the developer by indicating this.
          return res.status(404).json({ error: 'not_found' });
        }
        return res.json({ ok: true, removed: data });
      } catch (e: any) {
        console.error('[api] serverClient delete exception:', e);
        return res.status(500).json({ error: e?.message || 'delete_exception', details: process.env['NODE_ENV'] !== 'production' ? String(e) : undefined });
      }
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'delete_failed' });
    }
  });

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

  // Aggregation: Local insights proxy endpoint
  // GET /api/insights?lat=...&lng=...  returns NormalizedInsight-like object
  const insightsCache = new Map<string, { ts: number; data: any }>();
  const INSIGHTS_TTL = 30 * 60 * 1000; // 30 minutes
  server.get('/api/insights', async (req, res) => {
    try {
      const lat = Number(req.query['lat']);
      const lng = Number(req.query['lng']);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng query params required (numbers)' });

      const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const cached = insightsCache.get(key);
      if (cached && Date.now() - cached.ts < INSIGHTS_TTL) {
        return res.json({ fromCache: true, ...cached.data });
      }

      // Prepare provider URLs
      const radiusKm = 10;
      const iNatUrl = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&order=desc&order_by=observed_on&per_page=30`;
      const overpassUrl = 'https://overpass-api.de/api/interpreter';
      const overpassQl = `[out:json][timeout:25];(way["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15});relation["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15}););out body;>;out skel qt;`;
      const openAQUrl = `https://api.openaq.org/v2/latest?coordinates=${lat},${lng}&radius=${radiusKm*1000}`;

      // Fetch providers in parallel
      const [iNatResRaw, overpassResRaw, openAQResRaw] = await Promise.all([
        fetch(iNatUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
        fetch(overpassUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: overpassQl }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
        fetch(openAQUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      ]).catch(() => [null, null, null]);

      // Normalize species list from iNaturalist
      let species: string[] = [];
      try {
        const results = (iNatResRaw && iNatResRaw.results) || [];
        species = results
          .map((r: any) => r.taxon?.preferred_common_name || r.taxon?.name)
          .filter((n: any) => typeof n === 'string' && n.trim().length)
          .reduce((acc: string[], cur: string) => { if (!acc.includes(cur)) acc.push(cur); return acc; }, [])
          .slice(0, 8);
      } catch (e) { species = []; }

      // Mangrove detection via Overpass
      let mangroveDetected = false;
      try { mangroveDetected = !!(overpassResRaw && Array.isArray(overpassResRaw.elements) && overpassResRaw.elements.length > 0); } catch { mangroveDetected = false; }

      // OpenAQ: try to read pm25
      let pm25: number | null = null;
      try {
        const results = (openAQResRaw && openAQResRaw.results) || [];
        if (results.length && Array.isArray(results[0].measurements)) {
          const m = results[0].measurements.find((x: any) => String(x.parameter).toLowerCase() === 'pm25');
          if (m && typeof m.value === 'number') pm25 = m.value;
        }
      } catch { pm25 = null; }

      // Compute waterQualityIndex (0..100) from pm25; lower pm25 -> higher score
      let waterQualityIndex = 60;
      if (pm25 !== null) {
        waterQualityIndex = Math.max(0, Math.min(100, Math.round(100 - pm25 * 2)));
      }

      const mangroveCoverPct = mangroveDetected ? 5 : 0;

      const normalized = {
        waterQualityIndex,
        mangroveCoverPct,
        beachCleanlinessRating: 3,
        speciesObserved: species,
        lastUpdated: new Date().toISOString(),
      };

      insightsCache.set(key, { ts: Date.now(), data: normalized });
      return res.json({ fromCache: false, ...normalized });
    } catch (e: any) {
      console.error('[api] /api/insights error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'insights aggregation failed' });
    }
  });

  // Metrics: trees planted (best-effort aggregation from available Supabase tables)
  server.get('/api/metrics/trees-planted', async (req, res) => {
    try {
      // If Supabase server client isn't configured, return a sensible fallback number
      if (!serverClient) return res.json({ count: 1250, source: 'fallback-dev' });

      // Try common table names used for recording plantings
      const candidateTables = ['tree_plantings', 'plantings', 'planting_events', 'planting', 'tree_planting'];
      for (const table of candidateTables) {
        try {
          // Use head/count query for efficiency
          let resp: any = null;
          try {
            resp = await serverClient.from(table).select('id', { count: 'exact', head: true });
          } catch (e) {
            resp = null;
          }
          if (resp && (typeof resp.count === 'number' || Array.isArray(resp))) {
            // If resp.count is available, prefer it; else, try a safe count fallback
            const c = typeof resp.count === 'number' ? resp.count : (Array.isArray(resp) ? resp.length : 0);
            return res.json({ count: Number(c || 0), source: table });
          }
        } catch (e) {
          // ignore and try next candidate
        }
      }

      // Fallback: infer from challenge_history records referencing planting challenges
      try {
        let plantLike: any = null;
        try {
          plantLike = await serverClient.from('challenge_history').select('id', { count: 'exact', head: true }).ilike('challenge_id', '%plant%');
        } catch (e) {
          plantLike = null;
        }
        if (plantLike && typeof plantLike.count === 'number') return res.json({ count: Number(plantLike.count || 0), source: 'challenge_history:plant' });
      } catch (e) {}

      // Last resort: return a community estimate when no tables are present
      return res.json({ count: 1250, source: 'fallback' });
    } catch (e: any) {
      console.error('[api] /api/metrics/trees-planted error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'failed to compute trees planted' });
    }
  });

  // Plantings: return geojson of recent tree plantings (attempt Supabase, fallback to seeded sample)
  server.get('/api/plantings', async (req, res) => {
    try {
      // If Supabase not configured, return seeded sample GeoJSON points across the Philippines
      if (!serverClient) {
        const sample = {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { species: 'Narra', planted_at: '2025-11-01' }, geometry: { type: 'Point', coordinates: [120.9822, 14.6042] } }, // Manila
            { type: 'Feature', properties: { species: 'Mango', planted_at: '2025-10-12' }, geometry: { type: 'Point', coordinates: [122.5678, 10.3157] } }, // Mindanao
            { type: 'Feature', properties: { species: 'Bamboo', planted_at: '2025-09-21' }, geometry: { type: 'Point', coordinates: [120.9820, 15.2470] } }, // Zambales
            { type: 'Feature', properties: { species: 'Acacia', planted_at: '2025-08-15' }, geometry: { type: 'Point', coordinates: [121.7740, 12.8797] } }, // central
          ]
        };
        return res.json(sample);
      }

      // Try common planting tables
      const candidateTables = ['tree_plantings', 'plantings', 'planting_events', 'planting', 'tree_planting'];
      for (const table of candidateTables) {
        try {
          const { data, error } = await serverClient.from(table).select('id, lat, lng, planted_at, species, user_id').limit(1000);
          if (!error && Array.isArray(data) && data.length) {
            const features = data.map((r: any) => ({ type: 'Feature', properties: { id: r.id, species: r.species || null, planted_at: r.planted_at || null, user_id: r.user_id || null }, geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] } }));
            return res.json({ type: 'FeatureCollection', features });
          }
        } catch (e) {
          // ignore and try next
        }
      }

      // Fallback: return small seeded sample
      const fallback = {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { species: 'Narra', planted_at: new Date().toISOString() }, geometry: { type: 'Point', coordinates: [120.9822, 14.6042] } }
        ]
      };
      return res.json(fallback);
    } catch (e: any) {
      console.error('[api] /api/plantings error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'failed to load plantings' });
    }
  });

  // Plantings time-series: monthly aggregate of plantings
  server.get('/api/metrics/plantings-timeseries', async (req, res) => {
    try {
      if (!serverClient) {
        // Sample monthly data for the last 6 months
        const now = new Date();
        const months: any[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ month: key, count: Math.floor(50 + Math.random() * 300) });
        }
        return res.json({ series: months });
      }

      // Try to read timestamps from common planting tables and aggregate by month
      const candidateTables = ['tree_plantings', 'plantings', 'planting_events', 'planting', 'tree_planting'];
      let rows: any[] = [];
      for (const table of candidateTables) {
        try {
          const { data, error } = await serverClient.from(table).select('planted_at').limit(5000);
          if (!error && Array.isArray(data) && data.length) {
            rows = data.map((r: any) => ({ planted_at: r.planted_at }));
            break;
          }
        } catch (e) {
          // continue
        }
      }

      if (!rows.length) {
        // fallback: sample data
        const now = new Date();
        const months: any[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ month: key, count: Math.floor(50 + Math.random() * 300) });
        }
        return res.json({ series: months });
      }

      // Aggregate by YYYY-MM
      const agg: Record<string, number> = {};
      for (const r of rows) {
        try {
          const d = new Date(r.planted_at || r.plantedAt || r.created_at || null);
          if (!d || Number.isNaN(d.getTime())) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          agg[key] = (agg[key] || 0) + 1;
        } catch (e) {}
      }

      // Build last 12 months series for stability
      const now = new Date();
      const series: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        series.push({ month: key, count: agg[key] || 0 });
      }
      return res.json({ series });
    } catch (e: any) {
      console.error('[api] /api/metrics/plantings-timeseries error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'failed to compute timeseries' });
    }
  });

  // Scoreboard proxy: fetch environmental indicators server-side to avoid CORS
  // Query params: lat, lng, radius (meters)
  server.get('/api/scoreboard', async (req, res) => {
    try {
      const lat = Number(req.query['lat'] ?? 12.8797);
      const lng = Number(req.query['lng'] ?? 121.7740);
      const radius = Number(req.query['radius'] ?? 50000);

      // iNaturalist observations count (small page to check total_results)
      const inatUrl = `https://api.inaturalist.org/v1/observations?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${Math.round(radius/1000)}&per_page=1`;
      // OpenAQ latest
      const openAQUrl = `https://api.openaq.org/v2/latest?coordinates=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&radius=${Math.round(radius)}`;
      // Overpass query for forest/wood nodes/ways/rels
      const overpassQl = `[out:json][timeout:25];(node(around:${Math.round(radius)},${lat},${lng})[natural=wood];way(around:${Math.round(radius)},${lat},${lng})[natural=wood];relation(around:${Math.round(radius)},${lat},${lng})[natural=wood];node(around:${Math.round(radius)},${lat},${lng})[landuse=forest];way(around:${Math.round(radius)},${lat},${lng})[landuse=forest];relation(around:${Math.round(radius)},${lat},${lng})[landuse=forest];);out body;`;

      // Fetch in parallel
      const [inatResp, openAQResp, overpassResp] = await Promise.all([
        fetch(inatUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
        fetch(openAQUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
        fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: overpassQl }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      ]).catch(() => [null, null, null]);

      // Compute metadata and scores using same heuristics as client
      const biodCount = Number(inatResp?.total_results ?? inatResp?.results?.length ?? 0) || 0;
      let pm25: number | null = null;
      try {
        const results = openAQResp?.results || [];
        if (Array.isArray(results) && results.length) {
          for (const r of results) {
            const m = Array.isArray(r.measurements) ? r.measurements.find((x: any) => String(x.parameter).toLowerCase() === 'pm25') : null;
            if (m && typeof m.value === 'number') { pm25 = m.value; break; }
          }
        }
      } catch (e) { pm25 = null; }

      const forestCount = Array.isArray(overpassResp?.elements) ? overpassResp.elements.length : 0;

      const scores = {
        biodiversity: Math.min(100, Math.round((Math.log(biodCount + 1) / Math.log(5000 + 1)) * 100)) || 0,
        air: pm25 === null ? 0 : Math.max(0, Math.min(100, Math.round((1 - (pm25 / 100)) * 100))),
        forest: Math.min(100, Math.round((Math.log(forestCount + 1) / Math.log(2000 + 1)) * 100)) || 0,
      };

      return res.json({ ok: true, meta: { biodiversityCount: biodCount, pm25, forestCount }, scores, lastUpdated: new Date().toISOString(), source: 'server-proxy' });
    } catch (e: any) {
      console.error('[api] /api/scoreboard error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'scoreboard_failed' });
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

  // Storage signed URL generator: returns a short-lived signed URL for private objects
  // Query params: bucket (required), path (required), expires (optional, seconds)
  server.get('/api/storage/signed-url', async (req, res) => {
    try {
      if (!serverClient || !SUPABASE_SERVICE_ROLE_KEY) return res.status(501).json({ error: 'Server not configured with SUPABASE_SERVICE_ROLE_KEY' });
      const bucket = String((req.query['bucket'] || '')).trim();
      const path = String((req.query['path'] || '')).trim();
      const expires = Math.max(60, Math.min(3600, Number(req.query['expires'] || 300)));
      if (!bucket || !path) return res.status(400).json({ error: 'bucket and path query params required' });

      // Security: allow only requests originating from configured allowed origins
      const origin = String(req.headers.origin || '');
      const referer = String(req.headers.referer || '');
      const hostAllowed = allowedOrigins.length === 0 ? false : (origin && allowedOrigins.includes(origin)) || allowedOrigins.some(o => referer.startsWith(o));
      if (!hostAllowed) return res.status(403).json({ error: 'Forbidden: invalid origin or referer' });

      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await (adminClient as any).storage.from(bucket).createSignedUrl(path, expires);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ url: data?.signedUrl || data?.signed_url || null });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed to create signed url' });
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
