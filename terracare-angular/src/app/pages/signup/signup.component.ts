import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { SignUpRequest } from '../../core/models/auth.model';

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

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private userService: UserService,
    private router: Router
  ) {}

  passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const p = group.get('password')?.value;
    const c = group.get('confirmPassword')?.value;
    return p && c && p === c ? null : { mismatch: true };
  }

  get canSubmit(): boolean { 
    return this.form.valid && !this.isLoading; 
  }

  submit() {
    if (!this.canSubmit) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formValue = this.form.value;
    const signUpData: SignUpRequest = {
      email: formValue.email!,
      password: formValue.password!,
      fullName: formValue.fullname!
    };

    this.authService.signUp(signUpData).subscribe({
      next: (response) => {
        this.isLoading = false;
        
        if (response.success) {
          if (response.user) {
            // Create user profile
            this.userService.createUserProfile(response.user.id, response.user.fullName).subscribe({
              next: (profileResponse) => {
                if (profileResponse.success) {
                  this.successMessage = response.message || 'Account created successfully!';
                  
                  // If user is automatically logged in, redirect to dashboard
                  if (this.authService.isAuthenticated()) {
                    setTimeout(() => {
                      this.router.navigate(['/dashboard']);
                    }, 2000);
                  } else {
                    // If email confirmation is required, show message
                    setTimeout(() => {
                      this.router.navigate(['/login']);
                    }, 3000);
                  }
                } else {
                  this.errorMessage = 'Account created but failed to set up profile. Please contact support.';
                }
              },
              error: () => {
                this.errorMessage = 'Account created but failed to set up profile. Please contact support.';
              }
            });
          } else {
            this.successMessage = response.message || 'Account created successfully!';
            setTimeout(() => {
              this.router.navigate(['/login']);
            }, 3000);
          }
        } else {
          this.errorMessage = response.error || 'Failed to create account. Please try again.';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = 'An unexpected error occurred. Please try again.';
        console.error('Signup error:', error);
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
