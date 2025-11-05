import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';

@Component({
  selector: 'app-challenges',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  templateUrl: './challenges.component.html',
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengesComponent implements OnInit {
  joinedCount = 0;

  constructor(private supabase: SupabaseService, private activeChallengesService: ActiveChallengesService) {}

  async ngOnInit() {
    // Ensure service has loaded the active challenges and subscribe to the count
    try {
      this.activeChallengesService.activeCount$.subscribe(cnt => this.joinedCount = cnt);
      // trigger load (no-op if already loaded recently)
      await this.activeChallengesService.load();
    } catch (err) {
      console.warn('Could not subscribe to active challenges service', err);
      this.joinedCount = 0;
    }
  }
}
