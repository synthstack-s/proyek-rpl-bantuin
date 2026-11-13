/**
 * DATA SERVICE - BANTUIN AI DATABASE ASSISTANT
 * 
 * Lapisan akses data terotentikasi dan aman dengan:
 * 1. Parameterized SQL queries (mencegah SQL Injection).
 * 2. Row-Level Authorization (mengunci data berdasarkan user_id / technician_id / customer_id).
 * 3. Whitelist column projection (menjamin password_hash, otp_hash, dan token_hash TIDAK PERNAH terambil).
 * 4. Zero direct SQL dari LLM.
 * 5. Aturan tiga keadaan (N1/T9): kueri sukses + baris ada -> data riil;
 *    kueri sukses + kosong -> [] / null / angka 0 riil; kueri error -> null
 *    (dicatat via console.error). TIDAK ADA data demo untuk data transaksional;
 *    fallback hanya untuk katalog publik statis (DEFAULT_FALLBACK_CATEGORIES).
 */

import { query, checkDatabaseConnection } from '@/lib/db';
import { ChatUserContext } from './types';
import { BANTUIN_SCHEMA_REGISTRY, TableMetadata } from './schema-registry';

// ============================================================================
// 1. DATA SERVICES UNTUK GUEST & PUBLIK
// ============================================================================

export interface PublicServiceCatalogItem {
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  description: string | null;
  services: Array<{
    serviceId: number;
    name: string;
    slug: string;
    basePrice: number;
    estimatedDurationMin: number;
    description: string | null;
  }>;
}

// Default master catalog fallback (sesuai seed.sql) saat database offline
const DEFAULT_FALLBACK_CATEGORIES: PublicServiceCatalogItem[] = [
  {
    categoryId: 1,
    categoryName: 'Pendingin Ruangan (AC)',
    categorySlug: 'ac-pendingin-ruangan',
    description: 'Layanan cuci, perbaikan mesin, pengisian refrigeran/freon, dan instalasi AC.',
    services: [
      { serviceId: 1, name: 'Cuci AC Standar (0.5 - 1 PK)', slug: 'cuci-ac-standar-05-1pk', basePrice: 75000, estimatedDurationMin: 45, description: 'Pembersihan evaporator indoor dan kondensor outdoor.' },
      { serviceId: 3, name: 'Tambah Freon R32 / R410A', slug: 'tambah-freon-r32-r410a', basePrice: 175000, estimatedDurationMin: 45, description: 'Pengisian refrigeran ramah lingkungan.' },
    ],
  },
  {
    categoryId: 2,
    categoryName: 'Lemari Es & Freezer',
    categorySlug: 'kulkas-freezer',
    description: 'Perbaikan kulkas 1 pintu, 2 pintu, chiller, dan freezer box.',
    services: [
      { serviceId: 5, name: 'Inspeksi & Diagnosis Kulkas', slug: 'inspeksi-diagnosis-kulkas', basePrice: 60000, estimatedDurationMin: 45, description: 'Pengecekan relay PTC, thermostat, dan kompresor.' },
    ],
  },
  {
    categoryId: 3,
    categoryName: 'Mesin Cuci & Pengering',
    categorySlug: 'mesin-cuci-pengering',
    description: 'Perbaikan mesin cuci top loading, front loading, 2 tabung, dan mesin pengering pakaian.',
    services: [
      { serviceId: 8, name: 'Perbaikan Saluran Air & Selang Pembuangan', slug: 'servis-saluran-air-mesin-cuci', basePrice: 120000, estimatedDurationMin: 45, description: 'Pembersihan filter inlet atau water valve.' },
    ],
  },
  {
    categoryId: 4,
    categoryName: 'Pompa Air & Water Heater',
    categorySlug: 'pompa-air-water-heater',
    description: 'Servis pompa air tanah, pendorong (booster), serta water heater listrik dan gas.',
    services: [
      { serviceId: 11, name: 'Servis Otomatis (Pressure Switch) & Tangki', slug: 'servis-pressure-switch-pompa', basePrice: 110000, estimatedDurationMin: 45, description: 'Penggantian sakelar otomatis pompa air.' },
    ],
  },
  {
    categoryId: 5,
    categoryName: 'Televisi & Home Audio',
    categorySlug: 'tv-audio-elektronik',
    description: 'Perbaikan Smart TV LED/OLED, panel gambar gelap, backlight mati, suara tidak keluar.',
    services: [
      { serviceId: 13, name: 'Perbaikan TV LED Layar Gelap (Ganti Backlight)', slug: 'ganti-backlight-tv-led', basePrice: 275000, estimatedDurationMin: 90, description: 'Penggantian strip lampu LED backlight TV.' },
    ],
  },
  {
    categoryId: 6,
    categoryName: 'Peralatan Dapur Elektronik',
    categorySlug: 'elektronik-dapur',
    description: 'Layanan perbaikan microwave oven, kompor induksi, dispenser air galon, dan rice cooker digital.',
    services: [
      { serviceId: 15, name: 'Perbaikan Dispenser Tidak Panas / Tidak Dingin', slug: 'servis-dispenser-panas-dingin', basePrice: 135000, estimatedDurationMin: 60, description: 'Penggantian thermostat pemanas atau relay dispenser.' },
    ],
  },
];

export async function getPublicCatalog(): Promise<PublicServiceCatalogItem[]> {
  try {
    const categories = await query<any[]>(
      `SELECT id, name, slug, description 
       FROM appliance_categories 
       WHERE is_active = TRUE AND deleted_at IS NULL 
       ORDER BY id ASC`
    );

    const services = await query<any[]>(
      `SELECT id, category_id, name, slug, base_price, estimated_duration_min, description
       FROM services 
       WHERE is_active = TRUE AND deleted_at IS NULL 
       ORDER BY category_id, base_price ASC`
    );

    if (categories && categories.length > 0) {
      return categories.map(cat => ({
        categoryId: Number(cat.id),
        categoryName: cat.name,
        categorySlug: cat.slug,
        description: cat.description,
        services: services
          .filter(s => Number(s.category_id) === Number(cat.id))
          .map(s => ({
            serviceId: Number(s.id),
            name: s.name,
            slug: s.slug,
            basePrice: Number(s.base_price),
            estimatedDurationMin: Number(s.estimated_duration_min),
            description: s.description,
          })),
      }));
    }
  } catch {
    // Gunakan fallback katalog standar saat database offline/sandbox
  }

  return DEFAULT_FALLBACK_CATEGORIES;
}

/**
 * N10 — Daftar harga layanan dari katalog (untuk pertanyaan "berapa biaya
 * perbaikan AC?" dsb.). Berbeda dengan getPublicCatalog yang memakai
 * fallback statis saat DB offline, fungsi ini mengembalikan null bila DB
 * tidak dapat dibaca — harga TIDAK BOLEH ditebak dari data fallback —
 * dan [] bila katalog kosong.
 */
export async function getPublicServicePrices(): Promise<Array<{
  serviceId: number;
  name: string;
  slug: string;
  basePrice: number;
  estimatedDurationMin: number;
  categoryName: string;
  categorySlug: string;
}> | null> {
  try {
    const rows = await query<any[]>(
      `SELECT s.id, s.name, s.slug, s.base_price, s.estimated_duration_min,
              ac.name AS category_name, ac.slug AS category_slug
       FROM services s
       JOIN appliance_categories ac ON s.category_id = ac.id
       WHERE s.is_active = TRUE AND s.deleted_at IS NULL
         AND ac.is_active = TRUE AND ac.deleted_at IS NULL
       ORDER BY ac.id ASC, s.base_price ASC`
    );
    if (!rows || rows.length === 0) return [];
    return rows.map(r => ({
      serviceId: Number(r.id),
      name: r.name,
      slug: r.slug,
      basePrice: Number(r.base_price),
      estimatedDurationMin: Number(r.estimated_duration_min),
      categoryName: r.category_name,
      categorySlug: r.category_slug,
    }));
  } catch (err) {
    console.error('[data-service] getPublicServicePrices gagal:', err);
    return null;
  }
}

export async function getPublicApplianceCategories() {
  try {
    const rows = await query<any[]>(
      `SELECT id, name, slug, description 
       FROM appliance_categories 
       WHERE is_active = TRUE AND deleted_at IS NULL 
       ORDER BY id ASC`
    );
    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: Number(r.id),
        name: r.name,
        slug: r.slug,
        description: r.description,
      }));
    }
  } catch {
    // Fallback offline
  }

  return DEFAULT_FALLBACK_CATEGORIES.map(c => ({
    id: c.categoryId,
    name: c.categoryName,
    slug: c.categorySlug,
    description: c.description,
  }));
}

export function getAppGuide(topic?: string): { title: string; content: string } {
  const norm = (topic || '').toLowerCase();

  if (norm.includes('garansi') || norm.includes('warranty')) {
    return {
      title: 'Kebijakan Garansi 30 Hari BANTUIN',
      content: `Perlindungan Garansi Resmi BANTUIN:
- Berlaku selama 30 hari kalender setelah status pekerjaan selesai (completed).
- Mencakup pengerjaan ulang gratis untuk kerusakan atau keluhan yang sama pada unit yang sama.
- Klaim garansi dapat diajukan dengan mudah melalui menu 'Komplain & Garansi' pada detail pesanan di aplikasi.`,
    };
  }

  if (norm.includes('bayar') || norm.includes('metode') || norm.includes('biaya')) {
    return {
      title: 'Metode Pembayaran Resmi BANTUIN',
      content: `Metode Pembayaran yang Didukung:
1. QRIS: Mendukung semua e-wallet (GoPay, OVO, DANA, ShopeePay, LinkAja) dan Mobile Banking.
2. Virtual Account Bank: BCA, Mandiri, BNI, dan BRI.
3. Cash on Delivery (COD): Pembayaran tunai langsung ke teknisi mitra setelah unit selesai diperbaiki dan invoice resmi terbit.
Keamanan: Tidak ada biaya tersembunyi. Pelanggan hanya membayar sesuai nominal invoice resmi yang tercatat di aplikasi.`,
    };
  }

  if (norm.includes('daftar') || norm.includes('register') || norm.includes('otp')) {
    return {
      title: 'Panduan Pendaftaran & Verifikasi Akun',
      content: `Prosedur Pendaftaran Akun BANTUIN:
1. Buka menu Daftar dan masukkan Nama Lengkap, Email, serta Nomor WhatsApp aktif (+62...).
2. Sistem BANTUIN mengirimkan 6 digit kode OTP verifikasi resmi via WhatsApp melalui gateway Fonnte.
3. Masukkan kode OTP dalam waktu 5 menit untuk mengaktifkan akun Anda secara instan tanpa perlu kata sandi rumit.`,
    };
  }

  if (norm.includes('alur') || norm.includes('cara pesan') || norm.includes('proses')) {
    return {
      title: 'Alur Pemesanan Jasa Teknisi BANTUIN',
      content: `5 Langkah Mudah Memesan Teknisi BANTUIN:
1. Pilih Kategori: Tentukan perangkat (AC, Kulkas, Mesin Cuci, Pompa Air, TV, atau Alat Dapur).
2. Deskripsikan Gejala: Jelaskan kendala kerusakan dan lampirkan foto jika ada.
3. Tentukan Lokasi: Konfirmasi alamat penjemputan/kunjungan di peta.
4. Penugasan Mitra: BANTUIN mencocokkan teknisi tersertifikasi terdekat dalam radius layanan.
5. Inspeksi & Eksekusi: Teknisi datang melakukan inspeksi fisik, memberikan estimasi transparan, dan mengeksekusi perbaikan bergaransi 30 hari.`,
    };
  }

  if (norm.includes('batal') || norm.includes('cancel')) {
    return {
      title: 'Ketentuan Pembatalan Pesanan',
      content: `Kebijakan Pembatalan Pesanan BANTUIN:
- Pelanggan dapat membatalkan pesanan secara mandiri di aplikasi selama status pesanan masih 'submitted' atau 'assigned' sebelum teknisi berangkat ke lokasi.
- Jika teknisi sudah berada dalam perjalanan ('scheduled' / 'on_the_way') atau sedang melakukan diagnosa fisik, pembatalan dapat dikoordinasikan langsung melalui chat dengan teknisi atau bantuan admin.`,
    };
  }

  return {
    title: 'Tentang Aplikasi BANTUIN',
    content: `BANTUIN adalah platform solusi terpercaya untuk perbaikan dan perawatan peralatan elektronik rumah tangga di Indonesia.
Didukung mitra teknisi profesional tersertifikasi kompetensi (BNSP/BLK), transparansi estimasi biaya tanpa biaya tersembunyi, dan perlindungan garansi resmi 30 hari kalender.
Jam Layanan Operasional: Setiap hari pukul 08:00 - 20:00 WIB.`,
  };
}

