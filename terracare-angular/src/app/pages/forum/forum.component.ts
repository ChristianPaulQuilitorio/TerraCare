import { Component, ViewEncapsulation } from '@angular/core';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-forum',
  standalone: true,
  imports: [NavbarComponent, FormsModule, CommonModule],
  templateUrl: './forum.component.html',
  styleUrls: ['./forum.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ForumComponent {
  draftText = '';
  posts: Array<{ author: string; body: string; title?: string }> = [
    { author: 'Society of Programming Enthusiasts', body: 'A special day calls for a special celebration!' },
    { author: 'A&A Buddy', body: 'Community meetup this weekend — bring plants!' },
  ];

  userName = 'Jian Carlo';
  attachedFile: File | null = null;
  attachedPreview: string | null = null;
  attachedPreviewType: 'image' | 'video' | null = null;

  publishPost() {
    const body = this.draftText.trim();
    if (!body) return;
    const post: any = { author: this.userName, body };
    if (this.attachedFile) {
      post.attachment = { name: this.attachedFile.name, type: this.attachedPreviewType };
      post.attachmentPreview = this.attachedPreview;
    }
    this.posts.unshift(post);
    this.draftText = '';
    this.clearAttachment();
  }

  onDraftKeydown(event: KeyboardEvent) {
    // Ctrl+Enter (or Cmd+Enter) to post
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
    // open file input; use query to find the first file input in this component
    const el = document.querySelector('input[type=file]') as HTMLInputElement | null;
    if (!el) return;
    // optional: set accept filter based on kind
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
    // reset input value so selecting the same file again triggers change
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
}
