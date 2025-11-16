import { Component, inject, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../toast/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ActiveChallengesService } from '../../core/services/active-challenges.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService } from '../../core/services/auth.service';

interface Message { role: 'user' | 'assistant' | 'system'; content: string }

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, CdkTrapFocus, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
  template: `
  <div class="tc-chatbot sidebar" [class.open]="open">
    <div style="display:flex; gap:8px; align-items:center; position:relative;">
      <button #toggleBtn class="chat-toggle-vertical" (click)="toggle()" [attr.aria-expanded]="open" aria-label="Open chat">
        <mat-icon>chat</mat-icon>
      </button>
    </div>

    <aside class="chat-panel" [class.open]="open" cdkTrapFocus (keydown.escape)="close()" role="dialog" aria-modal="true" aria-label="Care-chan dialog" [attr.aria-hidden]="!open">
      <header class="chat-header">
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
          <div style="display:flex; flex-direction:column">
            <span class="chat-title">Care-chan</span>
            <div class="chat-status"><span class="dot online"></span><span style="margin-left:8px; font-size:13px;color:var(--tc-muted,#666)">Online</span></div>
          </div>
          <div style="display:flex; align-items:center; gap:8px">
            <a class="clear-link" (click)="clearAll()">Clear</a>
            <button mat-icon-button aria-label="Close chat" (click)="close()"><mat-icon>close</mat-icon></button>
          </div>
        </div>
      </header>
      
      <div class="chat-controls" style="padding:12px; border-bottom:1px solid #eee;">
        <div style="margin-top:8px; font-size:12px; color:#555;">
          <span>Need help? Use a quick prompt.</span>
        </div>
      </div>

      <div class="chat-body" #body role="log" aria-live="polite">
        <div *ngFor="let m of messages" class="msg" [class.user]="m.role==='user'" [class.assistant]="m.role==='assistant'">
          <div class="bubble">{{ m.content }}</div>
        </div>
        <!-- Structured results (e.g., challenge list) rendered with action buttons -->
        <div *ngIf="lastListResults.length" class="structured-list" style="margin:8px 0 12px;">
          <div *ngFor="let it of lastListResults" class="structured-item" style="display:flex; align-items:flex-start; gap:8px; padding:8px; border-radius:8px; background: rgba(255,255,255,0.02); margin-bottom:8px;">
            <div style="flex:1">
              <div style="font-weight:700; color:var(--tc-accent-600)">{{ it.title }}</div>
              <div style="font-size:13px; color:rgba(255,255,255,0.8); margin-top:4px">{{ it.description }}</div>
              <div style="margin-top:6px; font-size:12px; color:var(--tc-muted)"> {{ it.meta || '' }} </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end">
              <button mat-stroked-button class="quick-pill" (click)="viewChallenge(it)">View</button>
              <button *ngIf="!it.owned" mat-flat-button color="primary" (click)="joinFromChat(it)" [disabled]="it.joined">{{ it.joined ? 'Joined' : 'Join' }}</button>
            </div>
          </div>
        </div>
        <div *ngIf="loading" class="msg assistant"><div class="bubble">Thinking...</div></div>
      </div>

      <div class="quick-actions-area">
        <div class="quick-actions-title">Quick actions</div>
        <div class="quick-actions">
          <button mat-stroked-button class="quick-pill" *ngFor="let p of quickPrompts" (click)="applyQuick(p)">{{ p }}</button>
        </div>
      </div>

      <form class="chat-form" (ngSubmit)="sendStream()">
        <mat-form-field style="flex:1; margin:0">
          <input matInput [(ngModel)]="draft" name="draft" placeholder="Ask me about eco-challenges..." required />
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="loading || !draft">Send</button>
      </form>

      <div class="chat-footer" style="padding:8px 12px; font-size:12px; color:var(--tc-muted,#666)">Don't share secrets. Messages may be sent to an AI service.</div>
    </aside>
  </div>
  `
