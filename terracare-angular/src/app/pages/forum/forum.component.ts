
import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PostService, ForumPost } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forum',
  standalone: true,
  imports: [NavbarComponent, FormsModule, CommonModule],
  templateUrl: './forum.component.html',
  styleUrls: ['./forum.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ForumComponent implements OnInit {
  draftText = '';
  posts: ForumPost[] = [];
  userName: string | null = null;
  userId: string | null = null;
  attachedFile: File | null = null;
  attachedPreview: string | null = null;
  attachedPreviewType: 'image' | 'video' | null = null;
  isLoggedIn = false;
  loading = false;
  errorMsg = '';

  constructor(private postService: PostService, private auth: AuthService) {}

  async ngOnInit() {
    await this.loadUser();
    this.loadPosts();
  }

  async loadUser() {
    const user = await this.auth.getCurrentUser();
    this.isLoggedIn = !!user;
    this.userId = user?.id ?? null;
  this.userName = (user?.user_metadata?.['full_name'] as string | undefined) ?? user?.email ?? null;
  }

  loadPosts() {
    this.postService.getAll().subscribe({
      next: (data) => { this.posts = data; },
      error: (err) => { this.errorMsg = 'Failed to load posts.'; }
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
}
