import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) },
	{ path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
	{ path: 'signup', loadComponent: () => import('./pages/signup/signup.component').then(m => m.SignupComponent) },
	{ path: 'forgot-password', loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
	{ path: 'challenges', loadComponent: () => import('./pages/challenges/challenges.component').then(m => m.ChallengesComponent) },
	{ path: 'forum', loadComponent: () => import('./pages/forum/forum.component').then(m => m.ForumComponent) },
	{ path: 'knowledge', loadComponent: () => import('./pages/knowledge/knowledge.component').then(m => m.KnowledgeComponent) },
	{ path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
	{ path: 'profile', loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent) },
	{ path: 'logout', loadComponent: () => import('./pages/logout/logout.component').then(m => m.LogoutComponent) },
	{ path: '**', redirectTo: '' }
];
