import { Component, ElementRef, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ToastService } from '../../shared/toast/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-incidents',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule],
  template: `
    <div class="incidents-page container">
      <h2>Incident Reporting & Map</h2>
      <p class="muted">Report illegal logging, land degradation, or wildlife threats. Click the map to set the incident location.</p>
      <div class="incidents-grid">
        <div class="map-pane">
          <div *ngIf="!leafletAvailable" class="install-note">Map library not available. Run npm install leaflet and restart the dev server to enable the map.</div>
          <div id="incidents-map" class="map" #mapContainer *ngIf="leafletAvailable"></div>
          <hr />
          <h4>Recent Reports</h4>
          <div *ngIf="incidents.length === 0" class="muted">No reports yet.</div>
          <ul class="reports-list">
            <li *ngFor="let r of incidents">
              <strong>{{ r.title }}</strong>
              <div class="muted small">{{ r.type }} — {{ r.createdAt | date:'medium' }}</div>
              <div class="desc">{{ r.description }}</div>
              <div *ngIf="r.image_url" style="margin-top:8px;">
                <img [src]="r.image_url" alt="report image" style="max-width:120px; border-radius:6px; display:block;" />
              </div>
              <div style="margin-top:8px; display:flex; gap:8px;">
                <button class="secondary" (click)="openDeleteModal(r)">Delete</button>
              </div>
            </li>
          </ul>
        </div>
        <div class="form-pane">
          <form [formGroup]="form" (ngSubmit)="submit()">
            <label>Type</label>
            <select formControlName="type">
              <option value="illegal_logging">Illegal logging</option>
              <option value="land_degradation">Land degradation</option>
              <option value="wildlife_threat">Wildlife threat</option>
              <option value="other">Other</option>
            </select>

            <label>Title</label>
            <input formControlName="title" placeholder="Short title" />

            <label>Description</label>
            <textarea formControlName="description" rows="6" placeholder="Describe what you observed"></textarea>

              <label>Location (click map to pick a place)</label>
              <input formControlName="location" placeholder="Location (populated from map)" />

            <label>Photo (optional)</label>
            <input type="file" accept="image/*" (change)="onFileSelected($event)" />
            <div *ngIf="previewUrl" style="margin-top:8px;"><img [src]="previewUrl" style="max-width:100%; border-radius:6px; border:1px solid #eee;" /></div>

            <div class="actions">
              <button type="submit" [disabled]="form.invalid">Report Incident</button>
              <button type="button" class="secondary" (click)="clearForm()">Clear</button>
            </div>
          </form>
          

          <!-- Deletion modal -->
          <div class="tc-modal-backdrop" *ngIf="deleteModalVisible">
            <div class="tc-modal">
              <h3>Delete report</h3>
              <p>Please provide a reason for deleting this report (optional):</p>
              <textarea [(ngModel)]="deleteReason" rows="4" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ddd;"></textarea>
              <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
                <button (click)="confirmDelete()" style="background:#d32f2f; color:#fff; padding:8px 12px; border-radius:6px; border:none;">Confirm Delete</button>
                <button class="secondary" (click)="cancelDelete()">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
    .incidents-page { padding: 20px 0; }
    .incidents-grid { display: grid; grid-template-columns: 1fr 380px; gap: 18px; align-items: start; }
    .map { height: 520px; border-radius: 8px; overflow: hidden; }
    .install-note { padding:12px; background:#fff3cd; border-radius:6px; }
    form { display:flex; flex-direction:column; gap:8px; }
    label { font-weight:600; color:#2E7D32; }
    input, textarea, select { padding:10px 12px; border-radius:8px; border:1px solid #dfeee0; font-size:0.95rem; }
    input:focus, textarea:focus, select:focus { outline: 2px solid rgba(46,125,50,0.14); }
    .coords { display:flex; gap:8px; }
    .coords input { flex:1; }
    .actions { display:flex; gap:8px; margin-top:6px; }
    .actions button { padding:10px 14px; border-radius:8px; border:none; cursor:pointer; font-weight:600; }
    .actions .secondary { background:#eee; }
    .reports-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
    .reports-list li { background:#fff; padding:10px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.04); }
    .desc { margin-top:6px; color:#333; }
    /* Modal styles (unique to incidents component to avoid global .modal collisions) */
    .tc-modal-backdrop { position:fixed; left:0; right:0; top:0; bottom:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:10000; }
    .tc-modal { background:#fff; padding:16px; border-radius:8px; width:480px; max-width:92%; box-shadow:0 6px 24px rgba(0,0,0,0.3); }

    /* Responsive behavior */
    @media (max-width: 920px) {
      .incidents-grid { grid-template-columns: 1fr; }
      .map { height:360px; }
      .form-pane { order: 2; }
    }

    @media (max-width: 560px) {
      .map { height: 260px; }
      input, textarea, select { width: 100%; }
      .actions { flex-direction: column; }
      .actions button { width: 100%; }
      .reports-list li { padding:12px; }
    }
    `
  ],
  encapsulation: ViewEncapsulation.None
})
export class IncidentsComponent implements OnInit {
  leafletAvailable = false;
  private L: any = null;
  private map: any = null;
  incidents: any[] = [];
  deleteModalVisible = false;
  deleteTarget: any = null;
  deleteReason = '';
  form = this.fb.group({ type: ['illegal_logging', Validators.required], title: ['', Validators.required], description: ['', Validators.required], location: ['', Validators.required] });

