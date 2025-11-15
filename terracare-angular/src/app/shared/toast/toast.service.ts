import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  timeoutMs?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$ = this.toastsSubject.asObservable();

  show(message: string, type: ToastType = 'info', timeoutMs = 3500) {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, type, message, timeoutMs };
    const list = this.toastsSubject.getValue();
    this.toastsSubject.next([...list, toast]);
    if (timeoutMs && timeoutMs > 0) {
      setTimeout(() => this.dismiss(id), timeoutMs);
    }
  }

  dismiss(id: string) {
    const list = this.toastsSubject.getValue().filter(t => t.id !== id);
    this.toastsSubject.next(list);
  }
}
