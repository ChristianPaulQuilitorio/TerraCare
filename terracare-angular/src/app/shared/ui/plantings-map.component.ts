import { Component, ElementRef, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-plantings-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plantings-map-root">
      <div class="plantings-controls" *ngIf="months && months.length">
        <label for="monthSelect">Show month:</label>
        <select id="monthSelect" (change)="onMonthChange($any($event.target).value)">
          <option value="all">All (last 12 months)</option>
          <option *ngFor="let m of months" [value]="m.key">{{ m.label }}</option>
        </select>
        <label style="margin-left:10px"><input type="checkbox" (change)="toggleHotspots($any($event.target).checked)" [checked]="hotspotsVisible"/> Show deforestation hotspots</label>
        <label style="margin-left:10px"><input type="checkbox" (change)="toggleProjects($any($event.target).checked)" [checked]="projectsVisible"/> Show reforestation projects</label>
      </div>
      <div *ngIf="!leafletAvailable" class="install-note">
        Map library not available. Run: npm install leaflet and restart the dev server to enable interactive map.
      </div>
      <div #mapContainer id="plantings-map" class="map-container" *ngIf="leafletAvailable"></div>
      <div *ngIf="!leafletAvailable" class="sample-legend">
        <h4>Sample plantings</h4>
        <ul>
          <li *ngFor="let f of sample; index as i">{{ f.properties.species }} — {{ f.properties.planted_at }}</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .map-container { height: 420px; width: 100%; border-radius: 6px; }
    .plantings-controls { margin-bottom:8px; display:flex; align-items:center; gap:8px; }
    .plantings-map-root { width: 100%; }
    .install-note { padding: 12px; background:#fff3cd; color:#664d03; border-radius:6px; }
    .sample-legend { padding:8px; }
  `],
  encapsulation: ViewEncapsulation.None
})
export class PlantingsMapComponent implements OnInit, OnDestroy {
  leafletAvailable = false;
  private L: any = null;
  private map: any = null;
  sample: any[] = [];
  months: Array<{ key: string; label: string }> = [];
  currentMonth: string | 'all' = 'all';
  hotspotsLayer: any = null;
  projectsLayer: any = null;
  hotspotsVisible = false;
  projectsVisible = false;

  constructor(private el: ElementRef, private http: HttpClient) {}

  async ngOnInit() {
    // Fetch plantings first
    try {
      const data: any = await this.http.get('/api/plantings').toPromise().catch(() => null);
      if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        this.sample = data.features;
      }
    } catch (e) { this.sample = []; }

    // Fetch timeseries months for the last 12 months if available
    try {
      const ts: any = await this.http.get('/api/metrics/plantings-timeseries').toPromise().catch(() => null);
      if (ts && Array.isArray(ts.series)) {
        this.months = ts.series.map((s: any) => ({ key: s.month, label: s.month }));
      } else {
        // Build a default last-12-months list
        const now = new Date();
        const months: any[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ key, label: key });
        }
        this.months = months;
      }
    } catch (e) { /* ignore */ }

    // Try dynamic import of Leaflet and optional markercluster plugin to avoid forcing hard deps
    try {
      const mod = await import('leaflet');
      this.L = mod.default || mod;
      // add leaflet stylesheet dynamically if not present
      const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      if (!document.querySelector(`link[href="${cssHref}"]`)) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = cssHref; document.head.appendChild(link);
      }

      // Try to load markercluster plugin and its CSS (best-effort)
      try {
        // Prefer a standard dynamic import when the package is installed.
        // This avoids using direct `eval('require')`, which bundlers warn about.
        await import('leaflet.markercluster');
        const mcCss1 = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
        const mcCss2 = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
        if (!document.querySelector(`link[href="${mcCss1}"]`)) { const l1 = document.createElement('link'); l1.rel='stylesheet'; l1.href=mcCss1; document.head.appendChild(l1); }
        if (!document.querySelector(`link[href="${mcCss2}"]`)) { const l2 = document.createElement('link'); l2.rel='stylesheet'; l2.href=mcCss2; document.head.appendChild(l2); }
      } catch (e) {
        // plugin not available; continue without clustering
      }

      this.leafletAvailable = true;
      setTimeout(() => this.initMap(), 50);
    } catch (e) {
      this.leafletAvailable = false;
    }
  }

  private initMap() {
    if (!this.L) return;
    const container = this.el.nativeElement.querySelector('#plantings-map');
    if (!container) return;
    this.map = this.L.map(container).setView([12.8797, 121.7740], 6);
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(this.map);

    // add empty hotspot and project layers
    try {
      this.hotspotsLayer = this.L.geoJSON(null, { style: { color: '#b71c1c', weight: 1, fillOpacity: 0.35 } });
      this.projectsLayer = this.L.geoJSON(null, { pointToLayer: (f: any, latlng: any) => this.L.circleMarker(latlng, { radius: 6, color: '#2e7d32', fillColor: '#66bb6a', fillOpacity: 0.9 }) });
    } catch (e) { this.hotspotsLayer = null; this.projectsLayer = null; }

    // filter features by selected month if any
    let featuresToUse = (this.sample || []).slice();
    if (this.currentMonth && this.currentMonth !== 'all') {
      featuresToUse = featuresToUse.filter((f: any) => {
        const d = f.properties?.planted_at || f.properties?.plantedAt || f.properties?.date || null;
        if (!d) return false;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return false;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        return key === this.currentMonth;
      });
    }
    const geo = { type: 'FeatureCollection', features: featuresToUse };
    const markers: any[] = [];
    // prefer clustering when plugin is available
    const useCluster = !!(this.L && (this.L as any).markerClusterGroup);
    let clusterGroup: any = null;
    if (useCluster) {
      try { clusterGroup = (this.L as any).markerClusterGroup(); } catch (e) { clusterGroup = null; }
    }

    for (const f of geo.features) {
      try {
        const [lng, lat] = f.geometry.coordinates;
        const marker = this.L.marker([lat, lng]);
        const species = f.properties?.species || f.properties?.species || 'Tree';
        const plantedAt = f.properties?.planted_at || f.properties?.plantedAt || '';
        const user = f.properties?.user_id || f.properties?.user || '';
        const popup = `<div style="min-width:140px"><strong>${this.escapeHtml(species)}</strong><div style="font-size:12px;color:#555;">Planted: ${this.escapeHtml(plantedAt)}</div>${user ? `<div style="font-size:12px;color:#666;">By: ${this.escapeHtml(user)}</div>` : ''}</div>`;
        marker.bindPopup(popup);
        if (clusterGroup) {
          clusterGroup.addLayer(marker);
        } else {
          marker.addTo(this.map);
          markers.push(marker);
        }
      } catch (e) { }
    }

    if (clusterGroup) {
      clusterGroup.addTo(this.map);
      try { if (clusterGroup.getBounds && !clusterGroup.getBounds().isValid()) { /* ignore */ } } catch {}
      try { if (clusterGroup.getBounds && clusterGroup.getBounds().isValid()) this.map.fitBounds(clusterGroup.getBounds().pad(0.2)); } catch { }
    } else if (markers.length) {
      const group = this.L.featureGroup(markers);
      this.map.fitBounds(group.getBounds().pad(0.2));
    }

    // Load GIS layers (hotspots and reforestation projects)
    this.loadHotspotsAndProjects();

    // Add layer control
    try {
      const overlays: any = {};
      if (this.hotspotsLayer) overlays['Deforestation hotspots'] = this.hotspotsLayer;
      if (this.projectsLayer) overlays['Reforestation projects'] = this.projectsLayer;
      if (Object.keys(overlays).length) this.L.control.layers({}, overlays, { collapsed: false, position: 'topright' }).addTo(this.map);
    } catch (e) {}
  }

  private async loadHotspotsAndProjects() {
    try {
      // Try server endpoints first; fallback to sample data
      let hotspots: any = null;
      let projects: any = null;
      try { hotspots = await this.http.get('/api/deforestation-hotspots').toPromise().catch(() => null); } catch (e) { hotspots = null; }
      try { projects = await this.http.get('/api/reforestation-projects').toPromise().catch(() => null); } catch (e) { projects = null; }

      if (!hotspots) {
        hotspots = { type: 'FeatureCollection', features: [
          { type: 'Feature', properties: { name: 'Likely hotspot' }, geometry: { type: 'Polygon', coordinates: [[[121.0, 12.0],[121.2,12.0],[121.2,12.2],[121.0,12.2],[121.0,12.0]]] } }
        ] };
      }
      if (!projects) {
        projects = { type: 'FeatureCollection', features: [
          { type: 'Feature', properties: { name: 'Reforest Project A' }, geometry: { type: 'Point', coordinates: [120.9822, 14.6042] } }
        ] };
      }

      if (this.hotspotsLayer && hotspots && hotspots.type === 'FeatureCollection') {
        this.hotspotsLayer.clearLayers();
        this.hotspotsLayer.addData(hotspots);
        if (this.hotspotsVisible) this.hotspotsLayer.addTo(this.map);
      }
      if (this.projectsLayer && projects && projects.type === 'FeatureCollection') {
        this.projectsLayer.clearLayers();
        this.projectsLayer.addData(projects);
        if (this.projectsVisible) this.projectsLayer.addTo(this.map);
      }
    } catch (e) { console.warn('loadHotspotsAndProjects failed', e); }
  }

  onMonthChange(key: string) {
    this.currentMonth = key || 'all';
    // re-render markers by reusing sample and filtering by month
    try {
      // remove existing map layers and re-init markers portion
      if (this.map) {
        // remove all markers and re-add
        // Simplest approach: remove and rebuild map markers by clearing and calling initMap again
        try { this.map.remove(); } catch (e) {}
        setTimeout(() => this.initMap(), 10);
      }
    } catch (e) {}
  }

  toggleHotspots(visible: boolean) {
    this.hotspotsVisible = !!visible;
    try { if (this.hotspotsLayer) { if (this.hotspotsVisible) this.hotspotsLayer.addTo(this.map); else this.map.removeLayer(this.hotspotsLayer); } } catch (e) {}
  }

  toggleProjects(visible: boolean) {
    this.projectsVisible = !!visible;
    try { if (this.projectsLayer) { if (this.projectsVisible) this.projectsLayer.addTo(this.map); else this.map.removeLayer(this.projectsLayer); } } catch (e) {}
  }

  private escapeHtml(s: string) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" } as any)[c]);
  }

  ngOnDestroy() {
    try { if (this.map && this.map.remove) this.map.remove(); } catch (e) {}
  }
}