// ============================================================================
// 2. DATA SERVICES KHUSUS CUSTOMER (ROW-LEVEL AUTHORIZATION)
// ============================================================================

export async function getCustomerProfile(userId: number) {
  try {
    const rows = await query<any[]>(
      `SELECT 
        u.id,
        u.email,
        u.phone_number,
        u.is_verified,
        u.status,
        u.created_at AS registered_at,
        cp.full_name,
        cp.default_address,
        cp.city,
        cp.postal_code,
        cp.latitude,
        cp.longitude
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       WHERE u.id = ? AND u.role = 'customer' AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (rows && rows.length > 0) {
      const r = rows[0];
      const isProfileComplete = Boolean(r.full_name && r.default_address && r.city);
      return {
        userId: r.id,
        fullName: r.full_name || 'Pelanggan BANTUIN',
        email: r.email,
        phoneNumber: r.phone_number,
        isVerified: Boolean(r.is_verified),
        status: r.status,
        registeredAt: r.registered_at,
        defaultAddress: r.default_address || 'Belum ada alamat tersimpan',
        city: r.city || '-',
        postalCode: r.postal_code || '-',
        isProfileComplete,
        updateProfileGuide: 'Anda dapat memperbarui profil dan alamat Anda melalui menu Pengaturan Profil di Dashboard Pelanggan.',
      };
    }
    // Pengguna tidak ditemukan (atau bukan customer): null, bukan profil demo.
    return null;
  } catch (err) {
    console.error('[data-service] getCustomerProfile gagal:', err);
    return null;
  }
}

export async function getCustomerRepairs(
  userId: number,
  options: { status?: string; limit?: number; offset?: number } = {}
) {
  const limit = Math.min(20, Math.max(1, options.limit || 5));
  const offset = Math.max(0, options.offset || 0);

  let statusFilterSql = '';
  const params: any[] = [userId];

  if (options.status) {
    statusFilterSql = 'AND rr.current_status = ?';
    params.push(options.status);
  }

  params.push(limit, offset);

  try {
    const rows = await query<any[]>(
      `SELECT 
        rr.id,
        rr.order_code,
        ac.name AS category_name,
        s.name AS service_name,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.address_text,
        rr.current_status,
        rr.created_at,
        rr.updated_at,
        tp.full_name AS technician_name,
        tp.rating_avg AS technician_rating,
        u_tech.phone_number AS technician_phone,
        inv.invoice_number,
        inv.total_amount,
        inv.status AS invoice_status,
        diag.total_estimate,
        diag.damage_details,
        diag.customer_approval
       FROM repair_requests rr
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       LEFT JOIN technician_assignments ta ON (ta.repair_request_id = rr.id AND ta.status IN ('accepted', 'completed'))
       LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
       LEFT JOIN users u_tech ON tp.user_id = u_tech.id
       LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
       LEFT JOIN repair_diagnoses diag ON diag.repair_request_id = rr.id
       WHERE rr.customer_id = ? AND rr.deleted_at IS NULL ${statusFilterSql}
       ORDER BY rr.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        orderCode: r.order_code,
        categoryName: r.category_name,
        serviceName: r.service_name || 'Diagnosis Mandiri & Penanganan Unit',
        device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
        problem: r.problem_description,
        address: r.address_text,
        status: r.current_status,
        technician: r.technician_name ? {
          name: r.technician_name,
          rating: Number(r.technician_rating || 5.0),
          phone: r.technician_phone || null,
        } : null,
        diagnosis: r.damage_details ? {
          details: r.damage_details,
          estimate: Number(r.total_estimate || 0),
          approvalStatus: r.customer_approval,
        } : null,
        invoice: r.invoice_number ? {
          invoiceNumber: r.invoice_number,
          totalAmount: Number(r.total_amount),
          status: r.invoice_status,
        } : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    // Tidak ada pesanan: [] (bukan pesanan demo).
    return [];
  } catch (err) {
    console.error('[data-service] getCustomerRepairs gagal:', err);
    return null;
  }
}

export async function getCustomerRepairDetail(userId: number, identifier: string | number) {
  const isNumeric = !isNaN(Number(identifier));
  const whereClause = isNumeric
    ? '(rr.id = ? OR rr.order_code = ?)'
    : 'rr.order_code = ?';
  const params = isNumeric ? [Number(identifier), String(identifier), userId] : [String(identifier), userId];

  try {
    const rows = await query<any[]>(
      `SELECT 
        rr.id,
        rr.order_code,
        ac.name AS category_name,
        s.name AS service_name,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.address_text,
        rr.current_status,
        rr.created_at,
        rr.updated_at,
        tp.full_name AS technician_name,
        tp.rating_avg AS technician_rating,
        u_tech.phone_number AS technician_phone,
        inv.invoice_number,
        inv.subtotal_labor,
        inv.subtotal_parts,
        inv.service_fee,
        inv.total_amount,
        inv.status AS invoice_status,
        inv.due_date,
        diag.damage_details,
        diag.labor_cost AS diag_labor,
        diag.parts_cost AS diag_parts,
        diag.total_estimate,
        diag.customer_approval,
        diag.approved_at,
        ts.scheduled_date,
        ts.time_slot_start,
        ts.time_slot_end,
        ts.status AS schedule_status
       FROM repair_requests rr
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       LEFT JOIN technician_assignments ta ON (ta.repair_request_id = rr.id AND ta.status IN ('accepted', 'completed'))
       LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
       LEFT JOIN users u_tech ON tp.user_id = u_tech.id
       LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
       LEFT JOIN repair_diagnoses diag ON diag.repair_request_id = rr.id
       LEFT JOIN technician_schedules ts ON ts.repair_request_id = rr.id
       WHERE ${whereClause} AND rr.customer_id = ? AND rr.deleted_at IS NULL
       LIMIT 1`,
      params
    );

    if (rows && rows.length > 0) {
      const r = rows[0];

      // Ambil linimasa status history
      const timeline = await query<any[]>(
        `SELECT previous_status, new_status, actor_role, notes, created_at
         FROM repair_status_history
         WHERE repair_request_id = ?
         ORDER BY created_at ASC`,
        [r.id]
      );

      return {
        id: r.id,
        orderCode: r.order_code,
        categoryName: r.category_name,
        serviceName: r.service_name || 'Diagnosis Mandiri',
        device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
        problem: r.problem_description,
        address: r.address_text,
        status: r.current_status,
        schedule: r.scheduled_date ? {
          date: r.scheduled_date,
          timeSlot: `${r.time_slot_start} - ${r.time_slot_end}`,
          status: r.schedule_status,
        } : null,
        technician: r.technician_name ? {
          name: r.technician_name,
          rating: Number(r.technician_rating || 5.0),
          phone: r.technician_phone,
        } : null,
        diagnosis: r.damage_details ? {
          damageDetails: r.damage_details,
          laborCost: Number(r.diag_labor || 0),
          partsCost: Number(r.diag_parts || 0),
          totalEstimate: Number(r.total_estimate || 0),
          approvalStatus: r.customer_approval,
          approvedAt: r.approved_at,
        } : null,
        invoice: r.invoice_number ? {
          invoiceNumber: r.invoice_number,
          subtotalLabor: Number(r.subtotal_labor),
          subtotalParts: Number(r.subtotal_parts),
          serviceFee: Number(r.service_fee),
          totalAmount: Number(r.total_amount),
          status: r.invoice_status,
          dueDate: r.due_date,
        } : null,
        timeline: (timeline || []).map(t => ({
          status: t.new_status,
          actor: t.actor_role,
          notes: t.notes,
          time: t.created_at,
        })),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    // Pesanan tidak ada, atau milik customer lain: null (bukan detail demo).
    return null;
  } catch (err) {
    console.error('[data-service] getCustomerRepairDetail gagal:', err);
    return null;
  }
}

export async function getCustomerInvoices(
  userId: number,
  options: { status?: 'unpaid' | 'paid' | 'cancelled' | 'refunded' } = {}
) {
  let statusClause = '';
  const params: any[] = [userId];

  if (options.status) {
    statusClause = 'AND inv.status = ?';
    params.push(options.status);
  }

  try {
    const rows = await query<any[]>(
      `SELECT 
        inv.id,
        inv.invoice_number,
        inv.repair_request_id,
        inv.subtotal_labor,
        inv.subtotal_parts,
        inv.service_fee,
        inv.discount_amount,
        inv.total_amount,
        inv.status,
        inv.due_date,
        inv.paid_at,
        inv.created_at,
        rr.order_code,
        ac.name AS category_name,
        p.payment_method,
        p.payment_status
       FROM invoices inv
       JOIN repair_requests rr ON inv.repair_request_id = rr.id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN payments p ON p.invoice_id = inv.id
       WHERE inv.customer_id = ? ${statusClause}
       ORDER BY inv.created_at DESC
       LIMIT 10`,
      params
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        invoiceNumber: r.invoice_number,
        orderCode: r.order_code,
        categoryName: r.category_name,
        laborCost: Number(r.subtotal_labor),
        partsCost: Number(r.subtotal_parts),
        serviceFee: Number(r.service_fee),
        totalAmount: Number(r.total_amount),
        status: r.status,
        dueDate: r.due_date,
        paidAt: r.paid_at,
        // N30: jangan menebak metode pembayaran — bila tidak ada baris
        // payment (LEFT JOIN menghasilkan NULL), laporkan "Tidak tercatat",
        // termasuk untuk invoice berstatus 'paid' (dulu ditebak "QRIS / VA").
        paymentMethod: r.payment_method || 'Tidak tercatat',
        paymentStatus: r.payment_status || r.status,
        createdAt: r.created_at,
      }));
    }
    // Tidak ada invoice: [] (bukan invoice demo).
    return [];
  } catch (err) {
    console.error('[data-service] getCustomerInvoices gagal:', err);
    return null;
  }
}

export async function getCustomerMessages(userId: number, orderCodeOrId: string | number) {
  const isNumeric = !isNaN(Number(orderCodeOrId));
  const whereClause = isNumeric
    ? '(rr.id = ? OR rr.order_code = ?)'
    : 'rr.order_code = ?';
  const params = isNumeric ? [Number(orderCodeOrId), String(orderCodeOrId), userId] : [String(orderCodeOrId), userId];

  try {
    const rows = await query<any[]>(
      `SELECT rcm.id, rcm.sender_id, rcm.content, rcm.message_type, rcm.is_read, rcm.created_at,
              u.role AS sender_role,
              CASE WHEN u.role = 'customer' THEN cp.full_name ELSE tp.full_name END AS sender_name
       FROM repair_chat_messages rcm
       JOIN repair_chat_rooms rcr ON rcm.chat_room_id = rcr.id
       JOIN repair_requests rr ON rcr.repair_request_id = rr.id
       JOIN users u ON rcm.sender_id = u.id
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN technician_profiles tp ON tp.user_id = u.id
       WHERE ${whereClause} AND rr.customer_id = ?
       ORDER BY rcm.created_at DESC
       LIMIT 5`,
      params
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        senderName: r.sender_name || (r.sender_role === 'customer' ? 'Anda' : 'Teknisi'),
        senderRole: r.sender_role,
        content: r.content,
        type: r.message_type,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
      }));
    }
    // Tidak ada pesan: [] (bukan pesan demo).
    return [];
  } catch (err) {
    console.error('[data-service] getCustomerMessages gagal:', err);
    return null;
  }
}

// ============================================================================
// 3. DATA SERVICES KHUSUS TECHNICIAN (ROW-LEVEL AUTHORIZATION)
// ============================================================================

