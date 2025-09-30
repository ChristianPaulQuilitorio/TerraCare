import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ForgotPasswordComponent {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    privacy: [false, Validators.requiredTrue],
    terms: [false, Validators.requiredTrue],
  });

  constructor(private fb: FormBuilder) {}

  get canSubmit(): boolean { return this.form.valid; }

  submit() {
    if (!this.canSubmit) return;
    alert('Password reset link sent (demo)');
  }
  // Modal state and handlers
  showPrivacy = false;
  showTerms = false;
  openPrivacy() { this.showPrivacy = true; }
  closePrivacy() { this.showPrivacy = false; }
  openTerms() { this.showTerms = true; }
  closeTerms() { this.showTerms = false; }
}
// TODO: Hook up form submission to API.
