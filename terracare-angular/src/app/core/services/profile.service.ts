import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface ProfileRecord {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  async getMyProfile(): Promise<ProfileRecord | null> {
    const user = await this.auth.getCurrentUser();
    if (!user) return null;
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('id, username, full_name, avatar_url, created_at')
      .eq('id', user.id)
      .single();
    if (error) return null;
    return data as ProfileRecord;
  }

  async upsertMyProfile(values: Partial<Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url'>>): Promise<{ success: boolean; error?: string }>{
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const payload: any = { id: user.id, ...values };
    const { error } = await this.supabase.client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Uploads an avatar file to the 'avatars' bucket under avatars/<uid>/avatar-<ts>.<ext>
   * Returns the public URL on success.
   */
  async uploadAvatar(file: File): Promise<{ success: boolean; url?: string; error?: string }>{
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const ext = file.name.split('.').pop() || 'png';
    const path = `avatars/${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadErr } = await this.supabase.client
      .storage
      .from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) {
      // best effort: if bucket missing, surface a helpful message
      return { success: false, error: uploadErr.message };
    }

    const { data } = this.supabase.client.storage.from('avatars').getPublicUrl(path);
    const publicUrl = data.publicUrl;
    // Sync into auth metadata as well to make it readily available on session load
    try { await this.supabase.client.auth.updateUser({ data: { avatar_url: publicUrl } }); } catch {}
    return { success: true, url: publicUrl };
  }

  /**
   * Removes the current avatar by deleting the object (best-effort) and clearing avatar_url in profiles.
   */
  async removeAvatar(currentUrl: string | null): Promise<{ success: boolean; error?: string }>{
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    try {
      if (currentUrl) {
        const marker = '/storage/v1/object/public/avatars/';
        const idx = currentUrl.indexOf(marker);
        if (idx !== -1) {
          const path = decodeURIComponent(currentUrl.substring(idx + marker.length));
          if (path.startsWith(`avatars/${user.id}/`)) {
            await this.supabase.client.storage.from('avatars').remove([path]);
          }
        }
      }
    } catch { /* ignore storage errors */ }

    const { error } = await this.supabase.client
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id);
    if (error) return { success: false, error: error.message };
    try { await this.supabase.client.auth.updateUser({ data: { avatar_url: null as any } }); } catch {}
    return { success: true };
  }

  /**
   * Syncs full name to auth user metadata (full_name) for consistency with profiles.
   */
  async syncFullNameToAuth(fullName: string): Promise<{ success: boolean; error?: string }>{
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    const { error } = await this.supabase.client.auth.updateUser({ data: { full_name: fullName } });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}
