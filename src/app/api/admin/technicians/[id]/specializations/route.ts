import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { addSpecializationSchema } from '@/lib/validations/technician';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/technicians/[id]/specializations
 * Menambahkan spesialisasi kategori perbaikan untuk teknisi.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi Admin
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const technicianProfileId = parseInt(rawId, 10);

    if (isNaN(technicianProfileId) || technicianProfileId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID teknisi tidak valid' },
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

    const validation = addSpecializationSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input spesialisasi tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { category_id, supporting_document_id } = validation.data;

    // 3. Pastikan Profil Teknisi Ada
    const techExists = await query<{ id: number }[]>(
      'SELECT id FROM technician_profiles WHERE id = ? LIMIT 1',
      [technicianProfileId]
    );
    if (!techExists || techExists.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Data teknisi tidak ditemukan' },
        { status: 404 }
      );
    }

    // 4. Pastikan Kategori Ada dan Belum Dihapus
    const categoryRows = await query<{ id: number; name: string }[]>(
      'SELECT id, name FROM appliance_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [category_id]
    );
    if (!categoryRows || categoryRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori peralatan yang dipilih tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }
    const category = categoryRows[0];

    // 5. Periksa Apakah Spesialisasi Kategori Sudah Terdaftar (Cegah Duplikat)
    const duplicateCheck = await query<{ id: number }[]>(
      'SELECT id FROM technician_specializations WHERE technician_profile_id = ? AND category_id = ? LIMIT 1',
      [technicianProfileId, category_id]
    );
    if (duplicateCheck && duplicateCheck.length > 0) {
      return NextResponse.json(
        { success: false, message: `Teknisi sudah memiliki spesialisasi untuk kategori "${category.name}"` },
        { status: 409 }
      );
    }

    // 6. Jika Dokumen Pendukung Diberikan, Pastikan Milik Teknisi Bersangkutan
    if (supporting_document_id) {
      const docCheck = await query<{ id: number; document_title: string }[]>(
        'SELECT id, document_title FROM technician_documents WHERE id = ? AND technician_profile_id = ? LIMIT 1',
        [supporting_document_id, technicianProfileId]
      );
      if (!docCheck || docCheck.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Dokumen pendukung yang dipilih tidak valid atau bukan milik teknisi ini' },
          { status: 400 }
        );
      }
    }

    // 7. Simpan Spesialisasi ke Database
    const insertResult: any = await query(
      `INSERT INTO technician_specializations (
        technician_profile_id,
        category_id,
        supporting_document_id,
        created_at
      ) VALUES (?, ?, ?, NOW())`,
      [technicianProfileId, category_id, supporting_document_id || null]
    );

    const insertedId = insertResult.insertId;

    // 8. Catat Log Audit
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const clientUserAgent = request.headers.get('user-agent') || '';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'ADD_SPECIALIZATION',
      entityName: 'technician_specializations',
      entityId: insertedId,
      oldValues: null,
      newValues: {
        technician_profile_id: technicianProfileId,
        category_id,
        category_name: category.name,
        supporting_document_id: supporting_document_id || null,
      },
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Spesialisasi kategori "${category.name}" berhasil ditambahkan untuk teknisi`,
        data: {
          id: insertedId,
          technician_profile_id: technicianProfileId,
          category_id,
          category_name: category.name,
          supporting_document_id: supporting_document_id || null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/admin/technicians/[id]/specializations Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal menambahkan spesialisasi teknisi' },
      { status: 500 }
    );
  }
}
