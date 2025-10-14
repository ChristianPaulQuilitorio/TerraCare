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
      </section>

      <section class="marquee">
        <div class="marquee-controls">
          <button class="carousel-nav left" aria-label="Previous" (click)="scrollPrev()">‹</button>
          <button class="carousel-nav right" aria-label="Next" (click)="scrollNext()">›</button>
        </div>
        <div class="marquee-frame">
          <div class="image-container marquee-track">
            <!-- first pass -->
            <div class="marquee-item" *ngFor="let c of challenges" (click)="openDetails(c)" role="button" tabindex="0" (keyup.enter)="openDetails(c)">
              <div class="card marquee-card" aria-hidden="false">
                <div class="thumb" [style.backgroundImage]="'url(' + c.image + ')'"></div>
                <div class="marquee-body">
                  <h4>{{ c.title }}</h4>
                  <p class="muted">{{ c.description }}</p>
                </div>
              </div>
            </div>
            <!-- duplicate for smooth loop -->
            <div class="marquee-item" *ngFor="let c of challenges" (click)="openDetails(c)" role="button" tabindex="0" (keyup.enter)="openDetails(c)">
              <div class="card marquee-card">
                <div class="thumb" [style.backgroundImage]="'url(' + c.image + ')'" aria-hidden="true"></div>
                <div class="marquee-body">
                  <h4>{{ c.title }}</h4>
                  <p class="muted">{{ c.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
export class BrowseChallengesComponent implements OnInit, OnDestroy {
  challenges = [
    { id: 'commute', title: 'Sustainable Commuting', description: 'Adopt eco-friendly commuting habits like biking or walking.', image: '/assets/icons/Gemini_Generated_Image_mfx6llmfx6llmfx6.png' },
    { id: 'cleanup', title: 'Community Clean-up Drive', description: 'Join local clean-up efforts to reduce waste and protect nature.', image: '/assets/ecolife-bg.jpg' },
    { id: 'wildlife', title: 'Support Local Wildlife', description: 'Help conserve wildlife by creating safe habitats.', image: '/assets/icons/Gemini_Generated_Image_mfx6llmfx6llmfx6.png' },
    { id: 'plastic', title: 'Reduce Plastic Waste', description: 'Minimize single-use plastics and encourage recycling.', image: '/assets/ecolife-bg.jpg' }
  ];

  current = 0;

  constructor(private router: Router, private supabase: SupabaseService) {}

  ngOnInit(): void {
    // manual marquee - no autoplay initialization
  }

  ngOnDestroy(): void {
    // manual marquee - no teardown needed
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
