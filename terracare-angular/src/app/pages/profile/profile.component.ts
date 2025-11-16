import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ProfileService, ProfileRecord } from '../../core/services/profile.service';
// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ToastService } from '../../shared/toast/toast.service';
import { MatGridListModule } from '@angular/material/grid-list';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatProgressBarModule,
    MatGridListModule
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user: any = null;
  loading = true;
  editing = false;
  saving = false;
  message = '';
  avatarUploading = false;
  avatarUrl: string | null = null;
  private profileRow: ProfileRecord | null = null;
  // Cropping state
  cropDialogOpen = false;
  cropSrc: string | null = null;
  cropError = '';
  cropping = false;
  // Accessibility / Preferences
  highContrast = false;
  largeFont = false;
  reduceMotion = false;
  private accessibilityStorageKey = 'tc.accessibility.prefs';
  // Activity stats
  activityLoading = false;
  postsCount = 0;
  knowledgeCount = 0;
  challengesCompleted = 0;
  commentsCount = 0;
  // Responsive state for Material grids
  isHandset = false;
  get headerRowHeight(): string { return this.isHandset ? '140px' : '180px'; }
  get statsRowHeight(): string { return this.isHandset ? '150px' : '170px'; }
  get quickRowHeight(): string { return this.isHandset ? '68px' : '72px'; }
  
  profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    // Email is view-only in profile; keep a disabled control for display/binding
    email: [{ value: '', disabled: true }]
  });

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private profileService: ProfileService,
    private supabaseSvc: SupabaseService,
    private toast: ToastService,
    private breakpoint: BreakpointObserver
  ) {}

  async ngOnInit() {
    // Observe small screens for grid column tweaks
    try {
      this.breakpoint.observe([Breakpoints.Handset]).subscribe(res => {
        this.isHandset = !!res.matches;
      });
    } catch {}
    await this.loadUserProfile();
    // Show cached avatar immediately to reduce flicker on hard refresh
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem('tc_avatar_url') : null;
      if (cached) this.avatarUrl = cached;
    } catch {}
    // If session isn't ready on first paint, refresh when it becomes available
    try {
      this.supabaseSvc.client.auth.onAuthStateChange((_event, session) => {
        if (session) {
          // Re-load once to populate avatar from metadata/profiles
          this.loadUserProfile();
        }
      });
    } catch {}
    // Load accessibility prefs
    this.loadAccessibilityPrefs();
    // Load activity metrics
    this.loadActivityStats();
  }

  async loadUserProfile() {
    try {
      this.loading = true;
      this.user = await this.authService.getUserProfile();
      this.profileRow = await this.profileService.getMyProfile();
      // Fallback to auth metadata avatar if profiles row isn't ready yet
      const authUser = await this.authService.getCurrentUser();
      const metaAvatar = (authUser?.user_metadata?.['avatar_url'] as string | undefined) ?? null;
        this.avatarUrl = this.profileRow?.avatar_url || metaAvatar || null;
        try { if (this.avatarUrl) localStorage.setItem('tc_avatar_url', this.avatarUrl); } catch {}
      // If we have metadata avatar but profiles row lacks it, persist it for consistency
      if (metaAvatar && (!this.profileRow || !this.profileRow.avatar_url)) {
        try { await this.profileService.upsertMyProfile({ avatar_url: metaAvatar }); } catch {}
      }
      
      if (!this.user) {
        // User not logged in, redirect to login
        console.log('No authenticated user, redirecting to login');
        this.router.navigate(['/login']);
        return;
      }

      // Populate form with current user data
      this.profileForm.patchValue({
        fullName: this.user.fullName || this.profileRow?.full_name || '',
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
      // Persist full_name to public.profiles; keep email as display only
      const res = await this.profileService.upsertMyProfile({ full_name: formData.fullName, avatar_url: this.avatarUrl || undefined });
      if (!res.success) throw new Error(res.error || 'Failed to save');
      // Also sync full name to auth metadata for consistency + dashboard display
      const sync = await this.profileService.syncFullNameToAuth(formData.fullName);
      if (!sync.success) console.warn('Failed to sync full name to auth metadata:', sync.error);
      // Update local display
  this.user.fullName = formData.fullName;
      // Force a light refresh of session metadata so navbar or other injected spots re-render
      try {
        const session = await this.supabaseSvc.client.auth.getSession();
        if (session?.data?.session?.user) {
          session.data.session.user.user_metadata = {
            ...session.data.session.user.user_metadata,
            full_name: formData.fullName,
            name: formData.fullName,
            display_name: formData.fullName
          };
        }
      } catch {}
      
      this.editing = false;
      this.message = 'Profile updated successfully!';
      this.toast.show('Profile updated', 'success');
      // Auto-clear success message
      setTimeout(() => {
        this.message = '';
      }, 3000);
      
    } catch (error: any) {
      console.error('Error saving profile:', error);
      this.message = 'Failed to update profile. Please try again.';
      this.toast.show('Failed to update profile', 'error');
    } finally {
      this.saving = false;
    }
  }

  async logout() {
    try {
      await this.authService.logout();
      this.toast.show('Signed out', 'success');
      this.router.navigateByUrl('/');
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

  async onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.message = '';
    this.cropError = '';
    // Validate image type and size
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (!file.type.startsWith('image/')) {
      this.message = 'Please select an image file.';
      try { if (input) input.value = ''; } catch {}
      return;
    }
    if (file.size > MAX_SIZE) {
      this.message = 'Image too large. Max size is 5MB.';
      try { if (input) input.value = ''; } catch {}
      return;
    }

    // Immediately upload the file (no cropping step)
    this.avatarUploading = true;
    try {
      const res = await this.profileService.uploadAvatar(file);
      if (!res.success || !res.url) throw new Error(res.error || 'Upload failed');
      this.avatarUrl = res.url;
      try { if (this.avatarUrl) localStorage.setItem('tc_avatar_url', this.avatarUrl); } catch {}
      // Persist to profiles row
      try { await this.profileService.upsertMyProfile({ avatar_url: this.avatarUrl }); } catch {}
      this.message = 'Profile photo updated!';
      this.toast.show('Profile photo updated', 'success');
      setTimeout(() => this.message = '', 2500);
    } catch (e: any) {
      this.message = e?.message || 'Failed to upload avatar.';
      this.toast.show(this.message, 'error');
    } finally {
      this.avatarUploading = false;
      // Clear the input so same file can be re-selected later
      try { if (input) input.value = ''; } catch {}
    }
  }

  async removeAvatar() {
    if (this.avatarUploading) return;
    this.avatarUploading = true;
    this.message = '';
    try {
      const res = await this.profileService.removeAvatar(this.avatarUrl);
      if (!res.success) throw new Error(res.error || 'Failed to remove');
      this.avatarUrl = null;
        try { localStorage.removeItem('tc_avatar_url'); } catch {}
      this.message = 'Profile photo removed';
      this.toast.show('Profile photo removed', 'success');
      setTimeout(() => this.message = '', 2500);
    } catch (e: any) {
      this.message = e?.message || 'Failed to remove avatar.';
      this.toast.show(this.message, 'error');
    } finally {
      this.avatarUploading = false;
    }
  }

  cancelCrop() {
    this.closeCropper();
  }

  async confirmCrop() {
    if (!this.cropSrc) return;
    this.cropping = true;
    this.avatarUploading = true;
    this.cropError = '';
    try {
      const file = await this.cropImageToSquare(this.cropSrc, 512);
      const res = await this.profileService.uploadAvatar(file);
      if (!res.success || !res.url) throw new Error(res.error || 'Upload failed');
      this.avatarUrl = res.url;
      await this.profileService.upsertMyProfile({ avatar_url: this.avatarUrl });
      this.message = 'Profile photo updated!';
      this.toast.show('Profile photo updated', 'success');
      setTimeout(() => this.message = '', 2500);
      this.closeCropper();
    } catch (e: any) {
      this.cropError = e?.message || 'Failed to process image.';
      this.toast.show(this.cropError, 'error');
    } finally {
      this.cropping = false;
      this.avatarUploading = false;
    }
  }

  private closeCropper() {
    if (this.cropSrc) {
      try { URL.revokeObjectURL(this.cropSrc); } catch {}
    }
    this.cropSrc = null;
    this.cropDialogOpen = false;
    this.cropError = '';
  }

  private async cropImageToSquare(src: string, size: number): Promise<File> {
    const img = await this.loadImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const s = Math.min(w, h);
    const sx = (w - s) / 2;
    const sy = (h - s) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.92);
    });
    return new File([blob], 'avatar-cropped.jpg', { type: 'image/jpeg' });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }

  // Accessibility prefs
  toggleHighContrast() { this.highContrast = !this.highContrast; this.applyAccessibility(); }
  toggleLargeFont() { this.largeFont = !this.largeFont; this.applyAccessibility(); }
  toggleReduceMotion() { this.reduceMotion = !this.reduceMotion; this.applyAccessibility(); }

  private loadAccessibilityPrefs() {
    try {
      const raw = localStorage.getItem(this.accessibilityStorageKey);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      this.highContrast = !!prefs.highContrast;
      this.largeFont = !!prefs.largeFont;
      this.reduceMotion = !!prefs.reduceMotion;
      this.applyAccessibility(false);
    } catch {}
  }

  private applyAccessibility(showToast: boolean = true) {
    // Persist
    try { localStorage.setItem(this.accessibilityStorageKey, JSON.stringify({ highContrast: this.highContrast, largeFont: this.largeFont, reduceMotion: this.reduceMotion })); } catch {}
    // Apply classes to document body (SSR-safe)
    if (typeof document !== 'undefined') {
      const body = document.body;
      body.classList.toggle('tc-high-contrast', this.highContrast);
      body.classList.toggle('tc-large-font', this.largeFont);
      body.classList.toggle('tc-reduce-motion', this.reduceMotion);
    }
    if (showToast) this.toast.show('Accessibility preferences updated', 'success');
  }

  // Activity stats loader
  async loadActivityStats() {
    this.activityLoading = true;
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) { this.activityLoading = false; return; }
      const uid = currentUser.id;
      // Parallel queries (best-effort)
      const supa = this.supabaseSvc.client;
      const [postsRes, knowledgeRes, commentsRes, challengesCount] = await Promise.all([
        supa.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', uid),
        supa.from('knowledge').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supa.from('post_comments').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        // Completed challenges: use leaderboard view (one row per completed challenge per user)
        (async () => {
          try {
            const { count } = await supa
              .from('leaderboard')
              .select('challenge_id', { count: 'exact', head: true })
              .eq('user_id', uid);
            if (typeof count === 'number') return count;
          } catch {}
          // Fallback to challenge_history (count distinct challenge_id where action='completed')
          try {
            const { data } = await supa
              .from('challenge_history')
              .select('challenge_id')
              .eq('user_id', uid)
              .eq('action', 'completed');
            const unique = new Set<string>((data || []).map((r: any) => r.challenge_id as string)).size;
            return unique;
          } catch {
            return 0;
          }
        })()
      ]);
      this.postsCount = postsRes.count || 0;
      this.knowledgeCount = knowledgeRes.count || 0;
      this.commentsCount = commentsRes.count || 0;
      this.challengesCompleted = Number(challengesCount) || 0;
    } catch (e) {
      console.warn('Activity stats load failed', e);
    } finally {
      this.activityLoading = false;
    }
  }
}
