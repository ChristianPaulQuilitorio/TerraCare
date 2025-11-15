import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <div *ngFor="let t of (toastSvc.toasts$ | async)" class="toast" [class.success]="t.type==='success'" [class.error]="t.type==='error'" [class.info]="t.type==='info'" [class.warning]="t.type==='warning'">
        <span class="msg">{{t.message}}</span>
        <button class="close" (click)="toastSvc.dismiss(t.id)" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container { position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
    .toast { min-width: 260px; max-width: 420px; padding: 10px 12px; border-radius: 8px; color: #0b2e13; background: #e9f7ef; border: 1px solid #cde6d1; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: space-between; }
    .toast.success { background: #e8f5e9; border-color: #c8e6c9; color: #1b5e20; }
    .toast.error { background: #fdecea; border-color: #f5c6cb; color: #7f1d1d; }
    .toast.info { background: #eef6ff; border-color: #cfe0ff; color: #0b3d91; }
    .toast.warning { background: #fff7e6; border-color: #ffe0b2; color: #7a4f01; }
    .toast .close { border: none; background: transparent; color: inherit; font-size: 14px; cursor: pointer; }
    .toast .msg { padding-right: 8px; }
  `]
})
export class ToastContainerComponent {
  constructor(public toastSvc: ToastService) {}
}
