// NOTE: Production secrets removed from source control. Values are injected at runtime/build
// via environment variables set in the hosting platform (e.g., Vercel Project Settings).
// Configure:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
// Optionally (server only): SUPABASE_SERVICE_ROLE_KEY (never expose to client bundles)
export const environment = {
	production: true,
	apiBase: '',
	supabaseUrl: (globalThis as any).SUPABASE_URL || '',
	supabaseAnonKey: (globalThis as any).SUPABASE_ANON_KEY || '',
	CEREBRAS_API_KEY: (globalThis as any).CEREBRAS_API_KEY || '',
	CEREBRAS_API_URL: (globalThis as any).CEREBRAS_API_URL || '',
	CEREBRAS_MODEL: (globalThis as any).CEREBRAS_MODEL || ''
};
