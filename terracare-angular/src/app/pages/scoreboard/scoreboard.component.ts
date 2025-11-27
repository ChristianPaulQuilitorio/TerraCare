import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="scoreboard container">
      <h2>Sustainability Scoreboard</h2>
      <p class="muted">Aggregated environmental indicators for the Philippines (automatic external data).</p>

      <div class="cards">
        <div class="card">
          <h3>Biodiversity Health</h3>
          <div class="score">{{ scores.biodiversity ?? '—' }}</div>
          <div class="meta">Recent observations (iNaturalist): {{ meta.biodiversityCount ?? '—' }}</div>
        </div>

        <div class="card">
          <h3>Air Quality (PM2.5)</h3>
          <div class="score">{{ scores.air ?? '—' }}</div>
          <div class="meta">PM2.5 (µg/m³): {{ meta.pm25 ?? '—' }}</div>
        </div>

        <div class="card">
          <h3>Land / Forest Proxy</h3>
          <div class="score">{{ scores.forest ?? '—' }}</div>
          <div class="meta">Forest features nearby: {{ meta.forestCount ?? '—' }}</div>
        </div>
      </div>

      <div style="margin-top:16px; display:flex; gap:8px; align-items:center">
        <button class="tc-btn tc-primary" (click)="refresh()">Refresh</button>
        <div class="muted">Last updated: {{ lastUpdated || 'never' }}</div>
      </div>
    </div>
  `,
  styles: [
    `
    .scoreboard { padding: 18px 0; }
    .cards { display:flex; gap:12px; flex-wrap:wrap; }
    .card { background:#fff; padding:12px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.04); width:240px; }
    .card h3 { margin:0 0 8px 0; }
    .score { font-size:32px; font-weight:700; color:#2E7D32; }
    .meta { margin-top:6px; color:#666; font-size:0.9rem }
    @media (max-width:720px) { .cards { flex-direction:column; } .card { width:100%; } }
    `
  ],
  encapsulation: ViewEncapsulation.None
})
export default class ScoreboardComponent implements OnInit {
  lastUpdated: string | null = null;
  meta: any = { biodiversityCount: null, pm25: null, forestCount: null };
  scores: any = { biodiversity: null, air: null, forest: null };

  // Default center (Philippines centroid)
  private lat = 12.8797;
  private lng = 121.7740;
  private radiusMeters = 50000; // 50km

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.refresh();
  }

  async refresh() {
    this.lastUpdated = null;
    try {
      const lat = this.lat; const lng = this.lng; const radius = this.radiusMeters;
      const q = `?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`;
      const resp: any = await this.http.get(`/api/scoreboard${q}`).toPromise().catch(() => null);
      if (!resp || !resp.ok) {
        this.scores = { biodiversity: 0, air: 0, forest: 0 };
        this.meta = { biodiversityCount: null, pm25: null, forestCount: null };
        this.lastUpdated = new Date().toLocaleString();
        return;
      }
      this.meta = resp.meta || {};
      this.scores = resp.scores || {};
      this.lastUpdated = resp.lastUpdated ? new Date(resp.lastUpdated).toLocaleString() : new Date().toLocaleString();
    } catch (e) {
      console.warn('Scoreboard refresh failed', e);
      this.lastUpdated = new Date().toLocaleString();
    }
  }
}
