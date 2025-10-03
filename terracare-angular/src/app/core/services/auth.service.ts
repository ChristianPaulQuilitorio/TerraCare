import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
	constructor(private supabase: SupabaseService) {}

	async signUp(email: string, password: string) {
		const { data, error } = await this.supabase.client.auth.signUp({ email, password });
		if (error) throw error;
		return data;
	}

	async signIn(email: string, password: string) {
		const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
		if (error) throw error;
		return data;
	}

	async signOut(scope: 'global' | 'local' | 'others' = 'global') {
		const { error } = await this.supabase.client.auth.signOut({ scope });
		if (error) throw error;
	}

	async createOrUpdateProfile(userId: string, values: { username?: string | null; full_name?: string | null; avatar_url?: string | null; bio?: string | null; }) {
		const payload: any = { ...values, id: userId };
		// Try upsert on profiles
		const { error } = await this.supabase.client
			.from('profiles')
			.upsert(payload, { onConflict: 'id' });
		if (error) throw error;
	}
}
