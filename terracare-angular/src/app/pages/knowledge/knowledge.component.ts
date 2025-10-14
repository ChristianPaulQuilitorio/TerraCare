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
