import { Component, Optional, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { AuthDialogService } from '../../shared/ui/auth-dialog.service';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class LoginComponent {
  hidePassword = true;
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [false],
  });

  submitting = false;
  errorText = 'Please check your email or password.';

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private authDialog: AuthDialogService,
    @Optional() private dialogRef?: MatDialogRef<LoginComponent>,
    private snackBar?: MatSnackBar
  ) {}

  get canSubmit(): boolean {
    return this.form.valid;
  }

  async submit() {
    if (!this.canSubmit) return;
    const { email, password, remember } = this.form.value as { email: string; password: string; remember: boolean };
    this.submitting = true;
    try {
      // Persist preference before sign-in so storage adapter uses the right backing store
      try { localStorage.setItem('tc.rememberMe', String(!!remember)); } catch {}
      await this.auth.signIn(email!, password!);
      // If opened as a dialog, close it and navigate immediately
      if (this.dialogRef) {
        this.dialogRef.close(true);
        this.router.navigate(['/home']);
      } else {
        // Page mode: show a brief success snackbar then navigate
        this.snackBar?.open('Login successful. Redirecting…', undefined, { duration: 1500 });
        setTimeout(() => this.router.navigate(['/home']), 1000);
      }
    } catch (_e) {
      this.errorText = 'Please check your email or password.';
      this.snackBar?.open(this.errorText, 'Dismiss', { duration: 3000, panelClass: ['mat-warn'] });
    } finally {
      this.submitting = false;
    }
  }
  goDashboard() { this.router.navigate(['/home']); }

  // Removed privacy/terms agreement from login page
  openForgot(ev: Event) {
    ev.preventDefault();
    if (this.dialogRef) {
      this.dialogRef.close();
      setTimeout(() => this.authDialog.openForgotPassword(), 0);
    } else {
      this.authDialog.openForgotPassword();
    }
  }

  openSignup() {
    if (this.dialogRef) {
      this.dialogRef.close();
      setTimeout(() => this.authDialog.openSignup(), 0);
    } else {
      this.authDialog.openSignup();
    }
  }
}
// In a real app, you'd handle auth via a service and route accordingly.
