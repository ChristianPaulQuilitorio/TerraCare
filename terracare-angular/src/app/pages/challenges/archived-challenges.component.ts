import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { SupabaseService } from '../../core/services/supabase.service';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-archived-challenges',
  standalone: true,
  imports: [CommonModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
  <main class="archive-page container">
    <header class="progress-header">
      <div>
        <h1>Archived Challenges</h1>
        <p class="subtitle">Only visible to you. Restore or permanently delete your archived challenges.</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button routerLink="/profile">Back to Profile</button>
      </div>
    </header>

    <section *ngIf="loading" class="muted">Loading...</section>

    <section *ngIf="!loading && !archives.length" class="muted">No archived challenges.</section>

    <section class="archive-grid" *ngIf="archives.length">
      <mat-card class="challenge-card" *ngFor="let c of archives">
        <mat-card-header>
          <mat-card-title>{{ c.title }}</mat-card-title>
          <mat-card-subtitle>Archived {{ c.archived_at | date:'medium' }}</mat-card-subtitle>
        </mat-card-header>
        <img *ngIf="c.image" [src]="c.image" alt="cover" style="width:100%;max-height:180px;object-fit:cover;" />
        <mat-card-content>
          <p class="muted small">{{ c.description }}</p>
        </mat-card-content>
        <mat-card-actions align="end">
          <button mat-stroked-button color="primary" (click)="restore(c)">Restore</button>
          <button mat-button color="warn" (click)="deleteForever(c)">Delete Permanently</button>
        </mat-card-actions>
      </mat-card>
    </section>
  </main>
  `,
  styles: [`
    .archive-page { padding: 28px; max-width: 1000px; margin: 0 auto; }
    .archive-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap:16px; }
    .muted { color:#6b7a6b; }
    .small { font-size:.9rem; }
  `],
  encapsulation: ViewEncapsulation.None,
})
export class ArchivedChallengesComponent implements OnInit {
  loading = false;
  archives: any[] = [];

  constructor(private supabase: SupabaseService, private toast: ToastService){}

  async ngOnInit(){
    await this.load();
  }

  async load(){
    this.loading = true;
    try {
      const user = (await this.supabase.client.auth.getUser()).data.user;
      if(!user){ this.archives = []; return; }
      const { data, error } = await this.supabase.client
        .from('challenges')
        .select('id, title, description, image, archived_at')
        .eq('archived', true)
        .eq('creator_id', user.id)
        .order('archived_at', { ascending: false });
      if(error){ this.archives = []; return; }
      this.archives = data || [];
    } finally {
      this.loading = false;
    }
  }

  async restore(c:any){
    const user = (await this.supabase.client.auth.getUser()).data.user;
    if(!user) { this.toast.show('Sign in required', 'info'); return; }
    const { error } = await this.supabase.client
      .from('challenges')
      .update({ archived: false, archived_at: null, visibility: 'public' })
      .eq('id', c.id)
      .eq('creator_id', user.id);
    if(error){ this.toast.show(error.message || 'Restore failed', 'error'); return; }
    this.toast.show('Challenge restored', 'success');
    await this.load();
  }

  async deleteForever(c:any){
    const user = (await this.supabase.client.auth.getUser()).data.user;
    if(!user) { this.toast.show('Sign in required', 'info'); return; }
    // Hard delete; history is preserved via ON DELETE SET NULL
    const { error } = await this.supabase.client
      .from('challenges')
      .delete()
      .eq('id', c.id)
      .eq('creator_id', user.id);
    if(error){ this.toast.show(error.message || 'Delete failed', 'error'); return; }
    this.toast.show('Challenge permanently deleted', 'success');
    await this.load();
  }
}