export async function getTechnicianProfile(userId: number) {
  try {
    const rows = await query<any[]>(
      `SELECT 
        u.id, u.email, u.phone_number, u.status AS account_status,
        tp.full_name, tp.bio, tp.years_of_experience, tp.rating_avg, tp.rating_count,
        tp.is_available, tp.verified_status, tp.created_at AS joined_at
       FROM users u
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.id = ? AND u.role = 'technician' AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (rows && rows.length > 0) {
      const r = rows[0];

      // Ambil keahlian
      const specs = await query<any[]>(
        `SELECT ac.name 
         FROM technician_specializations ts
         JOIN appliance_categories ac ON ts.category_id = ac.id
         JOIN technician_profiles tp ON ts.technician_profile_id = tp.id
         WHERE tp.user_id = ?`,
        [userId]
      );

      // Ambil total pekerjaan yang diselesaikan
      const [completedCount]: any = await query<any[]>(
        `SELECT COUNT(*) AS total_completed 
         FROM technician_assignments 
         WHERE technician_id = ? AND status = 'completed'`,
        [userId]
      );

      return {
        userId: r.id,
        fullName: r.full_name || 'Mitra Teknisi',
        email: r.email,
        phoneNumber: r.phone_number,
        experienceYears: r.years_of_experience,
        ratingAvg: Number(r.rating_avg || 0),
        ratingCount: Number(r.rating_count || 0),
        isAvailable: Boolean(r.is_available),
        verifiedStatus: r.verified_status,
        specializations: (specs || []).map(s => s.name),
        totalCompletedJobs: Number(completedCount?.total_completed || 0),
        joinedAt: r.joined_at,
      };
    }
    // Teknisi tidak ditemukan: null, bukan profil demo.
    return null;
  } catch (err) {
    console.error('[data-service] getTechnicianProfile gagal:', err);
    return null;
  }
}

export async function getTechnicianAssignedTasks(
  userId: number,
  options: { status?: string; urgentOnly?: boolean; limit?: number } = {}
) {
  const limit = Math.min(20, Math.max(1, options.limit || 10));
  const params: any[] = [userId];

  let statusFilter = "AND ta.status IN ('offered', 'accepted', 'in_repair')";
  if (options.status) {
    statusFilter = 'AND ta.status = ?';
    params.push(options.status);
  }

  params.push(limit);

  try {
    const rows = await query<any[]>(
      `SELECT 
        ta.id AS assignment_id,
        ta.status AS assignment_status,
        ta.created_at AS offered_at,
        rr.id AS repair_id,
        rr.order_code,
        ac.name AS category_name,
        s.name AS service_name,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.address_text,
        rr.current_status AS order_status,
        rr.created_at AS order_created_at,
        COALESCE(cp.full_name, 'Pelanggan BANTUIN') AS customer_name,
        u_cust.phone_number AS customer_phone,
        ts.scheduled_date,
        ts.time_slot_start,
        ts.time_slot_end,
        ts.status AS schedule_status,
        diag.total_estimate,
        diag.damage_details,
        diag.customer_approval
       FROM technician_assignments ta
       JOIN repair_requests rr ON ta.repair_request_id = rr.id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       JOIN users u_cust ON rr.customer_id = u_cust.id
       LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
       LEFT JOIN technician_schedules ts ON ts.repair_request_id = rr.id
       LEFT JOIN repair_diagnoses diag ON diag.repair_request_id = rr.id
       WHERE ta.technician_id = ? AND rr.deleted_at IS NULL ${statusFilter}
       ORDER BY 
        CASE WHEN ta.status = 'offered' THEN 1 WHEN ta.status = 'accepted' THEN 2 ELSE 3 END,
        rr.created_at ASC
       LIMIT ?`,
      params
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        assignmentId: r.assignment_id,
        assignmentStatus: r.assignment_status,
        repairId: r.repair_id,
        orderCode: r.order_code,
        categoryName: r.category_name,
        serviceName: r.service_name || 'Servis & Penanganan Fisik',
        device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
        problem: r.problem_description,
        address: r.address_text,
        orderStatus: r.order_status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        schedule: r.scheduled_date ? `${r.scheduled_date} (${r.time_slot_start} - ${r.time_slot_end})` : 'Belum dijadwalkan',
        scheduleStatus: r.schedule_status || 'none',
        diagnosis: r.damage_details ? {
          damageDetails: r.damage_details,
          estimate: Number(r.total_estimate || 0),
          approvalStatus: r.customer_approval,
        } : null,
        orderCreatedAt: r.order_created_at,
      }));
    }
    // Tidak ada tugas: [] (bukan tugas demo).
    return [];
  } catch (err) {
    console.error('[data-service] getTechnicianAssignedTasks gagal:', err);
    return null;
  }
}

export async function getTechnicianPerformanceMetrics(userId: number) {
  try {
    const rows = await query<any[]>(
      `SELECT status, COUNT(*) AS count 
       FROM technician_assignments 
       WHERE technician_id = ? 
       GROUP BY status`,
      [userId]
    );

    const stats = {
      offered: 0,
      accepted: 0,
      completed: 0,
      rejected: 0,
      cancelled: 0,
      total: 0,
    };

    if (rows && rows.length > 0) {
      for (const r of rows) {
        const c = Number(r.count);
        stats.total += c;
        if (r.status === 'offered') stats.offered += c;
        if (r.status === 'accepted') stats.accepted += c;
        if (r.status === 'completed') stats.completed += c;
        if (r.status === 'rejected') stats.rejected += c;
        if (r.status === 'cancelled') stats.cancelled += c;
      }
    }

    // N12: "Rata-rata Waktu Penyelesaian" diukur dari riwayat status
    // (repair_status_history) — dari teknisi MENERIMA tawaran (responded_at,
    // fallback ke created_at penugasan bila kosong) sampai pesanan pertama
    // kali berstatus 'completed'. Rumus lama (created_at -> responded_at)
    // mengukur waktu RESPON tawaran, bukan waktu penyelesaian pekerjaan.
    // Bila tidak ada baris riwayat 'completed' (data lama sebelum history
    // ditulis), fallback ke updated_at pesanan yang sudah completed.
    const [durationRow]: any = await query<any[]>(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, COALESCE(ta.responded_at, ta.created_at), h.completed_at)) AS avg_hours
       FROM technician_assignments ta
       JOIN (
         SELECT repair_request_id, MIN(created_at) AS completed_at
         FROM repair_status_history
         WHERE new_status = 'completed'
         GROUP BY repair_request_id
       ) h ON h.repair_request_id = ta.repair_request_id
       WHERE ta.technician_id = ? AND ta.status = 'completed'`,
      [userId]
    );

    let avgHours = durationRow?.avg_hours != null ? Number(durationRow.avg_hours).toFixed(1) : null;

    if (avgHours === null) {
      const [fallbackRow]: any = await query<any[]>(
        `SELECT AVG(TIMESTAMPDIFF(HOUR, COALESCE(ta.responded_at, ta.created_at), rr.updated_at)) AS avg_hours
         FROM technician_assignments ta
         JOIN repair_requests rr ON rr.id = ta.repair_request_id
         WHERE ta.technician_id = ? AND ta.status = 'completed' AND rr.current_status = 'completed'`,
        [userId]
      );
      avgHours = fallbackRow?.avg_hours != null ? Number(fallbackRow.avg_hours).toFixed(1) : null;
    }

    // Statistik riil (0 bila teknisi belum punya tugas — bukan angka demo).
    return {
      stats,
      averageCompletionHours: avgHours ? `${avgHours} jam` : 'Belum ada data',
      pendingTasksCount: stats.offered + stats.accepted,
    };
  } catch (err) {
    console.error('[data-service] getTechnicianPerformanceMetrics gagal:', err);
    return null;
  }
}

// ============================================================================
// 4. DATA SERVICES KHUSUS ADMINISTRATOR (GLOBAL AUDIT & ANALYTICS)
// ============================================================================

export async function getAdminOperationalOverview() {
  try {
    const [counts]: any = await query<any[]>(
      `SELECT 
        COUNT(*) AS total_orders,
        SUM(CASE WHEN current_status = 'draft' THEN 1 ELSE 0 END) AS draft_count,
        SUM(CASE WHEN current_status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
        SUM(CASE WHEN current_status = 'assigned' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN current_status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
        SUM(CASE WHEN current_status = 'in_diagnosis' THEN 1 ELSE 0 END) AS in_diagnosis_count,
        SUM(CASE WHEN current_status = 'estimated' THEN 1 ELSE 0 END) AS estimated_count,
        SUM(CASE WHEN current_status = 'customer_approved' THEN 1 ELSE 0 END) AS customer_approved_count,
        SUM(CASE WHEN current_status = 'in_repair' THEN 1 ELSE 0 END) AS in_repair_count,
        SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN current_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN current_status = 'complained' THEN 1 ELSE 0 END) AS complained_count
       FROM repair_requests 
       WHERE deleted_at IS NULL`
    );

    const [activeTechs]: any = await query<any[]>(
      `SELECT COUNT(*) AS total_active_techs 
       FROM users 
       WHERE role = 'technician' AND status = 'active' AND deleted_at IS NULL`
    );

    const [activeCustomers]: any = await query<any[]>(
      `SELECT COUNT(*) AS total_active_customers 
       FROM users 
       WHERE role = 'customer' AND status = 'active' AND deleted_at IS NULL`
    );

    const [openComplaints]: any = await query<any[]>(
      `SELECT COUNT(*) AS total_open_complaints 
       FROM repair_complaints 
       WHERE status IN ('submitted', 'in_investigation')`
    );

    // N6: hitungan berfilter tanggal — D#1 menjawab "pesanan hari ini /
    // bulan ini" dengan angka ini, bukan total sepanjang masa.
    const [periodCounts]: any = await query<any[]>(
      `SELECT
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS month_count
       FROM repair_requests
       WHERE deleted_at IS NULL`
    );

    // Hitungan riil — termasuk 0 bila database kosong (bukan angka demo).
    // N19: rincian mencakup SELURUH nilai ENUM repair_requests.current_status
    // (draft, submitted, assigned, scheduled, in_diagnosis, estimated,
    // customer_approved, in_repair, completed, cancelled, complained)
    // sehingga jumlah rincian = total. Sebelumnya draft/estimated/
    // customer_approved hilang sehingga rincian < total.
    return {
      orders: {
        total: Number(counts?.total_orders || 0),
        draft: Number(counts?.draft_count || 0),
        submitted: Number(counts?.submitted_count || 0),
        assigned: Number(counts?.assigned_count || 0),
        scheduled: Number(counts?.scheduled_count || 0),
        inDiagnosis: Number(counts?.in_diagnosis_count || 0),
        estimated: Number(counts?.estimated_count || 0),
        customerApproved: Number(counts?.customer_approved_count || 0),
        inRepair: Number(counts?.in_repair_count || 0),
        completed: Number(counts?.completed_count || 0),
        cancelled: Number(counts?.cancelled_count || 0),
        complained: Number(counts?.complained_count || 0),
        // N6: pesanan yang DIBUAT hari ini / bulan kalender berjalan.
        today: Number(periodCounts?.today_count || 0),
        thisMonth: Number(periodCounts?.month_count || 0),
      },
      technicians: {
        active: Number(activeTechs?.total_active_techs || 0),
      },
      customers: {
        active: Number(activeCustomers?.total_active_customers || 0),
      },
      complaints: {
        active: Number(openComplaints?.total_open_complaints || 0),
      },
    };
  } catch (err) {
    console.error('[data-service] getAdminOperationalOverview gagal:', err);
    return null;
  }
}

