import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/technicians/[id]/reviews
 * Mengambil ulasan publik untuk teknisi tertentu.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const technicianId = parseInt(id, 10);
    if (isNaN(technicianId)) {
      return NextResponse.json({ success: false, message: 'ID teknisi tidak valid' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10), 1), 50);

    // Ambil ulasan
    const reviews = await query<any[]>(
      `SELECT rv.id, rv.rating, rv.review_text, rv.photos, rv.created_at,
              cp.full_name AS customer_name,
              cat.name AS appliance_category
       FROM repair_reviews rv
       JOIN users u_cust ON u_cust.id = rv.customer_id
       LEFT JOIN customer_profiles cp ON cp.user_id = u_cust.id
       JOIN repair_requests rr ON rr.id = rv.repair_request_id
       LEFT JOIN appliance_categories cat ON cat.id = rr.category_id
       WHERE rv.technician_id = ? AND rv.is_published = TRUE
       ORDER BY rv.created_at DESC
       LIMIT ?`,
      [technicianId, limit]
    );

    // Ambil data profil teknisi
    const profiles = await query<any[]>(
      `SELECT tp.rating_avg, tp.rating_count, tp.full_name
       FROM technician_profiles tp
       WHERE tp.user_id = ?
       LIMIT 1`,
      [technicianId]
    );

    const formattedReviews = reviews.map((r) => {
      let parsedPhotos: string[] = [];
      if (r.photos) {
        parsedPhotos = typeof r.photos === 'string' ? JSON.parse(r.photos) : r.photos;
      }
      return {
        id: r.id,
        rating: r.rating,
        reviewText: r.review_text,
        photos: parsedPhotos,
        createdAt: r.created_at,
        customerName: r.customer_name ? `${r.customer_name.slice(0, 3)}***` : 'Pelanggan',
        applianceCategory: r.appliance_category,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        technician: profiles[0] || null,
        reviews: formattedReviews,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/technicians/[id]/reviews:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil ulasan teknisi' },
      { status: 500 }
    );
  }
}
