import { Component, ElementRef, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-plantings-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plantings-map-root">
      <div class="plantings-controls">
        <label>
          Region:
          <select (change)="onRegionChange($any($event.target).value)">
            <option value="ph">Philippines</option>
            <option value="sea">Southeast Asia</option>
            <option value="global">Global (large)</option>
          </select>
        </label>
        <label style="margin-left:10px">
          Recent alerts:
          <select (change)="onDaysChange($any($event.target).value)">
            <option value="1">Last 24h</option>
            <option value="3" selected>Last 3 days</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
          </select>
        </label>
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
  firesLayer: any = null;
  gainTile: any = null; // deprecated: GFW gain
  worldCoverTile: any = null;
  hotspotsVisible = false;
  projectsVisible = false;
  firesVisible = false;
  gainVisible = false; // deprecated: GFW gain
  worldCoverVisible = false;
  // FIRMS controls
  region: 'ph' | 'sea' | 'global' = 'ph';
  recentDays = 3;

  constructor(private el: ElementRef, private http: HttpClient) {}

  async ngOnInit() {
    // Fetch plantings first
    try {
      // If you have a local static GeoJSON, load it here (optional)
      // Otherwise skip populating sample; map focuses on hotspots/projects
      this.sample = [];
    } catch (e) { this.sample = []; }

    // Removed month filter UI; keep controls minimal per request

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
    
    // preset icons
    const TreeIcon = this.L.icon({
      iconUrl: 'assets/icons/tree-marker.svg',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -24],
      className: 'marker-tree'
    });
    const ProjectIcon = this.L.icon({
      iconUrl: 'assets/icons/project-marker.svg',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -24],
      className: 'marker-project'
    });
    const HotspotIcon = this.L.icon({
      iconUrl: 'assets/icons/hotspot-marker.svg',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -26],
      className: 'marker-hotspot'
    });

    // add empty hotspot and project layers
    try {
      this.hotspotsLayer = this.L.geoJSON(null, {
        pointToLayer: (_f: any, latlng: any) => this.L.marker(latlng, { icon: HotspotIcon }),
        onEachFeature: (feature: any, layer: any) => {
          const p = feature?.properties || {};
          const title = p.name || p.title || 'Deforestation hotspot';
          const when = p.date || p.observed || p.updated || '';
          const desc = p.description || p.source || '';
          const tooltip = `<strong>${this.escapeHtml(title)}</strong>${when ? `\n${this.escapeHtml(when)}` : ''}${desc ? `\n${this.escapeHtml(desc)}` : ''}`;
          try { layer.bindTooltip(tooltip, { direction: 'top', sticky: true }); } catch {}
          try { layer.bindPopup(`<div><strong>${this.escapeHtml(title)}</strong>${when ? `<div>${this.escapeHtml(when)}</div>` : ''}${desc ? `<div>${this.escapeHtml(desc)}</div>` : ''}</div>`); } catch {}
        }
      });
      this.projectsLayer = this.L.geoJSON(null, {
        pointToLayer: (_f: any, latlng: any) => this.L.marker(latlng, { icon: ProjectIcon }),
        onEachFeature: (feature: any, layer: any) => {
          const p = feature?.properties || {};
          const title = p.name || 'Reforestation project';
          const status = p.status || p.phase || '';
          const partner = p.partner || p.org || '';
          const started = p.start || p.startDate || '';
          const tooltip = `<strong>${this.escapeHtml(title)}</strong>${status ? `\n${this.escapeHtml(status)}` : ''}${partner ? `\n${this.escapeHtml(partner)}` : ''}`;
          try { layer.bindTooltip(tooltip, { direction: 'top', sticky: true }); } catch {}
          try { layer.bindPopup(`<div><strong>${this.escapeHtml(title)}</strong>${status ? `<div>${this.escapeHtml(status)}</div>` : ''}${partner ? `<div>${this.escapeHtml(partner)}</div>` : ''}${started ? `<div>${this.escapeHtml(started)}</div>` : ''}</div>`); } catch {}
        }
      });
      this.firesLayer = this.L.geoJSON(null, { pointToLayer: (_f: any, latlng: any) => this.L.circleMarker(latlng, { radius: 5, color: '#ff6f00', fillColor: '#ff8f00', fillOpacity: 0.9 }) });
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
    // Removed fires/world cover from UI

    // Add layer control
    try {
      const overlays: any = {};
      if (this.hotspotsLayer) overlays['Deforestation hotspots'] = this.hotspotsLayer;
      if (this.projectsLayer) overlays['Reforestation projects'] = this.projectsLayer;
      // Only deforestation hotspots and reforestation projects remain
      if (Object.keys(overlays).length) this.L.control.layers({}, overlays, { collapsed: false, position: 'topright' }).addTo(this.map);
    } catch (e) {}
  }

  private async loadHotspotsAndProjects() {
    try {
      // Use real NASA FIRMS alerts for deforestation proxy; projects from assets
      let hotspots: any = null;
      let projects: any = null;
      try {
        const bbox = this.getBboxByRegion(this.region);
        const url = `https://firms.modaps.eosdis.nasa.gov/mapserver/wfs/viirs?service=WFS&request=GetFeature&version=1.1.0&typeName=viirs_viirs&outputFormat=application/json&BBOX=${bbox}`;
        hotspots = await fetch(url).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null);
        // Normalize properties for tooltip/popup
        if (hotspots && hotspots.type === 'FeatureCollection') {
          hotspots.features = (hotspots.features || [])
            .filter((f: any) => this.filterByRecentDays(f, this.recentDays))
            .map((f: any) => {
            const p = f.properties || {};
            const n = p?.bright_ti4 ? `Fire ${p.bright_ti4}` : 'Active fire';
            return { ...f, properties: { name: n, date: p?.acq_date || p?.date || '', source: 'NASA FIRMS (VIIRS)' } };
          });
        }
      } catch (e) { hotspots = null; }
      try {
        // Prefer local curated dataset to improve accuracy when server not available
        projects = await this.http.get('assets/data/reforestation-projects.json').toPromise().catch(() => null);
        if (projects && Array.isArray(projects)) {
          // Convert simple array to GeoJSON FeatureCollection
          const feats = projects.map((p: any) => ({ type: 'Feature', properties: { name: p.name, status: p.status, partner: p.partner, start: p.start }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }));
          projects = { type: 'FeatureCollection', features: feats };
        }
      } catch (e) { projects = null; }

      // If FIRMS unavailable, keep minimal fallback empty collection
      if (!hotspots) { hotspots = { type: 'FeatureCollection', features: [] }; }
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

  private getBboxByRegion(region: 'ph' | 'sea' | 'global'): string {
    switch (region) {
      case 'ph': return '114.0,4.0,127.0,21.0';
      case 'sea': return '90.0,-12.0,150.0,25.0';
      case 'global': return '-180.0,-85.0,180.0,85.0';
      default: return '114.0,4.0,127.0,21.0';
    }
  }

  private filterByRecentDays(feature: any, days: number): boolean {
    try {
      const p = feature?.properties || {};
      const dStr = p.acq_date || p.date || '';
      if (!dStr) return true; // keep if unknown
      const dt = new Date(dStr);
      if (isNaN(dt.getTime())) return true;
      const now = new Date();
      const diff = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= days;
    } catch { return true; }
  }

  onRegionChange(val: string) {
    if (val === 'ph' || val === 'sea' || val === 'global') {
      this.region = val;
      this.reloadHotspots();
    }
  }

  onDaysChange(val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      this.recentDays = n;
      this.reloadHotspots();
    }
  }

  private async reloadHotspots() {
    try {
      await this.loadHotspotsAndProjects();
    } catch {}
  }

  // FIRMS loader removed per request

  // WorldCover tile init removed per request

  // Month change removed per request

  toggleHotspots(visible: boolean) {
    this.hotspotsVisible = !!visible;
    try { if (this.hotspotsLayer) { if (this.hotspotsVisible) this.hotspotsLayer.addTo(this.map); else this.map.removeLayer(this.hotspotsLayer); } } catch (e) {}
  }

  toggleProjects(visible: boolean) {
    this.projectsVisible = !!visible;
    try { if (this.projectsLayer) { if (this.projectsVisible) this.projectsLayer.addTo(this.map); else this.map.removeLayer(this.projectsLayer); } } catch (e) {}
  }

  // Fires toggle removed per request

  // WorldCover toggle removed per request

  private escapeHtml(s: string) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" } as any)[c]);
  }

  ngOnDestroy() {
    try { if (this.map && this.map.remove) this.map.remove(); } catch (e) {}
  }
}