export async function getAdminDelayedRepairs() {
  try {
    // N15: definisi "tertunda" per status, diukur dari saat pesanan MEMASUKI
    // statusnya saat ini (entri terakhir repair_status_history untuk status
    // itu; fallback ke created_at bila tidak ada riwayat). Definisi lama
    // (status IN (...) AND umur sejak dibuat >= 2 jam) salah dua arah:
    // pesanan in_repair 3 jam adalah pekerjaan normal, sementara pesanan
    // yang macet di in_diagnosis/estimated/customer_approved tidak pernah
    // muncul. Ambang per status (jam): submitted 24, assigned 24,
    // scheduled 48, in_diagnosis 48, estimated 48, customer_approved 72.
    // in_repair hanya tertunda bila melebihi estimasi durasi layanannya
    // (minimal 24 jam) — pekerjaan yang sedang berjalan bukan keterlambatan.
    const rows = await query<any[]>(
      `SELECT
        rr.id,
        rr.order_code,
        ac.name AS category_name,
        rr.current_status,
        rr.problem_description,
        rr.created_at,
        TIMESTAMPDIFF(HOUR, COALESCE(h.status_since, rr.created_at), NOW()) AS elapsed_hours,
        tp.full_name AS assigned_technician
       FROM repair_requests rr
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON s.id = rr.service_id
       LEFT JOIN (
         SELECT h1.repair_request_id, MAX(h1.created_at) AS status_since
         FROM repair_status_history h1
         JOIN repair_requests rr1 ON rr1.id = h1.repair_request_id
         WHERE h1.new_status = rr1.current_status
         GROUP BY h1.repair_request_id
       ) h ON h.repair_request_id = rr.id
       LEFT JOIN technician_assignments ta ON (ta.repair_request_id = rr.id AND ta.status IN ('accepted', 'offered'))
       LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
       WHERE rr.current_status IN ('submitted', 'assigned', 'scheduled', 'in_diagnosis', 'estimated', 'customer_approved', 'in_repair')
         AND rr.deleted_at IS NULL
         AND TIMESTAMPDIFF(HOUR, COALESCE(h.status_since, rr.created_at), NOW()) >= CASE rr.current_status
           WHEN 'submitted' THEN 24
           WHEN 'assigned' THEN 24
           WHEN 'scheduled' THEN 48
           WHEN 'in_diagnosis' THEN 48
           WHEN 'estimated' THEN 48
           WHEN 'customer_approved' THEN 72
           WHEN 'in_repair' THEN GREATEST(24, CEIL(COALESCE(s.estimated_duration_min, 60) / 30))
           ELSE 999999
         END
       ORDER BY rr.created_at ASC
       LIMIT 10`
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        orderCode: r.order_code,
        categoryName: r.category_name,
        status: r.current_status,
        problem: r.problem_description,
        elapsedHours: Number(r.elapsed_hours),
        technician: r.assigned_technician || 'Belum ada teknisi ditugaskan (Menunggu Penugasan)',
        cause: r.current_status === 'submitted'
          ? 'Belum ada teknisi yang menerima tawaran penugasan'
          : r.current_status === 'assigned'
          ? 'Sudah ditugaskan tetapi kunjungan belum dijadwalkan'
          : r.current_status === 'scheduled'
          ? 'Sudah dijadwalkan tetapi kunjungan belum terlaksana'
          : r.current_status === 'in_diagnosis'
          ? 'Diagnosis belum selesai'
          : r.current_status === 'estimated'
          ? 'Estimasi biaya belum diselesaikan'
          : r.current_status === 'customer_approved'
          ? 'Menunggu persetujuan/pembayaran pelanggan'
          : 'Pengerjaan melebihi estimasi durasi layanan',
      }));
    }
    // Tidak ada perbaikan tertunda: [] (bukan pesanan demo).
    return [];
  } catch (err) {
    console.error('[data-service] getAdminDelayedRepairs gagal:', err);
    return null;
  }
}

export async function getAdminTechnicianWorkload() {
  try {
    const rows = await query<any[]>(
      `SELECT 
        u.id AS technician_id,
        tp.full_name,
        tp.rating_avg,
        tp.rating_count,
        tp.is_available,
        COUNT(CASE WHEN ta.status IN ('offered', 'accepted') THEN 1 END) AS active_tasks,
        COUNT(CASE WHEN ta.status = 'completed' THEN 1 END) AS completed_tasks
       FROM users u
       JOIN technician_profiles tp ON u.id = tp.user_id
       LEFT JOIN technician_assignments ta ON u.id = ta.technician_id
       WHERE u.role = 'technician' AND u.deleted_at IS NULL
       GROUP BY u.id, tp.full_name, tp.rating_avg, tp.rating_count, tp.is_available
       ORDER BY active_tasks DESC, tp.rating_avg DESC
       LIMIT 10`
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        technicianId: r.technician_id,
        name: r.full_name || 'Mitra Teknisi',
        ratingAvg: Number(r.rating_avg || 0),
        ratingCount: Number(r.rating_count || 0),
        activeTasks: Number(r.active_tasks || 0),
        completedTasks: Number(r.completed_tasks || 0),
        isAvailable: Boolean(r.is_available),
      }));
    }
    // Tidak ada teknisi: [] (bukan teknisi demo).
    return [];
  } catch (err) {
    console.error('[data-service] getAdminTechnicianWorkload gagal:', err);
    return null;
  }
}

