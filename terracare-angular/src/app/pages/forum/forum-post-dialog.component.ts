import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../shared/ui/material.imports';
import { PostService, ForumPost, ForumComment } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-forum-post-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './forum-post-dialog.component.html',
  styleUrls: ['./forum-post-dialog.component.scss']
})
export class ForumPostDialogComponent implements OnInit {
  comments: ForumComment[] = [];
  newComment = '';
  loadingComments = true;
  adding = false;
  hasMore = false;
  pageSize = 20;
  isLoggedIn = false;
  userId: string | null = null;
  userDisplayName: string | null = null;
  userAvatarUrl: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<ForumPostDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { post: ForumPost },
    private postService: PostService,
    private auth: AuthService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadUser();
    this.loadComments();
  }

  async loadUser() {
    const u = await this.auth.getCurrentUser();
    this.isLoggedIn = !!u;
    this.userId = u?.id ?? null;
    this.userDisplayName = (u?.user_metadata?.['full_name'] as string | undefined) ?? u?.email ?? null;
    try {
      this.userAvatarUrl = typeof window !== 'undefined' ? localStorage.getItem('tc_avatar_url') : null;
    } catch { this.userAvatarUrl = null; }
    this.cdr.markForCheck();
  }

  async loadComments(offset = 0) {
    this.loadingComments = true;
    try {
      const res = await this.postService.getComments(this.data.post.id, offset, this.pageSize);
      if (offset === 0) this.comments = res.list;
      else this.comments = this.comments.concat(res.list);
      this.hasMore = res.hasMore;
    } catch (e) {
      console.warn('Failed to load comments', e);
      this.toast.show('Failed to load comments');
    }
    this.loadingComments = false;
    this.cdr.markForCheck();
  }

  toggleReply(comment: ForumComment) {
    comment.replying = !comment.replying;
    if (comment.replying) {
      // initialize a draft property for template binding
      (comment as any).replyDraft = (comment as any).replyDraft || '';
    }
    this.cdr.markForCheck();
  }

  async submitReply(comment: ForumComment) {
    const draft = ((comment as any).replyDraft || '').trim();
    if (!draft) return;
    (comment as any).replyPending = true;
    try {
      const res = await this.postService.addReply(comment, draft);
      if (res.success && res.comment) {
        comment.replies = comment.replies || [];
        comment.replies.push(res.comment);
        comment.replying = false;
        (comment as any).replyDraft = '';
      } else {
        this.toast.show(res.error || 'Failed to post reply');
      }
    } catch (e) {
      console.warn('submitReply error', e);
      this.toast.show('Reply failed');
    }
    (comment as any).replyPending = false;
    this.cdr.markForCheck();
  }

  toggleRepliesVisibility(comment: ForumComment) {
    (comment as any)._showAllReplies = !(comment as any)._showAllReplies;
    this.cdr.markForCheck();
  }

  shouldShowReplies(comment: ForumComment) {
    const len = (comment.replies || []).length;
    return len <= 3 || !!(comment as any)._showAllReplies;
  }

  hasCollapsedReplies(comment: ForumComment) {
    const len = (comment.replies || []).length;
    return len > 3 && !(comment as any)._showAllReplies;
  }

  isShowingAllReplies(comment: ForumComment) {
    return !!(comment as any)._showAllReplies;
  }

  async toggleCommentHeart(comment: ForumComment) {
    // Prevent users from hearting their own comments
    if (this.userId && comment.user_id && this.userId === comment.user_id) {
      this.toast.show("You can't heart your own comment", 'info');
      return;
    }

    // optimistic update
    const prev = !!comment.viewer_has_hearted;
    const prevCount = comment.hearts_count || 0;
    comment.viewer_has_hearted = !prev;
    comment.hearts_count = prev ? Math.max(0, prevCount - 1) : prevCount + 1;
    try {
      const res = await this.postService.toggleCommentHeart(comment.id, prev);
      if (!res.success) {
        // revert
        comment.viewer_has_hearted = prev;
        comment.hearts_count = prevCount;
        this.toast.show(res.error || 'Reaction failed');
      } else if (typeof res.count === 'number') {
        comment.hearts_count = res.count;
        comment.viewer_has_hearted = res.reacted ?? !prev;
      }
    } catch (e) {
      comment.viewer_has_hearted = prev;
      comment.hearts_count = prevCount;
      this.toast.show('Reaction failed');
    }
    this.cdr.markForCheck();
  }

  async confirmDelete(comment: ForumComment, parent: ForumComment | null) {
    const ok = confirm('Delete this comment?');
    if (!ok) return;
    await this.deleteComment(comment, parent);
  }

  async deleteComment(comment: ForumComment, parent: ForumComment | null) {
    try {
      const res = await this.postService.deleteComment(comment);
      if (!res.success) {
        this.toast.show(res.error || 'Failed to delete comment');
        return;
      }
      // Remove from UI tree
      if (parent) {
        parent.replies = (parent.replies || []).filter(r => r.id !== comment.id);
      } else {
        this.comments = this.comments.filter(c => c.id !== comment.id);
      }
      this.cdr.markForCheck();
    } catch (e) {
      console.warn('deleteComment error', e);
      this.toast.show('Failed to delete comment');
    }
  }

  async addComment() {
    if (!this.isLoggedIn) { this.toast.show('Please log in to comment'); return; }
    const content = (this.newComment || '').trim();
    if (!content) return;
    this.adding = true;
    const res = await this.postService.addComment(this.data.post.id, content);
    this.adding = false;
    if (res.success && res.comment) {
      // append to top of list for immediate visibility
      this.comments.push(res.comment);
      this.newComment = '';
      this.cdr.markForCheck();
    } else {
      this.toast.show(res.error || 'Failed to add comment');
    }
  }

  close() { this.dialogRef.close(); }

  formatTimestamp(ts: string) { return new Date(ts).toLocaleString(); }

  autoResize(ev: Event) {
    const ta = ev.target as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(window.innerHeight * 0.35, ta.scrollHeight) + 'px';
  }
}