  // File upload state
  selectedFile: File | null = null;
  previewUrl: string | null = null;

  constructor(private fb: FormBuilder, private http: HttpClient, private el: ElementRef, private toast: ToastService, private supabase: SupabaseService) {}

  openDeleteModal(r: any) {
    this.deleteTarget = r;
    this.deleteReason = '';
    this.deleteModalVisible = true;
  }

  cancelDelete() {
    this.deleteModalVisible = false;
    this.deleteTarget = null;
    this.deleteReason = '';
  }

  async confirmDelete() {
    if (!this.deleteTarget) return this.cancelDelete();
    const id = String(this.deleteTarget?.id ?? '');
    if (!id) {
      this.toast.show('Unable to delete: missing id', 'error');
      return this.cancelDelete();
    }
    try {
      // Prepare optional auth header from Supabase client session
      let headers: any = {};
      try {
        const sess = await this.supabase.client.auth.getSession();
        const token = sess?.data?.session?.access_token || null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}

      // Use HttpClient.request to allow a body with DELETE and include auth when available
      const resp: any = await this.http.request('delete', `/api/incidents/${encodeURIComponent(id)}`, { body: { reason: this.deleteReason }, headers }).toPromise().catch((e) => ({ __error: true, e }));
      if (resp && resp.__error) {
        this.toast.show('Failed to delete report', 'error');
        return;
      }
      if (resp && resp.error) {
        const msg = resp.error || 'Failed to delete report';
        this.toast.show(String(msg), 'error');
        return;
      }
      // remove from UI list
      this.incidents = this.incidents.filter(i => String(i.id) !== String(id));
      this.toast.show('Report deleted', 'success');
      this.cancelDelete();
    } catch (e) {
      this.toast.show('Failed to delete report', 'error');
      this.cancelDelete();
    }
  }

  async ngOnInit() {
    // Try to load leaflet dynamically
    try {
      const mod = await import('leaflet');
      this.L = mod.default || mod;
      const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      if (!document.querySelector(`link[href="${cssHref}"]`)) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = cssHref; document.head.appendChild(link);
      }
      this.leafletAvailable = true;
      setTimeout(() => this.initMap(), 60);
    } catch (e) {
      this.leafletAvailable = false;
    }

