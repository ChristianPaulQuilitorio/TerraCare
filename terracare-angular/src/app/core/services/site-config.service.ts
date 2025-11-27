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

  /**
   * Seed data for local ecosystem insights used on the landing page.
   * Keys are human-friendly location names.
   */
  readonly localInsights: Record<string, {
    lat?: number;
    lng?: number;
    waterQualityIndex: number; // 0-100
    mangroveCoverPct: number; // percent change or coverage
    beachCleanlinessRating: number; // 1-5
    speciesObserved: string[];
    lastUpdated: string; // ISO date
    note?: string;
  }> = {
    'Zambales (Province)': {
      // Central coordinate for approximate insights (uses bbox/radius when querying APIs)
      lat: 15.2470,
      lng: 119.9819,
      waterQualityIndex: 72,
      mangroveCoverPct: 18,
      beachCleanlinessRating: 3,
      speciesObserved: ['Green sea turtle', 'Mangrove crabs', 'Coastal birds'],
      lastUpdated: '2025-11-01',
      note: 'Mangrove restoration ongoing in several coastal barangays.'
    },
    'Olongapo City': {
      lat: 14.8395,
      lng: 120.2820,
      waterQualityIndex: 65,
      mangroveCoverPct: 8,
      beachCleanlinessRating: 2,
      speciesObserved: ['Shorebirds', 'Small reef fish'],
      lastUpdated: '2025-10-20',
      note: 'Urban runoff and littering affect nearshore water quality.'
    }
  };
}
