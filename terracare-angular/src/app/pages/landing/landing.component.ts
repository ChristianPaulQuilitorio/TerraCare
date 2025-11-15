import { Component, ViewEncapsulation, OnInit, AfterViewInit, Inject, PLATFORM_ID, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthDialogService } from '../../shared/ui/auth-dialog.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
    <header class="landing-header">
      <section class="hero" role="banner">
        <div class="hero-inner container">
          <h1 class="hero-title">Empowering communities to protect ecosystems through knowledge and action.</h1>
          <p class="hero-subtitle">Join thousands of eco-champions making a real difference in environmental conservation.</p>
          <div class="hero-actions">
            <button class="tc-btn tc-primary" (click)="openSignup()" type="button">Get Started</button>
            <button class="tc-btn tc-outline" (click)="openLogin()" type="button">Sign In</button>
          </div>
        </div>
      </section>
    </header>
    <main>
      <section class="challenges container" aria-label="Ongoing Eco-Challenges">
        <h2>Ongoing Eco-Challenges</h2>
        <div *ngIf="!loading && challenges.length; else noChallenges" class="carousel-wrapper" aria-live="polite" #carouselWrapper>
          <div class="carousel" (mouseenter)="pauseCarousel()" (mouseleave)="resumeCarousel()">
            <div class="carousel-track" #carouselTrack [style.animationPlayState]="carouselPaused ? 'paused' : 'running'">
              <ng-container *ngFor="let c of loopedChallenges">
                <div class="card" tabindex="0">
                  <h3>{{ c.title }}</h3>
                  <p>{{ c.description }}</p>
                  <button mat-raised-button color="primary" class="btn small" type="button" (click)="openSignup()" [attr.aria-label]="'Learn more about ' + c.title + ' challenge'">Learn More</button>
                </div>
              </ng-container>
            </div>
          </div>
        </div>
        <ng-template #noChallenges>
          <div class="empty" *ngIf="!loading">No challenges yet — be the first to create one.</div>
        </ng-template>
      </section>
    </main>
    <footer class="footer">
      <div class="container">
        <p>&copy; 2025 TerraCare. All rights reserved.</p>
      </div>
    </footer>
  `,
  styleUrls: ['./landing.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class LandingComponent implements OnInit, AfterViewInit {
  challenges: Array<{ id: string; title: string; description: string } > = [];
  loading = true;
  loopedChallenges: Array<{ id: string; title: string; description: string }> = [];
  carouselPaused = false;
  private resizeHandler?: () => void;

  @ViewChild('carouselWrapper', { static: false }) wrapperRef?: ElementRef<HTMLDivElement>;
  @ViewChild('carouselTrack', { static: false }) trackRef?: ElementRef<HTMLDivElement>;

  constructor(private supabase: SupabaseService, @Inject(PLATFORM_ID) private platformId: Object, private authDialog: AuthDialogService) {}

  async ngOnInit() {
    // Avoid hitting Supabase during server-side rendering to prevent slow or blocked requests
    if (isPlatformBrowser(this.platformId)) {
      await this.loadChallenges();
    } else {
      this.loading = false;
    }
  }
  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Build once view is ready
      setTimeout(() => this.buildInfiniteCarousel(), 0);
      // Rebuild on resize to keep it seamless
      const onResize = () => this.buildInfiniteCarousel();
      window.addEventListener('resize', onResize);
      this.resizeHandler = () => window.removeEventListener('resize', onResize);
    }
  }
  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.resizeHandler) {
      this.resizeHandler();
    }
  }

  private async loadChallenges() {
    this.loading = true;
    try {
      const { data, error } = await this.supabase.client
        .from('challenges')
        .select('id, title, description, visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      this.challenges = (data || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
      }));
      // Build the seamless carousel after data loads
      setTimeout(() => this.buildInfiniteCarousel(), 0);
    } catch (e) {
      console.warn('Failed to load landing challenges', e);
      this.challenges = [];
      this.loopedChallenges = [];
    } finally {
      this.loading = false;
    }
  }
  /**
   * Build a truly seamless loop by creating TWO identical halves:
   * - First, expand a base set until its width >= wrapper width (so there's no gap)
   * - Then render exactly [baseSet, baseSet] so translating -50% loops perfectly
   */
  private buildInfiniteCarousel() {
    const wrapper = this.wrapperRef?.nativeElement;
    const track = this.trackRef?.nativeElement;
    if (!wrapper || !track) return;
    if (!this.challenges || this.challenges.length === 0) {
      this.loopedChallenges = [];
      return;
    }

    // Start with one copy of the challenges as the "half" set.
    let half: Array<{ id: string; title: string; description: string }> = [...this.challenges];

    // Render one half to measure its width.
    this.loopedChallenges = [...half];

    // We need Angular to render before measuring width.
    setTimeout(() => {
      let guard = 0;
      const minWidth = wrapper.clientWidth + 32; // small buffer to avoid edge gaps

      // Keep appending base challenges to the half until it is at least wrapper width.
      while (this.trackRef && this.trackRef.nativeElement.scrollWidth < minWidth && guard++ < 12) {
        half = half.concat(this.challenges);
        this.loopedChallenges = [...half];
      }

      // Finally, set the track to exactly two identical halves.
      this.loopedChallenges = half.concat(half);
    }, 0);
  }

  openLogin() { if (isPlatformBrowser(this.platformId)) { this.authDialog.openLogin(); } }
  openSignup() { if (isPlatformBrowser(this.platformId)) { this.authDialog.openSignup(); } }

  pauseCarousel() { this.carouselPaused = true; }
  resumeCarousel() { this.carouselPaused = false; }
}
