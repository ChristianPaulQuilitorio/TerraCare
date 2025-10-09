import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user: any = null;
  loading = true;
  editing = false;
  saving = false;
  message = '';
  
  profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  async ngOnInit() {
    await this.loadUserProfile();
  }

  async loadUserProfile() {
    try {
      this.loading = true;
      this.user = await this.authService.getUserProfile();
      
      if (!this.user) {
        // User not logged in, redirect to login
        console.log('No authenticated user, redirecting to login');
        this.router.navigate(['/login']);
        return;
      }

      // Populate form with current user data
      this.profileForm.patchValue({
        fullName: this.user.fullName || '',
        email: this.user.email || ''
      });
      
    } catch (error) {
      console.error('Error loading profile:', error);
      this.router.navigate(['/login']);
    } finally {
      this.loading = false;
    }
  }

  startEditing() {
    this.editing = true;
    this.message = '';
  }

  cancelEditing() {
    this.editing = false;
    // Reset form to original values
    this.profileForm.patchValue({
      fullName: this.user.fullName || '',
      email: this.user.email || ''
    });
    this.message = '';
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      this.message = 'Please fill in all required fields correctly.';
      return;
    }

    try {
      this.saving = true;
      this.message = '';
      
      const formData = this.profileForm.value;
      
      // For now, we'll just update the local display
      // In a real app, you'd call an API to update the user profile
      this.user.fullName = formData.fullName;
      this.user.email = formData.email;
      
      this.editing = false;
      this.message = 'Profile updated successfully!';
      
      // Auto-clear success message
      setTimeout(() => {
        this.message = '';
      }, 3000);
      
    } catch (error: any) {
      console.error('Error saving profile:', error);
      this.message = 'Failed to update profile. Please try again.';
    } finally {
      this.saving = false;
    }
  }

  async logout() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
