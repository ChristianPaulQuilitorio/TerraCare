import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
	constructor(private supabase: SupabaseService) {
		// Check if Supabase is properly configured
		if (!this.supabase.client) {
			console.error('Supabase client not properly initialized');
		}
	}

	async signUp(email: string, password: string, fullname?: string) {
		try {
			const signUpData: any = { email, password };
			
			// Add fullname to user metadata if provided
			if (fullname) {
				signUpData.options = {
					data: {
						full_name: fullname
					}
				};
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

	async signOut(scope: 'global' | 'local' | 'others' = 'global') {
		const { error } = await this.supabase.client.auth.signOut({ scope });
		if (error) throw error;
	}

	async getCurrentUser() {
		try {
			const { data: { user }, error } = await this.supabase.client.auth.getUser();
			if (error) {
				console.warn('Auth error getting user:', error);
				// Don't throw error, just return null for unauthenticated state
				return null;
			}
			return user;
		} catch (error: any) {
			console.warn('Exception getting current user:', error?.message || error);
			// Return null instead of throwing to prevent app crashes
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
