import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { discoverDatabaseSchema, invalidateSchemaDiscoveryCache } from '@/lib/chatbot/db-intelligence/schema-discovery';

/**
 * GET /api/admin/ai/schema
 * Mengambil metadata skema database MySQL aktual hasil introspeksi information_schema
 */
export async function GET(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat melihat introspeksi skema database.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    if (refresh) {
      invalidateSchemaDiscoveryCache();
    }

    const schemaSnapshot = await discoverDatabaseSchema(refresh);

    // Hitung statistik ringkasan
    const tableNames = Object.keys(schemaSnapshot.tables);
    let totalColumns = 0;
    let sensitiveColumnsCount = 0;
    let foreignKeysCount = 0;

    for (const tableName of tableNames) {
      const table = schemaSnapshot.tables[tableName];
      totalColumns += table.columns.length;
      sensitiveColumnsCount += table.columns.filter((c: any) => c.isSensitive).length;
      foreignKeysCount += table.foreignKeys.length;
    }

    return NextResponse.json({
      success: true,
      snapshot: schemaSnapshot,
      stats: {
        databaseName: schemaSnapshot.databaseName,
        totalTables: tableNames.length,
        totalColumns,
        sensitiveColumnsCount,
        foreignKeysCount,
        discoveredAt: schemaSnapshot.discoveredAt,
      },
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/schema:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal melakukan introspeksi skema database: ' + err.message },
      { status: 500 }
    );
  }
}
