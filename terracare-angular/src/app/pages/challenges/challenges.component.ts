import { Component, ViewEncapsulation } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';

@Component({
  selector: 'app-challenges',
  standalone: true,
  imports: [NavbarComponent],
  templateUrl: './challenges.component.html',
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengesComponent {}
