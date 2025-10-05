#!/usr/bin/env node
// Generates src/environments/environment.production.ts from process.env values.
// Only writes PUBLIC (safe) values. Service role keys must remain server-only.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load local .env when present (has no effect on Vercel since it injects vars directly)
dotenv.config();

const outFile = 'src/environments/environment.production.ts';

// Accept both legacy names and documented ones.
const apiBase = process.env.API_BASE || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

const isCI = !!process.env.VERCEL || !!process.env.CI;
const isPreview = (process.env.VERCEL_ENV === 'preview');

if ((!supabaseUrl || !supabaseAnonKey) && isCI && !isPreview) {
	console.error('\n[generate-env] ERROR: Missing required environment variables for production build.');
	if (!supabaseUrl) console.error(' - SUPABASE_URL is not set');
	if (!supabaseAnonKey) console.error(' - SUPABASE_ANON_KEY is not set');
	console.error('Add them in Vercel Project Settings (Production) and rebuild.');
	process.exit(1);
}

// In preview builds allow placeholder (still warns) so you can test layout without backend
if ((!supabaseUrl || !supabaseAnonKey) && isPreview) {
	console.warn('[generate-env] WARNING: Missing Supabase env vars in preview. Using placeholder values. Auth/API calls will fail.');
}

const banner = `// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.\n`;
const body = `export const environment = {\n  production: true,\n  apiBase: '${apiBase}',\n  supabaseUrl: '${supabaseUrl}',\n  supabaseAnonKey: '${supabaseAnonKey}'\n};\n`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner + body, 'utf8');
console.log('[generate-env] Wrote', outFile, 'with values:', { apiBase, supabaseUrl, supabaseAnonKey: supabaseAnonKey ? '[present]' : '' });
