import { Component, OnInit, Inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/toast/toast-container.component';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { ChatbotComponent } from './shared/chatbot/chatbot.component';
import { SupabaseService } from './core/services/supabase.service';
import { AuthService } from './core/services/auth.service';
import { AuthDialogService } from './shared/ui/auth-dialog.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent, NavbarComponent, ChatbotComponent],
  template: '<app-navbar /><router-outlet /><app-toast-container /><app-chatbot />'
})
export class AppComponent implements OnInit {
  private visibilityTimer?: number;
  private authSub?: { unsubscribe: () => void };
  constructor(private router: Router, private supabase: SupabaseService, private auth: AuthService, private authDialog: AuthDialogService) {}

  ngOnInit(): void {
    // Initial redirect logic: only force landing if unauthenticated.
    const isFirstLoad = !sessionStorage.getItem('tc.initialRedirectDone');
    if (isFirstLoad) {
      sessionStorage.setItem('tc.initialRedirectDone', '1');
      const url = this.router.url || '';
      this.auth.getSession().then(sess => {
        if (!sess && url !== '/' && !url.startsWith('/landing')) {
          this.router.navigateByUrl('/');
        }
      });
    }

    // Soft session timeout: if tab hidden > threshold, sign out and redirect
    let lastHiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        lastHiddenAt = Date.now();
      } else {
        const hiddenMs = Date.now() - lastHiddenAt;
        const THRESHOLD_MS = 10 * 60 * 1000; // 10 min hidden -> auto logout
        if (hiddenMs > THRESHOLD_MS) {
          this.forceLogoutRedirect('Session timed out');
        }
      }
    });

    // Listen for auth state changes; if session disappears, redirect to landing (no auto login modal)
    const { data } = this.supabase.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        this.router.navigateByUrl('/');
      }
    });
    this.authSub = data?.subscription as any;

    // Network down detection: poll a lightweight endpoint (Supabase health via anon select) every minute
    this.startSessionHeartbeat();

    // Removed aggressive beforeunload sign-out to preserve session on page refresh.
  }

  private startSessionHeartbeat() {
    const intervalMs = 60_000;
    const run = async () => {
      try {
        const { data, error } = await this.supabase.client.from('posts').select('id', { count: 'exact', head: true }).limit(1);
        if (error) throw error;
        // Optional: if session vanished mid-flight
        const session = await this.auth.getSession();
        if (!session) {
          this.forceLogoutRedirect('Session expired');
        }
      } catch (e: any) {
        // Only logout on confirmed missing session after retry to avoid false positives during refresh
        const session = await this.auth.getSession();
        if (!session) {
          this.forceLogoutRedirect('Connection lost');
        }
      } finally {
        this.visibilityTimer = window.setTimeout(run, intervalMs);
      }
    };
    run();
  }

  private async forceLogoutRedirect(reason: string) {
    try { await this.supabase.client.auth.signOut({ scope: 'local' }); } catch {}
    this.router.navigateByUrl('/');
  }
}
