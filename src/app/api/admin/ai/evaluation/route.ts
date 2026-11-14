import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { runAIEvaluationSuite } from '@/lib/chatbot/evaluation/eval-runner';

/**
 * GET /api/admin/ai/evaluation
 * Menjalankan AI benchmark evaluation suite dan menghasilkan metrik kuantitatif
 */
export async function GET(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menjalankan evaluasi AI.' },
        { status: 403 }
      );
    }

    const report = await runAIEvaluationSuite();

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/evaluation:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal menjalankan evaluasi AI: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai/evaluation
 * Menjalankan evaluasi AI (mendukung trigger via POST)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

