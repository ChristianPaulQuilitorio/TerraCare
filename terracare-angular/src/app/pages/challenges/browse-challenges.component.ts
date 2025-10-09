import { Component, ViewEncapsulation } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-browse-challenges',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  template: `
    <app-navbar></app-navbar>
    <main class="browse-container">
      <section class="browse-hero">
        <h1>Browse Challenges</h1>
        <p>Discover challenges by category, difficulty, and impact.</p>
      </section>

      <section class="browse-list">
        <div class="card">
          <h3>Sustainable Commuting</h3>
          <p>Adopt eco-friendly commuting habits like biking or walking.</p>
          <button class="btn" routerLink="/challenges">Back</button>
        </div>
        <div class="card">
          <h3>Community Clean-up Drive</h3>
          <p>Join local clean-up efforts to reduce waste and protect nature.</p>
          <button class="btn" routerLink="/challenges">Back</button>
        </div>
      </section>
    </main>
  `,
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class BrowseChallengesComponent {}