export async function getAdminFinancialAnalytics() {
  try {
    const [invoicesSummary]: any = await query<any[]>(
      `SELECT 
        COUNT(*) AS total_invoices,
        SUM(CASE WHEN status = 'unpaid' THEN total_amount ELSE 0 END) AS total_unpaid_amount,
        SUM(CASE WHEN status = 'paid' THEN service_fee ELSE 0 END) AS total_platform_fee
       FROM invoices`
    );

    // N31: pendapatan dihitung dari uang yang benar-benar masuk — pembayaran
    // berstatus 'settlement' dikurangi refund (payment_status 'refunded') —
    // BUKAN dari menjumlah invoice berstatus 'paid' saja. Invoice 'paid'
    // tanpa pembayaran settlement terkait (atau yang sudah di-refund) tidak
    // boleh dihitung sebagai pendapatan. Satu baris payments bertransisi
    // settlement -> refunded saat dana dikembalikan, sehingga selisih kedua
    // jumlah ini adalah pendapatan bersih yang diterima.
    // (Fallback demo dengan metode 'bank_transfer' di luar ENUM yang
    // disebut temuan sudah tidak ada — dihapus Batch 1 bersama seluruh
    // fallback demo transaksional; diverifikasi dengan grep.)
    const [revenueSummary]: any = await query<any[]>(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'settlement' THEN amount ELSE 0 END), 0) AS settled_total,
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN amount ELSE 0 END), 0) AS refunded_total
       FROM payments`
    );

    const paymentMethods = await query<any[]>(
      `SELECT payment_method, COUNT(*) AS count, SUM(amount) AS total_amount
       FROM payments
       WHERE payment_status = 'settlement'
       GROUP BY payment_method`
    );

    // Angka riil — termasuk 0 bila belum ada invoice (bukan angka demo).
    return {
      totalInvoices: Number(invoicesSummary?.total_invoices || 0),
      totalRevenuePaid: Number(revenueSummary?.settled_total || 0) - Number(revenueSummary?.refunded_total || 0),
      totalUnpaidAmount: Number(invoicesSummary?.total_unpaid_amount || 0),
      totalPlatformFee: Number(invoicesSummary?.total_platform_fee || 0),
      paymentMethodsBreakdown: (paymentMethods || []).map(p => ({
        method: p.payment_method,
        transactionCount: Number(p.count),
        volume: Number(p.total_amount),
      })),
    };
  } catch (err) {
    console.error('[data-service] getAdminFinancialAnalytics gagal:', err);
    return null;
  }
}

export async function getAdminSystemHealth() {
  const dbHealth = await checkDatabaseConnection();

  // Bila belum ada OTP sama sekali, laporkan 'tidak ada data' — bukan 'delivered'.
  let fonnteStatus: { lastStatus: string; lastAttempt: string | null; error: string | null } = {
    lastStatus: 'tidak ada data',
    lastAttempt: null,
    error: null,
  };

  try {
    const [lastOtp]: any = await query<any[]>(
      `SELECT delivery_status, created_at, delivery_error
       FROM user_otps
       ORDER BY id DESC
       LIMIT 1`
    );
    if (lastOtp) {
      fonnteStatus = {
        lastStatus: lastOtp.delivery_status,
        lastAttempt: lastOtp.created_at,
        error: lastOtp.delivery_error || null,
      };
    }
  } catch (err) {
    console.error('[data-service] getAdminSystemHealth gagal membaca user_otps:', err);
    fonnteStatus = { lastStatus: 'tidak diketahui', lastAttempt: null, error: 'database tidak dapat diakses' };
  }

  const geminiConfig = {
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10),
  };

  return {
    database: {
      connected: dbHealth.connected,
      latencyMs: dbHealth.latencyMs || 0,
      statusText: dbHealth.connected ? 'Operational (Connected)' : 'Degraded',
    },
    whatsappFonnte: fonnteStatus,
    geminiAi: geminiConfig,
    serverTime: new Date().toISOString(),
  };
}

export async function getAdminRecentAuditLogs(limitCount = 5) {
  const limit = Math.min(20, Math.max(1, limitCount));
  try {
    const rows = await query<any[]>(
      `SELECT aal.id, aal.action, aal.entity_name, aal.entity_id, aal.ip_address, aal.created_at,
              u.email AS admin_email
       FROM admin_audit_logs aal
       JOIN users u ON aal.admin_user_id = u.id
       ORDER BY aal.created_at DESC
       LIMIT ?`,
      [limit]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        action: r.action,
        entityName: r.entity_name,
        entityId: r.entity_id,
        adminEmail: r.admin_email,
        ipAddress: r.ip_address || '127.0.0.1',
        createdAt: r.created_at,
      }));
    }
    // Tidak ada log audit: [] (bukan log demo).
    return [];
  } catch (err) {
    console.error('[data-service] getAdminRecentAuditLogs gagal:', err);
    return null;
  }
}

export async function getAdminSystemSettings() {
  try {
    const rows = await query<any[]>(
      `SELECT setting_key, setting_value, value_type, group_name, description
       FROM system_settings
       ORDER BY group_name, setting_key ASC`
    );
    if (rows && rows.length > 0) {
      return rows.map(r => ({
        key: r.setting_key,
        value: r.setting_value,
        type: r.value_type,
        group: r.group_name,
        description: r.description,
      }));
    }
    // Tidak ada setting: [] (bukan setting demo).
    return [];
  } catch (err) {
    console.error('[data-service] getAdminSystemSettings gagal:', err);
    return null;
  }
}

export async function getAdminUserStats() {
  try {
    const rows = await query<any[]>(
      `SELECT role, status, COUNT(*) AS count
       FROM users
       WHERE deleted_at IS NULL
       GROUP BY role, status`
    );

    // Hitungan riil — 0 di semua bucket bila belum ada pengguna (bukan angka demo).
    // N19: bucket mencakup SELURUH nilai ENUM users.status (active,
    // inactive, suspended, pending_verification) sehingga jumlah bucket =
    // total per peran. Sebelumnya akun 'inactive' tidak muncul di bucket
    // mana pun.
    const stats = {
      totalUsers: 0,
      customers: { total: 0, active: 0, inactive: 0, pending: 0, suspended: 0 },
      technicians: { total: 0, active: 0, inactive: 0, pending: 0, suspended: 0 },
      admins: { total: 0, active: 0, inactive: 0 },
    };

    for (const r of rows || []) {
      const count = Number(r.count);
      stats.totalUsers += count;
      if (r.role === 'customer') {
        stats.customers.total += count;
        if (r.status === 'active') stats.customers.active += count;
        if (r.status === 'inactive') stats.customers.inactive += count;
        if (r.status === 'pending_verification') stats.customers.pending += count;
        if (r.status === 'suspended') stats.customers.suspended += count;
      } else if (r.role === 'technician') {
        stats.technicians.total += count;
        if (r.status === 'active') stats.technicians.active += count;
        if (r.status === 'inactive') stats.technicians.inactive += count;
        if (r.status === 'pending_verification') stats.technicians.pending += count;
        if (r.status === 'suspended') stats.technicians.suspended += count;
      } else if (r.role === 'admin') {
        stats.admins.total += count;
        if (r.status === 'active') stats.admins.active += count;
        if (r.status === 'inactive') stats.admins.inactive += count;
      }
    }

    return stats;
  } catch (err) {
    console.error('[data-service] getAdminUserStats gagal:', err);
    return null;
  }
}

// ============================================================================
// 5. DATA ANALISIS LANJUTAN ADMINISTRATOR
// ============================================================================

export async function getAdminCustomerAnalytics() {
  try {
    const [counts]: any = await query<any[]>(
      // N28: "Bulan Ini" = bulan kalender berjalan (sejak tanggal 1),
      // BUKAN 30 hari bergulir — label D#2 ("Pelanggan Baru Bulan Ini")
      // harus sesuai definisinya.
      `SELECT 
        COUNT(*) AS total_customers,
        SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS new_this_month
       FROM users WHERE role = 'customer' AND deleted_at IS NULL`
    );

    const recent = await query<any[]>(
      `SELECT u.id, u.email, u.phone_number, cp.full_name, cp.city, u.created_at
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       WHERE u.role = 'customer' AND u.deleted_at IS NULL
       ORDER BY u.created_at DESC LIMIT 5`
    );

    const pendingOrders = await query<any[]>(
      `SELECT rr.order_code, rr.current_status, rr.created_at, cp.full_name, u.phone_number, ac.name AS category_name
       FROM repair_requests rr
       JOIN users u ON rr.customer_id = u.id
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       WHERE rr.current_status IN ('submitted', 'assigned', 'scheduled', 'in_diagnosis', 'in_repair')
         AND rr.deleted_at IS NULL
       ORDER BY rr.created_at DESC LIMIT 5`
    );

    // Angka riil — 0 dan daftar kosong bila belum ada customer (bukan data demo).
    return {
      totalCustomers: Number(counts?.total_customers || 0),
      newCustomersThisMonth: Number(counts?.new_this_month || 0),
      recentCustomers: (recent || []).map(r => ({
        name: r.full_name || 'Pelanggan',
        email: r.email,
        phone: r.phone_number,
        city: r.city || '-',
        registeredAt: r.created_at,
      })),
      pendingOrders: (pendingOrders || []).map(p => ({
        orderCode: p.order_code,
        customerName: p.full_name || 'Pelanggan',
        phone: p.phone_number,
        category: p.category_name,
        status: p.current_status,
        createdAt: p.created_at,
      })),
    };
  } catch (err) {
    console.error('[data-service] getAdminCustomerAnalytics gagal:', err);
    return null;
  }
}

export async function getAdminOperationalReport() {
  try {
    // Perbandingan pesanan bulan berjalan vs bulan lalu (berdasarkan created_at).
    const [orderCounts]: any = await query<any[]>(
      `SELECT
        SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS current_orders,
        SUM(CASE WHEN created_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
                  AND created_at < DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS previous_orders
       FROM repair_requests
       WHERE deleted_at IS NULL`
    );

    // Pendapatan = invoice berstatus 'paid', dikelompokkan per bulan pembayaran (paid_at).
    const [revenue]: any = await query<any[]>(
      `SELECT
        SUM(CASE WHEN paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount ELSE 0 END) AS current_revenue,
        SUM(CASE WHEN paid_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
                  AND paid_at < DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount ELSE 0 END) AS previous_revenue
       FROM invoices
       WHERE status = 'paid'`
    );

    // Layanan paling diminati bulan berjalan (GROUP BY service_id, nama dari tabel services).
    const topServiceRows = await query<any[]>(
      `SELECT s.name AS service_name, COUNT(*) AS requests
       FROM repair_requests rr
       JOIN services s ON rr.service_id = s.id
       WHERE rr.deleted_at IS NULL
         AND rr.service_id IS NOT NULL
         AND rr.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY rr.service_id, s.name
       ORDER BY requests DESC
       LIMIT 5`
    );

    // Kendala yang dapat diukur dari data: dibatalkan & dikomplain bulan ini,
    // serta pesanan yang menunggu penugasan/penjadwalan lebih dari 24 jam.
    const [issueCounts]: any = await query<any[]>(
      `SELECT
        SUM(CASE WHEN current_status = 'cancelled' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS cancelled_this_month,
        SUM(CASE WHEN current_status = 'complained' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS complained_this_month,
        SUM(CASE WHEN current_status IN ('submitted', 'assigned', 'scheduled')
                  AND TIMESTAMPDIFF(HOUR, created_at, NOW()) >= 24 THEN 1 ELSE 0 END) AS delayed_over_24h
       FROM repair_requests
       WHERE deleted_at IS NULL`
    );

    const currentMonthOrders = Number(orderCounts?.current_orders || 0);
    const previousMonthOrders = Number(orderCounts?.previous_orders || 0);
    const currentMonthRevenue = Number(revenue?.current_revenue || 0);
    const previousMonthRevenue = Number(revenue?.previous_revenue || 0);

    const formatGrowth = (current: number, previous: number): string => {
      if (previous <= 0) return current > 0 ? 'n/a' : '0.0%';
      const pct = ((current - previous) / previous) * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    };
    const formatRupiah = (n: number): string => `Rp ${n.toLocaleString('id-ID')}`;

    const topServices = (topServiceRows || []).map(r => {
      const requests = Number(r.requests || 0);
      const share = currentMonthOrders > 0 ? `${((requests / currentMonthOrders) * 100).toFixed(1)}%` : '0.0%';
      return { name: r.service_name, requests, share };
    });

    // Kendala hanya dimunculkan bila benar-benar ada datanya (count > 0).
    const impactOf = (count: number): string => (count >= 10 ? 'Tinggi' : count >= 3 ? 'Menengah' : 'Rendah');
    const frequentIssues: Array<{ issue: string; count: number; impact: string }> = [];
    const cancelledCount = Number(issueCounts?.cancelled_this_month || 0);
    const complainedCount = Number(issueCounts?.complained_this_month || 0);
    const delayedCount = Number(issueCounts?.delayed_over_24h || 0);
    if (delayedCount > 0) {
      frequentIssues.push({
        issue: `${delayedCount} pesanan menunggu penugasan/penjadwalan lebih dari 24 jam`,
        count: delayedCount,
        impact: impactOf(delayedCount),
      });
    }
    if (cancelledCount > 0) {
      frequentIssues.push({
        issue: `${cancelledCount} pesanan dibatalkan pada bulan berjalan`,
        count: cancelledCount,
        impact: impactOf(cancelledCount),
      });
    }
    if (complainedCount > 0) {
      frequentIssues.push({
        issue: `${complainedCount} pesanan berstatus komplain pada bulan berjalan`,
        count: complainedCount,
        impact: impactOf(complainedCount),
      });
    }

    // Rekomendasi diturunkan dari angka di atas; kosong bila tidak ada kendala.
    const efficiencyRecommendations: string[] = [];
    if (delayedCount > 0) {
      efficiencyRecommendations.push(`Tinjau ketersediaan teknisi dan percepat penugasan untuk ${delayedCount} pesanan yang menunggu lebih dari 24 jam.`);
    }
    if (cancelledCount > 0) {
      efficiencyRecommendations.push(`Tinjau alasan pembatalan ${cancelledCount} pesanan bulan ini untuk menemukan pola yang bisa dicegah.`);
    }
    if (complainedCount > 0) {
      efficiencyRecommendations.push(`Tindak lanjuti ${complainedCount} komplain bulan ini dan tinjau kualitas pengerjaan pada pesanan terkait.`);
    }

    return {
      monthlyComparison: {
        currentMonthOrders,
        previousMonthOrders,
        growthPercent: formatGrowth(currentMonthOrders, previousMonthOrders),
        currentMonthRevenue: formatRupiah(currentMonthRevenue),
        previousMonthRevenue: formatRupiah(previousMonthRevenue),
        revenueGrowthPercent: formatGrowth(currentMonthRevenue, previousMonthRevenue),
      },
      topServices,
      frequentIssues,
      efficiencyRecommendations,
    };
  } catch (err) {
    console.error('[data-service] getAdminOperationalReport gagal:', err);
    return null;
  }
}

export async function getAdminNotificationStatus() {
  try {
    const [counts]: any = await query<any[]>(
      `SELECT
        COUNT(*) AS total_sent,
        SUM(CASE WHEN delivery_status = 'sent' THEN 1 ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) AS failed_count
       FROM user_otps`
    );

    const failedLogs = await query<any[]>(
      `SELECT target_phone, delivery_error, created_at
       FROM user_otps
       WHERE delivery_status = 'failed'
       ORDER BY created_at DESC LIMIT 5`
    );

    // Hitungan riil — 0 dan daftar kosong bila belum ada OTP (bukan data demo).
    return {
      totalSent: Number(counts?.total_sent || 0),
      delivered: Number(counts?.delivered_count || 0),
      failed: Number(counts?.failed_count || 0),
      failedLogs: (failedLogs || []).map(f => ({
        phone: f.target_phone,
        reason: f.delivery_error || 'Nomor WhatsApp tidak aktif atau timeout koneksi gateway Fonnte',
        createdAt: f.created_at,
      })),
    };
  } catch (err) {
    console.error('[data-service] getAdminNotificationStatus gagal:', err);
    return null;
  }
}

// ============================================================================
// 6. PANDUAN PEMBATALAN & KOMPLAIN CUSTOMER
// ============================================================================

export function getCustomerCancellationGuide(): { title: string; content: string } {
  return {
    title: 'Tata Cara & Kebijakan Pembatalan Pesanan BANTUIN',
    content: `Berikut prosedur resmi pembatalan pesanan di BANTUIN:
1. **Status Menunggu Penugasan (Submitted):**
   - Anda dapat membatalkan pesanan secara mandiri dengan membuka menu **Pesanan Saya** > pilih pesanan > klik tombol **Batalkan Pesanan**. Tanpa biaya pembatalan.
2. **Status Teknisi Ditugaskan (Assigned / Scheduled):**
   - Jika teknisi belum berangkat, pembatalan dapat dilakukan langsung di aplikasi tanpa penalti.
   - Jika teknisi sudah dalam perjalanan (On The Way) menuju lokasi Anda, mohon koordinasi melalui Chat Pesanan dengan teknisi atau hubungi Customer Support BANTUIN.
3. **Status Sedang Pengerjaan (In Repair):**
   - Pembatalan tidak dapat dilakukan sepihak jika komponen baru telah dipasang. Anda hanya dikenakan biaya inspeksi sesuai kesepakatan awal.`
  };
}

export function getCustomerComplaintGuide(): { title: string; content: string } {
  return {
    title: 'Tata Cara Pengajuan Keluhan & Klaim Garansi Resmi',
    content: `BANTUIN berkomitmen memberikan layanan terbaik dengan perlindungan garansi 30 hari kalender:
1. **Buka Menu Pesanan:** Pilih pesanan selesai yang mengalami kendala berulang.
2. **Ajukan Komplain:** Klik tombol **Ajukan Keluhan / Klaim Garansi**.
3. **Lampirkan Bukti:** Jelaskan kendala yang muncul kembali serta sertakan foto/video kondisi perangkat.
4. **Respon Cepat:** Tim kendali mutu BANTUIN akan meninjau dalam waktu maksimal 2 jam kerja dan menugaskan teknisi untuk inspeksi ulang tanpa biaya tambahan jika dalam masa garansi.`
  };
}

// ============================================================================
// 7. SOP & BANTUAN OPERASIONAL TEKNISI
// ============================================================================

export function getTechnicianSOP(topic?: string): { title: string; steps: string[] } {
  const norm = (topic || '').toLowerCase();

  if (norm.includes('terima') || norm.includes('penerimaan')) {
    return {
      title: 'SOP Penerimaan & Serah Terima Perangkat',
      steps: [
        '1. Ucapkan salam ramah dan tunjukkan kartu identitas mitra teknisi resmi BANTUIN kepada customer.',
        '2. Lakukan inspeksi visual menyeluruh pada bodi perangkat bersama customer (foto kondisi awal perangkat).',
        '3. Konfirmasi ulang gejala kerusakan dan riwayat pemakaian kepada customer.',
        '4. Jelaskan tahapan pemeriksaan awal dan perkiraan waktu inspeksi.',
        '5. Minta persetujuan customer sebelum membongkar penutup unit.'
      ]
    };
  }

  if (norm.includes('komponen') || norm.includes('ganti') || norm.includes('sparepart')) {
    return {
      title: 'SOP Penggantian Komponen & Suku Cadang',
      steps: [
        '1. Pastikan steker atau sumber daya listrik perangkat telah dimatikan secara total (Cabut MCB/Steker).',
        '2. Verifikasi kesesuaian tipe, voltase, dan spesifikasi suku cadang baru dengan standar pabrikan.',
        '3. Tunjukkan komponen rusak kepada customer dan jelaskan alasan teknis mengapa komponen tersebut harus diganti.',
        '4. Konfirmasi estimasi biaya suku cadang dan dapatkan persetujuan (Customer Approval) di aplikasi sebelum pemasangan.',
        '5. Pasang komponen baru dengan presisi, rapikan kabel, dan lakukan uji coba fungsi minimal 10 menit.',
        '6. Serahkan komponen bekas yang diganti kepada customer sebagai bukti transparansi.'
      ]
    };
  }

  if (norm.includes('tidak dapat') || norm.includes('gagal') || norm.includes('parah')) {
    return {
      title: 'SOP Penanganan Kerusakan yang Tidak Dapat Diperbaiki (Unrepairable)',
      steps: [
        '1. Jelaskan secara transparan kepada customer mengenai faktor kerusakan fatal (misal: kebocoran freon internal evaporator korosi parah atau modul PCB terbakar tanpa suku cadang).',
        '2. Dokumentasikan kondisi komponen rusak dengan foto jelas di aplikasi.',
        '3. Berikan saran alternatif yang objektif dan ekonomis bagi customer (misal: pertimbangan penggantian unit baru).',
        '4. Terbitkan laporan diagnosis resmi di aplikasi dengan status pembatalan teknis/selesai diagnosa.',
        '5. Kenakan hanya biaya jasa inspeksi standar sesuai tarif platform BANTUIN.'
      ]
    };
  }

  return {
    title: 'SOP Standar Pemeriksaan & Keselamatan Kerja Teknisi BANTUIN',
    steps: [
      '1. Kenakan APD standar dan alas kaki karet kering sebelum memeriksa unit.',
      '2. Matikan sumber daya listrik sebelum melakukan pengukuran komponen internal.',
      '3. Periksa tegangan stopkontak dan arus beban kerja (ampere kompresor/motor).',
      '4. Jelaskan hasil diagnosa dan estimasi biaya secara transparan di aplikasi.',
      '5. Bersihkan area kerja setelah pengerjaan selesai dan serahkan kartu garansi 30 hari BANTUIN.'
    ]
  };
}

// ============================================================================
// 8. DATABASE INTELLIGENCE: PENCARIAN & RETRIEVAL LINTAS TABEL
// ============================================================================

export interface DatabaseUserRecord {
  id: number;
  uuid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  role: 'customer' | 'technician' | 'admin';
  status: string;
  isVerified: boolean;
  city: string | null;
  address: string | null;
  technicianDetails?: {
    ratingAvg: number;
    ratingCount: number;
    isAvailable: boolean;
    yearsOfExperience: number;
  } | null;
  registeredAt: string;
}

/**
 * N14 — Escape karakter wildcard LIKE (`%`, `_`) pada istilah pencarian dari
 * pengguna, memakai `!` sebagai karakter escape (klausa LIKE yang memakai
 * hasil helper ini WAJIB menambahkan `ESCAPE '!'`). Tanpa escape, searchTerm
 * `%` cocok dengan SEMUA baris dan `_` cocok dengan satu karakter apa pun.
 * `!` dipilih sebagai karakter escape (bukan backslash) agar tidak ada
 * ambiguitas escaping bertingkat antara JavaScript dan MySQL.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

// N27 — Allowlist nilai status untuk filter pencarian (disalin dari ENUM di
// schema-registry.ts; nilai di luar daftar diabaikan tanpa filter —
// konsisten dengan pola options.role di searchDatabaseUsers).
const REPAIR_ORDER_STATUSES = new Set([
  'draft', 'submitted', 'assigned', 'scheduled', 'in_diagnosis', 'estimated',
  'customer_approved', 'in_repair', 'completed', 'cancelled', 'complained',
]);
const INVOICE_STATUSES = new Set(['unpaid', 'paid', 'cancelled', 'refunded']);

/**
 * Mencari data pengguna berdasarkan nomor telepon, email, nama, atau UUID
 */
export async function searchDatabaseUsers(
  searchTerm: string,
  options: { role?: string; limit?: number } = {}
): Promise<DatabaseUserRecord[]> {
  const cleanTerm = (searchTerm || '').trim();
  if (!cleanTerm) return [];

  const limit = Math.min(20, Math.max(1, options.limit || 5));
  const digitsOnly = cleanTerm.replace(/[^0-9]/g, '');
  const isPhone = digitsOnly.length >= 7;

  let phoneLike1 = cleanTerm;
  let phoneLike2 = cleanTerm;
  if (isPhone) {
    if (digitsOnly.startsWith('62')) {
      phoneLike1 = '0' + digitsOnly.slice(2);
      phoneLike2 = digitsOnly;
    } else if (digitsOnly.startsWith('0')) {
      phoneLike1 = '62' + digitsOnly.slice(1);
      phoneLike2 = digitsOnly;
    }
  }

  const phoneSuffixPattern = isPhone ? `%${escapeLikePattern(digitsOnly.slice(-10))}` : `%${escapeLikePattern(cleanTerm)}%`;
  const termPattern = `%${escapeLikePattern(cleanTerm)}%`;

  // N14: pencocokan telepon memakai sufiks AKHIR nomor (10 digit terakhir),
  // bukan `%8 digit%` di posisi mana pun (false positive antar-nomor yang
  // mengandung 8 digit yang sama di tengah). 10 digit terakhir sama untuk
  // semua format awalan (0…, 62…, +62…) sehingga pencocokan akhir
  // menoleransi perbedaan format tanpa mengorbankan presisi.

  // N14: hormati options.role (sebelumnya parameter diterima tetapi tidak
  // pernah dipakai di SQL, sehingga pemanggil yang memfilter peran tidak
  // mendapat filter itu). Allowlist ketat — nilai lain diabaikan.
  const roleFilter = options.role === 'admin' || options.role === 'customer' || options.role === 'technician'
    ? 'AND u.role = ?'
    : '';
  const roleParams: any[] = roleFilter ? [options.role] : [];

  try {
    const rows = await query<any[]>(
      `SELECT 
        u.id,
        u.uuid,
        u.email,
        u.phone_number,
        u.role,
        u.status,
        u.is_verified,
        u.created_at,
        COALESCE(cp.full_name, tp.full_name, 'Pengguna BANTUIN') AS full_name,
        cp.city,
        cp.default_address,
        tp.rating_avg,
        tp.rating_count,
        tp.is_available,
        tp.years_of_experience
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.deleted_at IS NULL
         ${roleFilter}
         AND (
           u.phone_number = ?
           OR u.phone_number = ?
           OR u.phone_number LIKE ? ESCAPE '!'
           OR u.email = ?
           OR u.email LIKE ? ESCAPE '!'
           OR u.uuid = ?
           OR cp.full_name LIKE ? ESCAPE '!'
           OR tp.full_name LIKE ? ESCAPE '!'
         )
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [...roleParams, cleanTerm, phoneLike1, phoneSuffixPattern, cleanTerm, termPattern, cleanTerm, termPattern, termPattern, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: Number(r.id),
        uuid: r.uuid,
        fullName: r.full_name,
        email: r.email,
        phoneNumber: r.phone_number,
        role: r.role,
        status: r.status,
        isVerified: Boolean(r.is_verified),
        city: r.city || null,
        address: r.default_address || null,
        technicianDetails: r.role === 'technician' ? {
          ratingAvg: Number(r.rating_avg || 0),
          ratingCount: Number(r.rating_count || 0),
          isAvailable: Boolean(r.is_available),
          yearsOfExperience: Number(r.years_of_experience || 0),
        } : null,
        registeredAt: r.created_at,
      }));
    }
    // Tidak ada pengguna yang cocok: [] (tanpa fallback data hardcoded).
    return [];
  } catch (err) {
    console.error('[data-service] searchDatabaseUsers gagal:', err);
    return [];
  }
}

