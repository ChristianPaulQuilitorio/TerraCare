import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div mat-dialog-title style="display:flex; align-items:center; gap:12px;">
  <img src="assets/TerraCareLogo.png" alt="TerraCare logo" style="width:32px;height:32px;border-radius:6px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,.15);" />
      <h2 style="margin:0; font-weight:600;">Terms of Use</h2>
    </div>
    <div mat-dialog-content>
      <p style="color:rgba(0,0,0,.7)">By using TerraCare, you agree to follow applicable laws, provide accurate information, and not misuse or disrupt the platform. Features may change over time.</p>
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
    <div mat-dialog-actions align="end">
      <button mat-stroked-button class="tc-outline" mat-dialog-close>Close</button>
    </div>
  `
})
export class TermsDialogComponent {}
