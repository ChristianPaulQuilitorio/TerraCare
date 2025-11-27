#!/usr/bin/env node
// Bundles the Express server into a single Vercel serverless function at api/index.js
const esbuild = require('esbuild');
const path = require('path');

async function build() {
  const entry = path.join(process.cwd(), 'serverless-entry.ts');
  const out = path.join(process.cwd(), 'api', 'index.js');

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
  console.log('[bundle] done');
}

build().catch(err => {
  console.error('[bundle] build failed', err);
  process.exit(1);
});
