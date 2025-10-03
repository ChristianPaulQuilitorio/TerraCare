import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ResetPasswordRequest } from '../../core/models/auth.model';

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

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {}

  get canSubmit(): boolean { 
    return this.form.valid && !this.isLoading; 
  }

  submit() {
    if (!this.canSubmit) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formValue = this.form.value;
    const resetData: ResetPasswordRequest = {
      email: formValue.email!
    };

    this.authService.resetPassword(resetData).subscribe({
      next: (response) => {
        this.isLoading = false;
        
        if (response.success) {
          this.successMessage = response.message || 'Password reset email sent! Please check your inbox.';
          this.form.reset({
            email: '',
            privacy: false,
            terms: false
          });
        } else {
          this.errorMessage = response.error || 'Failed to send password reset email. Please try again.';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = 'An unexpected error occurred. Please try again.';
        console.error('Password reset error:', error);
      }
    });
  }

  // Modal state and handlers
  showPrivacy = false;
  showTerms = false;
  openPrivacy() { this.showPrivacy = true; }
  closePrivacy() { this.showPrivacy = false; }
  openTerms() { this.showTerms = true; }
  closeTerms() { this.showTerms = false; }
}
