import { Component, ViewEncapsulation } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-challenge-progress',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  template: `
    <app-navbar></app-navbar>
    <main class="progress-page">
      <header class="progress-header">
        <div>
          <h1>My Challenge Progress</h1>
          <p class="subtitle">Track progress, milestones, and impact for your active challenges</p>
        </div>
        <div class="header-actions">
          <button class="btn" routerLink="/challenges">Back</button>
          <button class="btn btn-primary">Share Progress</button>
        </div>
      </header>

      <section class="progress-summary">
        <div class="summary-cards">
          <div class="card">
            <h4>Current Challenge</h4>
            <p class="muted">Sustainable Commuting</p>
          </div>
          <div class="card">
            <h4>Impact Score</h4>
            <p class="number">720</p>
          </div>
          <div class="card">
            <h4>Completed</h4>
            <p class="number">3 / 9</p>
          </div>
        </div>

        <div class="overall-progress card">
          <h4>Overall Progress</h4>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="progress"></div>
          </div>
          <p class="muted">{{progress}}% complete</p>
        </div>
      </section>

      <section class="milestones">
        <h3>Milestones</h3>
        <ul>
          <li *ngFor="let m of milestones">
            <div class="milestone-left">
              <strong>{{m.title}}</strong>
              <p class="muted">{{m.desc}}</p>
            </div>
            <div class="milestone-right">
              <span class="muted">{{m.status}}</span>
            </div>
          </li>
        </ul>
      </section>
    </main>
  `,
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengeProgressComponent {
  progress = 33;
  milestones = [
    { title: 'Week 1: Try walking', desc: 'Walk or bike twice this week', status: 'Done' },
    { title: 'Week 2: Swap a car trip', desc: 'Replace 1 short drive with walking', status: 'In progress' },
    { title: 'Week 3: Track commute', desc: 'Log trips for one week', status: 'Pending' }
  ];
}
