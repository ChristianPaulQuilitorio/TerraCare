import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, map, catchError, of, tap } from 'rxjs';
import { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { 
  AuthResponse, 
  AuthState, 
  SignUpRequest, 
  SignInRequest, 
  ResetPasswordRequest,
  UpdatePasswordRequest,
  User 
} from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authState$ = new BehaviorSubject<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true
  });

  public readonly authState: Observable<AuthState> = this.authState$.asObservable();
  public readonly user$: Observable<User | null> = this.authState$.pipe(
    map(state => state.user)
  );
  public readonly isAuthenticated$: Observable<boolean> = this.authState$.pipe(
    map(state => state.isAuthenticated)
  );
  public readonly isLoading$: Observable<boolean> = this.authState$.pipe(
    map(state => state.isLoading)
  );

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    // Initialize auth state and listen for auth changes
    this.initializeAuth();
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.handleAuthStateChange(event, session);
    });
  }

  private async initializeAuth(): Promise<void> {
    try {
      const { data: { session }, error } = await this.supabase.getCurrentSession();
      
      if (error) {
        console.error('Error getting session:', error);
        this.updateAuthState(null, false, false);
        return;
      }

      if (session?.user) {
        const user = this.mapSupabaseUserToUser(session.user);
        this.updateAuthState(user, true, false);
      } else {
        this.updateAuthState(null, false, false);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      this.updateAuthState(null, false, false);
    }
  }

  private handleAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
    console.log('Auth state changed:', event, session);
    
    switch (event) {
      case 'SIGNED_IN':
        if (session?.user) {
          const user = this.mapSupabaseUserToUser(session.user);
          this.updateAuthState(user, true, false);
        }
        break;
      case 'SIGNED_OUT':
        this.updateAuthState(null, false, false);
        this.router.navigate(['/login']);
        break;
      case 'PASSWORD_RECOVERY':
        // When the user clicks the magic link from email to reset password, Supabase emits this event
        // Route them to the reset-password page to set a new password
        this.router.navigate(['/reset-password']);
        break;
      case 'TOKEN_REFRESHED':
        if (session?.user) {
          const user = this.mapSupabaseUserToUser(session.user);
          this.updateAuthState(user, true, false);
        }
        break;
    }
  }

  private updateAuthState(user: User | null, isAuthenticated: boolean, isLoading: boolean): void {
    this.authState$.next({
      user,
      isAuthenticated,
      isLoading
    });
  }

  private mapSupabaseUserToUser(supabaseUser: SupabaseUser): User {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      fullName: supabaseUser.user_metadata?.['full_name'] || supabaseUser.user_metadata?.['fullname'] || '',
      createdAt: supabaseUser.created_at,
      updatedAt: supabaseUser.updated_at,
      emailConfirmed: !!supabaseUser.email_confirmed_at,
      lastSignInAt: supabaseUser.last_sign_in_at
    };
  }

  signUp(signUpData: SignUpRequest): Observable<AuthResponse> {
    this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, true);
    
    return from(
      this.supabase.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          data: {
            full_name: signUpData.fullName,
            fullname: signUpData.fullName
          }
        }
      })
    ).pipe(
      map(({ data, error }) => {
        this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, false);
        
        if (error) {
          return {
            success: false,
            error: error.message
          };
        }

        if (data.user) {
          const user = this.mapSupabaseUserToUser(data.user);
          
          // If user needs email confirmation
          if (!data.session) {
            return {
              success: true,
              message: 'Please check your email to confirm your account.',
              user
            };
          }

          return {
            success: true,
            message: 'Account created successfully!',
            user
          };
        }

        return {
          success: false,
          error: 'Failed to create account'
        };
      }),
      catchError(error => {
        this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, false);
        console.error('Sign up error:', error);
        return of({
          success: false,
          error: 'An unexpected error occurred during sign up'
        });
      })
    );
  }

  signIn(signInData: SignInRequest): Observable<AuthResponse> {
    this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, true);
    
    return from(
      this.supabase.auth.signInWithPassword({
        email: signInData.email,
        password: signInData.password
      })
    ).pipe(
      map(({ data, error }) => {
        this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, false);
        
        if (error) {
          return {
            success: false,
            error: error.message
          };
        }

        if (data.user && data.session) {
          const user = this.mapSupabaseUserToUser(data.user);
          return {
            success: true,
            message: 'Signed in successfully!',
            user
          };
        }

        return {
          success: false,
          error: 'Failed to sign in'
        };
      }),
      catchError(error => {
        this.updateAuthState(this.authState$.value.user, this.authState$.value.isAuthenticated, false);
        console.error('Sign in error:', error);
        return of({
          success: false,
          error: 'An unexpected error occurred during sign in'
        });
      })
    );
  }

  signOut(): Observable<boolean> {
    return from(this.supabase.auth.signOut()).pipe(
      map(({ error }) => {
        if (error) {
          console.error('Sign out error:', error);
          return false;
        }
        return true;
      }),
      catchError(error => {
        console.error('Sign out error:', error);
        return of(false);
      })
    );
  }

  resetPassword(resetData: ResetPasswordRequest): Observable<AuthResponse> {
    return from(
      this.supabase.auth.resetPasswordForEmail(resetData.email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          return {
            success: false,
            error: error.message
          };
        }

        return {
          success: true,
          message: 'Password reset email sent. Please check your inbox.'
        };
      }),
      catchError(error => {
        console.error('Password reset error:', error);
        return of({
          success: false,
          error: 'An unexpected error occurred while sending reset email'
        });
      })
    );
  }

  updatePassword(updateData: UpdatePasswordRequest): Observable<AuthResponse> {
    return from(
      this.supabase.auth.updateUser({
        password: updateData.password
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          return {
            success: false,
            error: error.message
          };
        }

        return {
          success: true,
          message: 'Password updated successfully!'
        };
      }),
      catchError(error => {
        console.error('Password update error:', error);
        return of({
          success: false,
          error: 'An unexpected error occurred while updating password'
        });
      })
    );
  }

  getCurrentUser(): User | null {
    return this.authState$.value.user;
  }

  isAuthenticated(): boolean {
    return this.authState$.value.isAuthenticated;
  }

  // Utility method to refresh the session
  refreshSession(): Observable<boolean> {
    return from(this.supabase.auth.refreshSession()).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Session refresh error:', error);
          return false;
        }
        return !!data.session;
      }),
      catchError(() => of(false))
    );
  }
}