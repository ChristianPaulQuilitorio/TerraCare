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
}
