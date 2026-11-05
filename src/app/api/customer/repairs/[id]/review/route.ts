import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { createReviewSchema } from '@/lib/validations/review';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/customer/repairs/[id]/review
 * Mengambil ulasan yang sudah pernah diberikan untuk pesanan tertentu.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const reviews = await query<any[]>(
      `SELECT rv.id, rv.repair_request_id, rv.rating, rv.review_text, rv.photos,
              rv.created_at, tp.full_name AS technician_name
       FROM repair_reviews rv
       LEFT JOIN technician_profiles tp ON tp.user_id = rv.technician_id
       WHERE rv.repair_request_id = ? AND rv.customer_id = ?
       LIMIT 1`,
      [repairId, session.userId]
    );

    if (reviews.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Belum ada ulasan untuk pesanan ini',
      });
    }

    const review = reviews[0];
    let parsedPhotos: string[] = [];
    if (review.photos) {
      parsedPhotos = typeof review.photos === 'string' ? JSON.parse(review.photos) : review.photos;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: review.id,
        rating: review.rating,
        reviewText: review.review_text,
        photos: parsedPhotos,
        createdAt: review.created_at,
        technicianName: review.technician_name,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/customer/repairs/[id]/review:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil ulasan' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customer/repairs/[id]/review
 * Pelanggan mengirimkan rating bintang (1-5) dan ulasan untuk teknisi yang mengerjakan servis.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const validation = createReviewSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.error.issues[0]?.message || 'Input ulasan tidak valid' },
        { status: 400 }
      );
    }

    const { rating, review_text, photos } = validation.data;

    // 1. Verifikasi Kepemilikan Pesanan, Status Selesai, dan Teknisi yang Ditugaskan
    const orders = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.current_status AS repair_status, rr.customer_id,
              ta.technician_id,
              inv.status AS invoice_status
       FROM repair_requests rr
       LEFT JOIN technician_assignments ta ON ta.repair_request_id = rr.id AND ta.status = 'completed'
       LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
       WHERE rr.id = ? AND rr.customer_id = ? AND rr.deleted_at IS NULL
       ORDER BY ta.id DESC
       LIMIT 1`,
      [repairId, session.userId]
    );

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pesanan perbaikan tidak ditemukan atau bukan milik Anda' },
        { status: 404 }
      );
    }

    const order = orders[0];

    // Syarat 1: Pesanan harus berstatus completed
    if (order.repair_status !== 'completed') {
      return NextResponse.json(
        {
          success: false,
          message: 'Ulasan hanya dapat diberikan setelah pengerjaan perbaikan berstatus selesai (completed)',
        },
        { status: 400 }
      );
    }

    // Syarat 2: Invoice harus lunas
    if (order.invoice_status !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          message: 'Ulasan hanya dapat diberikan setelah tagihan invoice telah dilunasi',
        },
        { status: 400 }
      );
    }

    // Syarat 3: Teknisi harus ada
    if (!order.technician_id) {
      return NextResponse.json(
        { success: false, message: 'Data teknisi untuk pesanan ini tidak ditemukan' },
        { status: 400 }
      );
    }

    // 2. Cek apakah sudah pernah memberikan ulasan sebelumnya (Idempotensi / Duplicate Prevention)
    const existing = await query<any[]>(
      `SELECT id FROM repair_reviews WHERE repair_request_id = ? LIMIT 1`,
      [repairId]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, message: 'Anda sudah pernah memberikan ulasan untuk pesanan perbaikan ini' },
        { status: 409 }
      );
    }

    // 3. Simpan Ulasan ke repair_reviews
    const photosJson = photos && photos.length > 0 ? JSON.stringify(photos) : null;
    const insertResult = await query<any>(
      `INSERT INTO repair_reviews (
        repair_request_id, customer_id, technician_id, rating, review_text, photos, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [repairId, session.userId, order.technician_id, rating, review_text, photosJson]
    );

    // 4. Hitung & Update Rating Rata-rata Teknisi di technician_profiles
    const ratingStats = await query<any[]>(
      `SELECT COUNT(*) AS total_reviews, AVG(rating) AS avg_rating
       FROM repair_reviews
       WHERE technician_id = ? AND is_published = TRUE`,
      [order.technician_id]
    );

    if (ratingStats.length > 0) {
      const totalReviews = ratingStats[0].total_reviews || 0;
      const avgRating = parseFloat(ratingStats[0].avg_rating || '0').toFixed(2);

      await query(
        `UPDATE technician_profiles
         SET rating_avg = ?, rating_count = ?, updated_at = NOW()
         WHERE user_id = ?`,
        [avgRating, totalReviews, order.technician_id]
      );
    }

    // 5. Kirim Notifikasi ke Teknisi
    await query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, 'order_status', FALSE, NOW())`,
      [
        order.technician_id,
        'Ulasan Baru Diterima ⭐',
        `Pelanggan memberikan apresiasi ${rating} bintang untuk pesanan #${order.order_code}.`,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Terima kasih! Ulasan dan rating Anda berhasil disimpan.',
      data: {
        reviewId: insertResult.insertId,
        rating,
        reviewText: review_text,
        orderCode: order.order_code,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/customer/repairs/[id]/review:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat menyimpan ulasan' },
      { status: 500 }
    );
  }
}