,
  styles: [
    `
    /* Brand variables (overrideable) */
    .tc-chatbot { --tc-primary: #2E7D32; --tc-accent: #2E7D32; --tc-accent-600: #256628; --tc-muted: #9ca3af; position: fixed; right: 12px; bottom: 12px; z-index: 1400; }

    /* Toggle */
    .tc-chatbot .chat-toggle-vertical { width:44px; height:44px; border-radius:22px; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.12); display:flex; align-items:center; justify-content:center; border: none; cursor: pointer; transition: transform 220ms ease, box-shadow 220ms ease; }
    .tc-chatbot.open .chat-toggle-vertical { transform: translateX(-6px) scale(1.02); box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
    .ai-toggle { display:inline-flex; align-items:center; gap:8px; margin-left:6px; background:transparent; border:none; color:var(--tc-muted); cursor:pointer; padding:6px 8px; border-radius:8px }
    .ai-dot { width:10px; height:10px; border-radius:10px; background:#9ca3af; display:inline-block; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .ai-dot.server { background: var(--tc-accent); }
    .ai-label { font-size:12px; color: #cbd5e1 }
    .tc-chatbot .chat-toggle-vertical mat-icon { font-size:20px; }

    /* Sidebar panel */
    .tc-chatbot.sidebar .chat-panel { position: fixed; right: 0; top: 0; width:360px; max-width:360px; height:100vh; display:flex; flex-direction:column; background: #0f1113; border-left:1px solid rgba(255,255,255,0.04); box-shadow: -8px 0 24px rgba(0,0,0,0.6); overflow:hidden;
      transform: translateX(100%); opacity: 0; pointer-events: none; transition: transform 320ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease-in-out;
    }
    .tc-chatbot.sidebar .chat-panel.open { transform: translateX(0); opacity: 1; pointer-events: auto; }

    /* Header */
    .chat-header { padding:12px 16px; font-weight:600; border-bottom:1px solid rgba(255,255,255,0.03); background:transparent; color: #fff }
    .chat-title { font-size:16px; font-weight:700; }
    .chat-status { margin-top:4px; display:flex; align-items:center }
    .dot { display:inline-block; width:10px; height:10px; border-radius:10px; background:#ccc; }
    .dot.online { background: var(--tc-accent); }
    .clear-link { color:var(--tc-primary); cursor:pointer; text-decoration:underline; font-size:13px }

    .chat-controls { padding:8px 12px; }
     /* Desktop: keep the original flexible body so quick actions stay visible
       (mobile overrides live inside the @media block). */
     .chat-body { padding:12px; flex:1 1 auto; overflow:auto; background: #0b0b0b; border-radius:6px; margin:12px; border:1px solid rgba(255,255,255,0.03); }
     .chat-form { display:flex; gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.04); align-items:center; }
     .chat-form input[matInput] { background: #ffffff; color: #000000; padding:8px 10px; border-radius:6px; border: 1px solid rgba(2,6,23,0.06); }
    .chat-form input[matInput]::placeholder { color: #6b7280; }

    .bubble { padding:8px 12px; border-radius:10px; display:inline-block; max-width:100%; white-space:pre-wrap; word-wrap:break-word; }
    .msg { margin:8px 0; display:flex; }
    .msg.user { justify-content:flex-end; }
    .msg.user .bubble { background: var(--tc-accent); color:#fff; }
    .msg.assistant .bubble { background:transparent; border:1px solid rgba(255,255,255,0.04); color:#e6e6e6; }

    /* Quick action pills styled to brand palette */
    .quick-actions-area { padding:8px 12px 0 12px; }
    .quick-actions-title { font-size:13px; margin-bottom:8px; color:rgba(255,255,255,0.75) }
    .quick-actions { display:flex; gap:8px; flex-wrap:wrap }
    .quick-pill {
      border-radius:16px; text-transform:none; font-size:12px; padding:6px 10px; border: 1px solid rgba(2,6,23,0.06);
      color: #041018; background: #ffffff;
      box-shadow: 0 1px 4px rgba(2,6,23,0.04);
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    }
    .quick-pill:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(2,6,23,0.08); }
    .quick-pill:active { transform: translateY(0); opacity:0.95 }
    .quick-pill[disabled] { opacity:0.5; cursor:not-allowed }

    /* Send button uses brand primary/accent */
    .chat-form button[mat-flat-button] { background: var(--tc-accent); color: #fff; border-radius:8px; padding:8px 14px; box-shadow: none; border: none; }
    .chat-form button[mat-flat-button]:hover { background: var(--tc-accent-600) }

    .chat-footer { border-top:1px solid rgba(255,255,255,0.02); color: rgba(255,255,255,0.6); padding:8px 12px }
    @media (max-width:600px) {
      /* Mobile: bottom-sheet style — increase height and readability for small screens */
      .tc-chatbot .chat-toggle-vertical { position: fixed; right: 18px; bottom: 18px; width:52px; height:52px; border-radius:26px; }
      .tc-chatbot.sidebar .chat-panel {
        right: 6px;
        left: 6px;
        width: auto;
        max-width: none;
        bottom: 0;
        top: auto;
        /* reduce mobile panel height slightly to leave more room for browser UI */
        height: 90vh;
        border-radius: 14px 14px 0 0;
        transform: translateY(100%);
        transition: transform 320ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease-in-out;
        z-index: 1600;
      }
      .tc-chatbot.sidebar .chat-panel.open { transform: translateY(0); }
      .chat-header { padding:12px 16px; }
      .chat-title { font-size:18px; }
      .chat-status { font-size:13px }
      /* Adjust chat-body calc to match the reduced panel height and keep the composer visible */
      .chat-body { margin:10px; padding:12px; height: calc(90vh - 200px); overflow:auto; color: #fff; }
      .bubble { font-size:15px; line-height:1.4; }
      .msg.assistant .bubble { background: rgba(255,255,255,0.04); color:#ffffff; border: none; }
      .msg.user .bubble { background: var(--tc-accent); color:#fff; }
      .chat-form { display:flex; gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.06); position: sticky; bottom: 0; background: linear-gradient(180deg, rgba(15,15,15,0.98), rgba(15,15,15,0.98)); }
      .chat-form input[matInput] { width:100%; padding:12px 14px; font-size:15px; border-radius:8px; }
      .chat-form input[matInput]::placeholder { color:#9ca3af; }
      .chat-form button[mat-flat-button] { padding:10px 14px; font-size:14px; }
      .quick-actions { gap:6px; }
      .quick-actions-area { padding:8px 12px 6px 12px; }
      .quick-pill { font-size:11px; padding:4px 8px; }
      .structured-item { padding:12px; background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.03); }
      .chat-footer { padding:10px 12px; font-size:13px }
    }
    `
  ]
})
export class ChatbotComponent {
  quickPrompts: string[] = [
    'What challenges are available?',
    "What's my progress?",
    'How do I join a challenge?',
    'How to upload proof photos?'
  ];
  // UI state
  open = false;
  draft = '';
  messages: Message[] = [];
  loading = false;
  // Local-only AI: the assistant uses in-browser logic and app data via Supabase
  // Last structured results (e.g., challenges) returned by the assistant; rendered with action buttons
  lastListResults: any[] = [];
  // Language preference for assistant replies: 'en' or 'tl' (Tagalog)
  lang: string = 'en';
  

