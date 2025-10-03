import { Component, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/auth.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  template: `
    <nav class="navbar">
      <div class="navbar-logo">
        <a routerLink="/">
          <img src="/assets/icons/Gemini_Generated_Image_mfx6llmfx6llmfx6.png" alt="TerraCare logo" class="logo-img" />
          <span class="sr-only">TerraCare</span>
        </a>
      </div>
      <ul class="navbar-links">
        <li><a routerLink="/">Home</a></li>
        <li *ngIf="isAuthenticated$ | async"><a routerLink="/dashboard">Dashboard</a></li>
        <li *ngIf="isAuthenticated$ | async"><a routerLink="/challenges">Challenges</a></li>
        <li><a routerLink="/knowledge">Knowledge Hub</a></li>
        <li *ngIf="isAuthenticated$ | async"><a routerLink="/forum">Forum</a></li>
      </ul>
      <ul class="navbar-actions">
        <li *ngIf="!(isAuthenticated$ | async)"><a routerLink="/login">Login</a></li>
        <li *ngIf="!(isAuthenticated$ | async)"><a routerLink="/signup">Sign Up</a></li>
        <li *ngIf="isAuthenticated$ | async">
          <span class="user-greeting">Hello, {{ (user$ | async)?.fullName || (user$ | async)?.email }}</span>
        </li>
        <li *ngIf="isAuthenticated$ | async">
          <a (click)="logout()" title="Logout" style="cursor: pointer;">
            <span class="icon-logout">Logout</span>
          </a>
        </li>
      </ul>
    </nav>
  `,
  styleUrls: ['./navbar.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class NavbarComponent {
  isAuthenticated$: Observable<boolean>;
  user$: Observable<User | null>;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    this.isAuthenticated$ = this.authService.isAuthenticated$;
    this.user$ = this.authService.user$;
  }

  logout(): void {
    this.authService.signOut().subscribe({
      next: (success) => {
        if (success) {
          this.router.navigate(['/']);
        } else {
          console.error('Failed to sign out');
        }
      },
      error: (error) => {
        console.error('Error during sign out:', error);
      }
    });
  }
}
