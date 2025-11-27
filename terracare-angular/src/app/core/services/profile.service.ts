import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface ProfileRecord {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone?: string | null;
  address?: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  async getMyProfile(): Promise<ProfileRecord | null> {
    const user = await this.auth.getCurrentUser();
    if (!user) return null;
    // Try a flexible lookup to support either 'id' or 'user_id' schema variants
    const supa = this.supabase.client;
    // Prefer a broad OR query, fall back to single-column queries if needed
    try {
      const res = await supa
        .from('profiles')
        .select('id, user_id, username, full_name, avatar_url, phone, address, created_at')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1);
      const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
      if (row) return {
        id: (row.id || row.user_id || user.id) as string,
        username: row.username ?? null,
        full_name: row.full_name ?? null,
        avatar_url: row.avatar_url ?? null,
        phone: row.phone ?? null,
        address: row.address ?? null,
        created_at: row.created_at ?? new Date().toISOString()
      } as ProfileRecord;
    } catch {}
    // Fallback attempts
    try {
      const a = await supa.from('profiles').select('id, username, full_name, avatar_url, phone, address, created_at').eq('id', user.id).single();
      if (!a.error && a.data) return a.data as ProfileRecord;
    } catch {}
    try {
      const b = await supa.from('profiles').select('user_id, username, full_name, avatar_url, phone, address, created_at').eq('user_id', user.id).single();
      if (!b.error && b.data) return {
        id: b.data.user_id,
        username: b.data.username,
        full_name: b.data.full_name,
        avatar_url: b.data.avatar_url,
        phone: b.data.phone ?? null,
        address: b.data.address ?? null,
        created_at: b.data.created_at
      } as ProfileRecord;
    } catch {}
    return null;
  }

  async upsertMyProfile(values: Partial<Pick<ProfileRecord, 'username' | 'full_name' | 'avatar_url' | 'phone' | 'address'>>): Promise<{ success: boolean; error?: string }>{
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const supa = this.supabase.client;
    // Try to find an existing row matching either id or user_id
    let key: 'id' | 'user_id' | null = null;
    try {
      const probe = await supa
        .from('profiles')
        .select('id, user_id')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1);
      const row = Array.isArray(probe.data) && probe.data.length ? probe.data[0] : null;
      if (row) key = row.id ? 'id' : (row.user_id ? 'user_id' : null);
    } catch {}

    // If we identified a key, run an update
    if (key) {
      try {
        const upd = await supa
          .from('profiles')
          .update(values)
          .eq(key, user.id)
          .select(key)
          .limit(1);
        const updated = Array.isArray(upd.data) ? upd.data.length > 0 : false;
        if (updated) return { success: true };
      } catch (e: any) {
        // Fall through to insert attempts
      }
    }

    // Insert path: try a broad insert first, then narrow based on error
    const attemptPayloads: any[] = [
      { id: user.id, user_id: user.id, ...values },
      { id: user.id, ...values },
      { user_id: user.id, ...values }
    ];
    for (const payload of attemptPayloads) {
      try {
        const ins = await supa.from('profiles').insert([payload]).select('id, user_id').limit(1);
        if (!ins.error) return { success: true };
        // If the error is due to unknown column, move to next payload
        const msg = (ins.error.message || '').toLowerCase();
        if (!(msg.includes('column') && msg.includes('does not exist'))) {
          // Real error unrelated to column mismatch
          return { success: false, error: ins.error.message };
        }
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!(msg.includes('column') && msg.includes('does not exist'))) {
          return { success: false, error: e?.message || 'Failed to save profile' };
        }
      }
    }
    return { success: false, error: 'Failed to save profile: schema mismatch' };
  }

  /**
   * Check whether a full_name is already used by another profile (case-insensitive best-effort).
   */
  async isFullNameTaken(fullName: string): Promise<boolean> {
    if (!fullName) return false;
    const supa = this.supabase.client;
    try {
      // First, try checking the auth `users` table's metadata where available
      // Many Supabase projects expose `auth.users` as `users` to the client; attempt ilike on JSON metadata
      try {
        const u = await supa.from('users').select('id, user_metadata').filter("user_metadata->>full_name", 'ilike', fullName).limit(1);
        if (!u.error && Array.isArray(u.data) && u.data.length) return true;
      } catch (e) {
        // ignore and fall through to profiles check
      }

      // Try case-insensitive match using ILIKE on profiles.full_name
      const pattern = fullName;
      const res = await supa.from('profiles').select('id, full_name').ilike('full_name', pattern).limit(1);
      if (!res.error && Array.isArray(res.data) && res.data.length) return true;
    } catch (e) {
      // ignore and try fallback
    }
    try {
      const r2 = await supa.from('profiles').select('id').eq('full_name', fullName).limit(1);
      if (!r2.error && Array.isArray(r2.data) && r2.data.length) return true;
    } catch (e) {}
    return false;
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

    // Update avatar_url null regardless of whether PK column is 'id' or 'user_id'
    const supa = this.supabase.client;
    let error = null as any;
    try {
      const res = await supa.from('profiles').update({ avatar_url: null }).or(`id.eq.${user.id},user_id.eq.${user.id}`);
      error = res.error || null;
      if (error && (error.message || '').toLowerCase().includes('syntax')) {
        // Fallback: try id first then user_id
        const a = await supa.from('profiles').update({ avatar_url: null }).eq('id', user.id);
        if (a.error) {
          const b = await supa.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
          error = b.error || null;
        } else {
          error = null;
        }
      }
    } catch (e:any) { error = e; }
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
    // Write to multiple commonly used metadata keys so Supabase UI and providers display it.
    // Keys chosen: full_name (Supabase default), name (OAuth convention), display_name (dashboard-friendly), preferred_username.
    const meta = { full_name: fullName, name: fullName, display_name: fullName, preferred_username: fullName } as const;
    const { error } = await this.supabase.client.auth.updateUser({ data: meta as any });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}
