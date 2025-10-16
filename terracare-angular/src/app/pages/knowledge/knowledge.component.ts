import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { KnowledgeService } from '../../core/services/knowledge.service';
import { KnowledgeItem } from '../../core/models/knowledge-item.model';

@Component({
  selector: 'app-knowledge',
  standalone: true,
  imports: [NavbarComponent, CommonModule],
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

  constructor(private knowledge: KnowledgeService) {}

  ngOnInit() {
    // Only fetch on the client to avoid SSR prerender network calls
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) {
      this.loading = false;
      return;
    }
    this.knowledge.getAll().subscribe((items) => {
      this.items = items;
      this.loading = false;
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
      return;
    }
    this.uploadLoading = true;
    this.uploadError = null;
    try {
      let url: string | null = null;
      if (this.selectedFile) {
        url = await this.knowledge.uploadFileToStorage(this.selectedFile, 'knowledge');
      }
      const created = await this.knowledge.create({
        title: this.uploadTitle,
        description: this.uploadDescription,
        category: this.uploadCategory,
        url: url ?? undefined,
        type: this.selectedFile ? this.selectedFile.type : undefined,
      });
      if (created) {
        // prepend to local items so user sees it immediately
        this.items = [created as KnowledgeItem].concat(this.items || []);
        this.resetUploadForm();
        this.showUploadForm = false;
      } else {
        this.uploadError = 'Failed to create item.';
      }
    } catch (err: any) {
      this.uploadError = err?.message || 'Upload failed.';
    } finally {
      this.uploadLoading = false;
    }
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
    this.selectedItem = item;
    setTimeout(() => {
      const el = document.querySelector('.kc-modal') as HTMLElement | null;
      el?.focus();
    }, 0);
  }

  closeItem() {
    this.selectedItem = null;
  }
}