  // Injected services
  auth = inject(AuthService);
  http = inject(HttpClient);
  router = inject(Router);
  toast = inject(ToastService);
  // Supabase & app services (allow chatbot to work without external server)
  supabase = inject(SupabaseService);
  activeChallengesService = inject(ActiveChallengesService);
  // Host element reference for outside-click detection
  hostEl = inject(ElementRef);
  @ViewChild('toggleBtn', { read: ElementRef }) toggleBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('body', { read: ElementRef }) bodyEl?: ElementRef<HTMLDivElement>;

  // Simple translation table for common assistant replies (English -> Tagalog)
  private translations: Record<string,string> = {
    // Greeting
    'Hi there! I\'m Care-chan. How can I help you today?': 'Kumusta! Ako si Care-chan. Paano kita matutulungan ngayon?',
    'Hello! How can I help you today?': 'Kumusta! Paano kita matutulungan ngayon?',
    'Please sign in so I can look up your progress — tap Sign In and I will show your progress.': 'Mangyaring mag-sign in upang masuri ko ang iyong progreso — pindutin ang "Sign In" at ipapakita ko ang iyong progreso.',
    'Challenge data is not available in this environment.': 'Hindi magagamit ang datos ng hamon sa environment na ito.',
    'No public challenges found right now.': 'Walang pampublikong hamon na makita ngayon.',
    'Could not load challenges right now — try again later.': 'Hindi ma-load ang mga hamon ngayon — subukan ulit mamaya.',
    'Your active challenges:\n\n': 'Ang iyong mga aktibong hamon:\n\n',
    'Here are some available challenges:\n\n': 'Narito ang ilang magagamit na hamon:\n\n',
    'I found these helpful articles related to your question:\n\n': 'Nakita ko ang mga artikulong makakatulong tungkol sa iyong tanong:\n\n',
    'I can list challenges and show your progress locally. Try a quick prompt or ask about a specific feature.': 'Maaari kong ilista ang mga hamon at ipakita ang iyong progreso nang lokal. Subukan ang isang quick prompt o magtanong tungkol sa isang partikular na tampok.',
    'I can list challenges and show your progress locally. Enable AI backend (toggle at top) for more conversational replies.': 'Maaari kong ilista ang mga hamon at ipakita ang iyong progreso nang lokal.',
    'Please sign in to join challenges — tap Sign In and I will join it for you.': 'Mangyaring mag-sign in upang makasali sa mga hamon — pindutin ang "Sign In" at sasaliin kita.',
    'You\'re already joined to': 'Nakasali ka na sa',
    'You\'re now joined to': 'Sumali ka na sa',
    'To join a challenge, follow these steps:\n\n1) Sign in to your account (top-right).\n2) Open the "Challenges" page and browse available challenges.\n3) Click a challenge to view details.\n4) On the challenge page click the "Join" button to enroll.\n5) Once joined, you\'ll see the challenge under your Dashboard -> Active Challenges.\n\nIf you want, I can show available challenges now — just ask "What challenges are available?" or click the Browse link.':
      'Upang sumali sa isang hamon, sundin ang mga hakbang na ito:\n\n1) Mag-sign in sa iyong account (kanang itaas).\n2) Buksan ang pahina ng "Challenges" at hanapin ang mga magagamit na hamon.\n3) I-click ang isang hamon upang makita ang mga detalye.\n4) Sa pahina ng hamon, i-click ang button na "Join" upang mag-enroll.\n5) Kapag sumali ka na, makikita mo ang hamon sa iyong Dashboard -> Active Challenges.\n\nKung gusto mo, maaari kong ipakita ang mga magagamit na hamon ngayon — itanong lang "What challenges are available?" o i-click ang Browse link.',
    'To upload proof photos for a challenge:\n\n1) Make sure you\'re signed in.\n2) Go to the challenge page for the challenge you joined (Challenges -> Browse -> View).\n+3) Find the "Upload Proof" or "Add Evidence" button on the challenge page.\n4) Select your photo(s) (JPEG/PNG preferred). Maximum file size: 50MB.\n5) Add a short caption or description explaining the proof.\n6) Submit — your proof will be saved and will appear in your submissions.\n\nTips: Use clear photos showing the activity or location; include a timestamp or context in the caption when helpful. If you don\'t see the upload button, make sure you have joined the challenge first.':
      'Upang mag-upload ng proof photos para sa isang hamon:\n\n1) Siguraduhing naka-sign in ka.\n2) Pumunta sa pahina ng hamon na sinalihan mo (Challenges -> Browse -> View).\n+3) Hanapin ang button na "Upload Proof" o "Add Evidence" sa pahina ng hamon.\n4) Piliin ang iyong mga larawan (JPEG/PNG mas mainam). Maximum na laki ng file: 50MB.\n5) Magdagdag ng maikling caption o paglalarawan ng patunay.\n6) I-submit — mase-save ang iyong proof at makikita sa iyong submissions.\n\nMga Tip: Gumamit ng malinaw na larawan na nagpapakita ng aktibidad o lokasyon; maglagay ng timestamp o konteksto sa caption kapag makakatulong. Kung hindi mo nakikita ang upload button, siguraduhing sumali ka muna sa hamon.'
  };

