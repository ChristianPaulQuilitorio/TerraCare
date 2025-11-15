import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container" style="padding:24px 16px; max-width:900px; margin:0 auto;">
      <h1>Terms of Use</h1>
      <p>Last updated: 2025-11-06</p>
      <p>
        By using TerraCare, you agree to follow applicable laws, provide accurate information,
        and not misuse or disrupt the platform. Features may change over time.
      </p>
      <h3>Acceptable Use</h3>
      <ul>
        <li>No illegal, abusive, or spam activities</li>
        <li>Respect intellectual property and privacy</li>
      </ul>
      <h3>Accounts</h3>
      <ul>
        <li>You are responsible for keeping your credentials secure</li>
        <li>We may suspend accounts that violate these terms</li>
      </ul>
      <p>TerraCare is provided "as is" without warranties. Liability is limited to the maximum extent permitted by law.</p>
    </div>
  `
})
export class TermsComponent {}
