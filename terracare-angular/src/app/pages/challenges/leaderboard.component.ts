import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../shared/toast/toast.service';

interface LeaderboardRow {
  user_id?: string;
  user?: string; // display name or email
  display_name?: string;
  email?: string;
  points?: number;
  challenge_id?: string;
  challenge_title?: string;
}

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
    <div class="container" style="padding: 16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap: wrap;">
        <h2 style="margin:0;">Leaderboard</h2>
        <div style="display:flex; gap:8px; align-items:center;">
          <mat-form-field appearance="outline">
            <mat-label>Filter by challenge</mat-label>
            <input matInput placeholder="e.g. Tree Planting" (input)="challengeFilter = ($any($event.target).value || '').toLowerCase()" />
          </mat-form-field>
          <button mat-stroked-button (click)="refresh()" [disabled]="loading">Refresh</button>
        </div>
      </div>

      <div *ngIf="loading" style="margin-top:12px;">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      </div>

      <div *ngIf="!loading && filteredRows.length === 0" style="margin-top:16px; color:#666;">
        No leaderboard data yet.
      </div>

      <div style="display:grid; gap:12px; margin-top:16px;">
        <mat-card *ngFor="let row of filteredRows; index as i">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-weight:700; width:2ch; text-align:right;">{{ i + 1 }}</div>
              <div>
                <div style="font-weight:600;">{{ row.display_name || row.user || row.email || 'User' }}</div>
                <div style="font-size: 12px; color:#666;">{{ row.challenge_title || 'All Challenges' }}</div>
              </div>
            </div>
            <div style="font-weight:700;">{{ row.points ?? 0 }} pts</div>
          </div>
        </mat-card>
      </div>
    </div>
  `,
})
export class LeaderboardComponent implements OnInit {
  rows: LeaderboardRow[] = [];
  challengeFilter = '';
  loading = false;

  constructor(private supabase: SupabaseService, private toast: ToastService) {}

  ngOnInit(): void {
    this.refresh();
  }

  get filteredRows(): LeaderboardRow[] {
    const f = this.challengeFilter.trim();
    if (!f) return this.rows;
    return this.rows.filter(r => (r.challenge_title || '').toLowerCase().includes(f));
  }

  async refresh() {
    this.loading = true;
    try {
      const client = this.supabase.client;
      // Prefer a public RPC; fallback to a view named 'leaderboard'; then to 'challenge_scores'
      let data: any[] | null = null;
      let error: any = null;

      // Try RPC first
      try {
        const rpcRes = await client.rpc('get_public_leaderboard', { limit_count: 100 });
        if (Array.isArray(rpcRes.data)) {
          data = rpcRes.data.map((r: any) => ({ user_id: r.user_id, display_name: r.display_name, points: r.total_points, challenge_title: 'All Challenges' }));
        }
      } catch {}

      // If RPC not available or empty, try public.leaderboard view (history-backed)
      if (!data || data.length === 0) {
        ({ data, error } = await client.from('leaderboard').select('*'));
      }
      if (error) {
  // Fallback to a scores table if available
  const fb = await client.from('challenge_scores').select('*');
  data = fb.data;
  error = fb.error;
      }

      if (error) {
        this.toast.show(`Failed to load leaderboard: ${error.message || error}`, 'error');
        this.rows = [];
      } else {
        // Normalize a bit for display
        const items = (data || []).map((d: any) => ({
          user_id: d.user_id ?? d.user,
          display_name: d.display_name ?? d.name ?? undefined,
          email: d.email ?? undefined,
          points: d.points ?? d.score ?? d.total_points ?? 0,
          challenge_id: d.challenge_id ?? undefined,
          challenge_title: d.challenge_title ?? d.title ?? undefined,
        }));

        // Try to enrich missing display names via profiles, then auth.users as a best-effort
        const ids1 = Array.from(new Set(items.map(i => i.user_id).filter(Boolean)));
        const profilesMap: Record<string, any> = {};
        if (ids1.length) {
          try {
            const { data: profiles } = await this.supabase.client.from('profiles').select('id, full_name, username').in('id', ids1).limit(200);
            (profiles ?? []).forEach((p: any) => profilesMap[p.id] = p);
          } catch {}
        }

        // auth.users fallback for any remaining missing
        const usersMap: Record<string, any> = {};
        const missing = ids1.filter(id => !profilesMap[id]);
        if (missing.length) {
          try {
            const { data: users } = await this.supabase.client.from('auth.users').select('id, email, user_metadata').in('id', missing).limit(200);
            (users ?? []).forEach((u: any) => usersMap[u.id] = u);
          } catch {}
        }

        // Aggregate by user to show a single entry per user (sum points across challenges)
        const byUser: Record<string, { points: number }> = {};
        items.forEach(i => { const id = i.user_id || ''; byUser[id] = { points: (byUser[id]?.points || 0) + Number(i.points || 0) }; });

        // Resolve names via RPC first for best cross-schema results
        const ids2 = Object.keys(byUser).filter(Boolean);
        const rpcNames: Record<string, string> = {};
        if (ids2.length) {
          try { const { data: nameRows } = await this.supabase.client.rpc('get_user_display_names', { ids: ids2 }); (nameRows || []).forEach((r: any) => rpcNames[r.id] = r.display_name); } catch {}
        }

        this.rows = ids2.map(id => ({
          user_id: id,
          display_name: rpcNames[id] || profilesMap[id]?.full_name || profilesMap[id]?.username || (usersMap[id]?.user_metadata && (usersMap[id].user_metadata.name || usersMap[id].user_metadata.full_name)) || usersMap[id]?.email || id,
          points: byUser[id].points,
          challenge_id: undefined,
          challenge_title: 'All Challenges'
        })).sort((a,b) => (b.points||0) - (a.points||0));
      }
    } catch (e: any) {
      this.toast.show(`Unexpected error loading leaderboard: ${e?.message || e}`, 'error');
      this.rows = [];
    } finally {
      this.loading = false;
    }
  }
}
 
