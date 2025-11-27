import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface NormalizedInsight {
  waterQualityIndex: number;
  mangroveCoverPct: number;
  beachCleanlinessRating: number;
  speciesObserved: string[];
  lastUpdated: string;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class InsightsService {
  // Simple TTL cache in localStorage (keyed by lat,lng)
  private cacheTtlMs = 30 * 60 * 1000; // 30 minutes

  constructor(private http: HttpClient) {}

  private cacheKey(lat: number, lng: number) { return `insights:${lat.toFixed(4)}:${lng.toFixed(4)}`; }

  private saveCache(key: string, data: any) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  /** Fetch aggregated trees planted metric from server */
  async getTreesPlanted(): Promise<{ count: number; source?: string } | null> {
    try {
      const url = `/api/metrics/trees-planted`;
      const resp: any = await this.http.get(url).toPromise();
      if (!resp) return null;
      // normalize: allow resp.count or resp
      if (typeof resp.count === 'number') return { count: resp.count, source: resp.source };
      if (typeof resp === 'number') return { count: resp };
      if (resp && typeof resp === 'object' && typeof resp.total === 'number') return { count: resp.total };
      return null;
    } catch (e) {
      return null;
    }
  }

  private readCache(key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) return null;
      return parsed.data;
    } catch { return null; }
  }

  /**
   * Fetch and normalize insights for a coordinate.
   * Uses iNaturalist (species), Overpass (mangrove presence), OpenAQ (aq) — falls back to provided seed values.
   */
  async getInsights(lat: number, lng: number, seed?: Partial<NormalizedInsight>): Promise<NormalizedInsight> {
    const key = this.cacheKey(lat, lng);
    const cached = this.readCache(key);
    if (cached) return cached as NormalizedInsight;

    // Parallel requests
    const radiusKm = 10; // search radius
    const iNatUrl = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&order=desc&order_by=observed_on&per_page=20`;
        // Prefer server-side aggregated endpoint to avoid CORS and centralize logic
        try {
          const url = `/api/insights?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
          const resp: any = await this.http.get(url).toPromise().catch(() => null);
          const data = resp || {};

          const normalized: NormalizedInsight = {
            waterQualityIndex: Number(data.waterQualityIndex ?? seed?.waterQualityIndex ?? 60),
            mangroveCoverPct: Number(data.mangroveCoverPct ?? seed?.mangroveCoverPct ?? 0),
            beachCleanlinessRating: Number(data.beachCleanlinessRating ?? seed?.beachCleanlinessRating ?? 3),
            speciesObserved: Array.isArray(data.speciesObserved) ? data.speciesObserved.map(String).slice(0, 8) : (seed?.speciesObserved ?? []),
            lastUpdated: String(data.lastUpdated ?? new Date().toISOString()),
            note: data.note ?? seed?.note,
          };

          this.saveCache(key, normalized);
          return normalized;
        } catch (e) {
          // Fallback to seed values when server is unreachable
          const fallback: NormalizedInsight = {
            waterQualityIndex: seed?.waterQualityIndex ?? 60,
            mangroveCoverPct: seed?.mangroveCoverPct ?? 0,
            beachCleanlinessRating: seed?.beachCleanlinessRating ?? 3,
            speciesObserved: seed?.speciesObserved ?? [],
            lastUpdated: new Date().toISOString(),
            note: seed?.note
          };
          this.saveCache(key, fallback);
          return fallback;
            }
    }

      // Return raw provider response from server (/api/insights) when needed for inspection
      async getInsightsRaw(lat: number, lng: number): Promise<any> {
        try {
          const url = `/api/insights?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
          const resp: any = await this.http.get(url).toPromise();
          return resp;
        } catch (e) {
          return null;
        }
      }
}
