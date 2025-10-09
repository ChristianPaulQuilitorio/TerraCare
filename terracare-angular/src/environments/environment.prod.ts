<<<<<<< HEAD
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
	supabaseAnonKey: (globalThis as any).SUPABASE_ANON_KEY || ''
=======
export const environment = {
	production: true,
	apiBase: '',
	supabaseUrl: 'https://tyalzymvdnrzbwwtlcvj.supabase.co',
	supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWx6eW12ZG5yemJ3d3RsY3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MjAzODAsImV4cCI6MjA3NDk5NjM4MH0.gP0SnNZOQ3H6mmIQ0NvlPwW3TMUe7nvzKpFyAa4TPaM'
>>>>>>> 1e73e1a802f2b93dfa9c8be1f3a727b535a1f040
};
