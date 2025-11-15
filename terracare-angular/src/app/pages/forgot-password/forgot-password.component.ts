import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthDialogService } from '../../shared/ui/auth-dialog.service';
import { MatDialogRef } from '@angular/material/dialog';
import { Optional } from '@angular/core';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ForgotPasswordComponent {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor(
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private authDialog: AuthDialogService,
    @Optional() private dialogRef?: MatDialogRef<ForgotPasswordComponent>
  ) {}

  get canSubmit(): boolean { return this.form.valid; }

  submit() {
    if (!this.canSubmit) return;
    this.snackBar.open('Password reset link sent (demo).', 'Dismiss', { duration: 2500 });
  }
  // Dialog handlers
  openLogin() {
    if (this.dialogRef) {
      this.dialogRef.close();
      setTimeout(() => this.authDialog.openLogin(), 0);
    } else {
      this.authDialog.openLogin();
    }
  }
}
// TODO: Hook up form submission to API.