/**
 * Mencari data pesanan perbaikan (repair_requests) dengan relasinya
 */
export async function searchDatabaseOrders(
  searchTerm: string,
  options: { status?: string; limit?: number } = {}
) {
  const cleanTerm = (searchTerm || '').trim();
  // N14: istilah kosong -> [] (konsisten dengan searchDatabaseUsers /
  // searchDatabaseTechnicians — tanpa ini pola `%%` mengembalikan semua
  // pesanan).
  if (!cleanTerm) return [];
  const limit = Math.min(20, Math.max(1, options.limit || 5));
  const termPattern = `%${escapeLikePattern(cleanTerm)}%`;

  // N27: hormati options.status (allowlist ENUM repair_requests.current_status;
  // nilai lain diabaikan tanpa filter). Sebelumnya parameter diterima tetapi
  // tidak pernah dipakai di SQL — pencarian dengan status 'completed' tetap
  // mengembalikan semua status.
  const statusFilter = options.status && REPAIR_ORDER_STATUSES.has(options.status)
    ? 'AND rr.current_status = ?'
    : '';
  const statusParams: any[] = statusFilter ? [options.status] : [];

  try {
    const rows = await query<any[]>(
      `SELECT 
        rr.id,
        rr.order_code,
        rr.current_status,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.address_text,
        rr.created_at,
        ac.name AS category_name,
        COALESCE(cp.full_name, 'Pelanggan') AS customer_name,
        u_cust.phone_number AS customer_phone,
        tp.full_name AS technician_name,
        tp.rating_avg AS technician_rating,
        inv.invoice_number,
        inv.total_amount AS invoice_total,
        inv.status AS invoice_status,
        diag.total_estimate,
        diag.damage_details
       FROM repair_requests rr
       JOIN appliance_categories ac ON rr.category_id = ac.id
       JOIN users u_cust ON rr.customer_id = u_cust.id
       LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
       LEFT JOIN technician_assignments ta ON (ta.repair_request_id = rr.id AND ta.status IN ('accepted', 'completed'))
       LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
       LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
       LEFT JOIN repair_diagnoses diag ON diag.repair_request_id = rr.id
       WHERE rr.deleted_at IS NULL
         ${statusFilter}
         AND (
           rr.order_code = ?
           OR rr.order_code LIKE ? ESCAPE '!'
           OR cp.full_name LIKE ? ESCAPE '!'
           OR u_cust.phone_number LIKE ? ESCAPE '!'
           OR ac.name LIKE ? ESCAPE '!'
           OR rr.problem_description LIKE ? ESCAPE '!'
         )
       ORDER BY rr.created_at DESC
       LIMIT ?`,
      [...statusParams, cleanTerm, termPattern, termPattern, termPattern, termPattern, termPattern, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        orderCode: r.order_code,
        category: r.category_name,
        device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
        status: r.current_status,
        problem: r.problem_description,
        address: r.address_text,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        technicianName: r.technician_name || 'Belum ditugaskan',
        technicianRating: r.technician_rating ? Number(r.technician_rating) : null,
        invoiceNumber: r.invoice_number || null,
        totalAmount: r.invoice_total ? Number(r.invoice_total) : (r.total_estimate ? Number(r.total_estimate) : null),
        invoiceStatus: r.invoice_status || 'Belum terbit',
        createdAt: r.created_at,
      }));
    }
    // Tidak ada pesanan yang cocok: [] (tanpa fallback data hardcoded).
    return [];
  } catch (err) {
    console.error('[data-service] searchDatabaseOrders gagal:', err);
    return [];
  }
}

/**
 * Mencari data teknisi spesialis berdasarkan kategori dan kesiapan.
 *
 * N16 — Dua perbaikan atas perilaku lama:
 * 1. searchTerm kosong/blank mengembalikan [] (seperti searchDatabaseUsers),
 *    bukan 5 teknisi rating tertinggi (pola LIKE `%%` lama).
 * 2. Hanya teknisi `verified_status = 'verified'` yang dikembalikan, kecuali
 *    pemanggil secara eksplisit meminta semua lewat `includeUnverified`.
 *    Opsi itu HANYA boleh diisi tools.ts untuk peran admin (lihat
 *    executeRoleBasedTool) — argumen mentah dari AI tidak pernah
 *    diteruskan langsung, agar tamu tidak bisa meminta daftar teknisi
 *    pending/rejected/suspended.
 * Hasil menyertakan `specializations` (nama kategori keahlian) agar tools.ts
 * dapat menyusun tampilan publik yang aman (nama/rating/spesialisasi) tanpa
 * telepon/email untuk peran non-admin (T8).
 */
export async function searchDatabaseTechnicians(
  searchTerm?: string,
  options: { categoryName?: string; limit?: number; includeUnverified?: boolean } = {}
) {
  const cleanTerm = (searchTerm || '').trim();
  // N16: istilah kosong -> [] (jangan kembalikan teknisi apa pun).
  if (!cleanTerm) return [];

  const limit = Math.min(20, Math.max(1, options.limit || 5));
  const termPattern = `%${escapeLikePattern(cleanTerm)}%`;
  // N16: filter verifikasi default; hanya admin eksplisit yang boleh
  // melihat teknisi belum terverifikasi/ditolak/ditangguhkan.
  const verifiedFilter = options.includeUnverified === true
    ? ''
    : `AND tp.verified_status = 'verified'`;

  // N27: hormati options.categoryName — teknisi harus punya spesialisasi di
  // kategori bernama itu (nama dicocokkan persis, diparameterisasi).
  // Nama kategori bukan ENUM sehingga tidak ada allowlist statis; nama yang
  // tidak ada di appliance_categories secara alami tidak cocok dengan
  // teknisi mana pun (hasil []). Nilai kosong/blank diabaikan (tanpa filter).
  const cleanCategory = (options.categoryName || '').trim();
  const categoryFilter = cleanCategory
    ? `AND EXISTS (
         SELECT 1 FROM technician_specializations tsf
         JOIN appliance_categories acf ON tsf.category_id = acf.id
         WHERE tsf.technician_profile_id = tp.id AND acf.name = ?
       )`
    : '';
  const categoryParams: any[] = cleanCategory ? [cleanCategory] : [];

  try {
    const rows = await query<any[]>(
      `SELECT
        tp.id,
        tp.user_id,
        tp.full_name,
        tp.years_of_experience,
        tp.rating_avg,
        tp.rating_count,
        tp.is_available,
        tp.verified_status,
        u.phone_number,
        u.email,
        (SELECT GROUP_CONCAT(ac2.name SEPARATOR ', ')
         FROM technician_specializations ts2
         JOIN appliance_categories ac2 ON ts2.category_id = ac2.id
         WHERE ts2.technician_profile_id = tp.id) AS specializations
       FROM technician_profiles tp
       JOIN users u ON tp.user_id = u.id
       WHERE u.deleted_at IS NULL
         ${verifiedFilter}
         ${categoryFilter}
         AND (
           tp.full_name LIKE ? ESCAPE '!'
           OR u.phone_number LIKE ? ESCAPE '!'
           OR u.email LIKE ? ESCAPE '!'
         )
       ORDER BY tp.rating_avg DESC, tp.rating_count DESC
       LIMIT ?`,
      [...categoryParams, termPattern, termPattern, termPattern, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        technicianId: r.user_id,
        name: r.full_name,
        phone: r.phone_number,
        email: r.email,
        experienceYears: r.years_of_experience,
        rating: Number(r.rating_avg || 0),
        reviewsCount: Number(r.rating_count || 0),
        isAvailable: Boolean(r.is_available),
        verifiedStatus: r.verified_status,
        specializations: r.specializations
          ? String(r.specializations).split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      }));
    }
    // Tidak ada teknisi yang cocok: [] (tanpa fallback data hardcoded).
    return [];
  } catch (err) {
    console.error('[data-service] searchDatabaseTechnicians gagal:', err);
    return [];
  }
}

