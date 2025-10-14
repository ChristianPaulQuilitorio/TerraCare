import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    // During SSR there is no browser session; allow navigation and let the client enforce auth after hydration.
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return true;

    try {
      // First, check if we have a session. This avoids Supabase's AuthSessionMissingError.
      const { data: { session }, error: sessionError } = await this.supabase.client.auth.getSession();
      if (sessionError) {
        // Treat as unauthenticated rather than throwing; this commonly happens when no session exists
        console.warn('Auth guard getSession error:', sessionError?.message || sessionError);
      }

      if (!session) {
        this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        return false;
      }

      const { data: { user }, error } = await this.supabase.client.auth.getUser();
      if (error) {
        console.warn('Auth guard getUser error:', error?.message || error);
        this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        return false;
      }
      return !!user;
    } catch (error: any) {
      console.warn('Auth guard exception:', error?.message || error);
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return false;
    }
  }
}
