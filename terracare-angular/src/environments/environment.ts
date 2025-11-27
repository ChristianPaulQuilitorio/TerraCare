export const environment = {
	production: false,
	// Use a relative API base so dev-server proxy forwards /api to the backend
	apiBase: '/api',
	// Client-side Supabase (Anon) credentials
	supabaseUrl: 'https://tyalzymvdnrzbwwtlcvj.supabase.co',
	supabaseAnonKey: 'sb_publishable_hx40kiu9z1XutU-a1ltB3Q_8GbsbZiu',
	SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWx6eW12ZG5yemJ3d3RsY3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MjAzODAsImV4cCI6MjA3NDk5NjM4MH0.gP0SnNZOQ3H6mmIQ0NvlPwW3TMUe7nvzKpFyAa4TPaM",
	// Do NOT store provider API keys in client environment. The server should hold the
	// CEREBRAS_API_KEY and forward requests from the client via /api/ endpoints.
	// Keep the model name here if you need the client to pick a default.
	CEREBRAS_MODEL: 'llama-3.3-70b'

	
};
