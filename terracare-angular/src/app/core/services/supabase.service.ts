import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
	private _client?: SupabaseClient;

	constructor() {
		// Lazy init: actual client creation deferred until first access.
	}

	get client(): SupabaseClient {
		if (this._client) return this._client;
		if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
			console.error('Supabase client accessed before configuration was provided. Returning placeholder client that will fail on use.');
			return new Proxy({} as SupabaseClient, {
				get() { throw new Error('Supabase not configured. Set SUPABASE_URL & SUPABASE_ANON_KEY and redeploy.'); }
			});
		}
		const zoneSafeLock: any = createInMemoryLock();
		const w = typeof window !== 'undefined' ? (window as any) : undefined;
		const existing = w?.__supabaseClient as SupabaseClient | undefined;
		if (existing) {
			this._client = existing;
			return existing;
		}
		this._client = createClient(
			environment.supabaseUrl,
			environment.supabaseAnonKey,
			{
				auth: {
					persistSession: true,
					autoRefreshToken: true,
					detectSessionInUrl: true,
					lock: zoneSafeLock,
				},
			}
		);
		if (w) w.__supabaseClient = this._client;
		return this._client;
	}
}

export function isSupabaseConfigured() {
	return !!(environment.supabaseUrl && environment.supabaseAnonKey);
}

// Simple per-process async lock to avoid Navigator LockManager incompatibilities with zone.js
function createInMemoryLock() {
	const busy = new Set<string>();
	const queues = new Map<string, Array<() => void>>();

	return async function lock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
		// Fast path: try to acquire immediately
		if (!busy.has(name)) {
			busy.add(name);
		} else if (acquireTimeout === 0) {
			const err: any = new Error(`Lock '${name}' not available`);
			err.isAcquireTimeout = true; // recognized by auth-js
			throw err;
		} else {
			// Wait until released
			await new Promise<void>((resolve) => {
				const q = queues.get(name) ?? [];
				q.push(resolve);
				queues.set(name, q);
			});
			busy.add(name);
		}

		try {
			return await fn();
		} finally {
			const q = queues.get(name);
			if (q && q.length) {
				// Allow next waiter to proceed
				busy.delete(name);
				const next = q.shift()!;
				if (q.length === 0) queues.delete(name); else queues.set(name, q);
				next();
			} else {
				busy.delete(name);
			}
		}
	};
}

