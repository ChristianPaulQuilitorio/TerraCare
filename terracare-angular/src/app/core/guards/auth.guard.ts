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
    try {
      const { data: { user }, error } = await this.supabase.client.auth.getUser();
      if (error) {
        console.warn('Auth guard error:', error);
        this.router.navigate(['/login']);
        return false;
      }
      if (user) {
        return true;
      } else {
        this.router.navigate(['/login']);
        return false;
      }
    } catch (error) {
      console.error('Auth guard exception:', error);
      this.router.navigate(['/login']);
      return false;
    }
  }
}
