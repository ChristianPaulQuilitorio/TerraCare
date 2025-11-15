import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ...MATERIAL_IMPORTS],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  userProfile: any = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      this.userProfile = await this.authService.getUserProfile();
    } catch (error) {
      // If user is not authenticated, redirect to login
      this.router.navigate(['/login']);
    }
  }
}