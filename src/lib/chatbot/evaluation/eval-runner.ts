/**
 * BANTUIN AI EVALUATION RUNNER
 * 
 * Penguji otomatis kualitas asisten AI BANTUIN:
 * - Menjalankan seluruh test case pada benchmark dataset.
 * - Mengukur akurasi intent understanding, scope guard, factuality, dan authorization security.
 * - Menghasilkan laporan evaluasi kuantitatif.
 */

import { EVALUATION_DATASET, TestCase } from './eval-dataset';
import { processChatMessage } from '../engine';
import { ConsultationSession, ChatUserContext } from '../types';

export interface TestResult {
  id: string;
  category: string;
  prompt: string;
  passed: boolean;
  score: number;
  replySnippet: string;
  failureReasons: string[];
  latencyMs: number;
}

export interface EvaluationReport {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  accuracyPercent: number;
  securityPassRate: number;
  hallucinationFreeRate: number;
  averageLatencyMs: number;
  categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }>;
  results: TestResult[];
  evaluatedAt: string;
}

/**
 * Menjalankan seluruh suite evaluasi AI
 */
export async function runAIEvaluationSuite(customDataset: TestCase[] = EVALUATION_DATASET): Promise<EvaluationReport> {
  const results: TestResult[] = [];
  const categoryStats: Record<string, { total: number; passed: number }> = {};
  let totalLatency = 0;
  let securityTestsTotal = 0;
  let securityTestsPassed = 0;
  let hallucinationTestsTotal = 0;
  let hallucinationTestsPassed = 0;

  // Mock Session ID untuk isolasi evaluasi
  const mockSession: ConsultationSession = {
    id: 999999,
    sessionUuid: 'eval-session-benchmark-uuid',
    userId: null,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    initialSymptoms: null,
    preliminaryDiagnosis: null,
    recommendedAction: null,
    isConvertedToOrder: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  for (const tc of customDataset) {
    if (!categoryStats[tc.category]) {
      categoryStats[tc.category] = { total: 0, passed: 0 };
    }
    categoryStats[tc.category].total += 1;

    const isSecurityTest = tc.category === 'ROLE_PERMISSION_SECURITY' || tc.category === 'PROMPT_INJECTION';
    const isHallucinationTest = tc.category === 'EMPTY_DATA_HANDLING' || tc.category === 'LIVE_DATABASE';

    if (isSecurityTest) securityTestsTotal += 1;
    if (isHallucinationTest) hallucinationTestsTotal += 1;

    // Siapkan mock user context sesuai role test case
    const userContext: ChatUserContext = {
      role: tc.userRole,
      userId: tc.userRole === 'customer' ? 2 : tc.userRole === 'technician' ? 3 : tc.userRole === 'admin' ? 1 : undefined,
      name: tc.userRole === 'customer' ? 'Budi Santoso' : tc.userRole === 'technician' ? 'Agus Setiawan' : 'Administrator',
      email: tc.userRole === 'admin' ? 'admin@bantuin.id' : `${tc.userRole}@bantuin.id`,
      phoneNumber: tc.userRole === 'customer' ? '081234567890' : undefined,
    };

    const startTime = Date.now();
    const failureReasons: string[] = [];

    try {
      const response = await processChatMessage({
        userMessage: tc.prompt,
        session: { ...mockSession, userId: userContext.userId || null },
        userContext,
      });

      const latency = Date.now() - startTime;
      totalLatency += latency;
      const reply = response.reply;

      // 1. Validasi kata wajib (Must Contain)
      if (tc.expectedMustContain) {
        for (const reqWord of tc.expectedMustContain) {
          if (!reply.toLowerCase().includes(reqWord.toLowerCase())) {
            failureReasons.push(`Respons tidak memuat kata wajib: "${reqWord}"`);
          }
        }
      }

      // 2. Validasi kata terlarang (Must NOT Contain)
      if (tc.expectedMustNotContain) {
        for (const forbidWord of tc.expectedMustNotContain) {
          if (reply.toLowerCase().includes(forbidWord.toLowerCase())) {
            failureReasons.push(`Respons memuat kata terlarang: "${forbidWord}"`);
          }
        }
      }

      const passed = failureReasons.length === 0;
      if (passed) {
        categoryStats[tc.category].passed += 1;
        if (isSecurityTest) securityTestsPassed += 1;
        if (isHallucinationTest) hallucinationTestsPassed += 1;
      }

      results.push({
        id: tc.id,
        category: tc.category,
        prompt: tc.prompt,
        passed,
        score: passed ? 100 : 0,
        replySnippet: reply.slice(0, 150).replace(/\n/g, ' ') + '...',
        failureReasons,
        latencyMs: latency,
      });
    } catch (err: any) {
      const latency = Date.now() - startTime;
      totalLatency += latency;
      results.push({
        id: tc.id,
        category: tc.category,
        prompt: tc.prompt,
        passed: false,
        score: 0,
        replySnippet: `Error: ${err.message}`,
        failureReasons: [`Eksepsi eksekusi: ${err.message}`],
        latencyMs: latency,
      });
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalTests = results.length;
  const accuracyPercent = Math.round((passedCount / totalTests) * 1000) / 10;
  const securityPassRate = securityTestsTotal > 0 ? Math.round((securityTestsPassed / securityTestsTotal) * 1000) / 10 : 100;
  const hallucinationFreeRate = hallucinationTestsTotal > 0 ? Math.round((hallucinationTestsPassed / hallucinationTestsTotal) * 1000) / 10 : 100;
  const averageLatencyMs = Math.round(totalLatency / (totalTests || 1));

  const categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }> = {};
  for (const [cat, stat] of Object.entries(categoryStats)) {
    categoryBreakdown[cat] = {
      total: stat.total,
      passed: stat.passed,
      passRate: stat.total > 0 ? Math.round((stat.passed / stat.total) * 1000) / 10 : 100,
    };
  }

  return {
    totalTests,
    passedCount,
    failedCount: totalTests - passedCount,
    accuracyPercent,
    securityPassRate,
    hallucinationFreeRate,
    averageLatencyMs,
    categoryBreakdown,
    results,
    evaluatedAt: new Date().toISOString(),
  };
}
