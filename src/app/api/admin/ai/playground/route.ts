import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { evaluateApplicationScope } from '@/lib/chatbot/security/scope-guard';
import { classifyUserIntent } from '@/lib/chatbot/understanding/intent-classifier';
import { getAllActiveKnowledge } from '@/lib/knowledge/knowledge-service';
import { searchKnowledgeBase } from '@/lib/knowledge/rag-engine';
import { processChatMessage } from '@/lib/chatbot/engine';
import { ChatUserContext } from '@/lib/chatbot/types';

/**
 * POST /api/admin/ai/playground
 * Playground pengujian AI terisolasi dengan telemetri diagnostik lengkap untuk Admin
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menggunakan AI Playground.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const prompt = (body.prompt || '').trim();
    const simulatedRole = body.role || 'admin';
    const categorySlug = body.categorySlug || undefined;

    if (!prompt) {
      return NextResponse.json({ success: false, message: 'Prompt pengujian wajib diisi.' }, { status: 400 });
    }

    // 1. Telemetri Scope Guard
    const simulatedUserContext: ChatUserContext = {
      role: simulatedRole,
      userId: simulatedRole === 'admin' ? Number(adminSession.id) : 1,
      name: simulatedRole === 'admin' ? 'Administrator' : `Test ${simulatedRole}`,
      email: simulatedRole === 'admin' ? adminSession.email : `test-${simulatedRole}@bantuin.id`,
      pageContext: { pathname: '/admin/settings' },
    };

    const scopeEval = evaluateApplicationScope(prompt, simulatedUserContext);

    // 2. Telemetri Pemahaman Bahasa (NLU) & Entitas
    const understanding = classifyUserIntent(prompt);

    // 3. Telemetri RAG Knowledge Retrieval
    const allDocs = await getAllActiveKnowledge();
    const ragMatches = searchKnowledgeBase(prompt, allDocs, {
      role: simulatedRole,
      limit: 3,
      minScoreThreshold: 1.0,
    });

    // 4. Simulasi Pemrosesan Nyata melalui Chatbot Engine
    const mockSession = {
      id: 999999, // sandbox session ID
      sessionUuid: 'playground-sandbox-session',
      userId: null,
      categoryId: null,
      categoryName: null,
      categorySlug: categorySlug || null,
      initialSymptoms: null,
      preliminaryDiagnosis: null,
      recommendedAction: null,
      isConvertedToOrder: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let chatResult;
    try {
      chatResult = await processChatMessage({
        userMessage: prompt,
        session: mockSession,
        userContext: simulatedUserContext,
      });
    } catch (engineErr: any) {
      chatResult = {
        reply: 'Gagal memproses pesan: ' + engineErr.message,
        metadata: {
          model: 'error',
          responseTimeMs: Date.now() - startTime,
        },
      };
    }

    const totalDurationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      diagnostic: {
        prompt,
        simulatedRole,
        totalDurationMs,
        scopeGuard: {
          status: scopeEval.status,
          isAllowed: scopeEval.isAllowed,
          reason: scopeEval.reason,
          isSafetyHazard: scopeEval.isSafetyHazard,
          safetyAlert: scopeEval.safetyAlert,
        },
        nluUnderstanding: {
          intent: understanding.intent,
          confidence: understanding.confidence,
          normalizedMessage: understanding.normalizedMessage,
          entities: understanding.entities,
          targetDomain: understanding.targetDomain,
        },
        ragRetrieval: {
          matchedCount: ragMatches.length,
          matches: ragMatches.map((m) => ({
            id: m.item.id,
            slug: m.item.slug,
            title: m.item.title,
            category: m.item.category,
            relevanceScore: m.score,
            matchedKeywords: m.matchedKeywords,
            snippet: m.snippet,
          })),
        },
        engineExecution: {
          model: chatResult.metadata?.model,
          responseTimeMs: chatResult.metadata?.responseTimeMs,
          topicRefused: chatResult.metadata?.topicRefused || false,
          hasDiagnosisCard: Boolean(chatResult.diagnosisCard),
          quickSuggestionsCount: chatResult.metadata?.quickSuggestions?.length || 0,
        },
      },
      reply: chatResult.reply,
      diagnosisCard: chatResult.diagnosisCard,
      quickSuggestions: chatResult.metadata?.quickSuggestions || [],
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/playground:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengeksekusi playground: ' + err.message },
      { status: 500 }
    );
  }
}
