import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './logout.component.html',
  styleUrls: ['./logout.component.scss']
})
export class LogoutComponent implements OnInit {
  constructor(private auth: AuthService, private router: Router) {}

  async ngOnInit() {
    try {
      await this.auth.signOut('global');
    } catch (e) {
      // ignore errors during signout
    } finally {
      this.router.navigateByUrl('/');
    }
  }
}