    // Load recent incidents from server (best-effort) and normalize timestamp field
    try {
      const data: any = await this.http.get('/api/incidents').toPromise().catch(() => null);
      if (Array.isArray(data)) {
        this.incidents = data.map((r: any) => ({ ...r, createdAt: r.created_at || r.createdAt || (r.createdAtRaw || new Date().toISOString()) }));
      }
    } catch (e) {
      // ignore - we'll show empty list
    }
  }

  private initMap() {
    if (!this.L) return;
    const container = this.el.nativeElement.querySelector('#incidents-map');
    this.map = this.L.map(container).setView([12.8797, 121.7740], 6);
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(this.map);

    // show existing incidents
    for (const inc of this.incidents) {
      try {
        if (inc.lat && inc.lng) {
          const m = this.L.marker([Number(inc.lat), Number(inc.lng)]).addTo(this.map);
          m.bindPopup(`<strong>${this.escape(inc.title)}</strong><div style="font-size:12px">${this.escape(inc.type)}</div>`);
        }
      } catch (e) {}
    }

    // click to set location: reverse geocode to a human-readable place name and populate the form
    this.map.on('click', async (ev: any) => {
      const lat = ev.latlng.lat; const lng = ev.latlng.lng;
      // place a temporary marker
      try { if (this.tempMarker) this.tempMarker.remove(); } catch {}
      this.tempMarker = this.L.marker([lat, lng]).addTo(this.map);
      // reverse geocode using Nominatim (best-effort, free)
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'TerraCare/1.0 (+https://example.com)' } });
        if (resp && resp.ok) {
          const data = await resp.json();
          const display = data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          this.form.patchValue({ location: display });
        } else {
          this.form.patchValue({ location: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
        }
      } catch (e) {
        this.form.patchValue({ location: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
      }
    });
  }

  private tempMarker: any = null;

  private escape(s: string) { if (!s) return ''; return String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' } as any)[c]); }

  async submit() {
    if (this.form.invalid) return;
    // Only submit human-readable location text (location) as location_text; avoid sending raw lat/lng
    const fv = this.form.value || {};
    // Build FormData for multipart/form-data submission (includes optional file)
    const formData = new FormData();
    formData.append('type', String(fv.type ?? ''));
    formData.append('title', String(fv.title ?? ''));
    formData.append('description', String(fv.description ?? ''));
    formData.append('location_text', String(fv.location ?? ''));
    if (this.selectedFile) formData.append('image', this.selectedFile, this.selectedFile.name);

    try {
      // Attach Authorization header if a Supabase session exists so server can set user_id
      let headers: any = {};
      try {
        const sess = await this.supabase.client.auth.getSession();
        const token = sess?.data?.session?.access_token || null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}

      const resp: any = await this.http.post('/api/incidents', formData, { headers }).toPromise().catch((err) => ({ __error: true, message: (err && err.message) || 'request_failed' }));
      if (resp && resp.__error) {
        this.toast.show('Could not submit report right now.', 'error');
        return;
      }
      const row = resp && resp.id ? ({ ...resp, createdAt: resp.created_at || resp.createdAt || new Date().toISOString() }) : ({ id: `dev-${Date.now()}`, type: fv.type, title: fv.title, description: fv.description, location_text: fv.location, createdAt: new Date().toISOString() });
      this.incidents.unshift(row as any);
      this.toast.show('Incident reported — thank you.', 'success');
      this.clearForm();
    } catch (e) {
      this.toast.show('Could not submit report right now.', 'error');
    }
  }

  onFileSelected(ev: any) {
    try {
      const f = (ev.target && ev.target.files && ev.target.files[0]) ? ev.target.files[0] : null;
      if (!f) {
        this.selectedFile = null; this.previewUrl = null; return;
      }
      this.selectedFile = f;
      // Create a preview (data URL)
      const reader = new FileReader();
      reader.onload = () => { this.previewUrl = String(reader.result || ''); };
      reader.readAsDataURL(f);
    } catch (e) {
      this.selectedFile = null; this.previewUrl = null;
    }
  }
  clearForm() {
    this.form.reset({ type: 'illegal_logging', title: '', description: '', location: '' });
    try { if (this.tempMarker) this.tempMarker.remove(); } catch {}
    // Clear selected file and preview and reset file input element
    this.selectedFile = null;
    this.previewUrl = null;
    try {
      const fileInput: HTMLInputElement | null = this.el.nativeElement.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
    } catch (e) {}
  }
}
