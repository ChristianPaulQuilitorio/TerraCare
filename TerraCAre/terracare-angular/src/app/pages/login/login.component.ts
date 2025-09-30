import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class LoginComponent {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [false],
    privacy: [false, Validators.requiredTrue],
    terms: [false, Validators.requiredTrue],
  });

  constructor(private fb: FormBuilder) {}

  get canSubmit(): boolean {
    return this.form.valid;
  }

  submit() {
    if (!this.canSubmit) return;
    // Placeholder: handle login
    alert('Logged in (demo)');
  }

  // Modal state and handlers
  showPrivacy = false;
  showTerms = false;

  openPrivacy() { this.showPrivacy = true; }
  closePrivacy() { this.showPrivacy = false; }
  openTerms() { this.showTerms = true; }
  closeTerms() { this.showTerms = false; }
}
// In a real app, you'd handle auth via a service and route accordingly.
