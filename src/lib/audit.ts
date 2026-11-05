import { query } from '@/lib/db';

export interface CreateAuditLogParams {
  adminUserId: number;
  action: string;
  entityName: string;
  entityId: number;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Filter data untuk memastikan tidak ada informasi sensitif (password, JWT, rahasia)
 * yang dicatat ke dalam audit log.
 */
function sanitizeAuditPayload(data?: Record<string, any> | null): string | null {
  if (!data) return null;

  const sanitized = { ...data };
  const sensitiveKeys = [
    'password',
    'password_hash',
    'token',
    'secret',
    'jwt',
    'cookie',
    'authorization',
  ];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      delete sanitized[key];
    }
  }

  return JSON.stringify(sanitized);
}

/**
 * Mencatat aktivitas administrator ke dalam tabel admin_audit_logs secara aman dan terstruktur.
 */
export async function recordAdminAudit(params: CreateAuditLogParams): Promise<void> {
  try {
    const oldValuesJson = sanitizeAuditPayload(params.oldValues);
    const newValuesJson = sanitizeAuditPayload(params.newValues);

    await query(
      `INSERT INTO admin_audit_logs (
        admin_user_id,
        action,
        entity_name,
        entity_id,
        old_values,
        new_values,
        ip_address,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.adminUserId,
        params.action.toUpperCase(),
        params.entityName,
        params.entityId,
        oldValuesJson,
        newValuesJson,
        params.ipAddress || null,
        params.userAgent?.slice(0, 255) || null,
      ]
    );
  } catch (error) {
    // Audit failure tidak boleh membatalkan aksi utama, namun harus dicatat di error log server
    console.error('[Admin Audit Log Error]: Gagal mencatat log audit:', error);
  }
}
