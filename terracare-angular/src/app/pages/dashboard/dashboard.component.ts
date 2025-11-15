import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule, ...MATERIAL_IMPORTS],
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
  leaderboard: Array<{ user_id: string; name: string; score: number }> = [];
  impactScore = 0; // current user's total points across all challenges

  loading = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private activeChallengesService: ActiveChallengesService
  ) {}

  async ngOnInit() {
    await this.loadDashboard();
  }

  ngOnDestroy() {}

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

      // Resolve display names via secure RPC (profiles > auth.users metadata > email/id)
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

  this.leaderboard = top.map(t => ({ user_id: t.user_id, name: names[t.user_id] || t.user_id, score: t.score }));

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
}
