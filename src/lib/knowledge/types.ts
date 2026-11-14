/**
 * BANTUIN KNOWLEDGE ENGINE - TYPES & INTERFACES
 * 
 * Standar tipe data untuk Knowledge Base, Retrieval-Augmented Generation (RAG),
 * dan pemetaan sumber kebenaran (Source of Truth) aplikasi BANTUIN.
 */

export type KnowledgeCategory =
  | 'application_overview'
  | 'feature_documentation'
  | 'module_documentation'
  | 'business_rules'
  | 'user_guide'
  | 'workflow_documentation'
  | 'role_permission_documentation'
  | 'database_relationship_documentation'
  | 'system_configuration_documentation'
  | 'error_handling_documentation';

export interface KnowledgeItem {
  id?: number;
  slug: string;
  title: string;
  category: KnowledgeCategory;
  tags: string[];
  summary: string;
  content: string;
  source: string;
  version?: number;
  isActive: boolean;
  allowedRoles?: ('guest' | 'customer' | 'technician' | 'admin')[];
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeSearchResult {
  item: KnowledgeItem;
  score: number;
  matchedKeywords: string[];
  snippet: string;
}

export interface RAGContext {
  formattedContext: string;
  citations: Array<{
    title: string;
    source: string;
    category: KnowledgeCategory;
  }>;
  totalRetrieved: number;
}
