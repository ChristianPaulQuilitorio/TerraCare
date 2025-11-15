import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Inject } from '@angular/core';
import { Subscription } from 'rxjs';

export interface TourStep {
  route: string;
  selector: string;
  title: string;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class TourService {
  steps: TourStep[] = [
    {
      route: '/home',
      selector: '.welcome-section h1',
      title: 'Home — Your Hub',
      text: 'This is your TerraCare home. Use the hub cards to jump to key areas (Dashboard, Challenges, Knowledge Hub, Forum). Think of Home as a quick-launch overview — click any card to open that section.'
    },
    {
      route: '/dashboard',
      selector: '.dashboard-header h1',
      title: 'Dashboard — Track Progress',
      text: 'Your Dashboard shows active challenges, resource counts, recent forum activity, and a leaderboard. Use the action buttons to create or join challenges, view detailed progress, and check your engagement at a glance.'
    },
    {
      route: '/challenges',
      selector: '.hero h1',
      title: 'Challenges — Take Action',
      text: 'Discover and join eco-challenges here. Browse available challenges, track your joined challenges and progress, and use the progress view to see completion percentages and details for each challenge.'
    },
    {
      route: '/knowledge',
      // On mobile the desktop H1 may be hidden. Include subtitle and the header container
      // so the tour can target a visible element on small screens.
      selector: '.kc-header .desktop-title, .kc-header h1, .kc-header .subtitle, .kc-header',
      title: 'Knowledge Hub — Learn & Share',
      text: 'Search articles, videos, and guides to learn sustainable practices. Use the category and topic filters to narrow results, and click "Add Resource" to contribute articles or media to the community.'
    },
    {
      route: '/forum',
      selector: '.forum h1',
      title: 'Forum — Community Discussion',
      text: 'Post questions, share experiences, and reply to others. Use the create-post box to start a new discussion, attach images or videos, and comment on posts to collaborate with the community.'
    },
    {
      route: '/profile',
      selector: '.profile-header h1',
      title: 'Profile — Your Account',
      text: 'Manage your profile, photo, and accessibility settings. Edit your personal details, view activity stats (challenges completed, posts, resources), and use quick actions to navigate back to the app.'
    },
  ];

  private renderer: Renderer2;
  private overlayEl?: HTMLElement;
  private tooltipEl?: HTMLElement;
  private highlightClass = 'tc-tour-highlight';
  private highlightEl?: HTMLElement;
  private currentIndex = 0;
  active = false;
  private routerSub?: Subscription;

  constructor(
    private router: Router,
    rendererFactory: RendererFactory2,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  toggle() { this.active ? this.stop() : this.start(); }

  start(startIndex = 0) {
    if (this.active) return;
    this.active = true;
    this.currentIndex = startIndex;
    // Listen for route changes to continue when navigating
    this.routerSub = this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        // run step after small delay so content can render
        setTimeout(() => this.showCurrentStep(), 300);
      }
    });
    this.showCurrentStep();
  }

  stop() {
    this.active = false;
    this.currentIndex = 0;
    this.removeOverlay();
    this.routerSub?.unsubscribe();
  }

  next() {
    if (!this.active) return;
    if (this.currentIndex < this.steps.length - 1) {
      this.currentIndex++;
      this.navigateAndShow();
    } else {
      this.stop();
    }
  }

  prev() {
    if (!this.active) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.navigateAndShow();
    }
  }

  private navigateAndShow() {
    const step = this.steps[this.currentIndex];
    this.removeOverlay();
    this.router.navigateByUrl(step.route).then(() => {
      // showCurrentStep will be triggered by NavigationEnd subscription,
      // but also call just in case navigation resolves without event ordering issues
      setTimeout(() => this.showCurrentStep(), 300);
    }).catch(() => setTimeout(() => this.showCurrentStep(), 350));
  }

  private async showCurrentStep() {
    if (!this.active) return;
    const step = this.steps[this.currentIndex];
    // Ensure we're on correct route
    if (!this.router.url.startsWith(step.route)) {
      // navigate and await NavigationEnd
      try {
        await this.router.navigateByUrl(step.route);
      } catch { /* ignore */ }
    }

    const el = await this.waitForElement(step.selector, 4000);
    if (!el) {
      // Couldn't find element — gracefully skip to next or stop
      if (this.currentIndex < this.steps.length - 1) {
        this.currentIndex++;
        return this.navigateAndShow();
      } else {
        return this.stop();
      }
    }

    this.showOverlay(el as HTMLElement, step);
  }

  private waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
    return new Promise(resolve => {
      const found = this.document.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const q = this.document.querySelector(selector);
        if (q) {
          obs.disconnect();
          resolve(q);
        }
      });
      obs.observe(this.document.body, { childList: true, subtree: true });
      setTimeout(() => {
        try { obs.disconnect(); } catch {}
        resolve(this.document.querySelector(selector));
      }, timeout);
    });
  }

  private showOverlay(target: HTMLElement, step: TourStep) {
    this.removeOverlay();
    // scroll target into view smoothly
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}

    // create overlay
    this.overlayEl = this.renderer.createElement('div');
    this.renderer.addClass(this.overlayEl, 'tc-tour-overlay');
    this.renderer.appendChild(this.document.body, this.overlayEl);

    // Create a cloned highlight element appended to <body> so it escapes any
    // stacking context or transform isolation the original element may live in.
    try {
      const rect = target.getBoundingClientRect();
      const clone = target.cloneNode(true) as HTMLElement;
      this.renderer.setStyle(clone, 'position', 'fixed');
      this.renderer.setStyle(clone, 'top', `${rect.top}px`);
      this.renderer.setStyle(clone, 'left', `${rect.left}px`);
      this.renderer.setStyle(clone, 'width', `${rect.width}px`);
      this.renderer.setStyle(clone, 'height', `${rect.height}px`);
      this.renderer.setStyle(clone, 'margin', '0');
      this.renderer.setStyle(clone, 'transform', 'none');
      this.renderer.setStyle(clone, 'pointer-events', 'none');
      this.renderer.addClass(clone, this.highlightClass);
      // Ensure clone sits above overlay and other elements
      this.renderer.setStyle(clone, 'z-index', '22000');
      this.renderer.appendChild(this.document.body, clone);
      this.highlightEl = clone;
    } catch (e) {
      // fallback: add class to original target if cloning fails
      this.renderer.addClass(target, this.highlightClass);
    }

    // create tooltip
    this.tooltipEl = this.renderer.createElement('div');
    this.renderer.addClass(this.tooltipEl, 'tc-tour-tooltip');
    const title = this.renderer.createElement('h3');
    title.textContent = step.title;
    const desc = this.renderer.createElement('div');
    desc.textContent = step.text;
    const actions = this.renderer.createElement('div');
    this.renderer.addClass(actions, 'actions');

    const prevBtn = this.renderer.createElement('button');
    prevBtn.textContent = 'Prev';
    this.renderer.listen(prevBtn, 'click', () => this.prev());
    const nextBtn = this.renderer.createElement('button');
    nextBtn.textContent = this.currentIndex < this.steps.length - 1 ? 'Next' : 'Finish';
    this.renderer.listen(nextBtn, 'click', () => this.next());
    const closeBtn = this.renderer.createElement('button');
    closeBtn.textContent = 'Close';
    this.renderer.listen(closeBtn, 'click', () => this.stop());

    this.renderer.appendChild(actions, prevBtn);
    this.renderer.appendChild(actions, nextBtn);
    this.renderer.appendChild(actions, closeBtn);

    this.renderer.appendChild(this.tooltipEl, title);
    this.renderer.appendChild(this.tooltipEl, desc);
    this.renderer.appendChild(this.tooltipEl, actions);
    this.renderer.appendChild(this.document.body, this.tooltipEl);

    // position tooltip near target
    setTimeout(() => this.positionTooltip(target), 50);
  }

  private positionTooltip(target: HTMLElement) {
    if (!this.tooltipEl) return;
    const rect = target.getBoundingClientRect();
    const ttRect = this.tooltipEl.getBoundingClientRect();
    const margin = 12;
    // prefer above, otherwise below
    let top = rect.top - ttRect.height - margin;
    if (top < 8) top = rect.bottom + margin;
    let left = rect.left + (rect.width - ttRect.width) / 2;
    if (left < 8) left = 8;
    if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
    this.renderer.setStyle(this.tooltipEl, 'position', 'fixed');
    this.renderer.setStyle(this.tooltipEl, 'top', `${Math.max(8, top)}px`);
    this.renderer.setStyle(this.tooltipEl, 'left', `${left}px`);
    this.renderer.setStyle(this.tooltipEl, 'z-index', '1200');
  }

  private removeOverlay() {
    try {
      if (this.overlayEl && this.overlayEl.parentNode) this.overlayEl.parentNode.removeChild(this.overlayEl);
      if (this.tooltipEl && this.tooltipEl.parentNode) this.tooltipEl.parentNode.removeChild(this.tooltipEl);
      if (this.highlightEl && this.highlightEl.parentNode) this.highlightEl.parentNode.removeChild(this.highlightEl);
    } catch {}
    // remove highlight class from any element
    try {
      const prev = this.document.querySelectorAll('.' + this.highlightClass);
      prev.forEach(el => el.classList.remove(this.highlightClass));
    } catch {}
    this.overlayEl = undefined;
    this.tooltipEl = undefined;
    this.highlightEl = undefined;
  }
}
