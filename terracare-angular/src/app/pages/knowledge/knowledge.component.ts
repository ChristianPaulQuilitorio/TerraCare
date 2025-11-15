import { Component, ViewEncapsulation, Inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { KnowledgeService } from '../../core/services/knowledge.service';
import { KnowledgeItem } from '../../core/models/knowledge-item.model';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { MatMenuModule } from '@angular/material/menu';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-knowledge',
  standalone: true,
  imports: [CommonModule, MatMenuModule, ...MATERIAL_IMPORTS],
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class KnowledgeComponent {
  items: KnowledgeItem[] = [];
  loading = true;
  error?: string;
  // UI state
  activeFilter = 'All';
  selectedItem: KnowledgeItem | null = null;
  // Upload form state
  showUploadForm = false;
  uploadTitle = '';
  uploadDescription = '';
  uploadCategory = 'Articles';
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  uploadLoading = false;
  uploadError: string | null = null;
  // Responsive sidenav state
  isHandset = false;
  currentUserId: string | null = null;
  sideOpened = false;

  constructor(private knowledge: KnowledgeService, private dialog: MatDialog, private bp: BreakpointObserver, private route: ActivatedRoute, private toast: ToastService) {}

  ngOnInit() {
    // Observe handset breakpoint
    this.bp.observe('(max-width: 840px)').subscribe(result => {
      this.isHandset = result.matches;
      if (!this.isHandset) {
        // Ensure the side nav is considered open in desktop mode
        this.sideOpened = false; // we rely on [opened]="!isHandset || sideOpened"
      }
    });
    // Only fetch on the client to avoid SSR prerender network calls
    const isBrowser = typeof window !== 'undefined';
    // Resolve current user id for ownership checks
    this.knowledge['auth'].getCurrentUser?.().then((u: any) => { this.currentUserId = u?.id ?? null; }).catch(() => this.currentUserId = null);
    if (!isBrowser) {
      this.loading = false;
      return;
    }
    this.knowledge.getAll().subscribe((items) => {
      // Provide a visible fallback if no items are returned to avoid a blank page
      if (!items || items.length === 0) {
        this.items = [
          { title: 'Getting started with TerraCare', description: 'First knowledge item!', category: 'Articles', image: 'assets/ecolife-bg.jpg' },
          { title: 'Eco Video Intro', description: 'Sustainability basics in video form', category: 'Videos', image: 'assets/ecolife-bg.jpg' },
          { title: 'Guides Collection', description: 'Practical steps to reduce waste', category: 'Guides', image: 'assets/ecolife-bg.jpg' },
        ];
      } else {
        this.items = items;
      }
      this.loading = false;
    });
    // If navigated with ?upload=1, open the upload form automatically
    this.route.queryParamMap.subscribe(params => {
      const upload = params.get('upload');
      if (upload) {
        this.showUploadForm = true;
        setTimeout(() => {
          const el = document.querySelector('.upload-card') as HTMLElement | null;
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 50);
      }
    });

  }

  onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.selectedFile = input.files[0];
    this.uploadError = null;
    // create preview for images only
    if (this.selectedFile.type.startsWith('image/')) {
      this.previewUrl = URL.createObjectURL(this.selectedFile);
    } else {
      this.previewUrl = null;
    }
  }

  async submitUpload() {
    if (!this.uploadTitle) {
      this.uploadError = 'Please add a title.';
      this.toast.show('Please add a title before publishing.', 'warning');
      return;
    }
    this.uploadLoading = true;
    this.uploadError = null;
    try {
      //
      let url: string | null = null;
      if (this.selectedFile) {
        url = await this.knowledge.uploadFileToStorage(this.selectedFile, 'knowledge');
        if (!url) {
          // If a file was selected but we failed to upload, stop here and surface a clear UI error
          throw new Error('File upload failed. Please check your connection and permissions, then try again.');
        }
      }
  const created = await this.knowledge.createItem({
        title: this.uploadTitle,
        description: this.uploadDescription,
        category: this.uploadCategory,
        url: url ?? undefined,
        type: this.selectedFile ? this.selectedFile.type : undefined,
      });
      if (created) {
        // prepend to local items so user sees it immediately
        this.items = [created as KnowledgeItem].concat(this.items || []);
        // Ensure filter doesn't hide the freshly added item
        this.activeFilter = 'All';
        this.resetUploadForm();
        this.showUploadForm = false;
        this.toast.show('Resource published', 'success');
        // Optional: scroll to top to reveal the new card
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      } else {
        this.uploadError = 'Failed to create item.';
        this.toast.show('Failed to create item.', 'error');
      }
    } catch (err: any) {
      this.uploadError = err?.message || 'Upload failed.';
  this.toast.show(this.uploadError || 'Upload failed.', 'error');
    } finally {
      this.uploadLoading = false;
    }
  }
  toggleSide() {
    if (!this.isHandset) return;
    this.sideOpened = !this.sideOpened;
  }

  resetUploadForm() {
    this.uploadTitle = '';
    this.uploadDescription = '';
    this.uploadCategory = 'Articles';
    this.selectedFile = null;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.uploadError = null;
  }

  setFilter(filter: string) {
    this.activeFilter = filter;
  }

  get filteredItems() {
    if (!this.items) return [];
    if (!this.activeFilter || this.activeFilter === 'All') return this.items;
    return this.items.filter(i => (i.category || '').toLowerCase() === this.activeFilter.toLowerCase());
  }

  openItem(item: KnowledgeItem) {
    const ref = this.dialog.open(KnowledgeItemDialogComponent, {
      width: '720px',
      maxHeight: '80vh',
      data: { item, canDelete: !!this.currentUserId && this.currentUserId === item.user_id },
    });
    ref.afterClosed().subscribe(res => {
      if (res && res.deleted) {
        this.items = this.items.filter(i => i.id !== item.id);
        this.toast.show('Resource deleted', 'success');
      }
    });
  }
}

@Component({
  selector: 'app-knowledge-item-dialog',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, CommonModule],
  template: `
    <h2 mat-dialog-title>{{ data.item.title }}</h2>
    <mat-dialog-content>
      <ng-container *ngIf="data.item.type?.startsWith('image/') && data.item.url; else fallback">
        <img [src]="data.item.url" alt="{{ data.item.title }}" style="width:100%; border-radius:8px; margin-bottom:12px;" />
      </ng-container>
      <ng-template #fallback>
        <img *ngIf="data.item.image" [src]="data.item.image" alt="{{ data.item.title }}" style="width:100%; border-radius:8px; margin-bottom:12px;" />
      </ng-template>
      <p>{{ data.item.description }}</p>
      <div *ngIf="data.item.url && !data.item.type?.startsWith('image/')" style="margin-top:8px;">
        <a [href]="data.item.url" target="_blank" rel="noopener">Open resource</a>
      </div>
      <p class="muted" *ngIf="data.item.displayName || data.item.user_id" style="margin-top:12px;">Uploaded by: <strong>{{ data.item.displayName || (data.item.user_id | slice:0:8) }}</strong></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
      <button mat-button color="warn" *ngIf="data.canDelete" (click)="delete()" [disabled]="deleting">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
    </mat-dialog-actions>
  `,
})
export class KnowledgeItemDialogComponent {
  deleting = false;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { item: KnowledgeItem; canDelete: boolean },
    private knowledge: KnowledgeService,
    private toast: ToastService,
    private dialogRef: MatDialogRef<KnowledgeItemDialogComponent>
  ) {}
  async delete() {
    if (!this.data.canDelete || this.deleting) return;
    const ok = confirm('Delete this resource?');
    if (!ok) return;
    this.deleting = true;
  const res = await this.knowledge.deleteItem(this.data.item);
    this.deleting = false;
    if (!res.success) {
      this.toast.show(res.error || 'Delete failed', 'error');
    } else {
      this.dialogRef.close({ deleted: true });
    }
  }
}
