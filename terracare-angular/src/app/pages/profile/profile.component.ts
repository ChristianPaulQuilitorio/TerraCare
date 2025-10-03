import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {
  userEmail: string | null = null;
  displayName: string | null = null;
  loading = true;

  constructor(private supabase: SupabaseService) {
    this.loadUser();
  }

  async loadUser() {
    try {
      const { data } = await this.supabase.client.auth.getUser();
      this.userEmail = data.user?.email ?? null;
      this.displayName = (data.user?.user_metadata as any)?.full_name ?? null;
    } catch (e) {
      this.userEmail = null;
    } finally {
      this.loading = false;
    }
  }
}
