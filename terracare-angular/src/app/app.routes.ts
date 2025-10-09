import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
	{ 
		path: '', 
		pathMatch: 'full', 
		loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) 
	},
	{ 
		path: 'home', 
		loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent),
		canActivate: [AuthGuard]
	},
	{ 
		path: 'login', 
		loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) 
	},
	{ 
		path: 'signup', 
		loadComponent: () => import('./pages/signup/signup.component').then(m => m.SignupComponent) 
	},
	{ 
		path: 'forgot-password', 
		loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) 
	},
	{ 
		path: 'challenges', 
		loadComponent: () => import('./pages/challenges/challenges.component').then(m => m.ChallengesComponent),
		canActivate: [AuthGuard]
	},
	{
		path: 'challenges/browse',
		loadComponent: () => import('./pages/challenges/browse-challenges.component').then(m => m.BrowseChallengesComponent),
		canActivate: [AuthGuard]
	},
	{
		path: 'challenges/progress',
		loadComponent: () => import('./pages/challenges/challenge-progress.component').then(m => m.ChallengeProgressComponent),
		canActivate: [AuthGuard]
	},
	{ 
		path: 'forum', 
		loadComponent: () => import('./pages/forum/forum.component').then(m => m.ForumComponent),
		canActivate: [AuthGuard]
	},
	{ 
		path: 'knowledge', 
		loadComponent: () => import('./pages/knowledge/knowledge.component').then(m => m.KnowledgeComponent),
		canActivate: [AuthGuard]
	},
	{ 
		path: 'dashboard', 
		loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
		canActivate: [AuthGuard]
	},

	{ 
		path: 'profile', 
		loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
		canActivate: [AuthGuard]
	},
	{ 
		path: 'logout', 
		loadComponent: () => import('./pages/logout/logout.component').then(m => m.LogoutComponent) 
	},
	{ path: '**', redirectTo: '' }
];
