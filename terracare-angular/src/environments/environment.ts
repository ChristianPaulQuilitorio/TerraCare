export const environment = {
	production: false,
	apiBase: '', // use relative /api calls in dev; or set to 'http://localhost:4000' if running local API
	supabaseUrl: '', // filled manually for local dev OR use a dev prebuild script similar to production
	supabaseAnonKey: '' // DO NOT commit real anon key; use .env + generator instead
};

