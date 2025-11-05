import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  // Dashboard stats
  activeCount = 0;
  knowledgeCount = 0;
  forumCount = 0;

  // Active challenges for current user
  activeChallenges: Array<any> = [];

  // Leaderboard: top users by challenges completed
  leaderboard: Array<{ user_id: string; name: string; score: number }> = [];

  loading = false;

  constructor(private supabase: SupabaseService, private router: Router, private activeChallengesService: ActiveChallengesService) {}

  async ngOnInit() {
    await this.loadDashboard();
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
        this.activeChallengesService.activeChallenges$.subscribe(arr => this.activeChallenges = arr);
      } catch (e) {
        console.warn('ActiveChallengesService subscription failed', e);
      }

      // Fetch all user_challenges rows to build leaderboard counts (best-effort)
      const { data: allUserChallenges } = await this.supabase.client.from('user_challenges').select('*');
      const userChallenges = (allUserChallenges ?? []) as any[];

      // map recent activity
      this.recentActivity = (recentPosts ?? []).map((p: any) => ({
        type: 'post',
        user: p.author_name || 'Anonymous',
        title: p.title || (p.content ? (p.content as string).slice(0, 60) : 'Post'),
        time: p.created_at,
      }));

      // Build leaderboard locally by counting challenge completions per user
      const counts: Record<string, number> = {};
      for (const row of userChallenges) {
        const uid = row.user_id || row.userId || row.user;
        if (!uid) continue;
        counts[uid] = (counts[uid] || 0) + 1;
      }

      const top = Object.entries(counts).map(([user_id, score]) => ({ user_id, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      // Attempt to fetch display names from `profiles` table (common Supabase pattern)
      const ids = top.map(t => t.user_id).filter(Boolean);
      let profilesMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profiles } = await this.supabase.client.from('profiles').select('id, full_name, username').in('id', ids).limit(100);
        (profiles ?? []).forEach((p: any) => profilesMap[p.id] = p);
      }

      this.leaderboard = top.map(t => ({ user_id: t.user_id, name: profilesMap[t.user_id]?.full_name || profilesMap[t.user_id]?.username || t.user_id, score: t.score }));

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
          alert('Joined locally; could not persist to server (table missing).');
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
