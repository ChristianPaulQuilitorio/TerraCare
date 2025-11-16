import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { ToastService } from '../../shared/toast/toast.service';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-browse-challenges',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
  <main class="browse-container">
      <section class="browse-hero">
        <h1>Browse Challenges</h1>
        <p>Discover and join challenges to make an impact.</p>
        <div class="hero-actions">
          <button mat-raised-button class="tc-primary" (click)="openCreateModalGuarded()" [disabled]="!isAuthed">Create Challenge</button>
        </div>
        <p class="muted" *ngIf="!isAuthed" style="margin-top:8px;">Sign in to create or join challenges.</p>
      </section>
      <!-- Roblox-style browse grid -->
      <section class="browse-controls">
        <div class="search-row">
          <input type="search" class="search" placeholder="Search challenges..." (input)="searchQuery = $any($event.target).value" />
          <select class="sort" (change)="onSortChange($event)">
            <option value="popular">Popular</option>
            <option value="new">New</option>
            <option value="trending">Trending</option>
          </select>
        </div>
      </section>

      <!-- Empty state when filtering returns no results -->
      <section class="featured" *ngIf="filteredChallenges && filteredChallenges.length === 0 && (searchQuery || '').trim()">
        <div class="empty-state" role="status" aria-live="polite">
          <strong>No matches</strong>
          Try a different search term or clear the filter.
        </div>
      </section>

      <section class="featured" *ngIf="featuredChallenge">
        <div class="featured-card" (click)="openDetails(featuredChallenge)" role="button" tabindex="0">
          <div class="featured-thumb" [style.backgroundImage]="'url(' + (featuredChallenge.image || '/assets/ecolife-bg.jpg') + ')'">
            <button class="play-large">▶ Play</button>
          </div>
          <div class="featured-body">
            <h2>{{ featuredChallenge.title }}</h2>
            <p class="muted">{{ featuredChallenge.description }}</p>
            <div style="margin-top:8px;">
              <div class="progress-bar small">
                <div class="progress-fill" [style.width.%]="getProgressForChallenge(featuredChallenge)"></div>
              </div>
              <p class="muted small">
                <span *ngIf="featuredChallenge.user_completed" class="pill">Completed</span>
                {{ getProgressForChallenge(featuredChallenge) }}% complete
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- My challenges grid -->
      <section class="browse-grid" *ngIf="myListForGrid.length">
        <h2 class="section-title">My Challenges</h2>
        <div class="game-card" *ngFor="let c of myListForGrid">
          <div class="card-thumb" [style.backgroundImage]="'url(' + (c.image || '/assets/ecolife-bg.jpg') + ')'" (click)="openDetails(c)" role="button" tabindex="0">
            <div class="play-overlay">▶</div>
          </div>
          <div class="game-meta">
            <h4>{{ c.title }}</h4>
            <p class="muted small">{{ c.description }}</p>
            <div style="margin-top:8px;">
              <div class="progress-bar small">
                <div class="progress-fill" [style.width.%]="getProgressForChallenge(c)"></div>
              </div>
              <p class="muted small">
                <span *ngIf="c.user_completed" class="pill">Completed</span>
                {{ getProgressForChallenge(c) }}%
              </p>
            </div>
            <div class="meta-row">
              <span class="pill">🌿 Eco</span>
              <span class="pill">⭐ 4.8</span>
              <button class="btn small" (click)="openDetails(c)">Details</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Available challenges grid -->
      <section class="browse-grid" *ngIf="otherListForGrid.length">
        <h2 class="section-title">Available Challenges</h2>
        <div class="game-card" *ngFor="let c of otherListForGrid">
          <div class="card-thumb" [style.backgroundImage]="'url(' + (c.image || '/assets/ecolife-bg.jpg') + ')'" (click)="openDetails(c)" role="button" tabindex="0">
            <div class="play-overlay">▶</div>
          </div>
          <div class="game-meta">
            <h4>{{ c.title }}</h4>
            <p class="muted small">{{ c.description }}</p>
            <div style="margin-top:8px;">
              <div class="progress-bar small">
                <div class="progress-fill" [style.width.%]="getProgressForChallenge(c)"></div>
              </div>
              <p class="muted small">
                <span *ngIf="c.user_completed" class="pill">Completed</span>
                {{ getProgressForChallenge(c) }}%
              </p>
            </div>
            <div class="meta-row">
              <span class="pill">🌿 Eco</span>
              <span class="pill">⭐ 4.8</span>
              <button class="btn small" (click)="openDetails(c)">Details</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Create and Details are handled by Angular Material dialogs now -->

      

      <!-- Details handled by Angular Material dialog -->
    </main>
  `,
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class BrowseChallengesComponent implements OnInit {
  challenges: any[] = [];

  current = 0;

  isAuthed = false;
  selectedIsJoined = false;
  currentUserId: string | null = null;

  constructor(private router: Router, private supabase: SupabaseService, private activeChallengesService: ActiveChallengesService, private toast: ToastService, private dialog: MatDialog) {}

  // UI state
  searchQuery = '';

  onSortChange(ev: Event) {
    // placeholder for sort logic - can be expanded later
    const sel = (ev.target as HTMLSelectElement).value;
    console.log('sort by', sel);
  }

  getProgressForChallenge(c: any) {
    try {
      if (!c) return 0;
      if (typeof c.user_progress === 'number') return Math.round(Math.max(0, Math.min(100, c.user_progress)));
      if (typeof c.progress === 'number') return Math.round(c.progress);
      const tasks = c.tasks ?? [];
      if (!tasks.length) return 0;
      const done = tasks.filter((t: any) => !!t.done).length;
      return Math.round((done / tasks.length) * 100);
    } catch (e) { return 0; }
  }

  // Data & create modal state
  showCreateModal = false;
  newTitle = '';
  newDescription = '';
  newImageUrl = '';
  newImageFile: File | null = null;
  createError: string | null = null;
  uploadLoading = false;
  tasks: Array<{ title: string; detail?: string }> = [{ title: '' }];

  async ngOnInit(): Promise<void> {
    await this.loadChallenges();
    try {
      const u = await this.supabase.client.auth.getUser();
      this.isAuthed = !!u?.data?.user;
      this.currentUserId = u?.data?.user?.id || null;
      this.supabase.client.auth.onAuthStateChange((_e, s) => {
        this.isAuthed = !!s?.user;
        this.currentUserId = s?.user?.id || null;
      });
    } catch {}
  }

  async loadChallenges() {
    try {
      // Prefer to hide archived challenges
      let { data, error } = await this.supabase.client
        .from('challenges')
        .select('id, title, description, image, visibility, creator_id, created_at, base_points, archived')
        .eq('archived', false)
        .order('created_at', { ascending: false });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if(msg.includes('column') && msg.includes('archived')){
          // retry without archived filter if column doesn't exist yet
          const retry = await this.supabase.client
            .from('challenges')
            .select('id, title, description, image, visibility, creator_id, created_at, base_points')
            .order('created_at', { ascending: false });
          data = retry.data as any[];
        } else if(msg.includes('column') && msg.includes('base_points')){
          // retry without base_points for legacy DB
          const retry = await this.supabase.client.from('challenges').select('id, title, description, image, visibility, creator_id, created_at').order('created_at', { ascending: false });
          data = retry.data as any[]; // may be null
        } else {
          throw error;
        }
      }
      this.challenges = ((data ?? []) as any[])
        .filter((c:any) => c.archived !== true)
        .map((c:any) => ({ ...c, base_points: typeof c.base_points === 'number' ? c.base_points : 10 }));
      // Load tasks for each challenge so progress bars and detail modals are meaningful
      for (const c of this.challenges) {
        const { data: tasks } = await this.supabase.client.from('challenge_tasks').select('id, title, detail').eq('challenge_id', c.id).order('id', { ascending: true });
        (c as any).tasks = tasks || [];
      }

      // Annotate with user-specific joined/progress/completed state
      try {
        const user = (await this.supabase.client.auth.getUser()).data.user;
        if (user && this.challenges.length) {
          const ids = this.challenges.map(c => c.id);
          const { data: parts } = await this.supabase.client
            .from('challenge_participants')
            .select('challenge_id, progress')
            .eq('user_id', user.id)
            .in('challenge_id', ids as any);
          const pMap = new Map<string, number>((parts || []).map((r:any) => [String(r.challenge_id), typeof r.progress === 'number' ? Number(r.progress) : 0]));
          const { data: hist } = await this.supabase.client
            .from('challenge_history')
            .select('challenge_id')
            .eq('user_id', user.id)
            .eq('action', 'completed')
            .in('challenge_id', ids as any);
          const completedSet = new Set<string>((hist || []).map((h:any) => String(h.challenge_id)));
          this.challenges = this.challenges.map((c:any) => {
            const key = String(c.id);
            const user_completed = completedSet.has(key);
            const user_joined = pMap.has(key);
            const user_progress = user_completed ? 100 : (pMap.get(key) ?? 0);
            return { ...c, user_joined, user_completed, user_progress };
          });
        }
      } catch {}
    } catch (err) {
      console.warn('Could not load challenges from DB', err);
    }
  }

  get filteredChallenges() {
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (!q) return this.challenges;
    return this.challenges.filter(c => (c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }

  get myFilteredChallenges() {
    return (this.filteredChallenges || []).filter(c => !!this.currentUserId && c.creator_id === this.currentUserId);
  }

  get otherFilteredChallenges() {
    return (this.filteredChallenges || []).filter(c => !this.currentUserId || c.creator_id !== this.currentUserId);
  }

  get featuredChallenge() {
    const my = this.myFilteredChallenges;
    if (my && my.length) return my[0];
    const other = this.otherFilteredChallenges;
    if (other && other.length) return other[0];
    return null as any;
  }

  get myListForGrid() {
    const f = this.featuredChallenge;
    const arr = this.myFilteredChallenges || [];
    if (!f) return arr;
    if (arr.length && arr[0]?.id === f.id) return arr.slice(1);
    return arr;
  }

  get otherListForGrid() {
    const f = this.featuredChallenge;
    const arr = this.otherFilteredChallenges || [];
    if (!f) return arr;
    if (arr.length && arr[0]?.id === f.id) return arr.slice(1);
    return arr;
  }

  openCreateModalGuarded() {
    if (!this.isAuthed) { this.toast.show('Please sign in to create challenges.', 'info'); return; }
    const ref = this.dialog.open(CreateChallengeDialogComponent, { width: '600px', maxHeight: '90vh', data: { } });
    ref.afterClosed().subscribe(async (result) => {
      if (result && result.created) {
        // refresh challenges list
        await this.loadChallenges();
      }
    });
  }

  // Creation logic has been moved to the CreateChallengeDialogComponent
  

  

  // Manual scroll helpers: scroll the marquee frame by one card width
  scrollNext() {
    const frame = document.querySelector('.marquee-frame') as HTMLElement | null;
    const item = document.querySelector('.marquee-item') as HTMLElement | null;
    if (!frame || !item) return;
    const gap = 18; // matches SCSS
    const width = item.clientWidth + gap;
    frame.scrollBy({ left: width, behavior: 'smooth' });
  }

  scrollPrev() {
    const frame = document.querySelector('.marquee-frame') as HTMLElement | null;
    const item = document.querySelector('.marquee-item') as HTMLElement | null;
    if (!frame || !item) return;
    const gap = 18;
    const width = item.clientWidth + gap;
    frame.scrollBy({ left: -width, behavior: 'smooth' });
  }

  viewDetails(c: any) {
    // Navigate to browse with id param so details can be read if desired
    this.router.navigate(['/challenges/browse'], { queryParams: { id: c.id } });
  }

  // Modal state for details
  selectedChallenge: any = null;

  openDetails(c: any) {
    const ref = this.dialog.open(ChallengeDetailsDialogComponent, { width: '640px', maxHeight: '90vh', data: { challenge: c, isAuthed: this.isAuthed } });
    ref.afterClosed().subscribe(async (action) => {
      if (action === 'join') {
        this.joinChallenge(c);
      } else if (action === 'leave') {
        this.leaveChallenge(c);
      } else if (action === 'delete') {
        await this.deleteChallenge(c);
      }
    });
  }

  async refreshJoinState(challengeId: any) {
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if (!user) { this.selectedIsJoined = false; return; }
      const { data } = await this.supabase.client.from('challenge_participants').select('id').eq('user_id', user.id).eq('challenge_id', challengeId).limit(1);
      this.selectedIsJoined = !!(data && data.length);
    } catch { this.selectedIsJoined = false; }
  }

  joinChallenge(c: any) {
    // Attempt to record the user's participation in Supabase if available.
    // Best-effort: try common table names and fall back to navigation.
    (async () => {
      try {
        const userResp = await this.supabase.client.auth.getUser();
        const user = userResp?.data?.user;
        if (!user) {
          // Not authenticated locally; just navigate to progress and inform the user
          alert('Please sign in to join challenges. Redirecting to progress.');
          this.router.navigate(['/challenges/progress']);
          return;
        }

        // Prevent creators from joining their own challenge
        if (user.id === c.creator_id) {
          this.toast.show('You created this challenge and cannot join it.', 'info');
          return;
        }

        // Try to insert into a likely table name; tolerant to schema differences.
        // Defensive: first check if already joined to avoid duplicate constraint errors
        const { data: already } = await this.supabase.client.from('challenge_participants').select('id').eq('user_id', user.id).eq('challenge_id', c.id).limit(1);
        if (!already || !already.length) {
          const payload = { user_id: user.id, challenge_id: c.id, joined_at: new Date().toISOString(), progress: 0 } as any;
          const { error } = await this.supabase.client.from('challenge_participants').insert(payload);
          if (error) {
            this.toast.show('Could not persist your join to the server.', 'error');
          } else {
            this.toast.show(`Joined "${c.title}" — good luck!`, 'success');
          }
        } else {
          this.toast.show(`Already joined "${c.title}"`, 'info');
        }
        try { await this.activeChallengesService.load(); } catch {}
        this.selectedIsJoined = true;
        // Navigate to progress page in all cases
        this.router.navigate(['/challenges/progress']);
      } catch (err) {
        console.warn('Join challenge failed:', err);
        alert('Could not join challenge right now — try again later.');
        this.router.navigate(['/challenges/progress']);
      }
    })();
  }

  leaveChallenge(c: any) {
    (async () => {
      try {
        const userResp = await this.supabase.client.auth.getUser();
        const user = userResp?.data?.user;
        if (!user) { this.toast.show('Please sign in to leave challenges.', 'info'); return; }
        // Clean up per-user task state first (in case the UI shows 100%)
        await this.supabase.client.from('user_challenge_tasks').delete().eq('user_id', user.id).eq('challenge_id', c.id);
        const { error } = await this.supabase.client.from('challenge_participants').delete().eq('user_id', user.id).eq('challenge_id', c.id);
        if (!error) {
          this.toast.show(`Left "${c.title}"`, 'success');
          this.selectedIsJoined = false;
          try { await this.activeChallengesService.load(); } catch {}
        } else {
          this.toast.show(`Could not leave this challenge: ${error.message || 'Unknown error'}`, 'error');
        }
      } catch (e) {
        console.warn('Leave failed', e);
      }
    })();
  }

  async deleteChallenge(c: any) {
    try {
      const user = (await this.supabase.client.auth.getUser()).data.user;
      if (!user) { this.toast.show('Sign in required.', 'info'); return; }
      if (user.id !== c.creator_id) { this.toast.show('Only the creator can delete this challenge.', 'error'); return; }
      // Archive instead of hard delete: keep history intact and hide from others
      const { error } = await this.supabase.client
        .from('challenges')
        .update({ archived: true, archived_at: new Date().toISOString(), visibility: 'private', status: 'completed' })
        .eq('id', c.id)
        .eq('creator_id', user.id);
      if (error) { this.toast.show(error.message || 'Archive failed', 'error'); return; }
      this.toast.show('Challenge archived. Participant history and scores retained.', 'success');
      await this.loadChallenges();
      try { await this.activeChallengesService.load(); } catch {}
    } catch (e) {
      console.warn('Archive challenge failed', e);
      this.toast.show('Archive failed.', 'error');
    }
  }

}

// Dialog component: Create Challenge
import { Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-create-challenge-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS],
  template: `
  <h2 mat-dialog-title>Create Challenge</h2>
  <div mat-dialog-content class="dialog-body">
    <mat-form-field appearance="outline" class="w-100">
      <mat-label>Title</mat-label>
      <input matInput [(ngModel)]="title" />
    </mat-form-field>
    <mat-form-field appearance="outline" class="w-100">
      <mat-label>Description</mat-label>
      <textarea matInput rows="3" [(ngModel)]="description"></textarea>
    </mat-form-field>
    <div class="attachments-block">
      <h3 class="tasks-heading">Attachments</h3>
      <p class="muted small">Add images, videos, or PDFs to enrich your challenge.</p>
      <div class="attach-row">
        <input type="file" multiple (change)="onFilesSelected($event)" accept="image/*,video/*,application/pdf"/>
        <button mat-stroked-button type="button" (click)="clearFiles()" [disabled]="!attachments.length">Clear</button>
      </div>
      <div class="attach-list" *ngIf="attachments.length">
        <div class="attach-item" *ngFor="let f of attachments; index as i">
          <mat-icon class="attach-icon">attach_file</mat-icon>
          <span class="name">{{ f.name }}</span>
          <span class="meta muted small">{{ (f.size/1024) | number:'1.0-0' }} KB</span>
          <button mat-icon-button aria-label="Remove" (click)="removeFile(i)"><mat-icon>close</mat-icon></button>
        </div>
      </div>
    </div>
    <div class="tasks-block">
      <h3 class="tasks-heading">Tasks</h3>
      <div class="task-row" *ngFor="let t of taskForms; index as i">
        <mat-form-field appearance="outline" class="task-field">
          <mat-label>Task title</mat-label>
          <input matInput [(ngModel)]="t.title" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="task-field">
          <mat-label>Details (optional)</mat-label>
          <input matInput [(ngModel)]="t.detail" />
        </mat-form-field>
        <button mat-icon-button aria-label="Remove task" (click)="removeTask(i)"><mat-icon>delete</mat-icon></button>
      </div>
      <div><button mat-stroked-button type="button" (click)="addTask()">Add Task</button></div>
    </div>
    <div class="points-block">
      <h3 class="tasks-heading">Scoring</h3>
      <mat-form-field appearance="outline" class="w-100">
        <mat-label>Base Points (1-100)</mat-label>
        <input matInput type="number" min="1" max="100" [(ngModel)]="basePoints" />
        <mat-hint>Points awarded when a participant completes this challenge</mat-hint>
      </mat-form-field>
    </div>
    <div *ngIf="error" class="error-text">{{error}}</div>
  </div>
  <div mat-dialog-actions align="end">
    <button mat-button (click)="close()" [disabled]="loading">Cancel</button>
    <button mat-raised-button color="primary" (click)="submit()" [disabled]="loading || !title.trim()">
      <span *ngIf="!loading">Create</span>
      <span *ngIf="loading">Creating...</span>
    </button>
  </div>
  `,
  styles: [`
    .w-100 { width: 100%; }
    .dialog-body { display:flex; flex-direction:column; gap:16px; }
    .attachments-block { border:1px dashed #cfd8dc; padding:12px; border-radius:8px; background:#fcfcfc; }
    .attach-row { display:flex; align-items:center; gap:8px; }
    .attach-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .attach-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid #eee; border-radius:6px; background:#fff; }
    .attach-item .name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .attach-icon { opacity:.7; }
    .tasks-block { border:1px solid #ddd; padding:12px 12px 16px; border-radius:8px; background:#fafafa; }
    .tasks-heading { margin:0 0 8px; font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
    .task-row { display:flex; align-items:flex-end; gap:8px; margin-bottom:8px; }
    .task-field { flex:1; }
    .error-text { color:#b00020; font-size:13px; }
    @media (max-width: 420px) {
      .task-row { flex-direction: column; align-items: stretch; }
      .task-row .task-field { width: 100%; }
      .task-row button[aria-label="Remove task"] { align-self: flex-end; }
      .attach-row { flex-direction: column; align-items: stretch; }
      .attach-row input[type="file"] { width: 100%; }
    }
  `]
})
export class CreateChallengeDialogComponent {
  title = '';
  description = '';
  taskForms: Array<{title:string; detail?:string}> = [{ title: '' }];
  loading = false;
  error: string | null = null;
  attachments: File[] = [];
  basePoints: number = 10;

  constructor(private supabase: SupabaseService, private toast: ToastService, private dialogRef: MatDialogRef<CreateChallengeDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: any) {}

  addTask(){ this.taskForms.push({ title: '' }); }
  removeTask(i:number){ this.taskForms.splice(i,1); if(!this.taskForms.length) this.taskForms.push({ title:'' }); }
  close(){ this.dialogRef.close(); }

  onFilesSelected(evt: Event){
    const input = evt.target as HTMLInputElement;
    if(!input.files) return;
    // Merge with existing, but avoid duplicates by name+size
    const next: File[] = [...this.attachments];
    for(const f of Array.from(input.files)){
      if(!next.find(x => x.name === f.name && x.size === f.size)) next.push(f);
    }
    this.attachments = next;
    // reset input to allow re-selecting same file
    input.value = '';
  }
  removeFile(i:number){ this.attachments.splice(i,1); }
  clearFiles(){ this.attachments = []; }

  async submit(){
    if(!this.title.trim()){ this.error='Title required'; return; }
    // sanitize basePoints into allowed 1-100
    if(typeof this.basePoints !== 'number' || isNaN(this.basePoints)) this.basePoints = 10 as any;
    this.basePoints = Math.max(1, Math.min(100, Math.round(this.basePoints)));
    this.loading = true; this.error=null;
    try {
      const userResp = await this.supabase.client.auth.getUser();
      const user = userResp?.data?.user;
      if(!user){ this.error='Not signed in'; this.loading=false; return; }
      const payload:any = { title:this.title, description:this.description, created_at:new Date().toISOString(), creator_id:user.id, visibility:'public', base_points: this.basePoints };
      let res = await this.supabase.client.from('challenges').insert(payload).select().limit(1);
      if(res.error && (res.error.message || '').toLowerCase().includes('column') && (res.error.message || '').toLowerCase().includes('base_points')){
        // Fallback: retry without base_points if column doesn't exist yet
        const fallbackPayload = { ...payload } as any; delete fallbackPayload.base_points;
        res = await this.supabase.client.from('challenges').insert(fallbackPayload).select().limit(1);
        if(!res.error){ this.toast.show('Scoring column missing in DB. Using default points until migrated.', 'warning'); }
      }
      if(res.error) throw res.error;
      const created = res.data?.[0];
      if(created){
        const challengeId = created.id;
        const taskRows = this.taskForms.filter(t=>t.title.trim()).map(t=>({ challenge_id:challengeId, title:t.title, detail:t.detail||null, created_at:new Date().toISOString() }));
        if(taskRows.length){ await this.supabase.client.from('challenge_tasks').insert(taskRows); }

        // Upload attachments to Storage and record rows
        if(this.attachments.length){
          const results: Array<{url:string; type:string; path:string}> = [];
          for(const file of this.attachments){
            const up = await this.uploadAttachment(file, user.id, challengeId);
            if(up) results.push(up);
          }
          const failed = this.attachments.length - results.length;

          // If there is at least one image, set it as the challenge preview image
          const cover = results.find(r => r.type === 'image');
          if(cover){
            try { await this.supabase.client.from('challenges').update({ image: cover.url }).eq('id', challengeId); } catch {}
          }

          // No DB table writes: keep attachments in Storage only to avoid REST 404s for non-existent tables

          if(failed){
            this.toast.show(`${results.length} attachment(s) uploaded, ${failed} failed.`, 'warning');
          }
        }
      }
      this.toast.show('Challenge created','success');
      this.dialogRef.close({ created:true });
    } catch(e:any){
      console.error(e); this.error = e?.message || 'Failed to create'; this.toast.show('Failed to create challenge','error');
    } finally { this.loading=false; }
  }

  private async uploadAttachment(file: File, userId: string, challengeId: string): Promise<{url:string; type:'image'|'video'|'file'; path:string} | null> {
    try {
      const ext = file.name.split('.').pop();
      const type: 'image'|'video'|'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `challenges/${userId}/${challengeId}/${Date.now()}-${safeName}`;
      let { error } = await this.supabase.client.storage.from('challenge-attachments').upload(path, file, { cacheControl: '3600', upsert: false });
      if(error?.message?.toLowerCase().includes('bucket not found')){
        // Attempt to init bucket via API then retry once
        try {
          const apiBase = (environment.apiBase || '').replace(/\/$/, '');
          if(apiBase){
            await fetch(`${apiBase}/api/storage/init`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ bucketId: 'challenge-attachments' }) });
          }
          const retry = await this.supabase.client.storage.from('challenge-attachments').upload(path, file, { cacheControl: '3600', upsert: false });
          error = retry.error || null;
        } catch {}
      }
      if(error) { console.warn('attachment upload failed', error); return null; }
      const { data } = this.supabase.client.storage.from('challenge-attachments').getPublicUrl(path);
      return { url: data.publicUrl, type, path };
    } catch (e){
      console.warn('uploadAttachment error', e);
      return null;
    }
  }
}

// Dialog component: Challenge Details
@Component({
  selector: 'app-challenge-details-dialog',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
  <h2 mat-dialog-title>{{challenge?.title}}</h2>
    <div mat-dialog-content class="details-body" *ngIf="challenge">
      <div class="details-hero">
        <img class="details-hero-img" [src]="challenge.image || '/assets/ecolife-bg.jpg'" [alt]="challenge?.title || 'Challenge image'" />
      </div>
      <div class="details-content">
        <p>{{challenge.description}}</p>
        <p class="muted small">Base Points: {{ challenge.base_points || 10 }}</p>
        <p class="muted small" *ngIf="completed">
          <span class="pill">Completed</span> Progress: 100%
        </p>
        <div class="tasks" *ngIf="challenge.tasks?.length">
          <h3>Tasks</h3>
          <ul>
            <li *ngFor="let t of challenge.tasks">{{t.title}}</li>
          </ul>
        </div>
      </div>
    </div>
  <div mat-dialog-actions align="end">
    <button mat-button (click)="close()">Close</button>
    <button mat-raised-button color="primary" *ngIf="isAuthed && !joined && !isCreator && !completed" (click)="doJoin()">Join</button>
    <button mat-stroked-button color="warn" *ngIf="isAuthed && joined && !completed" (click)="doLeave()">Leave</button>
    <button mat-stroked-button disabled *ngIf="isAuthed && completed">Done</button>
    <button mat-flat-button color="warn" *ngIf="isAuthed && isCreator" (click)="doDelete()">Delete</button>
  </div>
  `,
  styles:[`
    .details-body { display:flex; flex-direction:column; gap:12px; }
    .details-hero { width:100%; display:block; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,.12); background-color: #fff; }
    .details-hero-img { display:block; width:100%; height:auto; max-width:100%; object-fit:contain; border-radius:8px; margin-bottom:12px; /* default: fit within dialog */ max-height: calc(90vh - 160px); }

    /* Smaller screens: allow a bit more space for header/footer */
    @media (max-width: 520px) {
      .details-hero-img { max-height: calc(80vh - 120px); }
    }
    .tasks ul { margin:0; padding-left:18px; }
    h3 { margin:8px 0 4px; font-size:16px; }
  `]
})
export class ChallengeDetailsDialogComponent implements OnInit {
  challenge:any; isAuthed=false; joined=false; isCreator=false; completed=false;
  constructor(private supabase: SupabaseService, private dialogRef: MatDialogRef<ChallengeDetailsDialogComponent>, @Inject(MAT_DIALOG_DATA) public data:any){
    this.challenge = data.challenge; this.isAuthed = data.isAuthed; this.completed = !!data?.challenge?.user_completed;
  }
  async ngOnInit(){ if(this.isAuthed){ await this.checkJoinAndCompletion(); } }
  async checkJoinAndCompletion(){
    try {
      const user = (await this.supabase.client.auth.getUser()).data.user;
      if(!user) return;
      this.isCreator = (user.id === this.challenge?.creator_id);
      const { data: part } = await this.supabase.client.from('challenge_participants').select('id, progress').eq('user_id', user.id).eq('challenge_id', this.challenge.id).limit(1);
      this.joined = !!(part && part.length);
      if (!this.completed) {
        const { data: hist } = await this.supabase.client.from('challenge_history').select('id').eq('user_id', user.id).eq('challenge_id', this.challenge.id).eq('action','completed').limit(1);
        this.completed = !!(hist && hist.length) || (!!part && part[0]?.progress >= 100);
      }
    } catch {}
  }
  doJoin(){ this.dialogRef.close('join'); }
  doLeave(){ this.dialogRef.close('leave'); }
  doDelete(){ this.dialogRef.close('delete'); }
  close(){ this.dialogRef.close(); }
}
