import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling, PreloadAllModules, withPreloading } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { environment } from '../environments/environment';

// Enable hydration only when the page was server-rendered (avoids NG0505 in CSR-only dev)
function shouldEnableHydration(): boolean {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Angular SSR adds an attribute to the <html> element
    const hasSsrMarker = document.documentElement.hasAttribute('ng-server-context');
    if (hasSsrMarker) return true;
  }
  // Fallback to environment flag (e.g., production SSR builds)
  return !!(environment as any).ssrHydration;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),
    ...(shouldEnableHydration() ? [provideClientHydration()] as const : []),
    provideHttpClient(withFetch()),
    // Enable Angular animations (required by Angular Material components)
    provideAnimations()
  ]
};
