import { Injectable } from '@angular/core';
import { KnowledgeItem } from '../models/knowledge-item.model';

@Injectable({ providedIn: 'root' })
export class SiteConfigService {
  readonly knowledgeItems: KnowledgeItem[] = [
    { title: 'The Role of Reforestation', description: 'Learn about carbon sequestration.' },
    { title: 'Sustainable Living', description: 'Beginner’s guide to eco-habits.' },
    { title: 'Protecting Marine Life', description: 'Challenges & solutions.' },
    { title: 'Community Conservation', description: 'Local power in action.' },
  ];
}
