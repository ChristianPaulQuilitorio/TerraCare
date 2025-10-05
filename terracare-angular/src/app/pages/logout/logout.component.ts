import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './logout.component.html',
  styleUrls: ['./logout.component.scss']
})
export class LogoutComponent implements OnInit {
  isLoggingOut = true;
  errorMessage = '';
  
  constructor(private auth: AuthService, private router: Router) {}

  async ngOnInit() {
    await this.performLogout();
  }

  async performLogout() {
    try {
      this.isLoggingOut = true;
      this.errorMessage = '';
      
      // Sign out from Supabase
      await this.auth.signOut('global');
      
      // Clear any local storage/session storage if needed
      localStorage.clear();
      sessionStorage.clear();
      
      // Small delay to show the logout message
      setTimeout(() => {
        this.router.navigateByUrl('/login');
      }, 1500);
      
    } catch (error: any) {
      console.error('Logout error:', error);
      this.errorMessage = 'Error signing out. Please try again.';
      this.isLoggingOut = false;
    }
  }

  async retryLogout() {
    await this.performLogout();
  }
}
