import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          avatar_url: string | null;
          bio: string | null;
          website: string | null;
          location: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          website?: string | null;
          location?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          website?: string | null;
          location?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
      };
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient<Database>;

  constructor() {
    this.supabase = createClient<Database>(
      environment.supabase.url,
      environment.supabase.key
    );
  }

  get client(): SupabaseClient<Database> {
    return this.supabase;
  }

  get auth() {
    return this.supabase.auth;
  }

  get storage() {
    return this.supabase.storage;
  }

  // Helper method to get the current session
  getCurrentSession() {
    return this.supabase.auth.getSession();
  }

  // Helper method to get the current user
  getCurrentUser() {
    return this.supabase.auth.getUser();
  }
}