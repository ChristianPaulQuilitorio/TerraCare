import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { GuestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
	{ 
		path: '', 
		pathMatch: 'full', 
		loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) 
	},
	{ 
		path: 'login', 
		canActivate: [GuestGuard],
		loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) 
	},
	{ 
		path: 'signup', 
		canActivate: [GuestGuard],
		loadComponent: () => import('./pages/signup/signup.component').then(m => m.SignupComponent) 
	},
	{ 
		path: 'forgot-password', 
		canActivate: [GuestGuard],
		loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) 
	},
	{ 
		path: 'reset-password', 
		canActivate: [GuestGuard],
		loadComponent: () => import('./pages/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) 
	},
	{ 
		path: 'challenges', 
		canActivate: [AuthGuard],
		loadComponent: () => import('./pages/challenges/challenges.component').then(m => m.ChallengesComponent) 
	},
	{ 
		path: 'forum', 
		canActivate: [AuthGuard],
		loadComponent: () => import('./pages/forum/forum.component').then(m => m.ForumComponent) 
	},
	{ 
		path: 'knowledge', 
		loadComponent: () => import('./pages/knowledge/knowledge.component').then(m => m.KnowledgeComponent) 
	},
	{ 
		path: 'dashboard', 
		canActivate: [AuthGuard],
		loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) 
	},
	{ path: '**', redirectTo: '' }
];
