import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ForumPost {
  id: string;
  author_id: string;
  author_name?: string;
  author_avatar_url?: string | null;
  title: string;
  content: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  attachment_url?: string;
  attachment_type?: 'image' | 'video';
  // Client-side extras (not persisted directly):
  can_edit?: boolean;
  can_delete?: boolean;
  editing?: boolean;
  draft_content?: string;
  hearts_count?: number;
  viewer_has_hearted?: boolean;
}
export interface ForumComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string;
  pending?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  editing?: boolean;
  draft_content?: string;
  parent_comment_id?: string | null;
  replies?: ForumComment[]; // nested in-memory only
  avatar_url?: string | null;
  hearts_count?: number;
  viewer_has_hearted?: boolean;
  // UI-only: whether the inline reply composer is visible for this comment
  replying?: boolean;
  // UI-only: temporary draft for an inline reply composer
  replyDraft?: string;
  // UI-only: whether a reply submission is pending
  replyPending?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  getAll(): Observable<ForumPost[]> {
    return from(
      this.supabase.client
        .from('posts')
        .select('id, author_id, author_name, author_avatar_url, title, content, is_public, created_at, updated_at, attachment_url, attachment_type')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
    ).pipe(
      switchMap(async ({ data }) => {
        const rows = (data ?? []) as ForumPost[];
        // Determine current user for permission flags
        let currentUserId: string | null = null;
        try { const u = await this.auth.getCurrentUser(); currentUserId = u?.id ?? null; } catch { currentUserId = null; }
        // Fallback: if author_avatar_url missing, attempt to fetch from profiles in one round-trip
        const missing = rows.filter(r => !r.author_avatar_url);
        if (missing.length) {
          const ids = Array.from(new Set(missing.map(m => m.author_id)));
          const { data: profs } = await this.supabase.client
            .from('profiles')
            .select('id, avatar_url')
            .in('id', ids);
          const mapById = new Map<string, string | null>((profs || []).map((p: any) => [p.id as string, (p.avatar_url as string | null) || null]));
          rows.forEach(r => {
            if (!r.author_avatar_url && mapById.has(r.author_id)) r.author_avatar_url = mapById.get(r.author_id) || null;
          });
        }
        // Reactions: get heart counts and whether viewer reacted
        const postIds = rows.map(r => r.id);
        if (postIds.length) {
          try {
            const { data: reactionRows } = await this.supabase.client
              .from('post_reactions')
              .select('post_id')
              .eq('reaction', 'heart')
              .in('post_id', postIds);
            const counts = new Map<string, number>();
            (reactionRows || []).forEach((r: any) => {
              const id = r.post_id as string; counts.set(id, (counts.get(id) || 0) + 1);
            });
            rows.forEach(r => { r.hearts_count = counts.get(r.id) || 0; });
          } catch { rows.forEach(r => r.hearts_count = 0); }
          if (currentUserId) {
            try {
              const { data: mine } = await this.supabase.client
                .from('post_reactions')
                .select('post_id')
                .eq('reaction', 'heart')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);
              const setMine = new Set<string>((mine || []).map((m: any) => m.post_id as string));
              rows.forEach(r => { r.viewer_has_hearted = setMine.has(r.id); });
            } catch { rows.forEach(r => r.viewer_has_hearted = false); }
          } else {
            rows.forEach(r => r.viewer_has_hearted = false);
          }
        } else {
          rows.forEach(r => { r.hearts_count = 0; r.viewer_has_hearted = false; });
        }
        // Add permission flags & editing draft placeholder
        rows.forEach(r => {
          const isOwner = !!currentUserId && currentUserId === r.author_id;
          r.can_edit = isOwner;
          r.can_delete = isOwner;
          r.editing = false;
          r.draft_content = r.content;
        });
        return rows;
      })
    );
  }

  async createPost(title: string, content: string, file?: File): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    let attachment_url: string | undefined;
    let attachment_type: 'image' | 'video' | undefined;
    if (file) {
      const ext = file.name.split('.').pop();
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : undefined;
      attachment_type = type;
      const path = `forum/${user.id}/${Date.now()}-${file.name}`;
      let { error } = await this.supabase.client.storage.from('forum-attachments').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error?.message?.toLowerCase().includes('bucket not found')) {
        // call server to initialize bucket then retry once
        try {
          const apiBase = (environment.apiBase || '').replace(/\/$/, '');
          await fetch(`${apiBase}/api/storage/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bucketId: 'forum-attachments' })
          });
          const retry = await this.supabase.client.storage.from('forum-attachments').upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });
          error = retry.error || null;
        } catch {}
      }
      if (error) return { success: false, error: error.message };
      attachment_url = this.supabase.client.storage.from('forum-attachments').getPublicUrl(path).data.publicUrl;
    }

    const displayName = (user.user_metadata?.['full_name'] as string | undefined) ?? user.email ?? null;
    // Try to fetch avatar_url from profiles; fallback to auth metadata, for denormalization
    let author_avatar_url: string | null = null;
    try {
      const { data: prof } = await this.supabase.client
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();
      author_avatar_url = (prof?.avatar_url as string | undefined) ?? null;
    } catch {}
    if (!author_avatar_url) {
      author_avatar_url = (user.user_metadata?.['avatar_url'] as string | undefined) ?? null;
    }
    const { error } = await this.supabase.client.from('posts').insert([
      {
        author_id: user.id,
        author_name: displayName,
        author_avatar_url,
        title,
        content,
        is_public: true,
        attachment_url,
        attachment_type,
      },
    ]);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Delete a post the current user owns. If an attachment exists under the user's prefix,
   * try to remove it from Storage as well (best effort; ignore failures).
   */
  async deletePost(post: ForumPost): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Best-effort attachment cleanup
    try {
      if (post.attachment_url) {
        const path = this.extractStoragePath(post.attachment_url);
        // Only attempt delete if path is under the current user's folder
        if (path && path.startsWith(`forum/${user.id}/`)) {
          await this.supabase.client.storage.from('forum-attachments').remove([path]);
        }
      }
    } catch { /* ignore storage delete errors */ }

    // Delete the row (RLS ensures only author can delete)
    const { error } = await this.supabase.client
      .from('posts')
      .delete()
      .eq('id', post.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Extract the storage object path from a public URL like:
   * https://<ref>.supabase.co/storage/v1/object/public/forum-attachments/<path>
   */
  private extractStoragePath(publicUrl: string): string | null {
    try {
      const marker = '/storage/v1/object/public/forum-attachments/';
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return null;
      return decodeURIComponent(publicUrl.substring(idx + marker.length));
    } catch {
      return null;
    }
  }

  async updatePost(post: ForumPost, newContent: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    if (user.id !== post.author_id) return { success: false, error: 'Not owner' };
    const { error } = await this.supabase.client
      .from('posts')
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq('id', post.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async addComment(postId: string, content: string): Promise<{ success: boolean; error?: string; comment?: ForumComment }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    const { data, error } = await this.supabase.client
      .from('post_comments')
      .insert([{ post_id: postId, user_id: user.id, content }])
      .select('id, post_id, user_id, content, created_at, parent_comment_id')
      .single();
    if (error) {
      console.warn('[post.service] addComment error:', error);
      return { success: false, error: error.message };
    }
    const comment: ForumComment = data as any;
    comment.display_name = (user.user_metadata?.['full_name'] as string | undefined) || user.email || user.id;
  comment.can_edit = true;
  comment.can_delete = true; // commenters can delete their own comment
    comment.editing = false;
    comment.draft_content = comment.content;
    return { success: true, comment };
  }

  async addReply(parentComment: ForumComment, content: string): Promise<{ success: boolean; error?: string; comment?: ForumComment }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    const { data, error } = await this.supabase.client
      .from('post_comments')
      .insert([{ post_id: parentComment.post_id, user_id: user.id, content, parent_comment_id: parentComment.id }])
      .select('id, post_id, user_id, content, created_at, parent_comment_id')
      .single();
    if (error) {
      console.warn('[post.service] addReply error:', error);
      return { success: false, error: error.message };
    }
    const reply: ForumComment = data as any;
    reply.display_name = (user.user_metadata?.['full_name'] as string | undefined) || user.email || user.id;
  reply.can_edit = true;
  reply.can_delete = true; // reply owner can delete
    reply.editing = false;
    reply.draft_content = reply.content;
    reply.parent_comment_id = parentComment.id;
    return { success: true, comment: reply };
  }

  async getComments(postId: string, offset = 0, limit = 10): Promise<{ list: ForumComment[]; hasMore: boolean }> {
    // Fetch top-level comments (no parent)
    const { data: tops } = await this.supabase.client
      .from('post_comments')
      .select('id, post_id, user_id, content, created_at, parent_comment_id')
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    const parents = (tops || []) as ForumComment[];
    const parentIds = parents.map(p => p.id);
    // Fetch replies for those parents
    let replies: ForumComment[] = [];
    if (parentIds.length) {
      const { data: repRows } = await this.supabase.client
        .from('post_comments')
        .select('id, post_id, user_id, content, created_at, parent_comment_id')
        .in('parent_comment_id', parentIds)
        .order('created_at', { ascending: true });
      replies = (repRows || []) as ForumComment[];
    }
    // Resolve display names via RPC batch for all involved users
    const ids = Array.from(new Set([...parents, ...replies].map(r => r.user_id)));
    if (ids.length) {
      try {
        const { data: nameRows } = await this.supabase.client.rpc('get_user_display_names', { ids });
        const mapNames: Record<string,string> = {};
        (nameRows || []).forEach((r: any) => mapNames[r.id] = r.display_name);
        parents.forEach(r => r.display_name = mapNames[r.user_id] || r.user_id.substring(0,8));
        replies.forEach(r => r.display_name = mapNames[r.user_id] || r.user_id.substring(0,8));
      } catch {
        parents.forEach(r => r.display_name = r.user_id.substring(0,8));
        replies.forEach(r => r.display_name = r.user_id.substring(0,8));
      }
    }
    let postAuthor: string | null = null;
    try {
      const { data: postRow } = await this.supabase.client
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .single();
      postAuthor = (postRow as any)?.author_id ?? null;
    } catch { postAuthor = null; }
    try {
      const u = await this.auth.getCurrentUser();
      const uid = u?.id;
      parents.forEach(r => {
        const isOwner = !!uid && uid === r.user_id;
        const isPostOwner = !!uid && !!postAuthor && uid === postAuthor;
        r.can_edit = isOwner;
        r.can_delete = isOwner || isPostOwner;
        r.editing = false; r.draft_content = r.content;
      });
      replies.forEach(r => {
        const isOwner = !!uid && uid === r.user_id;
        const isPostOwner = !!uid && !!postAuthor && uid === postAuthor;
        r.can_edit = isOwner;
        r.can_delete = isOwner || isPostOwner;
        r.editing = false; r.draft_content = r.content;
      });
      // Set default reaction flags
      parents.forEach(r => { r.hearts_count = 0; r.viewer_has_hearted = false; });
      replies.forEach(r => { r.hearts_count = 0; r.viewer_has_hearted = false; });
    } catch {}
    // Reaction counts for comments
    const allIds = [...parents.map(p => p.id), ...replies.map(r => r.id)];
    if (allIds.length) {
      try {
        const { data: reactRows } = await this.supabase.client
          .from('comment_reactions')
          .select('comment_id')
          .eq('reaction', 'heart')
          .in('comment_id', allIds);
        const counts = new Map<string, number>();
        (reactRows || []).forEach((row: any) => {
          const id = row.comment_id as string; counts.set(id, (counts.get(id) || 0) + 1);
        });
        parents.forEach(p => p.hearts_count = counts.get(p.id) || 0);
        replies.forEach(r => r.hearts_count = counts.get(r.id) || 0);
      } catch {}
      // Which comments current user has hearted
      try {
        const user = await this.auth.getCurrentUser();
        if (user?.id) {
          const { data: mine } = await this.supabase.client
            .from('comment_reactions')
            .select('comment_id')
            .eq('reaction', 'heart')
            .eq('user_id', user.id)
            .in('comment_id', allIds);
          const setMine = new Set<string>((mine || []).map((m:any) => m.comment_id as string));
          parents.forEach(p => p.viewer_has_hearted = setMine.has(p.id));
          replies.forEach(r => r.viewer_has_hearted = setMine.has(r.id));
        }
      } catch {}
    }
    // Attach replies to parents
    const byParent = new Map<string, ForumComment[]>(parentIds.map(id => [id, []]));
    replies.forEach(r => {
      if (r.parent_comment_id && byParent.has(r.parent_comment_id)) {
        byParent.get(r.parent_comment_id)!.push(r);
      }
    });
    parents.forEach(p => p.replies = byParent.get(p.id) || []);
    // Determine if more top-level comments exist by counting total top-level only
    let hasMore = false;
    try {
      const { count } = await this.supabase.client
        .from('post_comments')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId)
        .is('parent_comment_id', null);
      if (typeof count === 'number') hasMore = count > offset + parents.length;
    } catch {}
    return { list: parents, hasMore };
  }

  async toggleCommentHeart(commentId: string, currentlyReacted: boolean): Promise<{ success: boolean; reacted?: boolean; count?: number; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    // Prevent reacting to own comment
    try {
      const { data: commentRow } = await this.supabase.client.from('post_comments').select('user_id').eq('id', commentId).single();
      const ownerId = (commentRow as any)?.user_id ?? null;
      if (ownerId && ownerId === user.id) return { success: false, error: 'Cannot react to your own comment' };
    } catch { /* ignore lookup errors and proceed */ }
    if (currentlyReacted) {
      const { error } = await this.supabase.client
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .eq('reaction', 'heart');
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await this.supabase.client
        .from('comment_reactions')
        .insert([{ comment_id: commentId, user_id: user.id, reaction: 'heart' }]);
      if (error && !/duplicate/i.test(error.message)) return { success: false, error: error.message };
    }
    try {
      const { count } = await this.supabase.client
        .from('comment_reactions')
        .select('*', { count: 'exact', head: true })
        .eq('comment_id', commentId)
        .eq('reaction', 'heart');
      return { success: true, reacted: !currentlyReacted, count: count ?? 0 };
    } catch {
      return { success: true, reacted: !currentlyReacted };
    }
  }

  async updateComment(comment: ForumComment, newContent: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    if (user.id !== comment.user_id) return { success: false, error: 'Not owner' };
    const { error } = await this.supabase.client
      .from('post_comments')
      .update({ content: newContent })
      .eq('id', comment.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async deleteComment(comment: ForumComment): Promise<{ success: boolean; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    // Fetch post author to allow them to delete any comment under their post
    let postAuthor: string | null = null;
    try {
      const { data: postRow } = await this.supabase.client
        .from('posts')
        .select('author_id')
        .eq('id', comment.post_id)
        .single();
      postAuthor = (postRow as any)?.author_id ?? null;
    } catch { postAuthor = null; }
    const isCommentOwner = user.id === comment.user_id;
    const isPostOwner = !!postAuthor && user.id === postAuthor;
    if (!isCommentOwner && !isPostOwner) return { success: false, error: 'Not permitted' };
    const { error } = await this.supabase.client
      .from('post_comments')
      .delete()
      .eq('id', comment.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async toggleHeart(postId: string, currentlyReacted: boolean): Promise<{ success: boolean; reacted?: boolean; count?: number; error?: string }> {
    const user = await this.auth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    // Prevent reacting to own post
    try {
      const { data: postRow } = await this.supabase.client.from('posts').select('author_id').eq('id', postId).single();
      const authorId = (postRow as any)?.author_id ?? null;
      if (authorId && authorId === user.id) return { success: false, error: 'Cannot react to your own post' };
    } catch { /* ignore lookup errors and proceed */ }
    if (currentlyReacted) {
      const { error } = await this.supabase.client
        .from('post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .eq('reaction', 'heart');
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await this.supabase.client
        .from('post_reactions')
        .insert([{ post_id: postId, user_id: user.id, reaction: 'heart' }]);
      if (error && !/duplicate/i.test(error.message)) {
        return { success: false, error: error.message };
      }
    }
    // fetch updated count
    try {
      const { count } = await this.supabase.client
        .from('post_reactions')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId)
        .eq('reaction', 'heart');
      const reacted = !currentlyReacted;
      return { success: true, reacted, count: count ?? 0 };
    } catch (e: any) {
      return { success: true, reacted: !currentlyReacted };
    }
  }
}