import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container" style="padding:24px 16px; max-width:900px; margin:0 auto;">
      <h1>Privacy Policy</h1>
      <p>Last updated: 2025-11-06</p>
      <p>
        We collect only the information necessary to create and manage your account, improve your
        experience, secure our platform, and communicate important updates. We do not sell your data.
      </p>
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
      <p>If you have questions, contact us via the support email linked in the app.</p>
    </div>
  `
})
export class PrivacyComponent {}
