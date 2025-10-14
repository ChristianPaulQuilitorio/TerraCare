import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="simple-nav">
      <div class="nav-brand">🌱 TerraCare</div>
      <div class="nav-links">
        <a routerLink="/login">Login</a>
        <a routerLink="/signup">Sign Up</a>
      </div>
    </nav>
    
    <section class="hero">
      <h1>Empowering communities to protect ecosystems through knowledge and action.</h1>
      <p class="hero-subtitle">Join thousands of eco-champions making a real difference in environmental conservation.</p>
      <div class="hero-actions">
        <a class="btn primary" routerLink="/signup">Get Started</a>
        <a class="btn secondary" routerLink="/login">Sign In</a>
      </div>
    </section>
    
    <section class="challenges">
      <h2>Ongoing Eco-Challenges</h2>
      <div class="cards">
        <div class="card">
          <h3>Global Reforestation Initiative</h3>
          <p>Join hands to plant trees and restore our forests.</p>
          <button class="btn small">Learn More</button>
        </div>
        <div class="card">
          <h3>Ocean Cleanup Drive</h3>
          <p>Be part of cleaning plastic waste from oceans.</p>
          <button class="btn small">Learn More</button>
        </div>
        <div class="card">
          <h3>Protect Our Pollinators</h3>
          <p>Help save bees and promote biodiversity.</p>
          <button class="btn small">Learn More</button>
        </div>
      </div>
    </section>

    <footer class="footer">
      <p>&copy; 2025 TerraCare. All rights reserved.</p>
    </footer>
  `,
  styleUrls: ['./landing.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class LandingComponent {}
