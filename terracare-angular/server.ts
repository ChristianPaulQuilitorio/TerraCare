import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Body parsers for API routes
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  // Basic CORS for dev when front-end runs on a different origin
  server.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

  // Health check
  server.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
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

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
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
