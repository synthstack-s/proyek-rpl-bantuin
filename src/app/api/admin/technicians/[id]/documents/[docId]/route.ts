import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { verifyDocumentSchema } from '@/lib/validations/technician';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

interface DocumentCheckRow {
  id: number;
  technician_profile_id: number;
  document_title: string;
  document_type: string;
  verification_status: string;
  admin_notes: string | null;
  file_name: string;
}

/**
 * PATCH /api/admin/technicians/[id]/documents/[docId]
 * Memverifikasi berkas dokumen teknisi (menyetujui, menolak dengan alasan, atau meminta revisi).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi Admin
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId, docId: rawDocId } = await params;
    const technicianProfileId = parseInt(rawId, 10);
    const documentId = parseInt(rawDocId, 10);

    if (isNaN(technicianProfileId) || technicianProfileId <= 0 || isNaN(documentId) || documentId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID teknisi atau dokumen tidak valid' },
        { status: 400 }
      );
    }

    // 2. Parse & Validasi Payload
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Format data JSON tidak valid' },
        { status: 400 }
      );
    }

    const validation = verifyDocumentSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input verifikasi dokumen tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { verification_status, admin_notes } = validation.data;

    // 3. Verifikasi Keberadaan Dokumen dan Kepemilikan Profil Teknisi
    const existing = await query<DocumentCheckRow[]>(
      `SELECT id, technician_profile_id, document_title, document_type, verification_status, admin_notes, file_name
       FROM technician_documents
       WHERE id = ? AND technician_profile_id = ?
       LIMIT 1`,
      [documentId, technicianProfileId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Dokumen tidak ditemukan atau bukan milik teknisi bersangkutan' },
        { status: 404 }
      );
    }

    const currentDoc = existing[0];

    // 4. Update Status Verifikasi Dokumen
    await query(
      `UPDATE technician_documents
       SET 
         verification_status = ?,
         admin_notes = ?,
         verified_by_admin_id = ?,
         verified_at = NOW(),
         updated_at = NOW()
       WHERE id = ? AND technician_profile_id = ?`,
      [
        verification_status,
        admin_notes || null,
        session.userId,
        documentId,
        technicianProfileId,
      ]
    );

    // 5. Catat Log Audit
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const clientUserAgent = request.headers.get('user-agent') || '';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: `DOC_${verification_status.toUpperCase()}`,
      entityName: 'technician_documents',
      entityId: documentId,
      oldValues: {
        verification_status: currentDoc.verification_status,
        admin_notes: currentDoc.admin_notes,
        document_title: currentDoc.document_title,
      },
      newValues: {
        verification_status,
        admin_notes: admin_notes || null,
        document_title: currentDoc.document_title,
      },
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Status dokumen "${currentDoc.document_title}" berhasil diperbarui menjadi ${verification_status}`,
        data: {
          id: documentId,
          technician_profile_id: technicianProfileId,
          verification_status,
          admin_notes: admin_notes || null,
          verified_by_admin_id: session.userId,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[PATCH /api/admin/technicians/[id]/documents/[docId] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan saat memperbarui status dokumen' },
      { status: 500 }
    );
  }
}
