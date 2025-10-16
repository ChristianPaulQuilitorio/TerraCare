import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-browse-challenges',
  standalone: true,
  imports: [NavbarComponent, CommonModule],
  template: `
    <app-navbar></app-navbar>

  <main class="browse-container">
      <section class="browse-hero">
        <h1>Browse Challenges</h1>
        <p>Discover and join challenges to make an impact.</p>
        <div class="hero-actions">
          <button class="btn" (click)="openCreateModal()">Create Challenge</button>
        </div>
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

      <section class="featured" *ngIf="filteredChallenges && filteredChallenges.length">
        <div class="featured-card" (click)="openDetails(filteredChallenges[0])" role="button" tabindex="0">
          <div class="featured-thumb" [style.backgroundImage]="'url(' + (filteredChallenges[0].image || '/assets/ecolife-bg.jpg') + ')'">
            <button class="play-large">▶ Play</button>
          </div>
          <div class="featured-body">
            <h2>{{ filteredChallenges[0].title }}</h2>
            <p class="muted">{{ filteredChallenges[0].description }}</p>
          </div>
        </div>
      </section>

      <section class="browse-grid">
        <div class="game-card" *ngFor="let c of filteredChallenges.slice(1)">
          <div class="card-thumb" [style.backgroundImage]="'url(' + (c.image || '/assets/ecolife-bg.jpg') + ')'" (click)="openDetails(c)" role="button" tabindex="0">
            <div class="play-overlay">▶</div>
          </div>
          <div class="game-meta">
            <h4>{{ c.title }}</h4>
            <p class="muted small">{{ c.description }}</p>
            <div class="meta-row">
              <span class="pill">🌿 Eco</span>
              <span class="pill">⭐ 4.8</span>
              <button class="btn small" (click)="openDetails(c)">Details</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Create Challenge Modal -->
      <div class="modal-backdrop" *ngIf="showCreateModal">
        <div class="modal modal-form" role="dialog" aria-modal="true" aria-labelledby="create-challenge-title">
          <header class="modal-header">
            <h2 id="create-challenge-title">Create Challenge</h2>
            <button class="close" aria-label="Close" (click)="closeCreateModal()">✕</button>
          </header>
          <div class="modal-body form-body">
            <label class="field">
              <span class="label-text">Title</span>
              <input class="form-input" placeholder="Title" [value]="newTitle" (input)="newTitle = $any($event.target).value" />
            </label>

            <label class="field">
              <span class="label-text">Short description</span>
              <textarea class="form-textarea" placeholder="Short description" (input)="newDescription = $any($event.target).value">{{ newDescription }}</textarea>
            </label>

            <label class="field">
              <span class="label-text">Tasks</span>
              <div class="tasks-list">
                <div class="task-row" *ngFor="let t of tasks; index as i">
                  <input class="form-input" placeholder="Task title" [value]="t.title" (input)="tasks[i].title = $any($event.target).value" />
                  <input class="form-input" placeholder="Details (optional)" [value]="t.detail" (input)="tasks[i].detail = $any($event.target).value" />
                  <button class="btn" type="button" (click)="removeTask(i)">Remove</button>
                </div>
                <div style="margin-top:8px;"><button class="btn" type="button" (click)="addTask()">Add Task</button></div>
              </div>
            </label>

            <!-- Image field removed for compatibility with minimal DB schema -->

            <p class="muted error" *ngIf="createError">{{ createError }}</p>
          </div>
          <footer class="modal-footer form-footer">
            <button class="btn" (click)="closeCreateModal()" [disabled]="uploadLoading">Cancel</button>
            <button class="btn primary" (click)="createChallenge()" [disabled]="uploadLoading">
              <span *ngIf="!uploadLoading">Create</span>
              <span *ngIf="uploadLoading">Creating…</span>
            </button>
          </footer>
        </div>
      </div>

      <section class="browse-list">
        <div class="card" *ngFor="let c of challenges">
          <h3>{{ c.title }}</h3>
          <p>{{ c.description }}</p>
          <button class="btn" (click)="openDetails(c)">Details</button>
        </div>
      </section>

      <!-- Details modal -->
      <div class="modal-backdrop" *ngIf="selectedChallenge">
        <div class="modal" role="dialog" aria-modal="true">
          <header class="modal-header">
            <h2>{{ selectedChallenge.title }}</h2>
            <button class="close" aria-label="Close" (click)="closeDetails()">✕</button>
          </header>
          <div class="modal-body">
            <div class="thumb" [style.backgroundImage]="'url(' + selectedChallenge.image + ')'" aria-hidden="true"></div>
            <p>{{ selectedChallenge.description }}</p>
          </div>
          <footer class="modal-footer">
            <button class="btn" (click)="acceptDetails()">Accept</button>
            <button class="btn outline" (click)="closeDetails()">Close</button>
          </footer>
        </div>
      </div>
    </main>
  `,
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class BrowseChallengesComponent implements OnInit {
  challenges = [
    { id: 'commute', title: 'Sustainable Commuting', description: 'Adopt eco-friendly commuting habits like biking or walking.', image: '/assets/icons/Gemini_Generated_Image_mfx6llmfx6llmfx6.png' },
    { id: 'cleanup', title: 'Community Clean-up Drive', description: 'Join local clean-up efforts to reduce waste and protect nature.', image: '/assets/ecolife-bg.jpg' },
    { id: 'wildlife', title: 'Support Local Wildlife', description: 'Help conserve wildlife by creating safe habitats.', image: '/assets/icons/Gemini_Generated_Image_mfx6llmfx6llmfx6.png' },
    { id: 'plastic', title: 'Reduce Plastic Waste', description: 'Minimize single-use plastics and encourage recycling.', image: '/assets/ecolife-bg.jpg' }
  ];

  current = 0;

  constructor(private router: Router, private supabase: SupabaseService) {}

  // UI state
  searchQuery = '';

  onSortChange(ev: Event) {
    // placeholder for sort logic - can be expanded later
    const sel = (ev.target as HTMLSelectElement).value;
    console.log('sort by', sel);
  }

  // Data & create modal state
  showCreateModal = false;
  newTitle = '';
  newDescription = '';
  newImageUrl = '';
  createError: string | null = null;
  uploadLoading = false;
  tasks: Array<{ title: string; detail?: string }> = [{ title: '' }];

  async ngOnInit(): Promise<void> {
    await this.loadChallenges();
  }

  async loadChallenges() {
    try {
      const { data, error } = await this.supabase.client.from('challenges').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      this.challenges = (data ?? this.challenges) as any[];
    } catch (err) {
      console.warn('Could not load challenges from DB, using local seed', err);
    }
  }

  get filteredChallenges() {
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (!q) return this.challenges;
    return this.challenges.filter(c => (c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }

  openCreateModal() { this.showCreateModal = true; }
  closeCreateModal() { this.showCreateModal = false; this.createError = null; }

  async createChallenge() {
    if (!this.newTitle.trim()) { this.createError = 'Title is required'; return; }
    try {
      // Simplified minimal insert (no author_id/image) to work with minimal schemas
      this.uploadLoading = true;
      const payload = {
        title: this.newTitle,
        description: this.newDescription,
        created_at: new Date().toISOString(),
      } as any;
      const res = await this.supabase.client.from('challenges').insert([payload]).select().limit(1);
      if (res.error) {
        // surface DB error to the user
        throw res.error;
      }
      const created = res.data?.[0] ?? null;

      if (created) {
        // prepend locally and close modal
        this.challenges = [created].concat(this.challenges || []);
        this.newTitle = this.newDescription = this.newImageUrl = '';
        // Best-effort: insert tasks into a 'challenge_tasks' table if it exists
        try {
          const challengeId = created.id ?? created['id'] ?? null;
          const taskRows = this.tasks.filter(t => t.title && t.title.trim()).map(t => ({
            challenge_id: challengeId,
            title: t.title,
            detail: t.detail ?? null,
            created_at: new Date().toISOString(),
          }));
          if (taskRows.length && challengeId) {
            await this.supabase.client.from('challenge_tasks').insert(taskRows).select();
          }
        } catch (e) {
          // ignore task insert failures
        }
        this.closeCreateModal();
      }
    } catch (err: any) {
      console.warn('Create challenge failed', err);
      this.createError = err?.message || 'Failed to create challenge';
    }
    finally {
      this.uploadLoading = false;
    }
  }

  addTask() {
    this.tasks.push({ title: '' });
  }

  removeTask(index: number) {
    this.tasks.splice(index, 1);
    if (this.tasks.length === 0) this.tasks.push({ title: '' });
  }
  

  

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
    this.selectedChallenge = c;
    // ensure focus lands inside modal for keyboard users
    setTimeout(() => {
      const el = document.querySelector('.modal') as HTMLElement | null;
      el?.focus();
    }, 0);
  }

  closeDetails() {
    this.selectedChallenge = null;
  }

  acceptDetails() {
    if (!this.selectedChallenge) return;
    this.joinChallenge(this.selectedChallenge);
    this.closeDetails();
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

        // Try to insert into a likely table name; tolerant to schema differences.
        const payload = { user_id: user.id, challenge_id: c.id, joined_at: new Date().toISOString() } as any;
        const candidates = ['user_challenges', 'challenge_participants', 'participants'];
        let inserted = false;
        for (const table of candidates) {
          const { data, error } = await this.supabase.client.from(table).insert(payload).select().limit(1);
          if (!error) {
            inserted = true;
            break;
          }
        }

        if (inserted) {
          alert(`Joined "${c.title}" — good luck!`);
        } else {
          alert('Joined locally; could not persist to server (table missing).');
        }

        // Navigate to progress page in all cases
        this.router.navigate(['/challenges/progress']);
      } catch (err) {
        console.warn('Join challenge failed:', err);
        alert('Could not join challenge right now — try again later.');
        this.router.navigate(['/challenges/progress']);
      }
    })();
  }

}
