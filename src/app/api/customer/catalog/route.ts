import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Ambil kategori peralatan yang aktif
    const categories = await query<any[]>(
      `SELECT id, name, slug, icon_url, description
       FROM appliance_categories
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY id ASC`
    );

    // 2. Ambil seluruh layanan servis aktif
    const services = await query<any[]>(
      `SELECT id, category_id, name, slug, description, base_price, estimated_duration_min
       FROM services
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY category_id ASC, id ASC`
    );

    return NextResponse.json({
      success: true,
      data: {
        categories: categories.map((cat) => ({
          id: Number(cat.id),
          name: cat.name,
          slug: cat.slug,
          iconUrl: cat.icon_url,
          description: cat.description,
          services: services
            .filter((svc) => Number(svc.category_id) === Number(cat.id))
            .map((svc) => ({
              id: Number(svc.id),
              name: svc.name,
              slug: svc.slug,
              description: svc.description,
              basePrice: Number(svc.base_price),
              estimatedDurationMin: Number(svc.estimated_duration_min),
            })),
        })),
      },
    });
  } catch (error: any) {
    console.error('[Customer Catalog API Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat katalog layanan perbaikan' },
      { status: 500 }
    );
  }
}

