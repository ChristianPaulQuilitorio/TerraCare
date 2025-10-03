import { Injectable } from '@angular/core';
import { Observable, from, map, catchError, of } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { UserProfile } from '../models/auth.model';
import { DatabaseResult } from '../models/database.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // Create user profile after successful registration
  createUserProfile(userId: string, fullName: string): Observable<DatabaseResult<UserProfile>> {
    const profileData = {
      user_id: userId,
      full_name: fullName,
      created_at: new Date().toISOString()
    };

    return from(
      this.supabase.client
        .from('profiles')
        .insert(profileData as any)
        .select()
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error || !data) {
          console.error('Error creating user profile:', error);
          return {
            data: null,
            error: error?.message || 'Failed to create user profile',
            success: false
          };
        }

        const userProfile: UserProfile = {
          id: data.id,
          userId: data.user_id,
          fullName: data.full_name,
          avatarUrl: data.avatar_url || undefined,
          bio: data.bio || undefined,
          website: data.website || undefined,
          location: data.location || undefined,
          createdAt: data.created_at,
          updatedAt: data.updated_at || undefined
        };

        return {
          data: userProfile,
          error: null,
          success: true
        };
      }),
      catchError(error => {
        console.error('Error creating user profile:', error);
        return of({
          data: null,
          error: 'An unexpected error occurred while creating user profile',
          success: false
        });
      })
    );
  }

  // Get user profile by user ID
  getUserProfile(userId: string): Observable<DatabaseResult<UserProfile>> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error || !data) {
          console.error('Error getting user profile:', error);
          return {
            data: null,
            error: error?.message || 'Failed to get user profile',
            success: false
          };
        }

        const userProfile: UserProfile = {
          id: data.id,
          userId: data.user_id,
          fullName: data.full_name,
          avatarUrl: data.avatar_url || undefined,
          bio: data.bio || undefined,
          website: data.website || undefined,
          location: data.location || undefined,
          createdAt: data.created_at,
          updatedAt: data.updated_at || undefined
        };

        return {
          data: userProfile,
          error: null,
          success: true
        };
      }),
      catchError(error => {
        console.error('Error getting user profile:', error);
        return of({
          data: null,
          error: 'An unexpected error occurred while fetching user profile',
          success: false
        });
      })
    );
  }

  // Update user profile
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Observable<DatabaseResult<UserProfile>> {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
    if (updates.avatarUrl !== undefined) updateData.avatar_url = updates.avatarUrl || null;
    if (updates.bio !== undefined) updateData.bio = updates.bio || null;
    if (updates.website !== undefined) updateData.website = updates.website || null;
    if (updates.location !== undefined) updateData.location = updates.location || null;

    return from(
      (this.supabase.client as any)
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error || !data) {
          console.error('Error updating user profile:', error);
          return {
            data: null,
            error: error?.message || 'Failed to update user profile',
            success: false
          };
        }

        const userProfile: UserProfile = {
          id: data.id,
          userId: data.user_id,
          fullName: data.full_name,
          avatarUrl: data.avatar_url || undefined,
          bio: data.bio || undefined,
          website: data.website || undefined,
          location: data.location || undefined,
          createdAt: data.created_at,
          updatedAt: data.updated_at || undefined
        };

        return {
          data: userProfile,
          error: null,
          success: true
        };
      }),
      catchError(error => {
        console.error('Error updating user profile:', error);
        return of({
          data: null,
          error: 'An unexpected error occurred while updating user profile',
          success: false
        });
      })
    );
  }

  // Get current user's profile
  getCurrentUserProfile(): Observable<DatabaseResult<UserProfile>> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return of({
        data: null,
        error: 'No authenticated user found',
        success: false
      });
    }

    return this.getUserProfile(currentUser.id);
  }
}