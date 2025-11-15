import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';

@Component({
  selector: 'app-challenges',
  standalone: true,
  // Use Material cards; grid is handled with CSS to match Knowledge Hub sizing
  imports: [RouterLink, CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './challenges.component.html',
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengesComponent implements OnInit {
  joinedCount = 0;
  overallProgress = 0;
  discoverChallenges: Array<any> = [];

  constructor(
    private supabase: SupabaseService,
    private activeChallengesService: ActiveChallengesService,
    private bp: BreakpointObserver
  ) {}

  async ngOnInit() {
    // Currently no need to compute grid columns; CSS grid handles responsiveness
    // Ensure service has loaded the active challenges and subscribe to the count
    try {
      this.activeChallengesService.activeCount$.subscribe(cnt => this.joinedCount = cnt);
      this.activeChallengesService.activeChallenges$.subscribe(list => {
        if (!list || !list.length) { this.overallProgress = 0; return; }
        const percs = list.map((ac: any) => typeof ac.progress === 'number' ? Math.max(0, Math.min(100, ac.progress)) : 0);
        const avg = Math.round(percs.reduce((a: number, b: number) => a + b, 0) / percs.length);
        // If all joined challenges are completed, clear the overview bar to 0
        const allComplete = percs.length > 0 && percs.every(p => p >= 100);
        this.overallProgress = allComplete ? 0 : avg;
      });
      // trigger load (no-op if already loaded recently)
      await this.activeChallengesService.load();
      await this.loadDiscoverChallenges();
    } catch (err) {
      console.warn('Could not subscribe to active challenges service', err);
      this.joinedCount = 0;
      this.overallProgress = 0;
    }
  }

  async loadDiscoverChallenges() {
    try {
      const { data, error } = await this.supabase.client
        .from('challenges')
        .select('id, title, description, image, visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
  const fallback = 'assets/TerraCareLogo.png';
      this.discoverChallenges = (data || []).map((c: any) => ({
        ...c,
        image: c.image || fallback
      }));
    } catch (e) {
      console.warn('Failed to load discover challenges', e);
      this.discoverChallenges = [];
    }
  }
}
