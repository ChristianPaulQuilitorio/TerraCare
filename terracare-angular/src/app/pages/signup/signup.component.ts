import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class SignupComponent {
  form = this.fb.group({
    fullname: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    privacy: [false, Validators.requiredTrue],
    terms: [false, Validators.requiredTrue],
  }, { validators: this.passwordsMatch });

  message = '';
  submitting = false;
  showAgreeModal = false;
  verificationSent = false;
  verificationEmail = '';
  resendBusy = false;
  verificationCheckBusy = false;
  constructor(
    private fb: FormBuilder, 
    private auth: AuthService,
    private router: Router
  ) {}

  passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const p = group.get('password')?.value;
    const c = group.get('confirmPassword')?.value;
    return p && c && p === c ? null : { mismatch: true };
  }

  get canSubmit(): boolean { return this.form.valid; }

  // Allow clicking submit when core fields are valid even if privacy/terms unchecked
  get canAttemptSubmit(): boolean {
    const f = this.form;
    const fullnameValid = f.get('fullname')?.valid;
    const emailValid = f.get('email')?.valid;
    const passwordValid = f.get('password')?.valid;
    const confirmValid = f.get('confirmPassword')?.valid;
    const noMismatch = !f.errors || !f.errors['mismatch'];
    return !!(fullnameValid && emailValid && passwordValid && confirmValid && noMismatch);
  }

  async submit() {
    // If agreements are not checked, show notification toast and stop
    const agreedPrivacy = !!this.form.get('privacy')?.value;
    const agreedTerms = !!this.form.get('terms')?.value;
    if (!agreedPrivacy || !agreedTerms) {
      this.showAgreeModal = true;
      return;
    }

    if (!this.canSubmit) return; // guard against other invalid cases
    const { fullname, email, password } = this.form.value;
    this.submitting = true;
    try {
      await this.auth.signUp(email!, password!, fullname!);
      // Show verification message and offer resend
      this.verificationSent = true;
      this.verificationEmail = email || '';
      this.message = 'Signup successful. A verification email has been sent.';
      // Do not auto-redirect — wait for user to verify
    } catch (e: any) {
      this.message = e?.message || 'Signup failed';
    } finally {
      this.submitting = false;
    }
  }
  
    async resendVerification() {
      if (!this.verificationEmail) return;
      this.resendBusy = true;
      try {
        await this.auth.resendVerification(this.verificationEmail);
        this.message = 'Verification email resent. Please check your inbox.';
      } catch (e: any) {
        this.message = e?.message || 'Failed to resend verification.';
      } finally {
        this.resendBusy = false;
      }
    }

    async checkVerification() {
      if (!this.verificationEmail) return;
      this.verificationCheckBusy = true;
      try {
        const user = await this.auth.getCurrentUser();
        if (user && user.email === this.verificationEmail) {
          // Verified — redirect to login so the user can sign in
          this.router.navigateByUrl('/login');
        } else {
          this.message = 'Email not verified yet. Please check your inbox or click resend.';
        }
      } catch (e: any) {
        this.message = e?.message || 'Error checking verification status.';
      } finally {
        this.verificationCheckBusy = false;
      }
  }
  // Modal state and handlers
  showPrivacy = false;
  showTerms = false;
  openPrivacy() { this.showPrivacy = true; }
  closePrivacy() { this.showPrivacy = false; }
  openTerms() { this.showTerms = true; }
  closeTerms() { this.showTerms = false; }
}
// TODO: Replace with real signup service and route to dashboard after signup.
