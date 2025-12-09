import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
// Date adapter for Chart.js time scale
import 'chartjs-adapter-date-fns';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { InsightsService } from '../../core/services/insights.service';
import { SiteConfigService } from '../../core/services/site-config.service';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { PlantingsMapComponent } from '../../shared/ui/plantings-map.component';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule, ...MATERIAL_IMPORTS, PlantingsMapComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Dashboard stats
  activeCount = 0;
  knowledgeCount = 0;
  forumCount = 0;

  // Active challenges for current user
  activeChallenges: Array<any> = [];
  // Challenge to feature in the Active card (most recently joined, preferring incomplete)
  featuredActive: any | null = null;

  // Leaderboard: top users by challenges completed
  leaderboard: Array<{ user_id: string; name: string; score: number; avatarUrl?: string | null }> = [];
  impactScore = 0; // current user's total points across all challenges

  loading = false;
  // Environmental metrics
  treesPlanted = 0;
  treesPlantedSource: string | null = null;
  wildlifeSpecies: string[] = [];
  wildlifeLastUpdated: string | null = null;
  speciesCounts: Array<{ name: string; count: number }> = [];
  private wildlifePollTimer: any = null;
  // Chart.js instance
  private plantingsChart: any = null;
  // Cached series for printing
  plantingsSeries: Array<{ month: string; count: number }> = [];

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private activeChallengesService: ActiveChallengesService
    , private insightsService: InsightsService
    , private siteConfig: SiteConfigService
    , private http: HttpClient
  ) {}

  async ngOnInit() {
    await this.loadDashboard();
    // Start lightweight polling for wildlife updates (every 60s)
    this.wildlifePollTimer = setInterval(() => this.refreshWildlife(), 60 * 1000);
  }

  // Fetch timeseries from server and render Chart.js bar chart into canvas
  private async loadPlantingsTimeseriesAndRender() {
    try {
      // Load from client asset; shape: [{ month: 'YYYY-MM', count: number }]
      const series: Array<{ month: string; count: number }> = await this.http.get('assets/data/plantings-timeseries.json').toPromise().catch(() => []) as any;
      this.plantingsSeries = Array.isArray(series) ? series : [];
      // Ensure we render a full 12-month series (last 12 months) even if server returns sparse data.
      const now = new Date();
      const months: Date[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d);
      }

      // Build a lookup from server series keyed by YYYY-MM to counts
      const lookup: Record<string, number> = {};
      for (const s of (this.plantingsSeries || [])) {
        const month = String(s.month || '');
        const key = month.length === 7 ? month : (month.slice(0,7) || '');
        if (key) lookup[key] = Number(s.count || 0);
      }

      const dataPoints = months.map(d => {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return { x: d, y: lookup[key] || 0 };
      });

      // Dynamic load Chart.js
      try {
        const ChartModule = await import('chart.js/auto');
        const Chart = ChartModule.default || ChartModule;
        const canvas: HTMLCanvasElement | null = document.querySelector('#plantingsChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        if (this.plantingsChart && this.plantingsChart.destroy) this.plantingsChart.destroy();
        // create a vertical gradient for the fill
        const gradient = ctx.createLinearGradient(0, 0, 0, (canvas as HTMLCanvasElement).height || 150);
        gradient.addColorStop(0, 'rgba(40,167,69,0.22)');
        gradient.addColorStop(0.6, 'rgba(40,167,69,0.12)');
        gradient.addColorStop(1, 'rgba(40,167,69,0.04)');

        // eslint-disable-next-line no-unused-vars
        this.plantingsChart = new Chart(ctx, {
          type: 'line',
          data: {
            datasets: [{
              label: 'Plantings',
              data: dataPoints,
              parsing: false,
              fill: true,
              backgroundColor: gradient,
              borderColor: 'rgba(40,167,69,1)',
              pointRadius: 4,
              pointHoverRadius: 6,
              tension: 0.25
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(22,28,23,0.92)',
                titleColor: '#e8f5e9',
                bodyColor: '#fff',
                padding: 10,
                displayColors: false,
                cornerRadius: 8,
                boxPadding: 6,
                callbacks: {
                  title: (items: any[]) => {
                    if (!items || !items.length) return '';
                    const d = items[0].parsed && items[0].parsed.x ? new Date(items[0].parsed.x) : (items[0].parsed && items[0].parsed.t ? new Date(items[0].parsed.t) : null);
                    if (!d) return '';
                    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
                  },
                  label: (ctx: any) => {
                    const v = ctx.parsed && typeof ctx.parsed.y !== 'undefined' ? ctx.parsed.y : ctx.raw && ctx.raw.y ? ctx.raw.y : ctx.raw;
                    return `Plantings: ${Number(v || 0).toLocaleString()}`;
                  }
                }
              }
            },
            scales: {
              x: {
                type: 'time',
                time: { unit: 'month', tooltipFormat: 'MMM yyyy', displayFormats: { month: 'MMM yyyy' } },
                ticks: { autoSkip: true, maxRotation: 0 },
                grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
                min: months[0],
                max: months[months.length-1]
              },
              y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false } }
            }
          }
        });
      } catch (e) {
        // Chart.js not installed — silently skip
      }
    } catch (e) {
      // ignore
    }
  }

  printAnalytics() {
    try {
      const series = this.plantingsSeries && this.plantingsSeries.length ? this.plantingsSeries : [];
      const canvas: HTMLCanvasElement | null = document.querySelector('#plantingsChartCanvas');
      const chartImg = canvas ? (canvas.toDataURL('image/png')) : '';
      const win = window.open('', '_blank');
      if (!win) return;
      const rows = series.map(s => `<tr><td style="padding:6px 10px;border:1px solid #cfcfcf">${s.month}</td><td style="padding:6px 10px;border:1px solid #cfcfcf;text-align:right">${Number(s.count||0).toLocaleString()}</td></tr>`).join('');
      // Compute Plantings Over Time summary stats
      const counts = series.map(s => Number(s.count||0));
      const total = counts.reduce((sum,c)=>sum+c,0);
      const avg = counts.length ? total / counts.length : 0;
      const minVal = counts.length ? Math.min(...counts) : 0;
      const maxVal = counts.length ? Math.max(...counts) : 0;
      const minIdx = counts.length ? counts.indexOf(minVal) : -1;
      const maxIdx = counts.length ? counts.indexOf(maxVal) : -1;
      const minMonth = (minIdx>=0 && series[minIdx]) ? series[minIdx].month : '—';
      const maxMonth = (maxIdx>=0 && series[maxIdx]) ? series[maxIdx].month : '—';
      const lastMonth = series.length ? series[series.length-1].month : '—';
      const lastCount = series.length ? Number(series[series.length-1].count||0) : 0;
      const generatedAt = new Date();
      const dateStr = generatedAt.toLocaleDateString();
      const timeStr = generatedAt.toLocaleTimeString();
      // Focus summary on Plantings Over Time only
      const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>TerraCare — Plantings Analytics</title>
      <style>
      :root{--brand:#2e7d32;--muted:#4b4b4b;--border:#cfcfcf;--bg:#ffffff}
      @page { margin: 15mm 12mm; }
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0;background:var(--bg);}
      .page{padding:18px 22px 72px 22px;}
      header.print-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--brand);padding-bottom:10px;margin-bottom:14px}
      .header-left{display:flex;align-items:center;gap:12px}
      .brand{font-weight:800;color:var(--brand);font-size:19px}
      h1{margin:0;font-size:21px}
      .meta{color:var(--muted);margin-top:4px;font-size:12px}
      .summary{display:grid;grid-template-columns: repeat(3, 1fr); gap:12px; margin:16px 0 18px 0}
      .summary .card{border:1px solid var(--border); border-radius:8px; padding:10px; box-shadow:0 1px 0 rgba(0,0,0,0.04)}
      .summary .label{color:var(--muted);font-size:12px}
      .summary .value{font-weight:600;font-size:16px}
      table{border-collapse:collapse;width:100%;}
      thead th{background:#f5f5f5;border:1px solid var(--border);padding:8px 10px;text-align:left}
      tbody td{border:1px solid var(--border); padding:6px 10px}
      .chart-img{margin:12px 0 18px 0; max-width:100%; border:1px solid #e0e0e0; border-radius:6px}
      footer.print-footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid var(--border);padding:8px 24px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;background:#fff}
      .page-num::after{content: counter(page) " / " counter(pages);}
      @media print { .chart-img { page-break-inside: avoid; } thead{display:table-header-group;} }
      </style></head><body>
      <div class="page">
        <header class="print-header">
          <div class="header-left">
            <div class=\"brand\">TerraCare</div>
            <h1>Plantings Analytics</h1>
          </div>
          <div class="meta">Generated on ${dateStr} at ${timeStr}</div>
        </header>
        <section class="summary">
          <div class="card"><div class="label">Total Plantings</div><div class="value">${Number(total).toLocaleString()}</div></div>
          <div class="card"><div class="label">Average / Month</div><div class="value">${avg.toFixed(1)}</div></div>
          <div class="card"><div class="label">Peak Month</div><div class="value">${maxMonth} — ${Number(maxVal).toLocaleString()}</div></div>
          <div class="card"><div class="label">Lowest Month</div><div class="value">${minMonth} — ${Number(minVal).toLocaleString()}</div></div>
          <div class="card"><div class="label">Last Month</div><div class="value">${lastMonth} — ${Number(lastCount).toLocaleString()}</div></div>
          <div class="card"><div class="label">Months Covered</div><div class="value">${series.length}</div></div>
        </section>
        ${chartImg ? `<img class=\"chart-img\" src=\"${chartImg}\" alt=\"Plantings Chart\"/>` : ''}
        <table>
          <thead><tr><th>Month</th><th>Count</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2" style="padding:10px;border:1px solid var(--border);color:#666">No data</td></tr>'}</tbody>
        </table>
      </div>
      <footer class="print-footer">
        <div>TerraCare — Sustainability Analytics</div>
        <div>Printed: ${dateStr} ${timeStr} · <span class="page-num"></span></div>
      </footer>
      <script>setTimeout(()=>window.print(), 200);</script>
      </body></html>`;
      win.document.write(html);
      win.document.close();
    } catch {}
  }


  async loadDashboard() {
    this.loading = true;
    try {
      // Basic counts (best-effort) — use head queries for counts where possible
      const knowledgeCountRes = await this.supabase.client.from('knowledge').select('id', { count: 'exact', head: true });

      // forum recent posts: fetch posts from last 24 hours for recent activity
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await this.supabase.client.from('posts').select('id,title,content,author_name,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(20);

      // assign counts
      this.knowledgeCount = (knowledgeCountRes.count ?? 0) as number;
      this.forumCount = (recentPosts ?? []).length;

      // Delegate loading user's active challenges to the shared service
      try {
        // Kick off load (best-effort)
        this.activeChallengesService.load().catch(e => console.warn('Could not load active challenges via service', e));
        // Subscribe to keep local state in sync
        this.activeChallengesService.activeCount$.subscribe(cnt => this.activeCount = cnt);
        this.activeChallengesService.activeChallenges$.subscribe(arr => {
          this.activeChallenges = arr || [];
          if (!this.activeChallenges.length) { this.featuredActive = null; return; }
          // Prefer most recent incomplete; else most recent
          const byRecent = [...this.activeChallenges].sort((a,b) => new Date(b.joined_at || 0).getTime() - new Date(a.joined_at || 0).getTime());
          this.featuredActive = byRecent.find(c => (typeof c.progress === 'number' ? c.progress < 100 : true)) || byRecent[0];
        });
      } catch (e) {
        console.warn('ActiveChallengesService subscription failed', e);
      }

      // Leaderboard: prefer RPC that exposes a public-safe leaderboard, then fallback to view/table
      let allScores: any[] = [];
      try {
        // Try RPC
        const rpc = await this.supabase.client.rpc('get_public_leaderboard', { limit_count: 10 });
        if (rpc.data && Array.isArray(rpc.data) && rpc.data.length) {
          // RPC already returns display names; capture for later mapping
          const rpcNames: Record<string, string> = {};
          rpc.data.forEach((r: any) => rpcNames[r.user_id] = r.display_name);
          allScores = rpc.data.map((r: any) => ({ user_id: r.user_id, total_points: r.total_points, _name: rpcNames[r.user_id] }));
        } else {
          // Fallback to view
          const { data: lbRows } = await this.supabase.client.from('leaderboard').select('user_id, total_points');
          if (lbRows) {
            const agg: Record<string, number> = {};
            (lbRows as any[]).forEach((r: any) => { agg[r.user_id] = (agg[r.user_id] || 0) + Number(r.total_points || 0); });
            allScores = Object.entries(agg).map(([user_id, total_points]) => ({ user_id, total_points }));
          } else {
            // fallback: challenge_scores table
            const { data: scoreRows } = await this.supabase.client.from('challenge_scores').select('user_id,total_points');
            allScores = (scoreRows || []) as any[];
          }
        }
      } catch {
        // final fallback sample
        allScores = [ { user_id:'demo1', total_points:25 }, { user_id:'demo2', total_points:18 } ];
      }

      // map recent activity
      this.recentActivity = (recentPosts ?? []).map((p: any) => ({
        type: 'post',
        user: p.author_name || 'Anonymous',
        title: p.title || (p.content ? (p.content as string).slice(0, 60) : 'Post'),
        time: p.created_at,
      }));

      // Build leaderboard from aggregated scores
      const top = allScores
        .map(r => ({ user_id: r.user_id, score: Number(r.total_points || 0) }))
        .sort((a,b) => b.score - a.score)
        .slice(0,6);

      // Resolve display names and avatars via secure RPC (profiles > auth.users metadata > email/id)
      const ids = top.map(t => t.user_id).filter(Boolean);
      const names: Record<string, string> = {};
      // If RPC provided names in allScores, prefer those
      allScores.forEach((s: any) => { if (s._name) names[s.user_id] = s._name; });
      // For any missing, call name RPC
      const missingForNames = ids.filter(id => !names[id]);
      if (missingForNames.length) {
        try {
          const { data: nameRows } = await this.supabase.client.rpc('get_user_display_names', { ids: missingForNames });
          (nameRows || []).forEach((r: any) => names[r.id] = r.display_name);
        } catch {}
      }

      // Also try to resolve avatars from public.profiles
      const avatars: Record<string, string | null> = {};
      try {
        if (ids.length) {
          const { data: profileRows } = await this.supabase.client.from('profiles').select('id, avatar_url').in('id', ids as string[]);
          (profileRows || []).forEach((r: any) => { avatars[r.id] = r.avatar_url || null; });
        }
      } catch (e) {
        // ignore
      }

  this.leaderboard = top.map(t => ({ user_id: t.user_id, name: names[t.user_id] || t.user_id, score: t.score, avatarUrl: avatars[t.user_id] || null }));

      // Load current user's impact score (sum of total_points)
      try {
        const userResp = await this.supabase.client.auth.getUser();
        const user = userResp?.data?.user;
        if(user){
          const { data: lbRows } = await this.supabase.client.from('leaderboard').select('user_id, total_points').eq('user_id', user.id);
          const my = (lbRows || []) as any[];
          this.impactScore = my.reduce((sum, r) => sum + Number(r.total_points || 0), 0);
        } else { this.impactScore = 0; }
      } catch { this.impactScore = 0; }

      // active challenges are loaded via ActiveChallengesService (subscriptions above)

      // Try to fetch trees planted metric and local wildlife insights
      try {
        const trees = await this.insightsService.getTreesPlanted();
        if (trees && typeof trees.count === 'number') {
          this.treesPlanted = trees.count;
          this.treesPlantedSource = (trees as any).source || null;
        }
      } catch (e) {
        // ignore
      }

      // Seed wildlife insights using a configured default location (if available)
      try {
        const cfg = this.siteConfig.localInsights;
        const firstKey = Object.keys(cfg)[0];
        if (firstKey) {
          const loc = (cfg as any)[firstKey];
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            const ins = await this.insightsService.getInsights(loc.lat, loc.lng);
            if (ins) {
              this.wildlifeSpecies = ins.speciesObserved || [];
              this.wildlifeLastUpdated = ins.lastUpdated || null;
            }
          }
        }
      } catch (e) {}

      // Load time-series plantings and render chart
      try {
        await this.loadPlantingsTimeseriesAndRender();
      } catch (e) {}

    } catch (err) {
      console.warn('Dashboard load failed, using fallbacks', err);
      // Fallback sample data
      this.knowledgeCount = this.knowledgeCount || 120;
      this.forumCount = this.forumCount || 15;
      this.activeCount = this.activeCount || 2;
      this.leaderboard = this.leaderboard.length ? this.leaderboard : [
        { user_id: 'u1', name: 'Maria', score: 12 },
        { user_id: 'u2', name: 'Jorge', score: 9 },
        { user_id: 'u3', name: 'Liza', score: 7 },
      ];
    } finally {
      this.loading = false;
    }
  }

  // Quick Actions
  quickJoinChallenge() {
    // Navigate to browse challenges for joining
    this.router.navigate(['/challenges/browse']);
  }
  quickCreatePost() {
    // Navigate to forum where user can create a post (focus draft area)
    this.router.navigate(['/forum'], { queryParams: { new: '1' } });
    // Optionally we could set focus after navigation via a small timeout
  }
  quickAddResource() {
    // Navigate to knowledge hub and show upload form via query param
    this.router.navigate(['/knowledge'], { queryParams: { upload: '1' } });
  }

  // recentActivity for dashboard
  recentActivity: Array<{ type: string; user: string; title: string; time: string }> = [];

  getChallengePercent(ac: any) {
    try {
      const tasks = ac?.tasks ?? [];
      if (!tasks.length) return 0;
      const done = tasks.filter((t: any) => !!t.done).length;
      return Math.round((done / tasks.length) * 100);
    } catch (e) {
      return 0;
    }
  }

  // Join a challenge from the dashboard (same behavior as BrowseChallengesComponent.joinChallenge)
  joinChallenge(c: any) {
    (async () => {
      try {
        const userResp = await this.supabase.client.auth.getUser();
        const user = userResp?.data?.user;
        if (!user) {
          alert('Please sign in to join challenges. Redirecting to login.');
          this.router.navigate(['/login']);
          return;
        }

        const payload = { user_id: user.id, challenge_id: c.id, joined_at: new Date().toISOString() } as any;
        const candidates = ['user_challenges', 'challenge_participants', 'participants'];
        let inserted = false;
        for (const table of candidates) {
          const { data, error } = await this.supabase.client.from(table).insert(payload ? [payload] : []).select().limit(1);
          if (!error) {
            inserted = true;
            break;
          }
        }

        if (inserted) {
          alert(`Joined "${c.title || c.id}" — good luck!`);
        } else {
          // Silent fallback: proceed without showing a toast when local persistence isn't possible
          console.info('Joined locally; could not persist to server (table missing).');
        }

        this.router.navigate(['/challenges/progress']);
      } catch (err) {
        console.warn('Join challenge failed:', err);
        alert('Could not join challenge right now — try again later.');
        this.router.navigate(['/challenges/progress']);
      }
    })();
  }

  // Periodic wildlife refresh
  private async refreshWildlife() {
    try {
      const cfg = this.siteConfig.localInsights;
      const firstKey = Object.keys(cfg)[0];
      if (!firstKey) return;
      const loc = (cfg as any)[firstKey];
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
      const ins = await this.insightsService.getInsights(loc.lat, loc.lng);
      if (ins) {
        this.wildlifeSpecies = ins.speciesObserved || [];
        this.wildlifeLastUpdated = ins.lastUpdated || null;
        this.computeSpeciesCounts();
        this.computeSpeciesCounts();
      }
    } catch (e) {
      // ignore
    }
  }

  private computeSpeciesCounts() {
    const agg: Record<string, number> = {};
    for (const s of (this.wildlifeSpecies || [])) {
      const k = String(s || 'Unknown');
      agg[k] = (agg[k] || 0) + 1;
    }
    const arr = Object.entries(agg).map(([name, count]) => ({ name, count }));
    // sort descending
    arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    this.speciesCounts = arr.slice(0, 10);
  }

  widthPercent(count: number) {
    if (!this.speciesCounts || !this.speciesCounts.length) return 10;
    const max = this.speciesCounts[0].count || 1;
    return Math.min(100, Math.max(2, (count / max) * 100));
  }

  ngOnDestroy() {
    if (this.wildlifePollTimer) {
      clearInterval(this.wildlifePollTimer);
      this.wildlifePollTimer = null;
    }
  }
}
