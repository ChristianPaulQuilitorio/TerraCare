import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-challenge-progress',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  template: `
    <app-navbar></app-navbar>
    <main class="progress-page container">
      <header class="progress-header">
        <div>
          <h1>My Challenge Progress</h1>
          <p class="subtitle">Track progress, milestones, and impact for your active challenges</p>
        </div>
        <div class="header-actions">
          <button class="btn" routerLink="/challenges">Back</button>
          <button class="btn btn-primary">Share Progress</button>
        </div>
      </header>

      <section class="progress-summary">
        <div class="summary-cards">
          <div class="card" *ngIf="activeCount">
            <h4>Active</h4>
            <p class="muted">{{ activeCount }} challenge(s)</p>
          </div>
          <div class="card">
            <h4>Impact Score</h4>
            <p class="number">720</p>
          </div>
          <div class="card">
            <h4>Average Progress</h4>
            <p class="number">{{progress}}%</p>
          </div>
        </div>

        <div class="overall-progress card">
          <h4>Overall Progress</h4>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="progress"></div>
          </div>
          <p class="muted">{{progress}}% complete</p>
        </div>
      </section>

      <section class="milestones">
        <h3>Active Challenges</h3>
        <ul>
          <li *ngFor="let ac of activeChallenges">
            <div class="milestone-left">
              <strong>{{ac.title}}</strong>
              <p class="muted">{{ac.tasks?.length || 0}} tasks</p>
              <div class="progress-bar small">
                <div class="progress-fill" [style.width.%]="getChallengePercent(ac)"></div>
              </div>
            </div>
            <div class="milestone-right">
              <div *ngIf="ac.tasks?.length">
                <ul class="task-list">
                  <li *ngFor="let t of ac.tasks">
                    <label><input type="checkbox" [checked]="!!t.done" (change)="toggleTask(ac, t)" /> {{t.title}}</label>
                  </li>
                </ul>
              </div>
              <div *ngIf="!(ac.tasks?.length)">No tasks available</div>
            </div>
          </li>
        </ul>
      </section>
    </main>
  `,
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengeProgressComponent implements OnInit {
  progress = 0;
  loading = false;
  // activeChallenges holds challenges the user joined with optional tasks
  activeChallenges: Array<any> = [];
  // number of distinct active challenges the user has joined
  activeCount = 0;

  // fallback sample milestones (used when DB not available)
  milestones = [
    { id: 1, title: 'Week 1: Try walking', desc: 'Walk or bike twice this week', done: true },
    { id: 2, title: 'Week 2: Swap a car trip', desc: 'Replace 1 short drive with walking', done: false },
    { id: 3, title: 'Week 3: Track commute', desc: 'Log trips for one week', done: false }
  ];

  constructor(private supabase: SupabaseService, private route: ActivatedRoute, private activeChallengesService: ActiveChallengesService) {}

  async ngOnInit() {
    const requestedId = this.route.snapshot.queryParamMap.get('id');

    // Subscribe to the shared active challenges list
    this.activeChallengesService.activeCount$.subscribe(cnt => this.activeCount = cnt);
    this.activeChallengesService.activeChallenges$.subscribe(arr => {
      this.activeChallenges = arr || [];
      // If a specific challenge id was requested, focus on it
      if (requestedId && this.activeChallenges && this.activeChallenges.length) {
        const found = this.activeChallenges.find(a => String(a.id) === String(requestedId));
        if (found) {
          this.activeChallenges = [found];
          this.activeCount = 1;
        }
      }
      this.recalculateProgress();
    });

    // Trigger initial load
    try {
      await this.activeChallengesService.load();
    } catch (e) {
      console.warn('Failed to load active challenges via service', e);
    }
  }

  // Load active challenges and tasks for the current user (best-effort)
  async loadUserProgress() {
    this.loading = true;
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) {
        // No auth: use fallback sample data and compute progress
        this.activeChallenges = [
          { id: 'commute', title: 'Sustainable Commuting', tasks: this.milestones.map(m => ({ id: m.id, title: m.title, done: m.done })) }
        ];
        this.recalculateProgress();
        this.loading = false;
        return;
      }

      // Attempt to read joined challenges for the user from common table names
      const candidateTables = ['user_challenges', 'challenge_participants', 'participants'];
      let joined: any[] | null = null;
      for (const t of candidateTables) {
        const { data, error } = await this.supabase.client.from(t).select('challenge_id').eq('user_id', user.id).limit(100);
        if (!error && data && data.length) { joined = data as any[]; break; }
      }

      if (!joined) {
        // No persisted joins: use fallback
        this.activeChallenges = [
          { id: 'commute', title: 'Sustainable Commuting', tasks: this.milestones.map(m => ({ id: m.id, title: m.title, done: m.done })) }
        ];
        this.recalculateProgress();
        this.loading = false;
        return;
      }

      // For each joined challenge, try to load tasks
      const challengeIds = Array.from(new Set(joined.map(j => j.challenge_id)));
      const challenges: any[] = [];
      for (const cid of challengeIds) {
        // Try to fetch tasks from a likely table
        const { data: tasksData } = await this.supabase.client.from('challenge_tasks').select('*').eq('challenge_id', cid).limit(200);
        challenges.push({ id: cid, title: String(cid), tasks: tasksData ?? [] });
      }

      this.activeChallenges = challenges.length ? challenges : [
        { id: 'commute', title: 'Sustainable Commuting', tasks: this.milestones.map(m => ({ id: m.id, title: m.title, done: m.done })) }
      ];

      // Update activeCount based on distinct challenge ids
      this.activeCount = Array.from(new Set(this.activeChallenges.map(a => a.id))).length;

      this.recalculateProgress();
    } catch (err) {
      console.warn('Could not load user progress', err);
      this.activeChallenges = [
        { id: 'commute', title: 'Sustainable Commuting', tasks: this.milestones.map(m => ({ id: m.id, title: m.title, done: m.done })) }
      ];
      this.activeCount = Array.from(new Set(this.activeChallenges.map(a => a.id))).length;
      this.recalculateProgress();
    } finally {
      this.loading = false;
    }
  }

  recalculateProgress() {
    // compute overall percent across all active challenges (simple average)
    if (!this.activeChallenges.length) { this.progress = 0; return; }
    const percs = this.activeChallenges.map(ac => {
      const tasks = ac.tasks ?? [];
      if (!tasks.length) return 0;
      const done = tasks.filter((t: any) => !!t.done).length;
      return Math.round((done / tasks.length) * 100);
    });
    this.progress = Math.round(percs.reduce((a,b) => a+b, 0) / percs.length);
  }

  // Toggle a task's done state locally and try to persist (best-effort)
  async toggleTask(ac: any, task: any) {
    task.done = !task.done;
    this.recalculateProgress();
    try {
      // best-effort: update a likely table storing task completion per user
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) return;
      const payload = { user_id: user.id, challenge_id: ac.id, task_id: task.id, completed: task.done, completed_at: task.done ? new Date().toISOString() : null } as any;
      const { error } = await this.supabase.client.from('user_challenge_tasks').upsert([payload]);
      if (error) console.warn('Could not persist task completion', error);
    } catch (e) {
      console.warn('Persist task failed', e);
    }
  }

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
}
