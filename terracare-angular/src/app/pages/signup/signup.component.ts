import { Component, Optional, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS, HttpClientModule],
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
    phone: ['', [Validators.required, Validators.pattern(/^(?:\+63|0)9\d{9}$/)]],
    address: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    privacy: [false, Validators.requiredTrue],
    terms: [false, Validators.requiredTrue],
  }, { validators: this.passwordsMatch });

  message = '';
  submitting = false;
  showAgreeModal = false;
  constructor(
    private fb: FormBuilder, 
    private auth: AuthService,
    private http: HttpClient,
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
    const { fullname, email, password, phone, address } = this.form.value;
    const normalizedFull = (fullname || '').trim();
    // Block duplicate full name usage by calling server-side check
    try {
      const params = { name: normalizedFull };
      const resp = await firstValueFrom(this.http.get<{ taken: boolean; source?: string; field?: string }>('/api/auth/check-name', { params }));
      if (resp && resp.taken) {
        this.snackBar.open('Full name already in use. Please choose a different name.', 'Dismiss', { duration: 5000, panelClass: ['snack-on-top'] });
        return;
      }
    } catch (e) {
      console.warn('Name-check endpoint failed:', e);
      // allow signup to proceed if name-check fails
    }
    this.submitting = true;
    try {
      // Notify user that signup is in progress
      this.snackBar.open('Creating account…', undefined, { duration: 3000, panelClass: ['snack-on-top'] });
      // Pass phone and address into user metadata so it is persisted with the auth user
      await this.auth.signUp(email!, password!, fullname!, { phone: phone || null, address: address || null });
      // Inform the user and open login dialog to proceed
      this.message = 'Signup successful. Please check your email to verify your account.';
      this.snackBar.open('Signup successful. Check your email.', 'OK', { duration: 4000, panelClass: ['snack-on-top'] });
      if (this.dialogRef) {
        this.dialogRef.close();
        setTimeout(() => this.authDialog.openLogin(), 0);
      } else {
        this.authDialog.openLogin();
      }
    } catch (e: any) {
      this.message = e?.message || 'Signup failed';
      // Show error toast
      this.snackBar.open(this.message, 'Dismiss', { duration: 5000, panelClass: ['snack-on-top'] });
    } finally {
      this.submitting = false;
    }
  }

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

