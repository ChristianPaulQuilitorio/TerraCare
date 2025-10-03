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

	async signOut() {
		const { error } = await this.supabase.client.auth.signOut();
		if (error) throw error;
	}
}
