import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

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
        <li><a [routerLink]="isAuthenticated ? '/home' : '/'">Home</a></li>
        <li><a routerLink="/dashboard">Dashboard</a></li>
        <li><a routerLink="/challenges">Challenges</a></li>
        <li><a routerLink="/knowledge">Knowledge Hub</a></li>
        <li><a routerLink="/forum">Forum</a></li>
        <li *ngIf="isAuthenticated"><a routerLink="/dashboard">Profile</a></li>
      </ul>
      <ul class="navbar-actions">
        <li><a title="Search"><span class="icon-search"></span></a></li>
        <li *ngIf="isAuthenticated"><a routerLink="/logout" title="Logout"><span class="icon-logout"></span></a></li>
        <li *ngIf="!isAuthenticated"><a routerLink="/login" title="Login">Login</a></li>
      </ul>
    </nav>
  `,
  styleUrls: ['./navbar.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class NavbarComponent implements OnInit {
  isAuthenticated = false;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Check auth status without blocking UI
    this.checkAuthStatus();
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
}
