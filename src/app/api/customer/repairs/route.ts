import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { pool, query } from '@/lib/db';
import { createRepairSchema, generateOrderCode } from '@/lib/validations/repair';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/repairs
 * Menampilkan daftar riwayat dan pesanan servis aktif milik pelanggan
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 10));
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) AS total FROM repair_requests WHERE customer_id = ? AND deleted_at IS NULL`;
    const countParams: any[] = [session.userId];

    let dataSql = `
      SELECT r.id, r.order_code, r.device_brand, r.device_model, r.problem_description,
             r.problem_photos, r.address_text, r.latitude, r.longitude, r.current_status,
             r.created_at, r.updated_at,
             c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.icon_url AS category_icon,
             s.id AS service_id, s.name AS service_name, s.base_price, s.estimated_duration_min,
             -- Info teknisi yang ditugaskan (jika ada)
             tp.full_name AS technician_name,
             tu.phone_number AS technician_phone
      FROM repair_requests r
      JOIN appliance_categories c ON r.category_id = c.id
      LEFT JOIN services s ON r.service_id = s.id
      LEFT JOIN technician_assignments ta ON r.id = ta.repair_request_id AND ta.status IN ('offered', 'accepted')
      LEFT JOIN users tu ON ta.technician_id = tu.id
      LEFT JOIN technician_profiles tp ON tu.id = tp.user_id
      WHERE r.customer_id = ? AND r.deleted_at IS NULL
    `;
    const dataParams: any[] = [session.userId];

    if (statusFilter && statusFilter !== 'all') {
      countSql += ` AND current_status = ?`;
      countParams.push(statusFilter);

      dataSql += ` AND r.current_status = ?`;
      dataParams.push(statusFilter);
    }

    dataSql += ` ORDER BY r.id DESC LIMIT ? OFFSET ?`;
    dataParams.push(limit, offset);

    const [countRows] = await query<any[]>(countSql, countParams);
    const total = Number(countRows?.total || 0);

    const rows = await query<any[]>(dataSql, dataParams);

    const repairs = rows.map((r) => {
      let photos: string[] = [];
      try {
        if (typeof r.problem_photos === 'string') {
          photos = JSON.parse(r.problem_photos);
        } else if (Array.isArray(r.problem_photos)) {
          photos = r.problem_photos;
        }
      } catch {
        photos = [];
      }

      return {
        id: Number(r.id),
        orderCode: r.order_code,
        status: r.current_status,
        deviceBrand: r.device_brand || '-',
        deviceModel: r.device_model || '-',
        problemDescription: r.problem_description,
        problemPhotos: photos,
        addressText: r.address_text,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        category: {
          id: Number(r.category_id),
          name: r.category_name,
          slug: r.category_slug,
          iconUrl: r.category_icon,
        },
        service: r.service_id
          ? {
              id: Number(r.service_id),
              name: r.service_name,
              basePrice: Number(r.base_price),
              estimatedDurationMin: Number(r.estimated_duration_min),
            }
          : null,
        technician: r.technician_name
          ? {
              name: r.technician_name,
              phone: r.technician_phone,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: repairs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('[Get Customer Repairs Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil riwayat pesanan servis' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customer/repairs
 * Membuat permintaan pesanan servis baru oleh pelanggan
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    if (!session.isVerified) {
      return NextResponse.json(
        {
          success: false,
          message: 'Nomor WhatsApp Anda belum diverifikasi. Silakan verifikasi nomor terlebih dahulu.',
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Payload tidak valid' },
        { status: 400 }
      );
    }

    const validation = createRepairSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Data pesanan tidak valid',
          errors: validation.error.format(),
        },
        { status: 422 }
      );
    }

    const {
      category_id,
      service_id,
      ai_session_id,
      device_brand,
      device_model,
      problem_description,
      problem_photos,
      address_text,
      latitude,
      longitude,
    } = validation.data;

    // 1. Verifikasi Kategori Aktif
    const categories = await query<any[]>(
      `SELECT id, name FROM appliance_categories WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
      [category_id]
    );

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori peralatan yang dipilih tidak valid atau tidak aktif' },
        { status: 400 }
      );
    }

    // 2. Jika service_id dipilih, pastikan valid dan sesuai dengan category_id (Foreign Key Consistency)
    if (service_id) {
      const services = await query<any[]>(
        `SELECT id, name, category_id, base_price FROM services
         WHERE id = ? AND category_id = ? AND is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
        [service_id, category_id]
      );

      if (!services || services.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'Paket layanan yang dipilih tidak sesuai dengan kategori peralatan yang dipilih',
          },
          { status: 400 }
        );
      }
    }

    // 3. Generate Kode Order Unik (format: BAN-YYYYMMDD-XXXXX)
    let orderCode = generateOrderCode();
    let isCodeUnique = false;
    let attempts = 0;

    while (!isCodeUnique && attempts < 5) {
      const existing = await query<any[]>(
        `SELECT id FROM repair_requests WHERE order_code = ? LIMIT 1`,
        [orderCode]
      );
      if (existing.length === 0) {
        isCodeUnique = true;
      } else {
        orderCode = generateOrderCode();
        attempts++;
      }
    }

    // 4. Simpan ke database dalam transaksi atomik
    const connection = await pool.getConnection();
    let newRepairId: number;

    try {
      await connection.beginTransaction();

      const photosJson = problem_photos && problem_photos.length > 0 ? JSON.stringify(problem_photos) : null;

      const [insertRes]: any = await connection.execute(
        `INSERT INTO repair_requests (
          order_code,
          customer_id,
          category_id,
          service_id,
          ai_session_id,
          device_brand,
          device_model,
          problem_description,
          problem_photos,
          address_text,
          latitude,
          longitude,
          current_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NOW(), NOW())`,
        [
          orderCode,
          session.userId,
          category_id,
          service_id || null,
          ai_session_id || null,
          device_brand || null,
          device_model || null,
          problem_description,
          photosJson,
          address_text,
          latitude,
          longitude,
        ]
      );

      newRepairId = insertRes.insertId;

      // Jika pesanan berasal dari sesi AI, tandai status konversinya
      if (ai_session_id) {
        await connection.execute(
          `UPDATE ai_consultation_sessions SET is_converted_to_order = TRUE, updated_at = NOW() WHERE id = ?`,
          [ai_session_id]
        );
      }

      // 5. Catat riwayat status perdana di repair_status_history
      await connection.execute(
        `INSERT INTO repair_status_history (
          repair_request_id,
          previous_status,
          new_status,
          changed_by_user_id,
          actor_role,
          notes,
          created_at
        ) VALUES (?, NULL, 'submitted', ?, 'customer', 'Pesanan perbaikan berhasil diajukan oleh pelanggan.', NOW())`,
        [newRepairId, session.userId]
      );

      // 6. Buat notifikasi in-app untuk pelanggan
      await connection.execute(
        `INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          target_url,
          entity_type,
          entity_id,
          created_at
        ) VALUES (?, 'Pesanan Servis Berhasil Diajukan', ?, 'order_status', ?, 'repair_requests', ?, NOW())`,
        [
          session.userId,
          `Pesanan perbaikan dengan kode ${orderCode} telah diterima. Kami sedang mencocokkan teknisi terdekat untuk Anda.`,
          `/customer/repairs/${newRepairId}`,
          newRepairId,
        ]
      );

      await connection.commit();
    } catch (dbErr: any) {
      await connection.rollback();
      console.error('[Create Repair DB Error]:', dbErr);
      throw dbErr;
    } finally {
      connection.release();
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Pesanan servis Anda berhasil dibuat!',
        data: {
          id: newRepairId,
          orderCode,
          status: 'submitted',
          categoryName: categories[0].name,
          redirectUrl: `/customer/repairs/${newRepairId}`,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Create Customer Repair Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat membuat pesanan servis' },
      { status: 500 }
    );
  }
}

