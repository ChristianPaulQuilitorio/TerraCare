import { Component, ViewEncapsulation } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-challenges',
  standalone: true,
  imports: [NavbarComponent, RouterLink, CommonModule],
  templateUrl: './challenges.component.html',
  styleUrls: ['./challenges.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ChallengesComponent {}