  private t(text: string) {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('tc.chat.lang');
        if (saved) this.lang = saved;
      }
    } catch (e) {}
    if (this.lang !== 'tl') return text;
    // Exact match translation
    if (this.translations[text]) return this.translations[text];
    // Simple header replacements
    if (text.startsWith('Here are some available challenges:')) return text.replace('Here are some available challenges:', this.translations['Here are some available challenges:\n\n'] || '');
    if (text.startsWith('Your active challenges:')) return text.replace('Your active challenges:', this.translations['Your active challenges:\n\n'] || '');
    if (text.startsWith('I found these helpful articles related to your question:')) return text.replace('I found these helpful articles related to your question:', this.translations['I found these helpful articles related to your question:\n\n'] || '');
    // Fallback: return original (translation not available)
    return text;
  }

  private detectLanguageFromText(s: string) {
    try {
      const v = (s || '').toLowerCase();
      const tagalogIndicators = ['kamusta','kumusta','po','opo','salamat','magandang','mano','naman','saan','ano','paano'];
      for (const w of tagalogIndicators) if (v.includes(w)) { this.lang = 'tl'; try { localStorage.setItem('tc.chat.lang','tl'); } catch {} return; }
      // Default to English when Tagalog indicators not present
      this.lang = 'en';
      try { localStorage.setItem('tc.chat.lang','en'); } catch {}
    } catch (e) {}
  }

  // Clean up provider fragments and metadata that may sneak into stream deltas
  private sanitizeText(text: string): string {
    if (!text) return '';
    let s = String(text);
    // Replace escaped newline sequences with real newlines
    s = s.replace(/\\n/g, '\n');

    // Preserve code fences (triple-backtick blocks) so we don't strip JSON-like content inside code samples
    const codeBlocks: string[] = [];
    s = s.replace(/```[\s\S]*?```/g, (m) => { codeBlocks.push(m); return `___CODE_BLOCK_${codeBlocks.length-1}___`; });

    // Remove JSON-like metadata objects containing id/object/system_fingerprint and any nested serialized JSON
    s = s.replace(/\{[^}]*\"(?:id|object|system_fingerprint|choices|created)\"[^}]*\}/g, '');
    // Remove any leftover JSON-looking fragments (simple heuristic)
    s = s.replace(/\{[^}]*\}/g, '');
    // Normalize whitespace but preserve line breaks (replace multiple spaces/tabs with single space)
    s = s.replace(/[ \t]{2,}/g, ' ');
    // Normalize repeated newlines to at most two
    s = s.replace(/\n{3,}/g, '\n\n');
    // Remove space before punctuation
    s = s.replace(/\s+([.,!?;:])/g, '$1');

    // Restore preserved code blocks
    s = s.replace(/___CODE_BLOCK_(\d+)___/g, (_m, idx) => codeBlocks[Number(idx)] || '');

    // Trim and return
    return s.trim();
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.open) return;
    try {
      const ev = event as any;
      const path = typeof ev.composedPath === 'function' ? ev.composedPath() : (ev.path || []);
      const panelEl = this.hostEl?.nativeElement?.querySelector('.chat-panel') as HTMLElement | null;
      const toggleEl = this.toggleBtn?.nativeElement as HTMLElement | null;
      if (!panelEl) return;
      // If the composed path contains the panel or the toggle, it's an inside click
      if (path && path.length) {
        if (path.includes(panelEl) || (toggleEl && path.includes(toggleEl))) return;
      } else {
        const target = event.target as Node;
        if (panelEl.contains(target) || (toggleEl && toggleEl.contains(target))) return;
      }
      // Otherwise close
      this.close();
    } catch (e) {
      // Best-effort fallback: check containment
      try {
        const target = (event as any).target as Node;
        const panelEl = this.hostEl?.nativeElement?.querySelector('.chat-panel') as HTMLElement | null;
        if (panelEl && target && !panelEl.contains(target)) this.close();
      } catch (_) {}
    }
  }

  // Normalize a raw fragment from the stream: strip leading `data:` tokens,
  // parse JSON payloads like {"delta":"..."} and return the textual part,
  // otherwise return a cleaned string (or empty to skip).
  private normalizeFragment(fragment: string): string {
    if (!fragment) return '';
    let s = String(fragment).trim();
    // Remove repeated leading 'data:' markers
    s = s.replace(/^\s*(?:data:\s*)+/i, '');
    // If it's a quoted string, remove quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    // Try to parse as JSON and extract textual fields
    try {
      const obj = JSON.parse(s);
      if (!obj) return '';
      if (typeof obj.delta === 'string') return obj.delta;
      if (typeof obj.content === 'string') return obj.content;
      if (typeof obj.text === 'string') return obj.text;
      if (Array.isArray(obj.choices)) {
        let out = '';
        for (const ch of obj.choices) {
          if (ch?.delta && typeof ch.delta === 'object' && typeof ch.delta.content === 'string') out += ch.delta.content;
          else if (ch?.delta && typeof ch.delta === 'string') out += ch.delta;
          else if (ch?.message && typeof ch.message.content === 'string') out += ch.message.content;
        }
        return out;
      }
      return '';
    } catch (e) {
      // Not JSON — remove any embedded 'data:' tokens and return
      return s.replace(/\bdata:\s*/gi, '').trim();
    }
  }

  toggle() { this.open = !this.open; if (this.open) { setTimeout(()=> this.focusInput(), 360); } }

  close() { this.open = false; setTimeout(()=> this.toggleBtn?.nativeElement?.focus?.(),50); }

  private focusInput() {
    try { const el = document.querySelector('.chat-form input') as HTMLInputElement | null; if (el) el.focus(); } catch {}
  }

  toggleAiMode() {
    // removed: server toggle (local-only AI)
  }

  applyQuick(prompt: string) {
    try {
      if (!prompt) return;
      this.open = true;
      // Clear any previous structured results unless this quick prompt is challenge-related
      this.clearStructuredResults();
      this.draft = prompt;
      // small delay so the input exists and focus is set before sending
      setTimeout(() => { try { this.sendStream(); } catch {} }, 120);
    } catch (e) { /* ignore */ }
  }

  // Clear structured results (cards) from the chat UI
  private clearStructuredResults() {
    try { this.lastListResults = []; } catch (e) {}
  }

  // Clear all chat state (messages, structured cards, draft)
  clearAll() {
    try {
      this.messages = [];
      this.clearStructuredResults();
      this.draft = '';
      // move focus back to toggle for accessibility
      setTimeout(()=> this.toggleBtn?.nativeElement?.focus?.(), 50);
    } catch (e) { /* ignore */ }
  }

  exportConversation() {
    try {
      const data = JSON.stringify(this.messages, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'conversation.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  }

  

  private async saveConversation() {
    try {
      // Save conversation to Supabase if available; otherwise persist to localStorage for dev
      const session = await this.auth.getSession();
      const user = session?.user || null;
      const payload: any = { user_id: user?.id || null, messages: this.messages, model: 'local', created_at: new Date().toISOString() };
      if (this.supabase && this.supabase.client && user) {
        try {
          await this.supabase.client.from('ai_conversations').insert([payload]);
        } catch (e) {
          // non-fatal: fallback to localStorage
          try { localStorage.setItem('tc.chat.last', JSON.stringify(this.messages.slice(-200))); } catch {}
        }
      } else {
        try { localStorage.setItem('tc.chat.last', JSON.stringify(this.messages.slice(-200))); } catch {}
      }
    } catch (e) { /* ignore save errors */ }
  }

  // Streaming send: uses fetch() to read provider stream and append to assistant message in real-time
  async sendStream() {
    if (!this.draft) return;
    const text = this.draft.trim();
    if (!text) return;
    // detect user language from input (simple heuristic)
    try { this.detectLanguageFromText(text); } catch (e) {}
    this.messages.push({ role: 'user', content: text });
    // push assistant placeholder
    const assistantIndex = this.messages.push({ role: 'assistant', content: '' }) - 1;
    this.draft = '';
    this.loading = true;
    try {
      // Quick local commands: if the user asked to list or show challenges we handle
      const cmd = text.toLowerCase();
      // Match when the text mentions challenges and any of the intent words (order-insensitive)
      const mentionsChallenge = /\b(challenge|challenges)\b/.test(cmd);
      const intentList = /\b(show|list|available|what|which|available|find)\b/.test(cmd);
      const wantsList = mentionsChallenge && intentList;
      const wantsMy = /\b(my|mine|my progress|what's my|show me|how am i)\b/.test(cmd) || (/\b(progress)\b/.test(cmd) && /\b(my|mine)\b/.test(cmd));
      if (wantsList || wantsMy) {
        // handle locally via API endpoints (no streaming)
        if (wantsList) {
          await this.fetchAndShowChallenges();
        } else if (wantsMy) {
          await this.fetchAndShowMyChallenges();
        }
        this.saveConversation();
        this.loading = false;
        return;
      }
      // For any non-challenge queries, clear structured cards so they don't persist
      this.clearStructuredResults();
      // Build a safe payload: limit the number of messages and cap per-message length
      // Server enforces a per-message max (5000 chars). Trim proactively here to avoid "message too long" errors.
      const MAX_MESSAGES = 12;
      const MAX_MSG_CHARS = 3000; // keep a margin under server-side 5000 limit
      const recent = this.messages.slice(-MAX_MESSAGES);
      const safeMessages = recent.map(m => {
        const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
        if (content.length > MAX_MSG_CHARS) {
          // keep the tail of long messages (more context) and prefix with ellipsis
          return { role: m.role, content: '...'+content.slice(-MAX_MSG_CHARS) };
        }
        return { role: m.role, content };
      });
      const payload = { messages: safeMessages, model: 'llama-3.3-70b', stream: true };
      // Use local conversational responder (Supabase knowledge + app data)
      const handled = await this.localConversationalResponder(text, assistantIndex);
      if (!handled) {
        this.messages[assistantIndex].content = this.t('I can list challenges and show your progress locally. Try a quick prompt or ask about a specific feature.');
      }
      this.saveConversation();
    } catch (e: any) {
      console.error('Chat stream error', e);
      // Attempt local fallback responder so chatbot remains useful without a backend AI service
      try {
        const fallbackHandled = await this.localFallbackResponder(text);
        if (!fallbackHandled) {
          this.messages.push({ role: 'assistant', content: this.t('I can list challenges and show your progress locally. Try a quick prompt or ask about a specific feature.') });
        }
      } catch (fe) {
        console.warn('Fallback responder failed', fe);
        this.messages.push({ role: 'assistant', content: this.t('Sorry — failed to get a response.') });
      }
    } finally {
      this.loading = false;
    }
  }

  // Basic local fallback responder: handles challenge listing and progress without external AI
  private async localFallbackResponder(text: string): Promise<boolean> {
    const cmd = (text || '').toLowerCase();
    // If user asks about available challenges
    if (cmd.includes('challenge') && (cmd.includes('available') || cmd.includes('what') || cmd.includes('list') || cmd.includes('show'))) {
      await this.fetchAndShowChallenges();
      return true;
    }
    // If user asks about their progress
    if (/(my|my progress|how am i|what's my progress|what is my progress)/.test(cmd) || (cmd.includes('progress') && cmd.includes('my'))) {
      const session = await this.auth.getSession();
      const user = session?.user || null;
      if (!user) {
        this.messages.push({ role: 'assistant', content: this.t('Please sign in so I can look up your progress — tap Sign In and I will show your progress.') });
        return true;
      }
      await this.fetchAndShowMyChallenges();
      return true;
    }
    // Default: no local answer
    return false;
  }

  // Local conversational responder: searches knowledge base and falls back to local handlers
  private async localConversationalResponder(text: string, assistantIndex: number): Promise<boolean> {
    // Quick greeting detection (hi/hello/hey, Tagalog kamusta/kumusta)
    try {
      const v = (text || '').toLowerCase().trim();
      if (/^(hi|hello|hey|hiya)\b/.test(v) || /\b(kamusta|kumusta)\b/.test(v)) {
        this.messages[assistantIndex].content = this.t("Hi there! I'm Care-chan. How can I help you today?");
        return true;
      }
    } catch (e) { /* ignore */ }

    // First, see if the simple fallback responder can handle the query (challenges/progress)
    try {
      const handled = await this.localFallbackResponder(text);
      if (handled) return true;
    } catch (e) { /* ignore */ }

    // Intent: handle common quick prompts with tailored instructions
    try {
      const q = (text || '').toLowerCase();
      // How to join a challenge
      if (/join/.test(q) && /challenge/.test(q)) {
        this.clearStructuredResults();
        this.messages[assistantIndex].content = this.t(`To join a challenge, follow these steps:\n\n1) Sign in to your account (top-right).\n2) Open the "Challenges" page and browse available challenges.\n3) Click a challenge to view details.\n4) On the challenge page click the "Join" button to enroll.\n5) Once joined, you\'ll see the challenge under your Dashboard -> Active Challenges.\n\nIf you want, I can show available challenges now — just ask "What challenges are available?" or click the Browse link.`);
        return true;
      }
      // How to upload proof photos
      if (/upload/.test(q) && /proof/.test(q) || /proof photo/.test(q) || /upload proof/.test(q)) {
        this.clearStructuredResults();
        this.messages[assistantIndex].content = this.t(`To upload proof photos for a challenge:\n\n1) Make sure you're signed in.\n2) Go to the challenge page for the challenge you joined (Challenges -> Browse -> View).\n3) Find the "Upload Proof" or "Add Evidence" button on the challenge page.\n4) Select your photo(s) (JPEG/PNG preferred). Maximum file size: 50MB.\n5) Add a short caption or description explaining the proof.\n6) Submit — your proof will be saved and will appear in your submissions.\n\nTips: Use clear photos showing the activity or location; include a timestamp or context in the caption when helpful. If you don't see the upload button, make sure you have joined the challenge first.`);
        return true;
      }

    } catch (e) { /* ignore */ }

    // Otherwise, try searching app knowledge items in Supabase
    try {
      if (this.supabase && this.supabase.client) {
        const q = (text || '').trim();
        if (q.length > 2) {
          // Search title and content using ilike (simple contains match)
          const { data, error } = await this.supabase.client
            .from('knowledge_items')
            .select('id, title, content')
            .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
            .limit(6);
          if (!error && Array.isArray(data) && data.length) {
            const snippets = (data as any[]).map(k => `• ${k.title}: ${((k.content||'').replace(/\s+/g,' ').slice(0,240))}`);
            // Ensure no challenge cards remain when showing knowledge results
            this.clearStructuredResults();
            this.messages[assistantIndex].content = `I found these helpful articles related to your question:\n\n${snippets.join('\n\n')}\n\nReply with the article title or ask for more details.`;
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('localConversationalResponder search error', e);
    }

    // Generic fallback reply (useful guidance and pointers)
    this.messages[assistantIndex].content = 'I can help with challenges, your progress, and app usage — try asking "What challenges are available?" or "What is my progress?".';
    return true;
  }

  // Fetch public challenges and append a friendly assistant message
  private async fetchAndShowChallenges() {
    try {
      if (!this.supabase || !this.supabase.client) {
        this.messages.push({ role: 'assistant', content: this.t('Challenge data is not available in this environment.') });
        return;
      }

      // Try primary query, but tolerate schema differences (archived/base_points may not exist)
      let { data, error } = await this.supabase.client
        .from('challenges')
        .select('id, title, description, image, visibility, creator_id, created_at, base_points, archived')
        .order('created_at', { ascending: false });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        // Retry without archived filter if column doesn't exist
        if (msg.includes('column') && msg.includes('archived')) {
          const retry = await this.supabase.client
            .from('challenges')
            .select('id, title, description, image, visibility, creator_id, created_at, base_points')
            .order('created_at', { ascending: false });
          data = retry.data as any[];
        } else if (msg.includes('column') && msg.includes('base_points')) {
          const retry = await this.supabase.client
            .from('challenges')
            .select('id, title, description, image, visibility, creator_id, created_at')
            .order('created_at', { ascending: false });
          data = retry.data as any[];
        } else {
          throw error;
        }
      }

      const all = Array.isArray(data) ? data : [];
      // Filter out archived if present
      const list = all.filter((c:any) => c.archived !== true).slice(0, 10);
      if (!list.length) {
        this.messages.push({ role: 'assistant', content: this.t('No public challenges found right now.') });
        return;
      }

      // If user is signed in, enrich with join/progress info
      const session = await this.auth.getSession();
      const user = session?.user || null;
      let participantMap = new Map<string, number>();
      let completedSet = new Set<string>();
      if (user) {
        const ids = list.map(c => c.id);
        try {
          const { data: parts } = await this.supabase.client
            .from('challenge_participants')
            .select('challenge_id, progress')
            .in('challenge_id', ids as any)
            .eq('user_id', user.id);
          for (const p of (parts || [])) participantMap.set(String(p.challenge_id), Number(p.progress || 0));

          const { data: hist } = await this.supabase.client
            .from('challenge_history')
            .select('challenge_id')
            .eq('user_id', user.id)
            .eq('action', 'completed')
            .in('challenge_id', ids as any);
          for (const h of (hist || [])) completedSet.add(String(h.challenge_id));
        } catch (e) { /* non-fatal */ }
      }

      const lines = list.map((c: any, i: number) => {
        const title = c.title || c.id;
        const desc = (c.description || '').replace(/\s+/g,' ').trim();
        const base = typeof c.base_points === 'number' ? c.base_points : 10;
        const joined = user ? participantMap.has(String(c.id)) : false;
        const pct = user ? (completedSet.has(String(c.id)) ? 100 : (participantMap.get(String(c.id)) ?? 0)) : null;
        const pctText = pct == null ? '' : ` — ${Math.round(pct)}% complete`;
        const joinText = joined ? ' (joined)' : '';
        return `${i+1}. ${title}${joinText}${pctText} — ${desc}`.trim();
      }).slice(0,6);
      // store structured results for UI actions (View / Join)
      this.lastListResults = list.slice(0,6).map((c:any, i:number) => {
        const id = c.id;
        const title = c.title || c.id;
        const description = (c.description || '').replace(/\s+/g,' ').trim();
        const joined = user ? participantMap.has(String(id)) : false;
        const hasProgress = participantMap.has(String(id)) && typeof participantMap.get(String(id)) === 'number';
        const owned = user ? String(c.creator_id) === String(user.id) : false;
        const progressVal = hasProgress ? Math.round(Number(participantMap.get(String(id)) || 0)) : null;
        const meta = user ? (joined ? 'Joined' : (completedSet.has(String(id)) ? 'Completed' : (progressVal !== null ? `${progressVal}% complete` : ''))) : '';
        return { id, title, description, meta, joined, owned };
      });

      this.messages.push({ role: 'assistant', content: this.t(`Here are some available challenges:\n\n${lines.join('\n')}`) });
      try { if (this.bodyEl?.nativeElement) this.bodyEl.nativeElement.scrollTop = this.bodyEl.nativeElement.scrollHeight; } catch {}
    } catch (e: any) {
      console.warn('fetchAndShowChallenges error', e);
      this.messages.push({ role: 'assistant', content: this.t('Could not load challenges right now — try again later.') });
    }
  }

  // Fetch the current user's joined/active challenges and show progress
  private async fetchAndShowMyChallenges() {
    try {
      // If not authed, ask user to sign in first
      const session = await this.auth.getSession();
      const user = session?.user || null;
      if (!user) {
        this.messages.push({ role: 'assistant', content: this.t('Please sign in so I can look up your progress — tap Sign In and I will show your progress.') });
        return;
      }
      // Use ActiveChallengesService to load current user's active challenges
      try { await this.activeChallengesService.load(); } catch (e) { /* ignore */ }
      const arr = await firstValueFrom(this.activeChallengesService.activeChallenges$);
      const list = Array.isArray(arr) ? arr : [];
      if (!list.length) {
        this.messages.push({ role: 'assistant', content: this.t('No active challenges found for your account.') });
        return;
      }
      const lines = list.map((c: any) => {
        const pct = typeof c.progress === 'number' ? `${Math.round(c.progress)}%` : (c.tasks ? `${Math.round(((c.tasks.filter((t:any)=>t.done).length||0)/(c.tasks.length||1))*100)}%` : 'N/A');
        return `${c.title || c.id} — ${pct} complete`;
      });
      // Populate lastListResults for active challenges so user can quick-view/join
      this.lastListResults = list.map((c:any) => ({ id: c.id, title: c.title || c.id, description: c.description || '', meta: `${Math.round(c.progress||0)}% complete`, joined: true }));
      this.messages.push({ role: 'assistant', content: this.t(`Your active challenges:\n\n${lines.join('\n')}`) });
      try { if (this.bodyEl?.nativeElement) this.bodyEl.nativeElement.scrollTop = this.bodyEl.nativeElement.scrollHeight; } catch {}
    } catch (e: any) {
      console.warn('fetchAndShowMyChallenges error', e);
      this.messages.push({ role: 'assistant', content: this.t('Could not load your challenges — please sign in and try again.') });
    }
  }

  // Navigate to challenge detail/browse view
  viewChallenge(item: any) {
    try {
      if (!item || !item.id) return;
      this.open = false;
      this.router.navigate(['/challenges/browse'], { queryParams: { id: item.id } });
    } catch (e) { console.warn('viewChallenge', e); }
  }

  // Join a challenge on behalf of the signed-in user
  async joinFromChat(item: any) {
    try {
      if (!item || !item.id) return;
      const session = await this.auth.getSession();
      const user = session?.user || null;
      if (!user) {
        this.messages.push({ role: 'assistant', content: this.t('Please sign in to join challenges — tap Sign In and I will join it for you.') });
        return;
      }
      // attempt to insert participant record
      const payload = { challenge_id: item.id, user_id: user.id, progress: 0, created_at: new Date().toISOString() };
      try {
        const { data, error } = await this.supabase.client.from('challenge_participants').insert([payload]);
        if (error) {
          // If already exists, mark as joined
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('duplicate') || msg.includes('unique')) {
            this.messages.push({ role: 'assistant', content: this.t("You're already joined to") + ' ' + (item.title || 'this challenge') + '.' });
            item.joined = true;
            try { await this.activeChallengesService.load(); } catch {}
            return;
          }
          this.toast?.show?.(`Failed to join: ${error.message || 'unknown error'}`, 'error');
          return;
        }
        item.joined = true;
        this.toast?.show?.(`Joined ${item.title || 'challenge'}`, 'success');
        // refresh app active challenges
        try { await this.activeChallengesService.load(); } catch {}
        this.messages.push({ role: 'assistant', content: this.t("You're now joined to") + ' ' + (item.title || 'this challenge') + '.' });
      } catch (ie) {
        console.warn('joinFromChat insert error', ie);
        this.toast?.show?.('Failed to join challenge', 'error');
      }
    } catch (e) {
      console.warn('joinFromChat error', e);
    }
  }
}

