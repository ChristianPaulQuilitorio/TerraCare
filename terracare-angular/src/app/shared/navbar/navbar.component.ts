import { Component, ViewEncapsulation, OnInit, Input, Output, EventEmitter, OnDestroy, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../ui/material.imports';
import { AuthDialogService } from '../ui/auth-dialog.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { TourService } from '../../core/services/tour.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule, ...MATERIAL_IMPORTS],
  template: `
  <mat-sidenav-container class="navbar-shell" [class.drawer-open]="drawerOpen">
  <!-- Mobile drawer -->
      <mat-sidenav
        #mobileDrawer
        class="mobile-drawer"
        [mode]="'over'"
    [opened]="false"
        [fixedInViewport]="isHandset"
  [fixedTopGap]="toolbarHeight"
    (keydown.escape)="mobileDrawer.close()"
        (backdropClick)="mobileDrawer.close()"
        (openedChange)="onDrawerOpenedChanged($event)">
  <mat-nav-list (click)="mobileDrawer.close()">
          <!-- Hide page navigation links when hideLinks=true (e.g., landing page) -->
          <ng-container *ngIf="!hideLinks">
            <a mat-list-item *ngFor="let link of navLinks" [routerLink]="link.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: link.exact }">
              <span>{{ link.label }}</span>
            </a>
          </ng-container>
          <!-- Mobile-only tour entry (visible in burger menu) -->
          <a mat-list-item (click)="toggleTour()">
            <mat-icon>help_outline</mat-icon>
            <span style="margin-left:8px">Take a tour</span>
          </a>
          <a mat-list-item *ngIf="isAuthenticated && !isLandingRoute" routerLink="/profile" routerLinkActive="active">Profile</a>
          <ng-container *ngIf="!isAuthenticated">
            <a mat-list-item (click)="openLogin()">Login</a>
            <a mat-list-item (click)="openSignup()">Sign Up</a>
          </ng-container>
          <a mat-list-item *ngIf="isAuthenticated && !isLandingRoute" routerLink="/logout">Logout</a>
        </mat-nav-list>
      </mat-sidenav>

      <mat-toolbar class="navbar">
        <button *ngIf="isHandset" mat-icon-button class="menu-button" aria-label="Toggle navigation" [attr.aria-expanded]="mobileDrawer.opened" (click)="mobileDrawer.toggle()">
          <mat-icon>menu</mat-icon>
        </button>

        <a class="navbar-logo" routerLink="/home" aria-label="TerraCare home">
          <img [src]="logoSrc" alt="TerraCare logo" class="logo-img" />
        </a>

        <!-- Desktop nav links -->
        <ul class="navbar-links" *ngIf="!hideLinks">
          <li *ngFor="let link of navLinks">
            <a mat-button *ngIf="isAuthenticated; else guestLink" [routerLink]="link.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: link.exact }">{{ link.label }}</a>
            <ng-template #guestLink>
              <a mat-button (click)="openLogin()">{{ link.label }}</a>
            </ng-template>
          </li>
          <li *ngIf="isAuthenticated"><a mat-button routerLink="/profile" routerLinkActive="active">Profile</a></li>
        </ul>

        <span class="spacer"></span>

        <!-- Actions -->
        <div class="navbar-actions">
          <ng-container *ngIf="isAuthenticated && !isLandingRoute; else guestActions">
            <a class="tc-btn tc-outline" routerLink="/profile" title="Profile">Profile</a>
            <a class="tc-btn tc-primary" routerLink="/logout" title="Logout">Logout</a>
            <button mat-icon-button title="Tour" (click)="toggleTour()" [attr.aria-pressed]="tour.active" style="margin-left:8px">
              <mat-icon aria-hidden="false">help_outline</mat-icon>
            </button>
          </ng-container>
          <ng-template #guestActions>
            <!-- On landing route, clicking nav items should open login -->
            <ng-container *ngIf="!isLandingRoute; else landingActions">
              <button class="tc-btn tc-secondary" type="button" (click)="openSignup()" title="Sign Up">Sign Up</button>
              <button class="tc-btn tc-primary" type="button" (click)="openLogin()" title="Login">Login</button>
                <button mat-icon-button title="Tour" (click)="toggleTour()" [attr.aria-pressed]="tour.active" style="margin-left:8px">
                  <mat-icon aria-hidden="false">help_outline</mat-icon>
                </button>
            </ng-container>
            <ng-template #landingActions>
              <button class="tc-btn tc-primary" type="button" (click)="openLogin()" title="Login">Login</button>
              <button mat-icon-button title="Tour" (click)="toggleTour()" [attr.aria-pressed]="tour.active" style="margin-left:8px">
                <mat-icon aria-hidden="false">help_outline</mat-icon>
              </button>
            </ng-template>
          </ng-template>
        </div>
      </mat-toolbar>
    </mat-sidenav-container>
  `,
  styleUrls: ['./navbar.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('mobileDrawer') mobileDrawer?: MatSidenav;
  drawerOpen = false;
  isAuthenticated = false;
  // Optional external control still supported for legacy usage
  @Input() showMenuButton = false; // legacy external control (not needed with internal detection)
  @Output() menuToggle = new EventEmitter<void>(); // legacy external event
  // When true, hides standard page navigation links (used for landing page minimalist header)
  @Input() hideLinks = false;
  // Updated to TerraCare official logo (ensure file exists at this path)
  // Use app-relative path (no leading slash) so it works in both CSR and SSR builds
  logoSrc = 'assets/TerraCareLogo.png';
  // Navigation links reused by desktop (mobile uses parent sidenav)
  navLinks = [
    { label: 'Home', route: '/home', exact: true },
    { label: 'Dashboard', route: '/dashboard', exact: false },
    { label: 'Challenges', route: '/challenges', exact: false },
    { label: 'Leaderboard', route: '/leaderboard', exact: false },
    { label: 'Knowledge Hub', route: '/knowledge', exact: false },
    { label: 'Forum', route: '/forum', exact: false },
  ];
  isHandset = false;
  toolbarHeight = 64;
  private bpSub?: Subscription;
  private navEndSub?: Subscription;
  private supabaseAuthSub?: { unsubscribe: () => void };
  isLandingRoute = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private authDialog: AuthDialogService,
    private breakpoints: BreakpointObserver,
    private supabase: SupabaseService,
    public tour: TourService
  ) {}

  ngOnInit() {
    // Check auth status without blocking UI
    this.checkAuthStatus();
    // Observe viewport size for mobile menu
    this.bpSub = this.breakpoints.observe('(max-width: 840px)').subscribe(result => {
      this.isHandset = result.matches;
      this.toolbarHeight = result.matches ? 56 : 64;
    });

    // React to Supabase auth state changes to keep navbar actions in sync
    const { data } = this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.isAuthenticated = !!session?.user;
    });
    this.supabaseAuthSub = data?.subscription as any;

    // Auto-close mobile drawer after any navigation (legacy event emitter retained)
    this.navEndSub = this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd && this.isHandset) {
        this.menuToggle.emit();
      }
      if (evt instanceof NavigationEnd) {
        this.isLandingRoute = this.router.url === '/' || this.router.url.startsWith('/landing');
      }
    });

    // Initial route check
    this.isLandingRoute = this.router.url === '/' || this.router.url.startsWith('/landing');
  }

  ngOnDestroy() {
    this.bpSub?.unsubscribe();
    this.navEndSub?.unsubscribe();
    this.supabaseAuthSub?.unsubscribe?.();
  }

  async checkAuthStatus() {
    try {
      const user = await this.authService.getCurrentUser();
      this.isAuthenticated = !!user;
      if (user) {
        console.log('User authenticated:', user.email);
      }
    } catch (error: any) {
      console.log('Auth check failed:', error?.message || error);
      this.isAuthenticated = false;
    }
  }

  openLogin() { this.authDialog.openLogin(); }
  openSignup() { this.authDialog.openSignup(); }

  onDrawerOpenedChanged(open: boolean) {
    // lock body scroll when drawer is open for a true overlay feel
    try {
      document.body.style.overflow = open ? 'hidden' : '';
    } catch { /* no-op for SSR */ }
    this.drawerOpen = open;
  }

  toggleTour() {
    try { this.tour.toggle(); } catch (e) { console.error('Tour toggle failed', e); }
  }
}
