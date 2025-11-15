export interface KnowledgeItem {
  id?: string; // uuid in DB
  title: string;
  description: string;
  category?: string;
  // Stored file public URL (if any)
  url?: string;
  // MIME type of the uploaded file
  type?: string;
  // optional image/thumbnail url for rich cards (legacy seed data)
  image?: string;
  created_at?: string;
  user_id?: string;
  // Resolved display name from profiles/auth (not persisted directly on table)
  displayName?: string;
}
