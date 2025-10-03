import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { KnowledgeItem } from '../models/knowledge-item.model';
import { SiteConfigService } from './site-config.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  private site = inject(SiteConfigService);
  private supabase = inject(SupabaseService);

  getAll(): Observable<KnowledgeItem[]> {
    // On the server (SSR/prerender), avoid network calls and return seed data
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return of(this.site.knowledgeItems);

    return from(
      this.supabase.client
        .from('knowledge')
        .select('title, description, category')
        .order('title', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as KnowledgeItem[];
      }),
      catchError((_err) => of(this.site.knowledgeItems))
    );
  }
}
