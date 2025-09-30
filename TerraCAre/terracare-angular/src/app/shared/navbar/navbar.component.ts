import { Component, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
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
        <li><a routerLink="/dashboard">Dashboard</a></li>
        <li><a routerLink="/challenges">Challenges</a></li>
        <li><a routerLink="/knowledge">Knowledge Hub</a></li>
        <li><a routerLink="/forum">Forum</a></li>
        <li><a (click)="goToProfile()" href="/login">Profile</a></li>
      </ul>
      <ul class="navbar-actions">
        <li><a title="Search"><span class="icon-search"></span></a></li>
        <li><a title="Logout"><span class="icon-logout"></span></a></li>
      </ul>
    </nav>
  `,
  styleUrls: ['./navbar.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class NavbarComponent {
  constructor(private router: Router) {}
  // Since we have no auth yet, always send to login.
  goToProfile() {
    this.router.navigateByUrl('/login');
  }
}
