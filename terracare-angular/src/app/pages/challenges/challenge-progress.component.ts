import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
// no server dependency for uploads; client-only storage path

@Component({
  selector: 'app-challenge-progress',
  standalone: true,
  imports: [RouterLink, CommonModule, ...MATERIAL_IMPORTS],
  template: `
  <main class="progress-page container">
    <header class="progress-header">
      <div>
        <h1>My Challenge Progress</h1>
        <p class="subtitle">Track progress, milestones, and impact for your active challenges</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button routerLink="/challenges">Back</button>
        <button mat-raised-button color="primary">Share Progress</button>
      </div>
    </header>

    <section class="summary-grid">
      <mat-card class="summary-card" *ngIf="activeCount">
        <mat-card-title>Active</mat-card-title>
        <mat-card-content><div class="metric small-metric">{{ activeCount }}</div><p class="muted tiny">challenge(s)</p></mat-card-content>
      </mat-card>
      <mat-card class="summary-card">
        <mat-card-title>Impact Score</mat-card-title>
        <mat-card-content><div class="metric">{{ impactScore }}</div></mat-card-content>
      </mat-card>
      <mat-card class="summary-card">
        <mat-card-title>Average Progress</mat-card-title>
        <mat-card-content><div class="metric">{{ progress }}%</div></mat-card-content>
      </mat-card>
      <ng-container *ngIf="activeChallenges.length; else noActive">
        <mat-card class="summary-card wide">
          <mat-card-title>Overall Progress</mat-card-title>
          <mat-card-content>
            <ng-container *ngIf="!allComplete; else cleared">
              <div class="progress-bar large" role="progressbar" [attr.aria-valuenow]="progress" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-fill" [style.width.%]="progress"></div>
              </div>
              <p class="muted small" style="margin-top:10px;">{{ progress }}% complete</p>
            </ng-container>
            <ng-template #cleared>
              <p class="muted">All current challenges completed. Great job!</p>
            </ng-template>
          </mat-card-content>
        </mat-card>
      </ng-container>
      <ng-template #noActive>
        <mat-card class="summary-card wide">
          <mat-card-title>Overall Progress</mat-card-title>
          <mat-card-content>
            <p class="muted">No active challenges yet. Browse and join one to get started.</p>
          </mat-card-content>
        </mat-card>
      </ng-template>
    </section>

    <section class="active-section" *ngIf="activeChallenges.length">
      <h2>Active Challenges</h2>
      <div class="active-grid">
        <mat-card class="challenge-card" *ngFor="let ac of activeChallenges">
          <mat-card-header>
            <mat-card-title>{{ ac.title }}</mat-card-title>
            <mat-card-subtitle>{{ ac.tasks?.length || 0 }} tasks</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <mat-progress-bar color="accent" mode="determinate" [value]="getChallengePercent(ac)"></mat-progress-bar>
            <div class="tasks-block" *ngIf="ac.tasks?.length">
              <mat-selection-list>
                <mat-list-option *ngFor="let t of ac.tasks" [selected]="t.done" (selectedChange)="toggleTask(ac, t, $event)">{{ t.title }}</mat-list-option>
              </mat-selection-list>
            </div>
            <div class="proof-row">
              <label class="muted small">Attach proof:</label>
              <input type="file" (change)="onProofSelected($event, ac)" accept="image/*,video/*,application/pdf" />
              <div class="muted small" *ngIf="proofNameMap.get(ac.id)">Selected: {{ proofNameMap.get(ac.id) }}</div>
            </div>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-raised-button color="primary" (click)="completeChallenge(ac)" [disabled]="completingId === ac.id || getChallengePercent(ac) < 100 || !hasProof(ac)">{{ completingId===ac.id ? 'Completing...' : 'Done' }}</button>
            <button mat-button color="warn" (click)="leave(ac)">Leave</button>
          </mat-card-actions>
        </mat-card>
      </div>
    </section>

    <section class="history-section" *ngIf="challengeHistory.length">
      <h2>Completed Challenges</h2>
      <mat-accordion>
        <mat-expansion-panel *ngFor="let h of challengeHistory">
          <mat-expansion-panel-header>
            <mat-panel-title>{{ h.challenge_title }}</mat-panel-title>
            <mat-panel-description>{{ h.points }} pts • {{ h.occurred_at | date:'mediumDate' }}</mat-panel-description>
          </mat-expansion-panel-header>
          <div class="history-body">
            <p class="muted small">Completed on {{ h.occurred_at | date:'medium' }}</p>
            <ng-container *ngIf="h.proof_url; else noProof">
              <a [href]="h.proof_url" target="_blank" rel="noopener" mat-stroked-button>View Proof</a>
            </ng-container>
            <ng-template #noProof><p class="muted small">No proof attached.</p></ng-template>
          </div>
        </mat-expansion-panel>
      </mat-accordion>
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
  // when every active challenge is at 100%
  allComplete = false;
  // number of distinct active challenges the user has joined
  activeCount = 0;
  impactScore = 0;
  challengeHistory: Array<any> = [];
  completingId: any = null;
  private proofFileMap = new Map<any, File>();
  proofNameMap = new Map<any, string>();

  // fallback sample milestones (used when DB not available)
  milestones = [
    { id: 1, title: 'Week 1: Try walking', desc: 'Walk or bike twice this week', done: true },
    { id: 2, title: 'Week 2: Swap a car trip', desc: 'Replace 1 short drive with walking', done: false },
    { id: 3, title: 'Week 3: Track commute', desc: 'Log trips for one week', done: false }
  ];

  constructor(private supabase: SupabaseService, private route: ActivatedRoute, private activeChallengesService: ActiveChallengesService, private toast: ToastService) {}

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

    // Load impact score & history
    try { await this.refreshImpactScore(); } catch {}
    try { await this.loadHistory(); } catch {}
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
    // Compute overall percent across all active challenges (simple average)
    if (!this.activeChallenges.length) { this.progress = 0; this.allComplete = false; return; }
    const percs = this.activeChallenges.map(ac => this.computePercentFor(ac));
    this.progress = Math.round(percs.reduce((a,b) => a+b, 0) / percs.length);
    this.allComplete = percs.length > 0 && percs.every(p => p >= 100);
  }

  // Toggle a task's done state locally and try to persist (best-effort)
  async toggleTask(ac: any, task: any, ev?: any) {
    // If selectionChange event provided, trust its selected state instead of manual inversion
    if (typeof ev === 'boolean') {
      task.done = !!ev;
    } else if (ev && ev.option && typeof ev.option.selected === 'boolean') {
      task.done = !!ev.option.selected;
    } else {
      // Fallback for legacy click handlers
      task.done = !task.done;
    }
    // Recalculate local percent for this challenge and overall
    const percent = this.getChallengePercent(ac);
    ac.progress = percent;
    this.recalculateProgress();
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) return;

      // First check if a record already exists to decide insert vs update (defensive against schema variations)
      const { data: existing, error: checkErr } = await this.supabase.client
        .from('user_challenge_tasks')
        .select('id, completed')
        .eq('user_id', user.id)
        .eq('task_id', task.id)
        .limit(1)
        .maybeSingle();
      if (checkErr) {
        console.warn('Check existing task failed', checkErr);
      }

      const payload: any = {
        user_id: user.id,
        challenge_id: ac.id,
        task_id: task.id,
        completed: !!task.done,
        completed_at: task.done ? new Date().toISOString() : null
      };

      let persistErr: any | null = null;
      if (existing) {
        // Update existing row
        const { error } = await this.supabase.client
          .from('user_challenge_tasks')
          .update({ completed: payload.completed, completed_at: payload.completed_at })
          .eq('user_id', user.id)
          .eq('task_id', task.id);
        persistErr = error;
      } else {
        // Insert new row using onConflict safeguard (in case race inserts happen)
        const { error } = await this.supabase.client
          .from('user_challenge_tasks')
          .upsert(payload, { onConflict: 'user_id,task_id' });
        persistErr = error;
      }

      if (persistErr) {
        console.warn('Could not persist task completion', persistErr);
        this.toast.show(`Could not save task: ${persistErr.message || 'Unknown error'}`, 'error');
      } else {
        this.toast.show(task.done ? 'Task completed' : 'Task unmarked', 'success', 2000);
      }
    } catch (e) {
      console.warn('Persist task failed', e);
      this.toast.show('Could not save your task right now.', 'error');
    }
  }

  getChallengePercent(ac: any) { return this.computePercentFor(ac); }

  private computePercentFor(ac: any): number {
    try {
      const tasks = ac?.tasks ?? [];
      if (Array.isArray(tasks) && tasks.length) {
        // Support multiple shapes: done, completed, or status === 'done'
        const done = tasks.filter((t: any) => t?.done === true || t?.completed === true || String(t?.status || '').toLowerCase() === 'done').length;
        return Math.round((done / tasks.length) * 100);
      }
      // Fallback to provided progress if tasks aren't available
      if (typeof ac?.progress === 'number' && !Number.isNaN(ac.progress)) {
        return Math.round(Math.max(0, Math.min(100, Number(ac.progress))));
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async leave(ac: any) {
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) { this.toast.show('Please sign in to leave challenges.', 'info'); return; }
      // Clean up per-user task entries first
      await this.supabase.client.from('user_challenge_tasks').delete().eq('user_id', user.id).eq('challenge_id', ac.id);
      const { error } = await this.supabase.client
        .from('challenge_participants')
        .delete()
        .eq('user_id', user.id)
        .eq('challenge_id', ac.id);
      if (!error) {
        this.toast.show('Left challenge', 'success');
        this.activeChallenges = this.activeChallenges.filter(c => c.id !== ac.id);
        this.activeCount = Array.from(new Set(this.activeChallenges.map(a => a.id))).length;
        this.recalculateProgress();
      } else {
        this.toast.show(`Unable to leave this challenge: ${error.message || 'Unknown error'}`, 'error');
      }
    } catch (e) {
      console.warn('Leave challenge failed', e);
      this.toast.show('Unable to leave this challenge right now.', 'error');
    }
  }

  onProofSelected(evt: Event, ac: any){
    const input = evt.target as HTMLInputElement;
    if(!input.files || !input.files[0]) return;
    const f = input.files[0];
    this.proofFileMap.set(ac.id, f);
    this.proofNameMap.set(ac.id, f.name);
    input.value = '';
  }

  hasProof(ac: any): boolean {
    return this.proofFileMap.has(ac.id);
  }

  private async refreshImpactScore(){
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if(!user){ this.impactScore = 0; return; }
      // Compute from history so points persist even if a challenge is later deleted
      const { data, error } = await this.supabase.client
        .from('challenge_history')
        .select('points')
        .eq('user_id', user.id)
        .eq('action', 'completed')
        .limit(2000);
      if(error){ this.impactScore = 0; return; }
      const rows = (data || []) as Array<{ points: number }>;
      this.impactScore = rows.reduce((sum, r) => sum + Number(r.points || 0), 0);
    } catch { this.impactScore = 0; }
  }

  async completeChallenge(ac: any){
    if(this.completingId){ return; }
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if(!user){ this.toast.show('Please sign in.', 'info'); return; }

      const proof = this.proofFileMap.get(ac.id) || null;
      if(!proof){ this.toast.show('Please attach a proof file before marking complete.', 'info'); return; }

      this.completingId = ac.id;

      // Prevent duplicate completion scoring: check for existing history row
      try {
        const { data: existing } = await this.supabase.client
          .from('challenge_history')
          .select('id')
          .eq('challenge_id', ac.id)
          .eq('user_id', user.id)
          .eq('action', 'completed')
          .limit(1);
        if(existing && existing.length){
          this.toast.show('Already completed — points previously awarded.', 'info');
          this.completingId = null; return;
        }
      } catch {}

      // We no longer need to fetch base points client-side; DB trigger derives points automatically.

  // Upload proof to storage bucket (client-only path)
  const proofUpload = await this.uploadProof(proof, user.id, ac.id);
  if(!proofUpload){ this.toast.show('Could not upload proof. Try again.', 'error'); this.completingId = null; return; }

      // Direct client insert only; points will be set by DB trigger
      const payload:any = {
        challenge_id: ac.id,
        user_id: user.id,
        action: 'completed',
        details: { proof_url: proofUpload.url, filename: proof.name, type: proofUpload.type }
      };
      const insertResp = await this.supabase.client.from('challenge_history').insert(payload);
      const insertError = insertResp.error;
      if(insertError){
        if(((insertError as any).code || '').includes('23505')){
          this.toast.show('Already completed — points previously awarded.', 'info');
        } else {
          this.toast.show('Completion failed: ' + (insertError.message || 'Unknown error'), 'error');
          this.completingId = null; return;
        }
      }

      // Optionally set participant progress to 100
      try { await this.supabase.client.from('challenge_participants').update({ progress: 100 }).eq('user_id', user.id).eq('challenge_id', ac.id); } catch {}

    // Refresh UI: impact score, active list, and history list
    try { await this.refreshImpactScore(); } catch {}
    try { await this.activeChallengesService.load(); } catch {}
    try { await this.loadHistory(); } catch {}

      // local state cleanup
      this.proofFileMap.delete(ac.id);
      this.proofNameMap.delete(ac.id);
      this.toast.show('Challenge completed! Points added to your Impact Score.', 'success');
    } catch (e){
      console.warn('completeChallenge failed', e);
      this.toast.show('Unable to complete challenge now.', 'error');
    } finally {
      this.completingId = null;
    }
  }

  private async loadHistory(){
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if(!user){ this.challengeHistory = []; return; }
      // Fetch completed challenge history with embedded challenge title & base points
      const { data, error } = await this.supabase.client
        .from('challenge_history')
        .select('id, challenge_id, points, occurred_at, details, challenge_title_snapshot, challenges:challenge_id (title, base_points)')
        .eq('user_id', user.id)
        .eq('action', 'completed')
        .order('occurred_at', { ascending: false })
        .limit(200);
      if(error){ this.challengeHistory = []; return; }
      this.challengeHistory = (data || []).map((r: any) => ({
        id: r.id,
        challenge_id: r.challenge_id,
        challenge_title: r.challenges?.title || r.challenge_title_snapshot || r.challenge_id,
        points: r.points,
        occurred_at: r.occurred_at,
        proof_url: r.details?.proof_url || null
      }));
      // Remove any completed challenges from active list for clean separation
      const completedIds = new Set(this.challengeHistory.map(h => h.challenge_id));
      this.activeChallenges = this.activeChallenges.filter(c => !completedIds.has(c.id));
      this.activeCount = this.activeChallenges.length;
      this.recalculateProgress();
    } catch (e){
      console.warn('loadHistory failed', e);
    }
  }

  private async uploadProof(file: File, userId: string, challengeId: string): Promise<{url:string; type:'image'|'video'|'file'; path:string} | null> {
    try {
      const type: 'image'|'video'|'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      // Client-only storage upload to challenge-proofs bucket
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `proofs/${userId}/${challengeId}/${Date.now()}-${safeName}`;
      const { error } = await this.supabase.client.storage.from('challenge-proofs').upload(path, file, { cacheControl: '3600', upsert: false });
      if(error){ console.warn('proof upload failed', error); return null; }
      const { data } = this.supabase.client.storage.from('challenge-proofs').getPublicUrl(path);
      return { url: data.publicUrl, type, path };
    } catch { return null; }
  }

  // Removed server fallback; DB trigger handles points. Keep method stub if referenced elsewhere.
  private async fallbackServerComplete(): Promise<{ ok: boolean; status: number }> { return { ok: false, status: 0 }; }
}
