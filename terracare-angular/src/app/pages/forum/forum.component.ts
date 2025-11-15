
import { Component, ViewEncapsulation, OnInit, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { PostService, ForumPost, ForumComment } from '../../core/services/post.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forum',
  standalone: true,
  imports: [FormsModule, CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './forum.component.html',
  styleUrls: ['./forum.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumComponent implements OnInit {
  draftText = '';
  posts: ForumPost[] = [];
  comments: Record<string, ForumComment[]> = {};
  commentDraft: Record<string, string> = {};
  commentPage: Record<string, number> = {};
  hasMoreComments: Record<string, boolean> = {};
  readonly pageSize = 10;
  userName: string | null = null;
  userId: string | null = null;
  attachedFile: File | null = null;
  attachedPreview: string | null = null;
  attachedPreviewType: 'image' | 'video' | null = null;
  isLoggedIn = false;
  loading = false;
  loadingPosts = true;
  errorMsg = '';

  constructor(private postService: PostService, private auth: AuthService, private route: ActivatedRoute, private dialog: MatDialog, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.loadUser();
    this.loadPosts();
    // If navigated with ?new=1, focus the composer
    this.route.queryParamMap.subscribe(params => {
      const openNew = params.get('new');
      if (openNew) {
        setTimeout(() => {
          const el = document.getElementById('forum-draft') as HTMLTextAreaElement | null;
          if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 50);
      }
    });
  }

  openCommentsModal(p: ForumPost) {
    this.dialog.open(ForumCommentsDialogComponent, {
      width: '720px',
      maxHeight: '85vh',
      data: { post: p },
      panelClass: 'forum-dialog'
    });
  }

  async loadUser() {
    const user = await this.auth.getCurrentUser();
    this.isLoggedIn = !!user;
    this.userId = user?.id ?? null;
    this.userName = (user?.user_metadata?.['full_name'] as string | undefined) ?? user?.email ?? null;
    this.cdr.markForCheck();
  }

  loadPosts() {
    this.loadingPosts = true;
    this.postService.getAll().subscribe({
      next: (data) => {
        this.posts = data;
        this.bootstrapComments();
        this.loadingPosts = false;
        this.cdr.markForCheck();
      },
      error: (_err) => {
        this.errorMsg = 'Failed to load posts.';
        this.loadingPosts = false;
        this.cdr.markForCheck();
      }
    });
  }

  bootstrapComments() {
    // Load first page per visible post
    this.posts.forEach(p => this.loadComments(p, true));
  }

  async publishPost() {
    if (!this.isLoggedIn) {
      this.errorMsg = 'You must be logged in to post.';
      return;
    }
    const content = this.draftText.trim();
    if (!content) return;
    this.loading = true;
    const result = await this.postService.createPost('', content, this.attachedFile ?? undefined);
    this.loading = false;
    if (result.success) {
      this.draftText = '';
      this.clearAttachment();
      this.loadPosts();
      this.errorMsg = '';
    } else {
      this.errorMsg = result.error ?? 'Failed to post.';
    }
  }

  startEdit(p: ForumPost) {
    if (!p.can_edit) return;
    p.editing = true;
    p.draft_content = p.content;
  }
  cancelEdit(p: ForumPost) { p.editing = false; }
  async saveEdit(p: ForumPost) {
    if (!p.can_edit) return;
    const newBody = (p.draft_content || '').trim();
    if (!newBody) return;
    const res = await this.postService.updatePost(p, newBody);
    if (res.success) {
      p.content = newBody;
      p.editing = false;
      p.updated_at = new Date().toISOString();
    } else {
      this.errorMsg = res.error || 'Update failed';
    }
  }

  async addComment(p: ForumPost) {
    const text = (this.commentDraft[p.id] || '').trim();
    if (!text) return;
    // Optimistic comment append
    const temp: ForumComment = {
      id: 'temp-' + Date.now(),
      post_id: p.id,
      user_id: this.userId || 'me',
      content: text,
      created_at: new Date().toISOString(),
      display_name: this.userName || 'You',
      pending: true,
      can_edit: true,
      editing: false,
      draft_content: text,
      parent_comment_id: null,
    };
    this.comments[p.id] = (this.comments[p.id] || []).concat([temp]);
    this.commentDraft[p.id] = '';
    const res = await this.postService.addComment(p.id, text);
    if (res.success && res.comment) {
      // Replace temp with actual
      this.comments[p.id] = (this.comments[p.id] || []).map(c => c.id === temp.id ? res.comment! : c);
    } else {
      // Revert optimistic
      this.comments[p.id] = (this.comments[p.id] || []).filter(c => c.id !== temp.id);
      this.errorMsg = res.error || 'Comment failed';
    }
  }

  async loadComments(p: ForumPost, reset = false) {
    if (reset) { this.commentPage[p.id] = 0; this.comments[p.id] = []; }
    const page = this.commentPage[p.id] || 0;
    const { list, hasMore } = await this.postService.getComments(p.id, page * this.pageSize, this.pageSize);
    this.comments[p.id] = (this.comments[p.id] || []).concat(list);
    this.hasMoreComments[p.id] = hasMore;
    this.cdr.markForCheck();
  }

  loadMoreComments(p: ForumPost) {
    this.commentPage[p.id] = (this.commentPage[p.id] || 0) + 1;
    this.loadComments(p, false);
  }

  trackByPostId(_i: number, p: ForumPost) { return p.id; }
  trackByCommentId(_i: number, c: ForumComment) { return c.id; }

  startEditComment(c: ForumComment) { if (!c.can_edit) return; c.editing = true; c.draft_content = c.content; }
  cancelEditComment(c: ForumComment) { c.editing = false; }
  async saveEditComment(c: ForumComment) {
    if (!c.can_edit) return;
    const next = (c.draft_content || '').trim();
    if (!next || next === c.content) { c.editing = false; return; }
    const prev = c.content;
    c.content = next; c.editing = false; // optimistic
    const res = await this.postService.updateComment(c, next);
    if (!res.success) {
      c.content = prev; // revert on failure
      this.errorMsg = res.error || 'Failed to edit comment';
    }
  }

  async addReply(parent: ForumComment) {
    const text = (parent.draft_content || '').trim();
    if (!text) return;
    const temp: ForumComment = {
      id: 'temp-r-' + Date.now(),
      post_id: parent.post_id,
      user_id: this.userId || 'me',
      content: text,
      created_at: new Date().toISOString(),
      display_name: this.userName || 'You',
      pending: true,
      can_edit: true,
      editing: false,
      draft_content: text,
      parent_comment_id: parent.id,
      replies: [],
    };
    const list = this.comments[parent.post_id] || [];
    this.comments[parent.post_id] = list.concat([temp]);
    parent.draft_content = '';
    const res = await this.postService.addReply(parent, text);
    if (res.success && res.comment) {
      this.comments[parent.post_id] = (this.comments[parent.post_id] || []).map(c => c.id === temp.id ? res.comment! : c);
    } else {
      this.comments[parent.post_id] = (this.comments[parent.post_id] || []).filter(c => c.id !== temp.id);
      this.errorMsg = res.error || 'Reply failed';
    }
  }
  async deleteComment(c: ForumComment){
    if (!this.isLoggedIn) { this.toast.show('Please sign in to delete comments.', 'info'); return; }
    const list = this.comments[c.post_id] || [];
    const isParent = !c.parent_comment_id;
    const toRemoveIds = new Set<string>([c.id]);
    if(isParent){ list.filter(x=>x.parent_comment_id===c.id).forEach(r=>toRemoveIds.add(r.id)); }
    const prev = list.slice();
    this.comments[c.post_id] = list.filter(x=>!toRemoveIds.has(x.id));
    const res = await this.postService.deleteComment(c);
    if(!res.success){ this.comments[c.post_id] = prev; this.toast.show(res.error || 'Delete failed', 'error'); }
    else { this.toast.show('Comment deleted', 'success'); }
  }
  startReply(c: ForumComment) {
    // Ensure only one reply box open per post at a time
    const list = this.comments[c.post_id] || [];
    const activating = !c.replying;
    list.forEach(t => { if (!t.parent_comment_id) { t.replying = false; t.draft_content = ''; } });
    c.replying = activating;
    if (activating) {
      c.draft_content = `@${c.display_name || c.user_id.slice(0, 8)} `;
      setTimeout(() => {
        const el = document.getElementById('reply-input-' + c.id) as HTMLInputElement | null;
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 10);
    }
  }
  async toggleCommentHeart(c: ForumComment) {
    if (!this.isLoggedIn) return;
    const prevReacted = !!c.viewer_has_hearted;
    const prevCount = c.hearts_count || 0;
    c.viewer_has_hearted = !prevReacted;
    c.hearts_count = prevReacted ? Math.max(0, prevCount - 1) : prevCount + 1;
    const res = await this.postService.toggleCommentHeart(c.id, prevReacted);
    if (!res.success) { c.viewer_has_hearted = prevReacted; c.hearts_count = prevCount; }
    else if (typeof res.count === 'number') { c.hearts_count = res.count; c.viewer_has_hearted = res.reacted ?? !prevReacted; }
  }

  onDraftKeydown(event: KeyboardEvent) {
    const isMod = event.ctrlKey || (event as any).metaKey;
    if (isMod && event.key === 'Enter') {
      event.preventDefault();
      this.publishPost();
    }
  }

  autoResize(event: Event) {
    const ta = event.target as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(window.innerHeight * 0.5, ta.scrollHeight) + 'px';
  }

  triggerFileInput(kind: 'image' | 'video') {
    const el = document.querySelector('input[type=file]') as HTMLInputElement | null;
    if (!el) return;
    el.accept = kind === 'image' ? 'image/*' : 'video/*';
    el.click();
  }

  onFileSelected(e: Event) {
    const inp = e.target as HTMLInputElement | null;
    if (!inp || !inp.files || inp.files.length === 0) return;
    const f = inp.files[0];
    this.attachedFile = f;
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('image/')) {
      this.attachedPreviewType = 'image';
      this.attachedPreview = url;
    } else if (f.type.startsWith('video/')) {
      this.attachedPreviewType = 'video';
      this.attachedPreview = url;
    } else {
      this.attachedPreviewType = null;
      this.attachedPreview = null;
    }
    setTimeout(() => { if (inp) inp.value = ''; }, 200);
  }

  clearAttachment() {
    if (this.attachedPreview) {
      try { URL.revokeObjectURL(this.attachedPreview); } catch { }
    }
    this.attachedFile = null;
    this.attachedPreview = null;
    this.attachedPreviewType = null;
  }

  formatTimestamp(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  async onDelete(p: ForumPost) {
    if (!this.isLoggedIn) return;
    const ok = confirm('Delete this post?');
    if (!ok) return;
    const res = await this.postService.deletePost(p);
    if (res.success) {
      this.loadPosts();
    } else {
      this.errorMsg = res.error ?? 'Failed to delete post.';
    }
  }

  async toggleHeart(p: ForumPost) {
    if (!this.isLoggedIn) { this.errorMsg = 'Login to react.'; return; }
    const prevReacted = !!p.viewer_has_hearted;
    const prevCount = p.hearts_count || 0;
    // Optimistic update
    p.viewer_has_hearted = !prevReacted;
    p.hearts_count = prevReacted ? Math.max(0, prevCount - 1) : prevCount + 1;
    const res = await this.postService.toggleHeart(p.id, prevReacted);
    if (!res.success) {
      // revert
      p.viewer_has_hearted = prevReacted;
      p.hearts_count = prevCount;
      this.errorMsg = res.error || 'Reaction failed';
    } else if (typeof res.count === 'number') {
      p.hearts_count = res.count;
      p.viewer_has_hearted = res.reacted ?? !prevReacted;
    }
  }
}

@Component({
  selector: 'app-forum-comments-dialog',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS, FormsModule],
  template: `
    <div mat-dialog-title class="dialog-header">
      <span class="dialog-title">Comments</span>
      <button mat-icon-button mat-dialog-close aria-label="Close dialog" class="close-btn">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <mat-dialog-content>
      <div class="post-preview">
        <h3 style="margin:0 0 8px;">{{ data.post.title || (data.post.author_name + ' · ' + (data.post.created_at | date:'short')) }}</h3>
        <p style="white-space:pre-wrap; font-weight:600;">{{ data.post.content }}</p>
        <ng-container *ngIf="data.post.attachment_url as url">
          <img *ngIf="data.post.attachment_type==='image'" [src]="url" alt="attachment" style="max-width:100%; border-radius:8px; margin-top:8px;" />
          <video *ngIf="data.post.attachment_type==='video'" [src]="url" controls style="width:100%; border-radius:8px; margin-top:8px;"></video>
        </ng-container>
      </div>
      <div class="comments" style="margin-top:12px;">
        <div class="comment" *ngFor="let c of topLevel(); trackBy: trackByCommentId">
          <div class="comment-header">
            <span class="comment-author"><strong>{{ c.display_name || (c.user_id | slice:0:8) }}</strong></span>
            <span class="comment-time muted">{{ formatTimestamp(c.created_at) }}</span>
            <span class="tag" *ngIf="c.pending" style="font-size:10px; padding:2px 6px; background:#fff3cd; border-radius:12px; margin-left:6px;">sending…</span>
          </div>
          <div *ngIf="!c.editing; else editC" class="comment-body"><strong>{{ c.content }}</strong></div>
          <ng-template #editC>
            <mat-form-field appearance="fill" style="width:100%"><textarea matInput rows="2" [(ngModel)]="c.draft_content"></textarea></mat-form-field>
          </ng-template>
          <div class="comment-actions" style="display:flex; gap:8px; align-items:center;">
            <button mat-icon-button (click)="toggleCommentHeart(c)" [disabled]="!isLoggedIn" [color]="c.viewer_has_hearted ? 'warn' : undefined" aria-label="Heart comment">
              <mat-icon>{{ c.viewer_has_hearted ? 'favorite' : 'favorite_border' }}</mat-icon>
            </button>
            <span class="muted" style="font-size:12px;">{{ c.hearts_count || 0 }}</span>
            <button mat-button (click)="startReply(c)">{{ c.replying ? 'Cancel' : 'Reply' }}</button>
            <span style="flex:1 1 auto"></span>
            <ng-container *ngIf="c.can_edit">
              <button mat-button *ngIf="!c.editing" (click)="startEditComment(c)">Edit</button>
              <button mat-button color="primary" *ngIf="c.editing" (click)="saveEditComment(c)">Save</button>
              <button mat-button *ngIf="c.editing" (click)="cancelEditComment(c)">Cancel</button>
            </ng-container>
            <button mat-button color="warn" *ngIf="c.can_delete" (click)="deleteComment(c)">Delete</button>
          </div>
          <div class="reply-compose" *ngIf="isLoggedIn && c.replying">
            <mat-form-field appearance="fill" style="width:100%">
              <mat-label>Reply</mat-label>
              <input matInput [(ngModel)]="c.draft_content" placeholder="Write a reply…" [id]="'reply-input-'+c.id" />
            </mat-form-field>
            <button mat-button color="accent" (click)="submitReply(c)" [disabled]="!(c.draft_content||'').trim()">Reply</button>
          </div>
          <div class="replies" *ngIf="repliesOf(c).length" style="margin-left:24px; border-left:3px solid #e0e0e0; padding-left:12px; margin-top:6px;">
            <div class="reply" *ngFor="let r of repliesOf(c); trackBy: trackByCommentId" style="margin-bottom:8px;">
              <div class="reply-header">
                <span class="reply-author"><strong>{{ r.display_name || (r.user_id | slice:0:8) }}</strong></span>
                <span class="reply-time muted">{{ formatTimestamp(r.created_at) }}</span>
                <span class="tag" *ngIf="r.pending" style="font-size:10px; padding:2px 6px; background:#fff3cd; border-radius:12px; margin-left:6px;">sending…</span>
              </div>
              <div class="reply-body" *ngIf="!r.editing; else editReply"><strong>{{ r.content }}</strong></div>
              <ng-template #editReply>
                <mat-form-field appearance="fill" style="width:100%"><textarea matInput rows="2" [(ngModel)]="r.draft_content"></textarea></mat-form-field>
              </ng-template>
              <div class="reply-actions" style="display:flex; gap:8px; align-items:center;">
                <button mat-icon-button (click)="toggleCommentHeart(r)" [disabled]="!isLoggedIn" [color]="r.viewer_has_hearted ? 'warn' : undefined" aria-label="Heart reply">
                  <mat-icon>{{ r.viewer_has_hearted ? 'favorite' : 'favorite_border' }}</mat-icon>
                </button>
                <span class="muted" style="font-size:12px;">{{ r.hearts_count || 0 }}</span>
                <span style="flex:1 1 auto"></span>
                <ng-container *ngIf="r.can_edit">
                  <button mat-button *ngIf="!r.editing" (click)="startEditComment(r)">Edit</button>
                  <button mat-button color="primary" *ngIf="r.editing" (click)="saveEditComment(r)">Save</button>
                  <button mat-button *ngIf="r.editing" (click)="cancelEditComment(r)">Cancel</button>
                </ng-container>
                <button mat-button color="warn" *ngIf="r.can_delete" (click)="deleteComment(r)">Delete</button>
              </div>
            </div>
          </div>
        </div>
        <div class="pagination" *ngIf="hasMore">
          <button mat-button (click)="loadMore()">Load more</button>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions class="dialog-footer" *ngIf="isLoggedIn">
      <mat-form-field appearance="fill" class="footer-input">
        <mat-label>Add a comment</mat-label>
        <input matInput [(ngModel)]="draft" placeholder="Write a comment…" />
      </mat-form-field>
      <button mat-stroked-button color="primary" (click)="submit()" [disabled]="!draft.trim()">Comment</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
    .dialog-header{ display:flex; align-items:center; justify-content:space-between; }
    .dialog-title{ font-size:20px; font-weight:600; }
    .close-btn{ margin-left:8px; }
    .dialog-footer{ display:flex; gap:8px; align-items:center; width:100%; }
    .dialog-footer .footer-input{ flex:1 1 auto; }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumCommentsDialogComponent implements OnInit {
  comments: ForumComment[] = [];
  hasMore = false;
  page = 0;
  readonly pageSize = 10;
  isLoggedIn = false;
  draft = '';
  constructor(@Inject(MAT_DIALOG_DATA) public data: { post: ForumPost }, private postService: PostService, private auth: AuthService, private toast: ToastService) {}
  async ngOnInit() {
    const user = await this.auth.getCurrentUser();
    this.isLoggedIn = !!user;
    await this.load(true);
  }
  async load(reset = false){
    if(reset){ this.page = 0; this.comments = []; }
    const res = await this.postService.getComments(this.data.post.id, this.page*this.pageSize, this.pageSize);
    this.comments = this.comments.concat(res.list);
    this.hasMore = res.hasMore;
  }
  loadMore(){ this.page++; this.load(false); }
  async submit(){
    const text = this.draft.trim(); if(!text) return;
    const temp: ForumComment = { id:'temp-'+Date.now(), post_id:this.data.post.id, user_id:'me', content:text, created_at:new Date().toISOString(), display_name:'You', pending:true, can_edit:true, editing:false, draft_content:text };
    this.comments = this.comments.concat([temp]); this.draft='';
    const res = await this.postService.addComment(this.data.post.id, text);
    if(res.success && res.comment){ this.comments = this.comments.map(c=>c.id===temp.id?res.comment!:c); }
    else { this.comments = this.comments.filter(c=>c.id!==temp.id); }
  }
  startReply(c: ForumComment){
    // Enforce only one open reply composer in dialog
    const activating = !c.replying;
    this.topLevel().forEach(t => { t.replying = false; t.draft_content = ''; });
    c.replying = activating;
    if(activating){
      c.draft_content = `@${c.display_name || c.user_id.slice(0,8)} `;
      setTimeout(()=>{
        const el = document.getElementById('reply-input-'+c.id) as HTMLInputElement | null;
        if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 10);
    }
  }
  async toggleCommentHeart(c: ForumComment){
    if(!this.isLoggedIn) return;
    const prevReacted = !!c.viewer_has_hearted;
    const prevCount = c.hearts_count || 0;
    c.viewer_has_hearted = !prevReacted;
    c.hearts_count = prevReacted ? Math.max(0, prevCount - 1) : prevCount + 1;
    const res = await this.postService.toggleCommentHeart(c.id, prevReacted);
    if(!res.success){ c.viewer_has_hearted = prevReacted; c.hearts_count = prevCount; }
    else if(typeof res.count === 'number'){ c.hearts_count = res.count; c.viewer_has_hearted = res.reacted ?? !prevReacted; }
  }
  async submitReply(parent: ForumComment){
    const text=(parent.draft_content||'').trim(); if(!text) return;
    const temp: ForumComment = { id:'temp-r-'+Date.now(), post_id:parent.post_id, user_id:'me', content:text, created_at:new Date().toISOString(), display_name:'You', pending:true, can_edit:true, editing:false, draft_content:text, parent_comment_id:parent.id };
    // optimistic: push into top-level flat list so repliesOf() picks it up
    this.comments = this.comments.concat([temp]); parent.draft_content=''; parent.replying=false;
    const res = await this.postService.addReply(parent, text);
    if(res.success && res.comment){ this.comments = this.comments.map(c=>c.id===temp.id?res.comment!:c); }
    else { this.comments = this.comments.filter(c=>c.id!==temp.id); }
  }
  topLevel(): ForumComment[]{ return this.comments.filter(c=>!c.parent_comment_id); }
  repliesOf(c: ForumComment): ForumComment[]{ return this.comments.filter(r=>r.parent_comment_id===c.id); }
  trackByCommentId(_i: number, c: ForumComment){ return c.id; }
  startEditComment(c: ForumComment){ if(!c.can_edit) return; c.editing=true; c.draft_content=c.content; }
  cancelEditComment(c: ForumComment){ c.editing=false; }
  async saveEditComment(c: ForumComment){ if(!c.can_edit) return; const next=(c.draft_content||'').trim(); if(!next||next===c.content){ c.editing=false; return;} const prev=c.content; c.content=next; c.editing=false; const res=await this.postService.updateComment(c,next); if(!res.success){ c.content=prev; } }
  async deleteComment(c: ForumComment){
    const isParent = !c.parent_comment_id;
    const toRemoveIds = new Set<string>([c.id]);
    if(isParent){ this.repliesOf(c).forEach(r=>toRemoveIds.add(r.id)); }
    // optimistic remove
    const prev = this.comments.slice();
    this.comments = this.comments.filter(x => !toRemoveIds.has(x.id));
    const res = await this.postService.deleteComment(c);
    if(!res.success){ this.comments = prev; this.toast.show(res.error || 'Delete failed', 'error'); }
    else { this.toast.show('Comment deleted', 'success'); }
  }
  formatTimestamp(ts: string){ const d = new Date(ts); return d.toLocaleString(); }
}
