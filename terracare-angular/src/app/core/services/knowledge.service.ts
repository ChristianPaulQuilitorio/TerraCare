import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { KnowledgeItem } from '../models/knowledge-item.model';
import { AuthService } from './auth.service';
import { SiteConfigService } from './site-config.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  private site = inject(SiteConfigService);
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  getAll(): Observable<KnowledgeItem[]> {
    // On the server (SSR/prerender), avoid network calls and return seed data
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return of(this.site.knowledgeItems);

    const fetchMinimal = from(
      this.supabase.client
        .from('knowledge')
        .select('id, title, description, category')
        .order('title', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as KnowledgeItem[];
      })
    );

    // Load minimal columns first to avoid 400s on older schemas missing url/"type"/user_id
    return fetchMinimal.pipe(
      switchMap((minimalRows) => {
        const tryEnrich = from(
          this.supabase.client
            .from('knowledge')
            .select('id, url, "type", user_id')
            .order('title', { ascending: true })
        ).pipe(
          switchMap(({ data, error }) => {
            if (error) throw error;
            const details = (data ?? []) as Array<any>;
            const mapById = new Map(details.map(d => [d.id, d]));
            const merged = minimalRows.map(r => ({ ...r, ...mapById.get((r as any).id) }));
            const ids = Array.from(new Set(merged.map((r: any) => r.user_id).filter(Boolean)));
            if (!ids.length) return of(merged as KnowledgeItem[]);
            return from(this.supabase.client.rpc('get_user_display_names', { ids })).pipe(
              map(({ data: names, error: rpcError }) => {
                if (rpcError) throw rpcError;
                const nameMap = new Map<string, string>((names || []).map((n: any) => [n.id, n.display_name]));
                return merged.map((r: any) => ({ ...r, displayName: nameMap.get(r.user_id) })) as KnowledgeItem[];
              }),
              catchError(() => of(merged as KnowledgeItem[]))
            );
          }),
          catchError((e) => {
            console.warn('Knowledge enrich (url/type/user_id) failed; using minimal', e);
            return of(minimalRows);
          })
        );
        return tryEnrich;
      }),
      catchError((e3) => {
        console.warn('Knowledge query (minimal) failed; using seed items', e3);
        return of(this.site.knowledgeItems);
      })
    );
  }

  async uploadFileToStorage(file: File, pathPrefix = 'knowledge') {
    const fileName = `${Date.now()}-${file.name}`;
    const bucket = 'knowledge-attachments';
    let prefix = pathPrefix;
    try {
      const user = await this.auth.getCurrentUser();
      if (user?.id) {
        prefix = `${pathPrefix}/${user.id}`;
      }
    } catch {
      // ignore; anonymous prefix still allowed by relaxed policy (knowledge/%)
    }
    const uploadPath = `${prefix}/${fileName}`;
    const { data, error } = await this.supabase.client.storage.from(bucket).upload(uploadPath, file, { upsert: false });
    if (error) {
      console.warn('Upload failed', error, 'path:', uploadPath);
      throw error;
    }
    const { data: publicUrlData } = this.supabase.client.storage.from(bucket).getPublicUrl(uploadPath);
    if (!publicUrlData?.publicUrl) {
      throw new Error('Public URL generation failed for uploaded file.');
    }
    return publicUrlData.publicUrl;
  }

  /**
   * Request a short-lived signed URL for a stored public URL or storage path.
   * If a Supabase public URL is provided, the storage path will be extracted and used.
   * Returns a signed URL suitable for embedding in a <video> or <a> tag.
   */
  async getSignedUrlForPublicUrl(publicUrl: string, expiresSec = 300): Promise<string | null> {
    try {
      const path = this.extractStoragePath(publicUrl);
      if (!path) return publicUrl; // fallback to original if not in expected storage format
      const params = new URLSearchParams({ bucket: 'knowledge-attachments', path, expires: String(Math.max(60, Math.min(3600, expiresSec))) });
      const resp = await fetch(`/api/storage/signed-url?${params.toString()}`, { method: 'GET', credentials: 'include' });
      if (!resp.ok) {
        console.warn('Signed URL fetch failed', resp.status);
        return publicUrl;
      }
      const body = await resp.json();
      return body?.url || publicUrl;
    } catch (e) {
      console.warn('getSignedUrlForPublicUrl error', e);
      return publicUrl;
    }
  }

  async createItem(item: { title: string; description: string; category?: string; url?: string; type?: string }) {
    try {
      const user = await this.auth.getCurrentUser();
      const insertObj: any = { ...item, user_id: user?.id };
      Object.keys(insertObj).forEach((k) => insertObj[k as keyof typeof insertObj] === undefined && delete insertObj[k as keyof typeof insertObj]);
      let { data, error } = await this.supabase.client.from('knowledge').insert(insertObj).select().limit(1);
      if (error && (error as any).code === '42703') {
        const minimal = { title: item.title, description: item.description, category: item.category } as any;
        ({ data, error } = await this.supabase.client.from('knowledge').insert(minimal).select().limit(1));
      }
      if (error) throw error;
      let row: any = data?.[0] ?? null;
      try {
        const userId: string | undefined = row?.user_id || user?.id || undefined;
        if (userId) {
          const { data: names, error: nameErr } = await this.supabase.client.rpc('get_user_display_names', { ids: [userId] as any });
          if (!nameErr && Array.isArray(names) && names.length) {
            const match = names.find((n: any) => n.id === userId);
            if (match?.display_name) {
              row = { ...row, displayName: match.display_name };
            }
          }
        }
      } catch { /* ignore enrichment errors */ }
      return row;
    } catch (err) {
      console.warn('Create knowledge item failed', err);
      return null;
    }
  }

  async deleteItem(item: KnowledgeItem): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await this.auth.getCurrentUser();
      if (!user) return { success: false, error: 'Not logged in' };
      try {
        if (item.url) {
          const path = this.extractStoragePath(item.url);
          if (path && (path.startsWith(`knowledge/${user.id}/`) || path.startsWith('knowledge/'))) {
            await this.supabase.client.storage.from('knowledge-attachments').remove([path]);
          }
        }
      } catch {}
      const { error } = await this.supabase.client
        .from('knowledge')
        .delete()
        .eq('id', item.id as string);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Delete failed' };
    }
  }

  private extractStoragePath(publicUrl: string): string | null {
    try {
      const marker = '/storage/v1/object/public/knowledge-attachments/';
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return null;
      return decodeURIComponent(publicUrl.substring(idx + marker.length));
    } catch { return null; }
  }
}
