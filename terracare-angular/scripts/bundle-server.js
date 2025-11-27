#!/usr/bin/env node
// Bundles the Express server into a single Vercel serverless function at api/index.js
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  const entry = path.join(process.cwd(), 'serverless-entry.ts');
  const out = path.join(process.cwd(), 'api', 'index.js');
  // Vercel Build Output API target directory for functions
  const vercelFuncDir = path.join(process.cwd(), '.vercel', 'output', 'functions', 'api.func');
  const vercelFuncIndex = path.join(vercelFuncDir, 'index.js');
  const vercelFuncMeta = path.join(vercelFuncDir, '.vc-config.json');

  console.log('[bundle] bundling server entry', entry, '->', out);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: ['node18'],
    outfile: out,
    format: 'cjs',
    sourcemap: false,
    external: [],
  });
  // Also emit a Build Output API function for Vercel so the platform reliably
  // serves the server as a serverless function. Ensure the directory exists
  // and copy the generated bundle into the function folder with metadata.
  try {
    fs.mkdirSync(vercelFuncDir, { recursive: true });
    // Copy the bundle to the function index
    fs.copyFileSync(out, vercelFuncIndex);
    // Write a minimal vc-config file
    const meta = { runtime: 'nodejs', handler: 'index.js' };
    fs.writeFileSync(vercelFuncMeta, JSON.stringify(meta));
    console.log('[bundle] wrote Build Output API function to', vercelFuncDir);
  } catch (e) {
    console.warn('[bundle] could not write vercel function output:', e && e.message ? e.message : e);
  }
  console.log('[bundle] done');
}

build().catch(err => {
  console.error('[bundle] build failed', err);
  process.exit(1);
});
