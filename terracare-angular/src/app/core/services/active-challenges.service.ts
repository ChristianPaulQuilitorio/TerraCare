import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ActiveChallengesService {
  private activeChallengesSubject = new BehaviorSubject<any[]>([]);
  activeChallenges$ = this.activeChallengesSubject.asObservable();

  private activeCountSubject = new BehaviorSubject<number>(0);
  activeCount$ = this.activeCountSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  // Public loader: best-effort fetch of joined challenges and their tasks
  async load() {
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) {
        this.setEmpty();
        return;
      }

      // Source of truth: challenge_participants per schema
      const { data: joined, error: joinErr } = await this.supabase.client
        .from('challenge_participants')
        .select('challenge_id, progress, joined_at')
        .eq('user_id', user.id)
        .limit(500);

      if (joinErr || !joined || !joined.length) {
        this.setEmpty();
        return;
      }

      const challengeIds = Array.from(new Set(joined.map(j => j.challenge_id)));
      // Fetch challenge titles
      let titles: Array<{ id: string; title: string }>|null = null;
      if (challengeIds.length) {
        let { data: chRows, error: chErr } = await this.supabase.client
          .from('challenges')
          .select('id, title, base_points')
          .in('id', challengeIds as any);
        if (chErr) {
          const msg = (chErr.message || '').toLowerCase();
          if (msg.includes('column') && msg.includes('base_points')) {
            const retry = await this.supabase.client
              .from('challenges')
              .select('id, title')
              .in('id', challengeIds as any);
            chRows = retry.data as any[];
          }
        }
        // Cast to any to allow optional base_points without strict typing issues
        titles = (chRows as any[])?.map(r => ({ id: r.id, title: r.title, base_points: (r as any).base_points ?? 10 })) ?? [];
      }
      const titleMap = new Map((titles ?? []).map((t: any) => [String(t.id), { title: t.title, base_points: t.base_points }]));
      // Load tasks for these challenges and per-user completions
  const challenges: any[] = [];
      for (const cid of challengeIds) {
        const { data: tasks } = await this.supabase.client
          .from('challenge_tasks')
          .select('id, title, detail, order_index')
          .eq('challenge_id', cid)
          .order('order_index', { ascending: true });

        const taskIds = (tasks ?? []).map(t => t.id);
        let completions: any[] = [];
        if (taskIds.length) {
          // Some schemas use a unique constraint on (user_id, task_id) without challenge_id.
          // Query by user + task_id list only to ensure we pick up completions regardless of challenge_id column.
          const { data: doneRows } = await this.supabase.client
            .from('user_challenge_tasks')
            .select('task_id, completed')
            .eq('user_id', user.id)
            .in('task_id', taskIds as any);
          completions = doneRows ?? [];
        }

        const tasksWithDone = (tasks ?? []).map(t => ({
          ...t,
          done: !!completions.find(c => c.task_id === t.id && c.completed === true)
        }));

        // Prefer DB participant progress if available; else compute from tasks
        const jp = joined.find(j => j.challenge_id === cid);
        const computed = tasksWithDone.length ? Math.round((tasksWithDone.filter(t => t.done).length / tasksWithDone.length) * 100) : 0;
        const progress = typeof jp?.progress === 'number' ? Number(jp.progress) : computed;

        const meta = titleMap.get(String(cid));
        challenges.push({ id: cid, title: meta?.title || String(cid), base_points: meta?.base_points ?? 10, progress, tasks: tasksWithDone, joined_at: jp?.joined_at || null });
      }

      // Sort by most recently joined first
      challenges.sort((a,b) => new Date(b.joined_at || 0).getTime() - new Date(a.joined_at || 0).getTime());
      this.activeChallengesSubject.next(challenges);
      this.activeCountSubject.next(Array.from(new Set(challenges.map(c => c.id))).length);

      // Ensure realtime subscription is active
      this.ensureRealtime(user.id);
    } catch (err) {
      console.warn('ActiveChallengesService.load failed', err);
      this.setEmpty();
    }
  }

  private channel: ReturnType<SupabaseService['client']['channel']> | null = null;

  private ensureRealtime(userId: string) {
    try {
      // If already subscribed, return
      if (this.channel) return;
      const chan = this.supabase.client
        .channel(`challenge-live-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants', filter: `user_id=eq.${userId}` }, () => this.load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_challenge_tasks', filter: `user_id=eq.${userId}` }, () => this.load())
        .subscribe((status) => {
          // optionally handle status
        });
      this.channel = chan as any;
    } catch (e) {
      console.warn('Realtime subscribe failed', e);
    }
  }

  // Allow manual set (useful after local join operations)
  setActiveChallenges(arr: any[]) {
    const unique = Array.from(new Set(arr.map(a => a.id))).map(id => arr.find(a => a.id === id));
    this.activeChallengesSubject.next(unique as any[]);
    this.activeCountSubject.next(unique.length);
  }

  private setEmpty() {
    this.activeChallengesSubject.next([]);
    this.activeCountSubject.next(0);
  }
}
