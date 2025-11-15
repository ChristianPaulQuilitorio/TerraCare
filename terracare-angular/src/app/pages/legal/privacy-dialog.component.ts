import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div mat-dialog-title style="display:flex; align-items:center; gap:12px;">
  <img src="assets/TerraCareLogo.png" alt="TerraCare logo" style="width:32px;height:32px;border-radius:6px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,.15);" />
      <h2 style="margin:0; font-weight:600;">Privacy Policy</h2>
    </div>
    <div mat-dialog-content>
      <p style="color:rgba(0,0,0,.7)">We collect only the information necessary to create and manage your account, improve your experience, secure our platform, and communicate important updates. We do not sell your data.</p>
      <h3>Information We Collect</h3>
      <ul>
        <li>Account data: name, email address</li>
        <li>Usage data: basic analytics to improve the service</li>
      </ul>
      <h3>How We Use Your Data</h3>
      <ul>
        <li>Provide and secure your account</li>
        <li>Improve features and fix issues</li>
        <li>Send important notices</li>
      </ul>
      <h3>Your Rights</h3>
      <ul>
        <li>Access, correct, or delete your personal information</li>
        <li>Export a copy of your data upon request</li>
      </ul>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-stroked-button class="tc-outline" mat-dialog-close>Close</button>
    </div>
  `
})
export class PrivacyDialogComponent {}
