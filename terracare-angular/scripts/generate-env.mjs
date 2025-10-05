#!/usr/bin/env node
// Generates src/environments/environment.production.ts from process.env values.
// Only writes PUBLIC (safe) values. Service role keys must remain server-only.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const outFile = 'src/environments/environment.production.ts';

// Accept both legacy names and documented ones.
const apiBase = process.env.API_BASE || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

const banner = `// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.\n`;
const body = `export const environment = {\n  production: true,\n  apiBase: '${apiBase}',\n  supabaseUrl: '${supabaseUrl}',\n  supabaseAnonKey: '${supabaseAnonKey}'\n};\n`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner + body, 'utf8');
console.log('[generate-env] Wrote', outFile, 'with values:', { apiBase, supabaseUrl, supabaseAnonKey: supabaseAnonKey ? '[present]' : '' });