/**
 * Mencari data tagihan invoice berdasarkan kode invoice atau kode pesanan
 */
export async function searchDatabaseInvoices(
  searchTerm: string,
  options: { status?: string; limit?: number } = {}
) {
  const cleanTerm = (searchTerm || '').trim();
  // N14: istilah kosong -> [] (konsisten dengan searchDatabaseUsers /
  // searchDatabaseTechnicians — tanpa ini pola `%%` mengembalikan semua
  // invoice).
  if (!cleanTerm) return [];
  const limit = Math.min(20, Math.max(1, options.limit || 5));
  const termPattern = `%${escapeLikePattern(cleanTerm)}%`;

  // N27: hormati options.status (allowlist ENUM invoices.status; nilai lain
  // diabaikan tanpa filter). Kelompok OR dibungkus kurung — tanpa kurung,
  // `AND inv.status = ?` hanya mengikat suku OR terakhir (presedensi AND
  // lebih tinggi dari OR) dan filter menjadi salah.
  const statusFilter = options.status && INVOICE_STATUSES.has(options.status)
    ? 'AND inv.status = ?'
    : '';
  const statusParams: any[] = statusFilter ? [options.status] : [];

  try {
    const rows = await query<any[]>(
      `SELECT 
        inv.id,
        inv.invoice_number,
        inv.subtotal_labor,
        inv.subtotal_parts,
        inv.service_fee,
        inv.total_amount,
        inv.status,
        inv.due_date,
        inv.paid_at,
        rr.order_code,
        ac.name AS category_name,
        COALESCE(cp.full_name, 'Pelanggan') AS customer_name,
        u.phone_number AS customer_phone
       FROM invoices inv
       JOIN repair_requests rr ON inv.repair_request_id = rr.id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       JOIN users u ON inv.customer_id = u.id
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       WHERE (inv.invoice_number = ?
          OR inv.invoice_number LIKE ? ESCAPE '!'
          OR rr.order_code = ?
          OR rr.order_code LIKE ? ESCAPE '!'
          OR cp.full_name LIKE ? ESCAPE '!'
          OR u.phone_number LIKE ? ESCAPE '!')
         ${statusFilter}
       ORDER BY inv.created_at DESC
       LIMIT ?`,
      [...statusParams, cleanTerm, termPattern, cleanTerm, termPattern, termPattern, termPattern, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        invoiceNumber: r.invoice_number,
        orderCode: r.order_code,
        category: r.category_name,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        laborCost: Number(r.subtotal_labor),
        partsCost: Number(r.subtotal_parts),
        serviceFee: Number(r.service_fee),
        totalAmount: Number(r.total_amount),
        status: r.status,
        dueDate: r.due_date,
        paidAt: r.paid_at,
      }));
    }
    // Tidak ada invoice yang cocok: [] (tanpa fallback data hardcoded).
    return [];
  } catch (err) {
    console.error('[data-service] searchDatabaseInvoices gagal:', err);
    return [];
  }
}


// ============================================================================
// 12. KUERI TERJAGA UNTUK AI (GOVERNED DATABASE QUERY)
// ============================================================================
// Satu-satunya jalur bagi AI untuk membaca tabel mana pun secara umum.
// Keamanan ditegakkan di SERVER (bukan di prompt):
// 1. Tabel & kolom HARUS ada di BANTUIN_SCHEMA_REGISTRY (allowlist).
// 2. Kolom isSensitive TIDAK PERNAH dikembalikan (password_hash, otp_hash,
//    token_hash, gateway_response_json).
// 3. Hanya SELECT. Tidak ada INSERT/UPDATE/DELETE, tidak ada SQL mentah dari AI.
// 4. Row-level scoping: peran non-admin dipaksa filter owner
//    (user_id / customer_id / technician_id / complainant_user_id).
// 5. Semua nilai diparameterisasi (?); semua identifier dikutip dari registry.
// 6. JOIN hanya lewat relasi yang dideklarasikan di registry.

export interface GovernedQueryFilter {
  column: string; // 'kolom' atau 'tabel.kolom'
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN';
  value: string | number;
}

/**
 * N23 — Spesifikasi satu JOIN. Bentuk string ('nama_tabel') mempertahankan
 * perilaku lama: relasi pertama yang dideklarasikan di registry. Bentuk
 * objek memungkinkan pemilihan relasi secara eksplisit lewat `via` (nama
 * kolom FK, mis. 'technician_id', atau 'tabel.kolom') — wajib bila dua
 * tabel punya lebih dari satu relasi (mis. repair_reviews -> users punya
 * customer_id DAN technician_id; tanpa `via`, JOIN selalu memakai
 * customer_id sehingga AI yang meminta data teknisi penilai diam-diam
 * mendapat data pelanggan pemberi ulasan).
 * Batasan: satu tabel target hanya bisa di-JOIN sekali per kueri (tidak ada
 * aliasing) — `via` memilih relasi mana yang dipakai untuk JOIN tunggal
 * itu, bukan menambahkan JOIN kedua ke tabel yang sama.
 */
export interface GovernedJoinSpec {
  table: string;
  via?: string;
}

export interface GovernedQuerySpec {
  table: string;
  columns?: string[]; // 'kolom' atau 'tabel.kolom'; kosong = semua kolom non-sensitif
  joins?: Array<string | GovernedJoinSpec>; // nama tabel, atau { table, via }
  filters?: GovernedQueryFilter[];
  aggregate?: { function: 'count' | 'sum' | 'avg' | 'min' | 'max'; column?: string };
  groupBy?: string; // 'kolom' atau 'tabel.kolom'
  orderBy?: { column: string; direction?: 'ASC' | 'DESC' };
  limit?: number; // default 20, maks 100
}

export interface GovernedQueryResult {
  success: boolean;
  data?: { table: string; rows: any[]; rowCount: number };
  error?: string;
}

// Tabel yang boleh dibaca tamu (publik).
const PUBLIC_TABLES = new Set(['appliance_categories', 'services']);

const ALLOWED_OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN']);
const ALLOWED_AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

function resolveTable(name: string): TableMetadata | null {
  if (typeof name !== 'string') return null;
  const clean = name.trim();
  if (!/^[a-z_][a-z0-9_]*$/.test(clean)) return null;
  return BANTUIN_SCHEMA_REGISTRY[clean] || null;
}

function resolveColumn(table: TableMetadata, col: string): { name: string; sensitive: boolean } | null {
  if (typeof col !== 'string') return null;
  const clean = col.trim();
  if (!/^[a-z_][a-z0-9_]*$/.test(clean)) return null;
  const meta = table.columns.find((c) => c.name === clean);
  if (!meta) return null;
  return { name: meta.name, sensitive: Boolean(meta.isSensitive) };
}

// 'kolom' atau 'tabel.kolom' -> { table, column }. Menolak kolom sensitif.
function parseQualifiedColumn(
  ref: string,
  base: TableMetadata,
  joined: Map<string, TableMetadata>
): { table: TableMetadata; column: string } | null {
  if (typeof ref !== 'string') return null;
  const parts = ref.trim().split('.');
  if (parts.length === 1) {
    const col = resolveColumn(base, parts[0]);
    if (!col || col.sensitive) return null;
    return { table: base, column: col.name };
  }
  if (parts.length === 2) {
    const tbl = parts[0] === base.tableName ? base : joined.get(parts[0]);
    if (!tbl) return null;
    const col = resolveColumn(tbl, parts[1]);
    if (!col || col.sensitive) return null;
    return { table: tbl, column: col.name };
  }
  return null;
}

function isTableAllowedForRole(table: TableMetadata, role: string): boolean {
  if (role === 'admin') return true;
  if (role === 'guest') return PUBLIC_TABLES.has(table.tableName);
  if (PUBLIC_TABLES.has(table.tableName)) return true;
  const owner = table.ownerForeignKey;
  if (!owner) return false;
  if (role === 'customer') return owner === 'user_id' || owner === 'customer_id' || owner === 'complainant_user_id';
  if (role === 'technician') return owner === 'technician_id' || owner === 'user_id';
  return false;
}

// Mengubah satu deklarasi relasi menjadi klausa ON (dengan backtick).
// Menangani dua format foreignKey di registry: 'tabel.kolom' dan 'kolom' saja
// (kolom tanpa tabel: one-to-many -> FK ada di target; selain itu di declaring table).
function relationToOnClause(
  declaring: TableMetadata,
  rel: { targetTable: string; relationshipType: string; foreignKey: string },
  base: TableMetadata,
  target: TableMetadata
): string | null {
  const relTarget = BANTUIN_SCHEMA_REGISTRY[rel.targetTable];
  if (!relTarget) return null;
  const parts = rel.foreignKey.split('.');
  let fkTable: TableMetadata | null = null;
  let fkCol = '';
  if (parts.length === 2) {
    fkCol = parts[1];
    if (parts[0] === base.tableName) fkTable = base;
    else if (parts[0] === target.tableName) fkTable = target;
    else return null;
  } else if (parts.length === 1) {
    fkCol = parts[0];
    fkTable = rel.relationshipType === 'one-to-many' ? relTarget : declaring;
    if (fkTable.tableName !== base.tableName && fkTable.tableName !== target.tableName) return null;
  } else {
    return null;
  }
  if (!fkTable.columns.some((c) => c.name === fkCol)) return null;
  const pkTable = fkTable.tableName === base.tableName ? target : base;
  return `\`${fkTable.tableName}\`.\`${fkCol}\` = \`${pkTable.tableName}\`.\`${pkTable.primaryKey}\``;
}

// Cari relasi langsung antara dua tabel (satu hop); kembalikan klausa ON atau null.
// N23: bila `via` diisi (nama kolom FK, mis. 'technician_id' atau
// 'repair_reviews.technician_id'), HANYA relasi yang foreignKey-nya cocok
// yang dipakai — divalidasi terhadap registry; bila tidak ada relasi yang
// cocok, kembalikan null (pemanggil menolak kueri dengan error, tidak
// pernah diam-diam memakai relasi lain). Bila `via` kosong, perilaku lama:
// relasi pertama yang dideklarasikan.
function resolveJoinOn(base: TableMetadata, target: TableMetadata, via?: string): string | null {
  const viaCol = via ? via.trim().split('.').pop() : null;
  const matchesVia = (rel: { foreignKey: string }): boolean => {
    if (!viaCol) return true;
    return rel.foreignKey.split('.').pop() === viaCol;
  };
  const fromBase = base.relations.find((r) => r.targetTable === target.tableName && matchesVia(r));
  if (fromBase) {
    const on = relationToOnClause(base, fromBase, base, target);
    if (on) return on;
  }
  const fromTarget = target.relations.find((r) => r.targetTable === base.tableName && matchesVia(r));
  if (fromTarget) {
    const on = relationToOnClause(target, fromTarget, base, target);
    if (on) return on;
  }
  return null;
}

