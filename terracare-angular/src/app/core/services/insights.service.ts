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

  /** Fetch aggregated trees planted metric.
   * Client-only: derive from curated reforestation projects asset or cached value.
   */
  async getTreesPlanted(): Promise<{ count: number; source?: string } | null> {
    try {
      // Prefer a locally maintained dataset under assets (each project may include a planted count)
      const projects: any = await this.http.get('assets/data/reforestation-projects.json').toPromise().catch(() => null);
      if (projects && Array.isArray(projects)) {
        const total = projects.reduce((sum: number, p: any) => sum + (Number(p.planted || p.trees || 0)), 0);
        return { count: total, source: 'assets:data/reforestation-projects.json' };
      }
      // Fallback to a locally cached value if previously stored
      try {
        const raw = localStorage.getItem('metrics:trees-planted');
        if (raw) {
          const n = Number(JSON.parse(raw));
          if (!isNaN(n)) return { count: n, source: 'localStorage' };
        }
      } catch {}
      return { count: 0, source: 'fallback' };
    } catch (e) {
      return { count: 0, source: 'error' };
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
   * Client-only insights aggregation (no serverless):
   * - OpenAQ: PM2.5 → waterQualityIndex
   * - Overpass: mangrove/forest presence → mangroveCoverPct
   * - iNaturalist: speciesObserved list
   */
  async getInsights(lat: number, lng: number, seed?: Partial<NormalizedInsight>): Promise<NormalizedInsight> {
    const key = this.cacheKey(lat, lng);
    const cached = this.readCache(key);
    if (cached) return cached as NormalizedInsight;

    const radiusKm = 10; // search radius
    try {
      const [openaq, inat, overpass] = await Promise.all([
        this.http.get(`https://api.openaq.org/v2/latest?coordinates=${lat},${lng}&radius=${radiusKm*1000}`).toPromise().catch(() => null),
        this.http.get(`https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&order=desc&order_by=observed_on&per_page=30`).toPromise().catch(() => null),
        // Overpass requires POST with text/plain; use fetch directly
        fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: `[out:json][timeout:25];(way["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15});relation["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15}););out body;>;out skel qt;`
        }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null)
      ]);

      // OpenAQ → PM2.5
      let pm25: number | null = null;
      try {
        const results = (openaq as any)?.results || [];
        if (Array.isArray(results) && results.length) {
          for (const r of results) {
            const m = Array.isArray((r as any).measurements) ? (r as any).measurements.find((x: any) => String(x.parameter).toLowerCase() === 'pm25') : null;
            if (m && typeof m.value === 'number') { pm25 = m.value; break; }
          }
        }
      } catch {}
      let waterQualityIndex = 60;
      if (pm25 !== null) waterQualityIndex = Math.max(0, Math.min(100, Math.round(100 - pm25 * 2)));

      // Overpass → mangrove presence heuristic
      const mangroveDetected = !!(overpass && Array.isArray((overpass as any).elements) && (overpass as any).elements.length > 0);
      const mangroveCoverPct = mangroveDetected ? 5 : 0;

      // iNaturalist → species
      let species: string[] = [];
      try {
        const results = (inat as any)?.results || [];
        species = results
          .map((r: any) => r?.taxon?.preferred_common_name || r?.taxon?.name)
          .filter((n: any) => typeof n === 'string' && n.trim().length)
          .reduce((acc: string[], cur: string) => { if (!acc.includes(cur)) acc.push(cur); return acc; }, [])
          .slice(0, 8);
      } catch {}

      const normalized: NormalizedInsight = {
        waterQualityIndex,
        mangroveCoverPct,
        beachCleanlinessRating: seed?.beachCleanlinessRating ?? 3,
        speciesObserved: species,
        lastUpdated: new Date().toISOString(),
      };

      this.saveCache(key, normalized);
      return normalized;
    } catch (e) {
      const fallback: NormalizedInsight = {
        waterQualityIndex: seed?.waterQualityIndex ?? 60,
        mangroveCoverPct: seed?.mangroveCoverPct ?? 0,
        beachCleanlinessRating: seed?.beachCleanlinessRating ?? 3,
        speciesObserved: seed?.speciesObserved ?? [],
        lastUpdated: new Date().toISOString(),
      };
      this.saveCache(key, fallback);
      return fallback;
    }
    }

      // Return raw provider response from server (/api/insights) when needed for inspection
      async getInsightsRaw(lat: number, lng: number): Promise<any> {
        try {
          // Return the normalized form for inspection in a single call
          return await this.getInsights(lat, lng);
        } catch (e) {
          return null;
        }
      }
}
