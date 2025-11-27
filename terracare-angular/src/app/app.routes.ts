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
		redirectTo: '', pathMatch: 'full' 
	},
	{ 
		path: 'signup', 
		redirectTo: '', pathMatch: 'full' 
	},
	{ 
		path: 'forgot-password', 
		redirectTo: '', pathMatch: 'full' 
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
		path: 'challenges/archive',
		loadComponent: () => import('./pages/challenges/archived-challenges.component').then(m => m.ArchivedChallengesComponent),
		canActivate: [AuthGuard]
	},
		{
			path: 'leaderboard',
			loadComponent: () => import('./pages/challenges/leaderboard.component').then(m => m.LeaderboardComponent)
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
        path: 'scoreboard',
        loadComponent: () => import('./pages/scoreboard/scoreboard.component').then(m => (m as any).default),
        canActivate: [AuthGuard]
    },
	{ 
		path: 'incidents',
		loadComponent: () => import('./pages/incidents/incidents.component').then(m => m.IncidentsComponent),
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
	// Legal routes
	{
		path: 'privacy',
		loadComponent: () => import('./pages/legal/privacy.component').then(m => m.PrivacyComponent)
	},
	{
		path: 'terms',
		loadComponent: () => import('./pages/legal/terms.component').then(m => m.TermsComponent)
	},
	{ path: '**', redirectTo: '' }
];
