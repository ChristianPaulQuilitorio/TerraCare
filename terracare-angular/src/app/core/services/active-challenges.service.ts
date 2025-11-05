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
        this.setFallback();
        return;
      }

      const candidateTables = ['user_challenges', 'challenge_participants', 'participants'];
      let joined: any[] | null = null;
      for (const t of candidateTables) {
        const { data, error } = await this.supabase.client.from(t).select('challenge_id').eq('user_id', user.id).limit(500);
        if (!error && data && data.length) { joined = data as any[]; break; }
      }

      if (!joined) {
        this.setFallback();
        return;
      }

      const challengeIds = Array.from(new Set(joined.map(j => j.challenge_id)));
      const challenges: any[] = [];
      for (const cid of challengeIds) {
        const { data: tasksData } = await this.supabase.client.from('challenge_tasks').select('*').eq('challenge_id', cid).limit(500);
        challenges.push({ id: cid, title: String(cid), tasks: tasksData ?? [] });
      }

      this.activeChallengesSubject.next(challenges);
      this.activeCountSubject.next(Array.from(new Set(challenges.map(c => c.id))).length);
    } catch (err) {
      console.warn('ActiveChallengesService.load failed', err);
      this.setFallback();
    }
  }

  // Allow manual set (useful after local join operations)
  setActiveChallenges(arr: any[]) {
    const unique = Array.from(new Set(arr.map(a => a.id))).map(id => arr.find(a => a.id === id));
    this.activeChallengesSubject.next(unique as any[]);
    this.activeCountSubject.next(unique.length);
  }

  private setFallback() {
    const fallback = [
      { id: 'commute', title: 'Sustainable Commuting', tasks: [{ id: 1, title: 'Walk twice', done: false }] }
    ];
    this.activeChallengesSubject.next(fallback);
    this.activeCountSubject.next(fallback.length);
  }
}
