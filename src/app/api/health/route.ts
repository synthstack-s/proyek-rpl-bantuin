import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbHealth = await checkDatabaseConnection();

  return NextResponse.json(
    {
      status: 'ok',
      service: 'BANTUIN Admin & API Engine',
      timestamp: new Date().toISOString(),
      database: {
        status: dbHealth.connected ? 'connected' : 'disconnected',
        ...(dbHealth.latencyMs !== undefined && { latencyMs: dbHealth.latencyMs }),
      },
    },
    {
      status: dbHealth.connected ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
