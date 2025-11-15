import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

@Injectable({ providedIn: 'root' })
export class AuthDialogService {
  private dialog = inject(MatDialog);
  private loginRef?: MatDialogRef<any>;

  async openLogin() {
    if (this.loginRef) { return this.loginRef; }
    const { LoginComponent } = await import('../../pages/login/login.component');
    this.loginRef = this.dialog.open(LoginComponent, {
      width: '100%',
      maxWidth: '520px',
      maxHeight: '90vh',
      panelClass: 'auth-dialog',
      backdropClass: 'auth-backdrop',
      autoFocus: 'first-tabbable' as any
    });
    this.loginRef.afterClosed().subscribe(() => { this.loginRef = undefined; });
    return this.loginRef;
  }

  async openSignup() {
    const { SignupComponent } = await import('../../pages/signup/signup.component');
    return this.dialog.open(SignupComponent, {
      width: '100%',
      maxWidth: '560px',
      maxHeight: '90vh',
      panelClass: 'auth-dialog',
      backdropClass: 'auth-backdrop',
      autoFocus: 'first-tabbable' as any
    });
  }

  async openForgotPassword() {
    const { ForgotPasswordComponent } = await import('../../pages/forgot-password/forgot-password.component');
    return this.dialog.open(ForgotPasswordComponent, {
      width: '100%',
      maxWidth: '520px',
      maxHeight: '90vh',
      panelClass: 'auth-dialog',
      backdropClass: 'auth-backdrop',
      autoFocus: 'first-tabbable' as any
    });
  }
}
