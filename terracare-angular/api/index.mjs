import { createServer } from 'http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Vercel Node runtime expects an exported handler. We'll lazy-load the built
// server from the Angular Universal build output which lives at
// dist/terracare-angular/server/server.mjs after a production SSR build.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedHandler = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;

  // Path to the built server entry
  const serverPath = join(__dirname, '..', 'dist', 'terracare-angular', 'server', 'server.mjs');
  // When running on Vercel the build output is available at process.cwd()
  const candidate = serverPath;

  try {
    const mod = await import(candidate);
    // The build exports a `app` function and runs a `run()` when executed.
    // Prefer an exported `app` so we can obtain the Express instance and
    // adapt it. Some Angular Universal builds export a default handler;
    // we try both.
    const serverApp = mod.app ?? (mod.default && mod.default.app) ?? null;
    if (!serverApp && mod.default) {
      // If module default is an express app
      if (typeof mod.default === 'function') {
        cachedHandler = mod.default;
        return cachedHandler;
      }
    }

    if (!serverApp) {
      throw new Error('Unable to find exported `app` in built server.');
    }

    const expressApp = serverApp();

    // Create a simple handler that uses the Express app to handle requests
    cachedHandler = (req, res) => expressApp(req, res);
    return cachedHandler;
  } catch (err) {
    // Re-throw with helpful context for debugging on Vercel
    throw new Error(`Failed to load Angular Universal server at ${candidate}: ${err.message}`);
  }
}

export default async function handler(req, res) {
  const h = await getHandler();
  return h(req, res);
}
