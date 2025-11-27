import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Session, User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
	constructor(private supabase: SupabaseService) {
		// Check if Supabase is properly configured
		if (!this.supabase.client) {
			console.error('Supabase client not properly initialized');
		}
	}

	async signUp(email: string, password: string, fullname?: string, metadata?: Record<string, any>) {
		try {
			const signUpData: any = { email, password };
			// Build metadata payload (merge fullname + any provided metadata)
			const meta: Record<string, any> = {};
			if (fullname) meta['full_name'] = fullname;
			if (metadata) Object.assign(meta, metadata);
			if (Object.keys(meta).length) {
				signUpData.options = { data: meta };
			}

			const { data, error } = await this.supabase.client.auth.signUp(signUpData);
			if (error) {
				console.error('Signup error:', error);
				throw new Error(error.message || 'Signup failed');
			}
			return data;
		} catch (error: any) {
			console.error('Signup exception:', error);
			throw new Error(error?.message || 'Signup failed - please check your connection');
		}
	}

	async signIn(email: string, password: string) {
		try {
			const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
			if (error) {
				console.error('Signin error:', error);
				throw new Error(error.message || 'Invalid email or password');
			}
			return data;
		} catch (error: any) {
			console.error('Signin exception:', error);
			throw new Error(error?.message || 'Login failed - please check your connection');
		}
	}

	/**
	 * Send a verification / magic link to the provided email.
	 * Uses Supabase `signInWithOtp` to deliver an email link which can be
	 * used for verification or passwordless sign-in. This is safe from the
	 * client side and does not require a service role key.
	 */
	async resendVerification(email: string) {
		try {
			const { data, error } = await this.supabase.client.auth.signInWithOtp({ email });
			if (error) {
				console.error('Resend verification error:', error);
				throw new Error(error.message || 'Failed to send verification');
			}
			return data;
		} catch (error: any) {
			console.error('Resend verification exception:', error);
			throw new Error(error?.message || 'Failed to send verification - please check your connection');
		}
	}

	async signOut(scope: 'global' | 'local' | 'others' = 'global') {
		const { error } = await this.supabase.client.auth.signOut({ scope });
		if (error) throw error;
	}

	/**
	 * Comprehensive logout that:
	 * - Signs out the Supabase session (global scope: all tabs)
	 * - Removes persisted auth artifacts from both local & session storage
	 * - Clears the remember-me flag so future visits start unauthenticated
	 *
	 * Does NOT indiscriminately clear all storage to avoid losing unrelated user preferences.
	 */
	async logout(): Promise<void> {
		try {
			await this.signOut('global');
		} catch (e) {
			console.warn('Supabase signOut error (continuing logout):', (e as any)?.message || e);
		}
		// Targeted storage cleanup
		try { localStorage.removeItem('terracare-auth'); } catch {}
		try { sessionStorage.removeItem('terracare-auth'); } catch {}
		try { localStorage.removeItem('tc.rememberMe'); } catch {}
		try { sessionStorage.removeItem('tc.rememberMe'); } catch {}
		// Cached avatar URL used to reduce flicker on profile
		try { localStorage.removeItem('tc_avatar_url'); } catch {}
		// Some Supabase keys may begin with 'sb-' (legacy); remove any that match our url keyspace
		try {
			const keys = Object.keys(localStorage);
			for (const k of keys) {
				if (k.startsWith('sb-')) {
					try { localStorage.removeItem(k); } catch {}
				}
			}
		} catch {}
		try {
			const keys = Object.keys(sessionStorage);
			for (const k of keys) {
				if (k.startsWith('sb-')) {
					try { sessionStorage.removeItem(k); } catch {}
				}
			}
		} catch {}
	}

	async getSession(): Promise<Session | null> {
		try {
			const { data: { session }, error } = await this.supabase.client.auth.getSession();
			if (error) return null;
			return session;
		} catch {
			return null;
		}
	}

	async getCurrentUser() {
		// Avoid triggering AuthSessionMissingError in logged-out or early-hydration states
		const session = await this.getSession();
		if (!session) return null;
		try {
			const { data: { user }, error } = await this.supabase.client.auth.getUser();
			if (error) return null;
			return user as User | null;
		} catch {
			return null;
		}
	}

	async getUserProfile() {
		const user = await this.getCurrentUser();
		return user ? {
			id: user.id,
			email: user.email,
			fullName: user.user_metadata?.['full_name'],
			createdAt: user.created_at
		} : null;
	}
}
