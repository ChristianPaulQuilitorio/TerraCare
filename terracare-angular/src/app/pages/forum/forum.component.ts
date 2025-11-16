
import { Component, ViewEncapsulation, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ForumPostDialogComponent } from './forum-post-dialog.component';
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

  constructor(private postService: PostService, private auth: AuthService, private route: ActivatedRoute, private toast: ToastService, private cdr: ChangeDetectorRef, private dialog: MatDialog) {}

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

  // comments modal removed

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
  trackByPostId(_i: number, p: ForumPost) { return p.id; }
  trackByCommentId(_i: number, c: ForumComment) { return c.id; }

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

  openPost(p: ForumPost) {
    const chatEl = document.querySelector('.tc-chatbot') as HTMLElement | null;
    if (chatEl) chatEl.style.display = 'none';
    const ref = this.dialog.open(ForumPostDialogComponent, {
      data: { post: p },
      width: '100%',
      maxWidth: '720px',
      panelClass: 'forum-post-dialog'
    });
    ref.afterClosed().subscribe(() => {
      if (chatEl) chatEl.style.display = '';
    });
  }
}

// comments UI removed; ForumCommentsDialogComponent deleted
