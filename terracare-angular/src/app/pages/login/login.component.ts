import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

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
  });

  submitting = false;
  showError = false;
  showSuccess = false;
  errorText = 'Please check your email or password.';

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  get canSubmit(): boolean {
    return this.form.valid;
  }

  async submit() {
    if (!this.canSubmit) return;
    const { email, password } = this.form.value;
    this.submitting = true;
    try {
      await this.auth.signIn(email!, password!);
      this.showSuccess = true;
      // Auto-dismiss toast and navigate shortly after
      setTimeout(() => this.router.navigate(['/home']), 1000);
      setTimeout(() => this.closeSuccess(), 2500);
    } catch (_e) {
      this.errorText = 'Please check your email or password.';
      this.showError = true;
      // Auto-dismiss error toast
      setTimeout(() => this.closeError(), 3000);
    } finally {
      this.submitting = false;
    }
  }

  closeError() { this.showError = false; }
  closeSuccess() { this.showSuccess = false; }
  goDashboard() { this.router.navigate(['/home']); }

  // Removed privacy/terms agreement from login page
}
// In a real app, you'd handle auth via a service and route accordingly.
