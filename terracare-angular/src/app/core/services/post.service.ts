import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ForumPost {
  id: string;
  author_id: string;
  author_name?: string;
  author_avatar_url?: string | null;
  title: string;
  content: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  attachment_url?: string;
  attachment_type?: 'image' | 'video';
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  getAll(): Observable<ForumPost[]> {
    return from(
      this.supabase.client
        .from('posts')
        .select('id, author_id, author_name, author_avatar_url, title, content, is_public, created_at, updated_at, attachment_url, attachment_type')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
    ).pipe(
      switchMap(async ({ data }) => {
        const rows = (data ?? []) as ForumPost[];
        // Fallback: if author_avatar_url missing, attempt to fetch from profiles in one round-trip
        const missing = rows.filter(r => !r.author_avatar_url);
        if (missing.length) {
          const ids = Array.from(new Set(missing.map(m => m.author_id)));
          const { data: profs } = await this.supabase.client
            .from('profiles')
            .select('id, avatar_url')
            .in('id', ids);
          const mapById = new Map<string, string | null>((profs || []).map((p: any) => [p.id as string, (p.avatar_url as string | null) || null]));
          rows.forEach(r => {
            if (!r.author_avatar_url && mapById.has(r.author_id)) r.author_avatar_url = mapById.get(r.author_id) || null;
          });
        }
        return rows;
      })
    );
  }

  async createPost(title: string, content: string, file?: File): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    let attachment_url: string | undefined;
    let attachment_type: 'image' | 'video' | undefined;
    if (file) {
      const ext = file.name.split('.').pop();
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : undefined;
      attachment_type = type;
      const path = `forum/${user.id}/${Date.now()}-${file.name}`;
      let { error } = await this.supabase.client.storage.from('forum-attachments').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error?.message?.toLowerCase().includes('bucket not found')) {
        // call server to initialize bucket then retry once
        try {
          const apiBase = (environment.apiBase || '').replace(/\/$/, '');
          await fetch(`${apiBase}/api/storage/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bucketId: 'forum-attachments' })
          });
          const retry = await this.supabase.client.storage.from('forum-attachments').upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });
          error = retry.error || null;
        } catch {}
      }
      if (error) return { success: false, error: error.message };
      attachment_url = this.supabase.client.storage.from('forum-attachments').getPublicUrl(path).data.publicUrl;
    }

    const displayName = (user.user_metadata?.['full_name'] as string | undefined) ?? user.email ?? null;
    // Try to fetch avatar_url from profiles; fallback to auth metadata, for denormalization
    let author_avatar_url: string | null = null;
    try {
      const { data: prof } = await this.supabase.client
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();
      author_avatar_url = (prof?.avatar_url as string | undefined) ?? null;
    } catch {}
    if (!author_avatar_url) {
      author_avatar_url = (user.user_metadata?.['avatar_url'] as string | undefined) ?? null;
    }
    const { error } = await this.supabase.client.from('posts').insert([
      {
        author_id: user.id,
        author_name: displayName,
        author_avatar_url,
        title,
        content,
        is_public: true,
        attachment_url,
        attachment_type,
      },
    ]);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Delete a post the current user owns. If an attachment exists under the user's prefix,
   * try to remove it from Storage as well (best effort; ignore failures).
   */
  async deletePost(post: ForumPost): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Best-effort attachment cleanup
    try {
      if (post.attachment_url) {
        const path = this.extractStoragePath(post.attachment_url);
        // Only attempt delete if path is under the current user's folder
        if (path && path.startsWith(`forum/${user.id}/`)) {
          await this.supabase.client.storage.from('forum-attachments').remove([path]);
        }
      }
    } catch { /* ignore storage delete errors */ }

    // Delete the row (RLS ensures only author can delete)
    const { error } = await this.supabase.client
      .from('posts')
      .delete()
      .eq('id', post.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Extract the storage object path from a public URL like:
   * https://<ref>.supabase.co/storage/v1/object/public/forum-attachments/<path>
   */
  private extractStoragePath(publicUrl: string): string | null {
    try {
      const marker = '/storage/v1/object/public/forum-attachments/';
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return null;
      return decodeURIComponent(publicUrl.substring(idx + marker.length));
    } catch {
      return null;
    }
  }
}