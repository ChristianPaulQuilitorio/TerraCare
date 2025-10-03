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
  username: string | null = null;
  displayName: string | null = null;
  loading = true;

  constructor(private supabase: SupabaseService) {
    this.loadUser();
  }

  async loadUser() {
    try {
      const { data } = await this.supabase.client.auth.getUser();
      const user = data.user;
      this.userEmail = user?.email ?? null;
      this.displayName = (user?.user_metadata as any)?.full_name ?? null;
      if (user?.id) {
        const { data: prof } = await this.supabase.client
          .from('profiles')
          .select('username, full_name')
          .eq('id', user.id)
          .single();
        this.username = prof?.username ?? null;
        // Prefer full_name from profiles if present
        if (prof?.full_name) this.displayName = prof.full_name;
      }
    } catch (e) {
      this.userEmail = null;
    } finally {
      this.loading = false;
    }
  }
}
