/**
 * BANTUIN KNOWLEDGE SERVICE - REPOSITORY & RUNTIME SYNC
 * 
 * Pengelola status persistensi pengetahuan:
 * 1. Sinkronisasi dokumen awal ke tabel MySQL `ai_knowledge_base`.
 * 2. Caching cerdas in-memory dengan invalidasi otomatis saat admin memperbarui dokumen.
 * 3. Eksekusi RAG context retrieval untuk pipeline Chatbot+.
 * 4. Dukungan CRUD penuh untuk Panel Admin Knowledge Management.
 */

import { query } from '@/lib/db';
import { KnowledgeItem, KnowledgeCategory, RAGContext } from './types';
import { OFFICIAL_KNOWLEDGE_DOCUMENTS } from './documents';
import { searchKnowledgeBase, buildRAGContext } from './rag-engine';

interface CachedKnowledgeState {
  documents: KnowledgeItem[];
  lastSyncedAt: number;
}

let memoryCache: CachedKnowledgeState | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 menit TTL untuk menjamin performa tinggi

/**
 * Sinkronisasi dokumen resmi ke database jika tabel belum terisi
 */
export async function syncOfficialDocumentsToDatabase(): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  try {
    for (const doc of OFFICIAL_KNOWLEDGE_DOCUMENTS) {
      const existing = await query<any[]>(
        `SELECT id, updated_at FROM ai_knowledge_base WHERE slug = ? LIMIT 1`,
        [doc.slug]
      );

      const tagsJson = JSON.stringify(doc.tags);

      if (existing.length === 0) {
        await query(
          `INSERT INTO ai_knowledge_base (slug, title, category, tags, summary, content, source, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [doc.slug, doc.title, doc.category, tagsJson, doc.summary, doc.content, doc.source, doc.isActive ? 1 : 0]
        );
        inserted++;
      } else {
        // Update data jika ada perubahan definisi resmi
        await query(
          `UPDATE ai_knowledge_base
           SET title = ?, category = ?, tags = ?, summary = ?, content = ?, source = ?, is_active = ?
           WHERE slug = ?`,
          [doc.title, doc.category, tagsJson, doc.summary, doc.content, doc.source, doc.isActive ? 1 : 0, doc.slug]
        );
        updated++;
      }
    }

    // Invalidate cache
    memoryCache = null;
  } catch (err: any) {
    console.warn('[Knowledge Service] Gagal menyinkronkan dokumen ke DB, menggunakan in-memory fallback:', err.message);
  }

  return { inserted, updated };
}

/**
 * Mengambil seluruh dokumen pengetahuan aktif (dengan caching)
 */
export async function getAllActiveKnowledge(): Promise<KnowledgeItem[]> {
  const now = Date.now();
  if (memoryCache && (now - memoryCache.lastSyncedAt < CACHE_TTL_MS)) {
    return memoryCache.documents;
  }

  try {
    const rows = await query<any[]>(
      `SELECT id, slug, title, category, tags, summary, content, source, is_active, created_at, updated_at
       FROM ai_knowledge_base
       ORDER BY category ASC, id ASC`
    );

    if (rows && rows.length > 0) {
      const docs: KnowledgeItem[] = rows.map((r) => {
        let tags: string[] = [];
        try {
          tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []);
        } catch {
          tags = [];
        }

        return {
          id: Number(r.id),
          slug: r.slug,
          title: r.title,
          category: r.category as KnowledgeCategory,
          tags,
          summary: r.summary,
          content: r.content,
          source: r.source,
          isActive: Boolean(r.is_active),
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
        };
      });

      memoryCache = {
        documents: docs,
        lastSyncedAt: now,
      };

      return docs;
    }
  } catch (err: any) {
    console.warn('[Knowledge Service] Gagal membaca dari database, menggunakan data statis:', err.message);
  }

  // Fallback ke in-memory document array
  return OFFICIAL_KNOWLEDGE_DOCUMENTS;
}

/**
 * Mengambil RAG context terformat untuk pertanyaan pengguna
 */
export async function getRAGContextForQuery(
  userQuery: string,
  role: 'guest' | 'customer' | 'technician' | 'admin' = 'guest',
  maxItems: number = 3
): Promise<RAGContext> {
  const docs = await getAllActiveKnowledge();
  return buildRAGContext(userQuery, docs, role, maxItems);
}

/**
 * Menambahkan dokumen pengetahuan baru oleh Admin
 */
export async function createKnowledgeDocument(
  data: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>,
  adminId?: number
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const tagsJson = JSON.stringify(data.tags || []);
    const res = await query<any>(
      `INSERT INTO ai_knowledge_base (slug, title, category, tags, summary, content, source, is_active, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.slug,
        data.title,
        data.category,
        tagsJson,
        data.summary,
        data.content,
        data.source,
        data.isActive ? 1 : 0,
        adminId || null,
      ]
    );

    memoryCache = null; // Clear cache
    return { success: true, id: Number(res.insertId) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Memperbarui dokumen pengetahuan oleh Admin
 */
export async function updateKnowledgeDocument(
  id: number,
  data: Partial<KnowledgeItem>,
  adminId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.category !== undefined) {
      fields.push('category = ?');
      values.push(data.category);
    }
    if (data.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }
    if (data.summary !== undefined) {
      fields.push('summary = ?');
      values.push(data.summary);
    }
    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(data.content);
    }
    if (data.source !== undefined) {
      fields.push('source = ?');
      values.push(data.source);
    }
    if (data.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if (fields.length === 0) return { success: true };

    values.push(id);
    await query(`UPDATE ai_knowledge_base SET ${fields.join(', ')} WHERE id = ?`, values);

    memoryCache = null;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Menghapus dokumen pengetahuan oleh Admin
 */
export async function deleteKnowledgeDocument(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    await query(`DELETE FROM ai_knowledge_base WHERE id = ?`, [id]);
    memoryCache = null;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Mengubah status aktif/nonaktif dokumen
 */
export async function toggleKnowledgeActiveStatus(id: number, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await query(`UPDATE ai_knowledge_base SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, id]);
    memoryCache = null;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Invalidate in-memory cache
 */
export function invalidateKnowledgeCache() {
  memoryCache = null;
}
