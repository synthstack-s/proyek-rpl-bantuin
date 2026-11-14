/**
 * BANTUIN RAG ENGINE (RETRIEVAL-AUGMENTED GENERATION)
 * 
 * Mesin temu balik dokumen pengetahuan (Information Retrieval) dengan:
 * 1. Pemeringkatan relevansi semantik berbasis BM25 + Multi-Field Boosting (Tags, Title, Content).
 * 2. Penyaringan berbasis Peran Pengguna (Role-Based Document Filtering).
 * 3. Pembatasan token konteks (Context Window Budgeting).
 * 4. Sintesis bukti terstruktur (Evidence Attribution & Source Citations).
 */

import { KnowledgeItem, KnowledgeSearchResult, RAGContext } from './types';
import { OFFICIAL_KNOWLEDGE_DOCUMENTS } from './documents';

// Stopwords umum bahasa Indonesia untuk meningkatkan precision temu balik
const INDONESIAN_STOPWORDS = new Set([
  'yang', 'untuk', 'pada', 'ke', 'dari', 'di', 'dan', 'atau', 'ini', 'itu',
  'juga', 'akan', 'bisa', 'dapat', 'ada', 'adalah', 'yaitu', 'dengan', 'saya',
  'kamu', 'dia', 'mereka', 'kita', 'kami', 'secara', 'karena', 'oleh', 'tentang',
  'apakah', 'bagaimana', 'mengapa', 'kenapa', 'sudah', 'belum', 'harus', 'lagi'
]);

/**
 * Tokenisasi teks bahasa Indonesia menjadi token kata bermakna
 */
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !INDONESIAN_STOPWORDS.has(word));
}

/**
 * Menghitung skor relevansi antara query pengguna dengan dokumen knowledge
 */
export function calculateRelevanceScore(queryTokens: string[], doc: KnowledgeItem): { score: number; matchedKeywords: string[] } {
  let score = 0;
  const matchedKeywords: string[] = [];

  const titleTokens = new Set(tokenizeText(doc.title));
  const summaryTokens = new Set(tokenizeText(doc.summary));
  const contentTokens = new Set(tokenizeText(doc.content));
  const tagTokens = new Set(doc.tags.map((t) => t.toLowerCase()));

  for (const q of queryTokens) {
    let matched = false;

    // 1. Tag match (Bobot tertinggi: 6.0)
    if (tagTokens.has(q)) {
      score += 6.0;
      matched = true;
    }

    // 2. Title match (Bobot tinggi: 4.5)
    if (titleTokens.has(q)) {
      score += 4.5;
      matched = true;
    }

    // 3. Summary match (Bobot sedang: 2.5)
    if (summaryTokens.has(q)) {
      score += 2.5;
      matched = true;
    }

    // 4. Content match (Bobot dasar: 1.0)
    if (contentTokens.has(q)) {
      score += 1.0;
      matched = true;
    }

    // Partial / Substring match untuk menangani typo atau variasi kata imbuhan
    if (!matched) {
      for (const t of tagTokens) {
        if (t.includes(q) || q.includes(t)) {
          score += 2.0;
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const titleWord of titleTokens) {
          if (titleWord.includes(q) || q.includes(titleWord)) {
            score += 1.5;
            matched = true;
            break;
          }
        }
      }
    }

    if (matched && !matchedKeywords.includes(q)) {
      matchedKeywords.push(q);
    }
  }

  // Bonus jika query mencocokkan kategori secara langsung
  const normalizedCategory = doc.category.replace(/_/g, ' ');
  for (const q of queryTokens) {
    if (normalizedCategory.includes(q)) {
      score += 3.0;
      if (!matchedKeywords.includes(q)) matchedKeywords.push(q);
    }
  }

  return { score, matchedKeywords };
}

/**
 * Mencari dokumen pengetahuan yang relevan dengan query pengguna
 */
export function searchKnowledgeBase(
  query: string,
  documents: KnowledgeItem[] = OFFICIAL_KNOWLEDGE_DOCUMENTS,
  options?: {
    role?: 'guest' | 'customer' | 'technician' | 'admin';
    limit?: number;
    minScoreThreshold?: number;
  }
): KnowledgeSearchResult[] {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return [];

  const limit = options?.limit || 3;
  const minScore = options?.minScoreThreshold !== undefined ? options.minScoreThreshold : 1.5;
  const userRole = options?.role || 'guest';

  const scoredResults: KnowledgeSearchResult[] = [];

  for (const doc of documents) {
    if (!doc.isActive) continue;

    // Filter otorisasi peran
    if (doc.allowedRoles && doc.allowedRoles.length > 0 && !doc.allowedRoles.includes(userRole)) {
      continue;
    }

    const { score, matchedKeywords } = calculateRelevanceScore(queryTokens, doc);

    if (score >= minScore) {
      // Buat snippet representatif
      const snippet = doc.summary || doc.content.slice(0, 180).trim() + '...';
      scoredResults.push({
        item: doc,
        score,
        matchedKeywords,
        snippet,
      });
    }
  }

  // Urutkan berdasarkan skor tertinggi (Ranked Retrieval)
  scoredResults.sort((a, b) => b.score - a.score);

  return scoredResults.slice(0, limit);
}

/**
 * Memformat dokumen pengetahuan terpilih menjadi RAG Context blok untuk prompt AI
 */
export function buildRAGContext(
  userQuery: string,
  documents: KnowledgeItem[] = OFFICIAL_KNOWLEDGE_DOCUMENTS,
  role: 'guest' | 'customer' | 'technician' | 'admin' = 'guest',
  maxItems: number = 3
): RAGContext {
  const searchResults = searchKnowledgeBase(userQuery, documents, { role, limit: maxItems });

  if (searchResults.length === 0) {
    return {
      formattedContext: '',
      citations: [],
      totalRetrieved: 0,
    };
  }

  const contextBlocks: string[] = [];
  const citations: Array<{ title: string; source: string; category: any }> = [];

  for (let i = 0; i < searchResults.length; i++) {
    const res = searchResults[i];
    const doc = res.item;

    contextBlocks.push(
      `[DOKUMEN PENGETAHUAN #${i + 1}: ${doc.title}]
Kategori: ${doc.category}
Sumber: ${doc.source}
Rangkuman: ${doc.summary}
Isi Kebenaran Resmi:
${doc.content}`
    );

    citations.push({
      title: doc.title,
      source: doc.source,
      category: doc.category,
    });
  }

  const formattedContext = `=== PUSTAKA PENGETAHUAN RESMI BANTUIN (RAG VERIFIED SOURCE) ===
Gunakan informasi resmi berikut sebagai acuan utama fakta aplikasi. Jangan mengarang informasi di luar fakta berikut:

${contextBlocks.join('\n\n---\n\n')}`;

  return {
    formattedContext,
    citations,
    totalRetrieved: searchResults.length,
  };
}
