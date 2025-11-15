import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { AuthDialogService } from '../../shared/ui/auth-dialog.service';
import { ToastService } from '../../shared/toast/toast.service';

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

  constructor(
    private auth: AuthService,
    private router: Router,
    private authDialog: AuthDialogService,
    private toast: ToastService
  ) {}

  async ngOnInit() {
    await this.performLogout();
  }

  async performLogout() {
    try {
      this.isLoggingOut = true;
      this.errorMessage = '';
      // Perform comprehensive targeted logout
      await this.auth.logout();
      this.toast.show('Signed out', 'success');
      // Immediate redirect to landing page
      await this.router.navigateByUrl('/');
      // Do NOT auto-open login; user stays on landing page
      this.isLoggingOut = false;
    } catch (error: any) {
      console.error('Logout error:', error);
      this.errorMessage = 'Error signing out. Please try again.';
      this.isLoggingOut = false;
    }
  }

  async retryLogout() { await this.performLogout(); }
}
