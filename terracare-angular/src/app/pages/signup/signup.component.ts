import { Component, Optional, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PrivacyDialogComponent } from '../legal/privacy-dialog.component';
import { TermsDialogComponent } from '../legal/terms-dialog.component';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { AuthDialogService } from '../../shared/ui/auth-dialog.service';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class SignupComponent {
  hidePassword = true;
  hideConfirm = true;
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
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private authDialog: AuthDialogService,
    @Optional() private dialogRef?: MatDialogRef<SignupComponent>
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
      this.snackBar.open('Please agree to the Privacy Policy and Terms to create an account.', 'Dismiss', { duration: 3000 });
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
            // Verified — switch to login dialog so the user can sign in
            if (this.dialogRef) {
              this.dialogRef.close();
              setTimeout(() => this.authDialog.openLogin(), 0);
            } else {
              // No route — open login dialog
              this.authDialog.openLogin();
            }
        } else {
          this.message = 'Email not verified yet. Please check your inbox or click resend.';
        }
      } catch (e: any) {
        this.message = e?.message || 'Error checking verification status.';
      } finally {
        this.verificationCheckBusy = false;
      }
  }
  // Dialog handlers
  openPrivacy() {
    this.dialog.open(PrivacyDialogComponent, { width: '640px', maxHeight: '80vh' });
  }
  openTerms() {
    this.dialog.open(TermsDialogComponent, { width: '640px', maxHeight: '80vh' });
  }

  openLogin() {
    if (this.dialogRef) {
      this.dialogRef.close();
      setTimeout(() => this.authDialog.openLogin(), 0);
    } else {
      this.authDialog.openLogin();
    }
  }
}
// TODO: Replace with real signup service and route to dashboard after signup.