// Cari jalur JOIN base -> target, maksimal 2 hop lewat satu tabel perantara.
// Mengembalikan daftar langkah { table, on } atau null bila tidak ada jalur.
function findJoinPath(
  base: TableMetadata,
  target: TableMetadata,
  role: string
): Array<{ table: TableMetadata; on: string }> | null {
  const direct = resolveJoinOn(base, target);
  if (direct) return [{ table: target, on: direct }];
  const candidates = new Set<string>();
  for (const rel of base.relations) candidates.add(rel.targetTable);
  for (const [name, tbl] of Object.entries(BANTUIN_SCHEMA_REGISTRY)) {
    if (tbl.relations.some((r) => r.targetTable === base.tableName)) candidates.add(name);
  }
  for (const midName of candidates) {
    if (midName === base.tableName || midName === target.tableName) continue;
    const mid = BANTUIN_SCHEMA_REGISTRY[midName];
    if (!mid || !isTableAllowedForRole(mid, role)) continue;
    const on1 = resolveJoinOn(base, mid);
    if (!on1) continue;
    const on2 = resolveJoinOn(mid, target);
    if (!on2) continue;
    return [
      { table: mid, on: on1 },
      { table: target, on: on2 },
    ];
  }
  return null;
}

// Membangun SQL SELECT dari spesifikasi (fungsi murni — tidak menyentuh DB).
// Mengembalikan { sql, params } atau { error }.
export function buildGovernedQuerySQL(
  spec: GovernedQuerySpec,
  userContext: ChatUserContext
): { sql: string; params: any[] } | { error: string } {
  const role = userContext.role || 'guest';

  if (!spec || typeof spec !== 'object') return { error: 'Spesifikasi kueri tidak valid.' };
  const base = resolveTable(spec.table);
  if (!base) return { error: `Tabel '${spec.table}' tidak dikenal.` };
  if (!isTableAllowedForRole(base, role)) {
    return { error: `Akses ditolak: peran ${role} tidak diizinkan membaca tabel ${base.tableName}.` };
  }

  // JOIN (hanya lewat relasi registry, maksimal 2 hop)
  const joined = new Map<string, TableMetadata>();
  const joinClauses: string[] = [];
  for (const joinEntry of spec.joins || []) {
    // N23: entri JOIN boleh berupa string ('tabel') atau objek
    // ({ table, via }) — `via` memilih FK eksplisit (lihat GovernedJoinSpec).
    const joinName = typeof joinEntry === 'string' ? joinEntry : (joinEntry as GovernedJoinSpec)?.table;
    const via = typeof joinEntry === 'string' ? undefined : (joinEntry as GovernedJoinSpec)?.via;
    const target = resolveTable(joinName as string);
    if (!target) return { error: `Tabel JOIN '${joinName}' tidak dikenal.` };
    if (target.tableName === base.tableName) return { error: 'Tidak dapat JOIN tabel ke dirinya sendiri.' };
    if (joined.has(target.tableName)) continue;
    if (!isTableAllowedForRole(target, role)) {
      return { error: `Akses ditolak: peran ${role} tidak diizinkan membaca tabel ${target.tableName}.` };
    }
    let path: Array<{ table: TableMetadata; on: string }> | null;
    if (via) {
      // Relasi eksplisit: hanya hop langsung yang memakai FK itu yang sah.
      // Jangan jatuh ke jalur 2-hop — itu akan diam-diam mengabaikan `via`.
      if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(via.trim())) {
        return { error: `Relasi JOIN '${via}' tidak valid.` };
      }
      const directOn = resolveJoinOn(base, target, via);
      if (!directOn) {
        return { error: `Relasi '${via}' antara ${base.tableName} dan ${target.tableName} tidak ditemukan di skema.` };
      }
      path = [{ table: target, on: directOn }];
    } else {
      path = findJoinPath(base, target, role);
      if (!path) return { error: `Tidak ada relasi antara ${base.tableName} dan ${target.tableName}.` };
    }
    for (const step of path) {
      if (joined.has(step.table.tableName)) continue;
      if (!isTableAllowedForRole(step.table, role)) {
        return { error: `Akses ditolak: peran ${role} tidak diizinkan membaca tabel ${step.table.tableName}.` };
      }
      joined.set(step.table.tableName, step.table);
      joinClauses.push(`LEFT JOIN \`${step.table.tableName}\` ON ${step.on}`);
    }
  }

  // Validasi GROUP BY lebih dulu (dipakai SELECT dan klausa GROUP BY)
  let groupCol: { table: TableMetadata; column: string } | null = null;
  if (spec.groupBy) {
    groupCol = parseQualifiedColumn(spec.groupBy, base, joined);
    if (!groupCol) return { error: `Kolom GROUP BY '${spec.groupBy}' tidak valid atau sensitif.` };
  }

  // SELECT
  const params: any[] = [];
  let selectClause: string;
  if (spec.aggregate) {
    const fn = String(spec.aggregate.function || '').toLowerCase();
    if (!ALLOWED_AGGREGATES.has(fn)) return { error: `Fungsi agregasi '${spec.aggregate.function}' tidak diizinkan.` };
    if (fn === 'count' && !spec.aggregate.column) {
      selectClause = 'COUNT(*) AS `value`';
    } else {
      if (!spec.aggregate.column) return { error: `Agregasi ${fn} membutuhkan kolom.` };
      const col = parseQualifiedColumn(spec.aggregate.column, base, joined);
      if (!col) return { error: `Kolom agregasi '${spec.aggregate.column}' tidak valid atau sensitif.` };
      selectClause = `${fn.toUpperCase()}(\`${col.table.tableName}\`.\`${col.column}\`) AS \`value\``;
    }
    if (groupCol) {
      selectClause = `\`${groupCol.table.tableName}\`.\`${groupCol.column}\` AS \`group_value\`, ${selectClause}`;
    }
  } else {
    const cols = spec.columns && spec.columns.length > 0
      ? spec.columns
      : base.columns.filter((c) => !c.isSensitive).map((c) => c.name);
    const selectParts: string[] = [];
    for (const ref of cols) {
      const col = parseQualifiedColumn(ref, base, joined);
      if (!col) return { error: `Kolom '${ref}' tidak valid atau sensitif.` };
      const alias = col.table.tableName === base.tableName ? col.column : `${col.table.tableName}_${col.column}`;
      selectParts.push(`\`${col.table.tableName}\`.\`${col.column}\` AS \`${alias}\``);
    }
    selectClause = selectParts.join(', ');
  }

  // WHERE (filter + row-level scoping)
  const whereParts: string[] = [];
  for (const f of spec.filters || []) {
    if (!f || typeof f !== 'object') return { error: 'Filter tidak valid.' };
    const col = parseQualifiedColumn(f.column, base, joined);
    if (!col) return { error: `Kolom filter '${f.column}' tidak valid atau sensitif.` };
    const op = String(f.operator || '').toUpperCase();
    if (!ALLOWED_OPERATORS.has(op)) return { error: `Operator '${f.operator}' tidak diizinkan.` };
    const qcol = `\`${col.table.tableName}\`.\`${col.column}\``;
    if (op === 'IN') {
      const raw = String(f.value ?? '');
      const items = raw.split(',').map((s) => s.trim()).filter((s) => s !== '').slice(0, 50);
      if (items.length === 0) return { error: 'Operator IN membutuhkan minimal satu nilai.' };
      whereParts.push(`${qcol} IN (${items.map(() => '?').join(', ')})`);
      params.push(...items);
    } else if (op === 'LIKE') {
      // N14: nilai LIKE dari AI juga di-escape (tanpa ini nilai `%` cocok
      // dengan semua baris). `ESCAPE '!'` — lihat escapeLikePattern.
      whereParts.push(`${qcol} LIKE ? ESCAPE '!'`);
      params.push(`%${escapeLikePattern(String(f.value ?? ''))}%`);
    } else {
      whereParts.push(`${qcol} ${op} ?`);
      params.push(f.value);
    }
  }

  // Row-level scoping untuk peran non-admin (wajib; gagal bila userId tidak ada).
  if (role !== 'admin' && role !== 'guest' && base.ownerForeignKey) {
    if (!userContext.userId) return { error: 'Konteks pengguna tidak valid: userId tidak tersedia.' };
    whereParts.push(`\`${base.tableName}\`.\`${base.ownerForeignKey}\` = ?`);
    params.push(userContext.userId);
  }

  let sql = `SELECT ${selectClause} FROM \`${base.tableName}\``;
  if (joinClauses.length > 0) sql += ' ' + joinClauses.join(' ');
  if (whereParts.length > 0) sql += ' WHERE ' + whereParts.join(' AND ');

  if (spec.aggregate && groupCol) {
    sql += ` GROUP BY \`${groupCol.table.tableName}\`.\`${groupCol.column}\``;
  }

  if (spec.orderBy) {
    const ocol = parseQualifiedColumn(spec.orderBy.column, base, joined);
    if (!ocol) return { error: `Kolom ORDER BY '${spec.orderBy.column}' tidak valid atau sensitif.` };
    const dir = String(spec.orderBy.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY \`${ocol.table.tableName}\`.\`${ocol.column}\` ${dir}`;
  } else if (spec.aggregate && groupCol) {
    sql += ' ORDER BY `value` DESC';
  }

  const limit = Math.min(100, Math.max(1, Math.floor(Number(spec.limit) || 20)));
  sql += ' LIMIT ?';
  params.push(limit);

  return { sql, params };
}

export async function executeGovernedDatabaseQuery(
  spec: GovernedQuerySpec,
  userContext: ChatUserContext
): Promise<GovernedQueryResult> {
  try {
    const built = buildGovernedQuerySQL(spec, userContext);
    if ('error' in built) return { success: false, error: built.error };
    const rows = await query<any[]>(built.sql, built.params);
    const list = Array.isArray(rows) ? rows : [];
    return {
      success: true,
      data: { table: spec.table, rows: list, rowCount: list.length },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Kueri database gagal.' };
  }
}

// Daftar nama pengguna berdasarkan peran (untuk jawaban list).
// Mengembalikan null bila database tidak dapat diakses (berbeda dari [] = kosong).
// Parameter status opsional: bila diisi, hanya pengguna dengan status itu yang diambil.
//
// N22 — Dua perbaikan atas perilaku lama:
// 1. Pengguna tanpa profil (tanpa full_name) tidak lagi ditampilkan sebagai
//    alamat email — melainkan "Tanpa nama (#id)" (id pengguna dicantumkan
//    agar admin tetap bisa membedakan dan mencari akunnya).
// 2. getUserNameListWithTotal mengembalikan total baris yang cocok agar
//    pemanggil bisa memberi tahu bahwa daftar dipotong di LIMIT
//    ("menampilkan 50 terbaru dari N total") — jangan biarkan admin
//    mengira 50 nama itu seluruh pengguna. getUserNameList sendiri tetap
//    mengembalikan array nama (kompatibilitas pemanggil lama).
async function queryUserNameList(
  role: 'customer' | 'technician' | null,
  limit: number,
  status?: 'active' | 'pending_verification' | 'suspended'
): Promise<{ names: string[]; total: number } | null> {
  const cleanLimit = Math.min(100, Math.max(1, Math.floor(limit) || 50));
  const cleanStatus = status === 'active' || status === 'pending_verification' || status === 'suspended' ? status : null;
  try {
    const whereParts = ['u.deleted_at IS NULL'];
    const params: any[] = [];
    if (role) {
      whereParts.push('u.role = ?');
      params.push(role);
    }
    if (cleanStatus) {
      whereParts.push('u.status = ?');
      params.push(cleanStatus);
    }
    const whereSql = whereParts.join(' AND ');
    const [countRow]: any = await query<any[]>(
      `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.total || 0);
    const rows = await query<any[]>(
      `SELECT u.id, cp.full_name AS customer_name, tp.full_name AS technician_name
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [...params, cleanLimit]
    );
    const names = (rows || []).map((r) => {
      const name = String(r.customer_name || r.technician_name || '').trim();
      return name || `Tanpa nama (#${r.id})`;
    });
    return { names, total };
  } catch {
    return null;
  }
}

export async function getUserNameList(
  role: 'customer' | 'technician' | null,
  limit: number = 50,
  status?: 'active' | 'pending_verification' | 'suspended'
): Promise<string[] | null> {
  const result = await queryUserNameList(role, limit, status);
  return result === null ? null : result.names;
}

// N22 — Varian getUserNameList yang juga mengembalikan total baris yang
// cocok (tanpa LIMIT), agar pemanggil bisa memberi tahu pemotongan daftar.
// Kontrak null tetap sama: null = DB error, { names: [], total: 0 } = kosong.
export async function getUserNameListWithTotal(
  role: 'customer' | 'technician' | null,
  limit: number = 50,
  status?: 'active' | 'pending_verification' | 'suspended'
): Promise<{ names: string[]; total: number } | null> {
  return queryUserNameList(role, limit, status);
}
