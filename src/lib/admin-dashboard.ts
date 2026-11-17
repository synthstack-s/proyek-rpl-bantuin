/**
 * ADMIN DASHBOARD — SUMBER DATA TUNGGAL (single source of truth)
 *
 * Semua angka di dasbor admin — halaman SSR `src/app/admin/page.tsx` dan
 * API `src/app/api/admin/dashboard/route.ts` — dibaca dari sini, agar
 * kedua jalur TIDAK PERNAH berbeda. Sebelumnya kedua file menduplikasi
 * kueri yang sama dan masing-masing menambal angka tetap bila hasilnya 0
 * (mis. totalRevenue dan totalOrders diganti angka demo), sehingga dasbor
 * menampilkan angka yang tidak ada di database.
 *
 * DEFINISI ANGKA — SELARAS DENGAN CHATBOT (agar angka dasbor dan jawaban
 * chatbot selalu sama untuk data yang sama):
 * - Pendapatan (N31, definisi yang SAMA PERSIS dengan
 *   getAdminFinancialAnalytics di src/lib/chatbot/data-service.ts):
 *   pembayaran `settlement` dikurangi `refunded` dari tabel `payments`.
 *   BUKAN SUM invoice `paid` — invoice lunas tanpa pembayaran settlement
 *   (atau yang sudah di-refund) bukan pendapatan.
 * - "Bulan Ini" = bulan kalender berjalan (N28), bukan 30 hari bergulir.
 * - Status pesanan mencakup SELURUH nilai ENUM repair_requests
 *   (termasuk `draft`) sehingga rincian selalu berjumlah sama dengan total.
 * - Angka 0 adalah angka riil (database kosong) — TIDAK ADA angka demo.
 *   Bila database tidak dapat diakses, fungsi di sini MELEMPAR error dan
 *   pemanggil wajib menampilkannya dengan jujur (bukan 0, bukan demo).
 */

import { query } from '@/lib/db';

export type DashboardTimeRange = '7d' | '30d' | 'month' | 'year';

export interface TimeDataPoint {
  date: string;
  rawDate: string;
  revenue: number;
  orders: number;
  completed: number;
}

export interface CategoryStat {
  id: number;
  name: string;
  slug: string;
  orderCount: number;
  percentage: number;
  totalRevenue: number;
}

export interface PaymentStat {
  method: string;
  label: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface RecentOrder {
  id: number;
  orderCode: string;
  customerName: string;
  categoryName: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  currentStatus: string;
  totalAmount: number;
  createdAt: string;
  technicianName: string | null;
}

export interface TopTechnician {
  id: number;
  name: string;
  // ratingAvg 0.00 = belum ada ulasan (nilai default kolom). JANGAN pernah
  // diganti 5.0 — teknisi tanpa ulasan yang tampil ⭐5.0 adalah angka palsu.
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  isAvailable: boolean;
}

export interface AdminDashboardOverview {
  totalRevenue: number;
  totalOrders: number;
  openOrders: number;
  inProgressOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  complainedOrders: number;
  completionRate: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  verifiedTechnicians: number;
  pendingTechnicians: number;
  avgOrderValue: number;
  satisfactionRate: number;
  // reviewCount 0 = belum ada ulasan (satisfactionRate 0 dalam hal ini
  // berarti "belum dapat dihitung", BUKAN "0% puas").
  reviewCount: number;
  // Pertumbuhan pendapatan bulan berjalan vs bulan lalu, format yang sama
  // dengan laporan operasional chatbot ("+12.3%", "-5.0%", "n/a", "0.0%").
  revenueGrowthPercent: string;
}

export interface AdminDashboardData {
  timeRange: string;
  overview: AdminDashboardOverview;
  timeline: TimeDataPoint[];
  statusBreakdown: {
    // "submitted" = pesanan terbuka (submitted + assigned + scheduled);
    // nama kunci dipertahankan demi kompatibilitas payload API lama.
    draft: number;
    submitted: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    complained: number;
  };
  categoryBreakdown: CategoryStat[];
  paymentBreakdown: PaymentStat[];
  recentOrders: RecentOrder[];
  topTechnicians: TopTechnician[];
  serverTime: string;
  // Diisi hanya bila data gagal dimuat (database tidak dapat diakses).
  // Pemanggil wajib menampilkan pesan ini, bukan menyembunyikannya.
  error?: string;
}

export interface TechnicianVerificationStats {
  verified: number;
  pending: number;
  rejected: number;
  suspended: number;
  total: number;
}

export interface SatisfactionStats {
  avgRating: number;
  reviewCount: number;
  satisfactionRate: number;
}

// Format pertumbuhan yang sama dengan getAdminOperationalReport di chatbot:
// bulan lalu 0 dan bulan ini > 0 -> "n/a" (bukan "+∞%"); keduanya 0 -> "0.0%".
function formatGrowth(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? 'n/a' : '0.0%';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toShortLabel(d: Date): string {
  return `${d.getDate()} ${d.toLocaleDateString('id-ID', { month: 'short' })}`;
}

// ============================================================================
// Statistik yang dipakai BERSAMA oleh dasbor dan chatbot (satu definisi).
// Fungsi-fungsi ini MELEMPAR bila database error; pembungkus di
// src/lib/chatbot/data-service.ts mengubahnya menjadi null (aturan tiga
// keadaan chatbot), sementara pemanggil dasbor menampilkannya sebagai error.
// ============================================================================

export async function getTechnicianVerificationStats(): Promise<TechnicianVerificationStats> {
  const [row] = await query<any[]>(`
    SELECT
      SUM(CASE WHEN verified_status = 'verified' THEN 1 ELSE 0 END) AS verified_cnt,
      SUM(CASE WHEN verified_status = 'pending' THEN 1 ELSE 0 END) AS pending_cnt,
      SUM(CASE WHEN verified_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_cnt,
      SUM(CASE WHEN verified_status = 'suspended' THEN 1 ELSE 0 END) AS suspended_cnt,
      COUNT(*) AS total_cnt
    FROM technician_profiles
  `);
  const verified = Number(row?.verified_cnt || 0);
  const pending = Number(row?.pending_cnt || 0);
  const rejected = Number(row?.rejected_cnt || 0);
  const suspended = Number(row?.suspended_cnt || 0);
  return {
    verified,
    pending,
    rejected,
    suspended,
    total: Number(row?.total_cnt || 0),
  };
}

export async function getSatisfactionStats(): Promise<SatisfactionStats> {
  const [row] = await query<any[]>(
    'SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS review_count FROM repair_reviews WHERE is_published = TRUE'
  );
  const avgRating = Number(row?.avg_rating || 0);
  const reviewCount = Number(row?.review_count || 0);
  return {
    avgRating,
    reviewCount,
    satisfactionRate: reviewCount > 0 ? Math.round((avgRating / 5) * 100) : 0,
  };
}

// ============================================================================
// Ringkasan utama (kartu statistik)
// ============================================================================

async function getOverview(): Promise<{
  overview: AdminDashboardOverview;
  draftOrders: number;
}> {
  const [revenueRow, monthlyRevenueRow, statusRow, customerRow, verification, satisfaction] =
    await Promise.all([
      // N31 — pendapatan dari uang yang benar-benar masuk (definisi yang
      // SAMA dengan getAdminFinancialAnalytics di chatbot): settlement
      // dikurangi refunded. Jembatan rekonsiliasi: COUNT DISTINCT invoice
      // yang punya ≥1 settlement (satu invoice boleh dibayar lewat
      // beberapa transaksi, sehingga jumlah transaksi bisa melebihi
      // jumlah invoice).
      query<any[]>(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_status = 'settlement' THEN amount ELSE 0 END), 0) AS settled_total,
          COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN amount ELSE 0 END), 0) AS refunded_total,
          COUNT(DISTINCT CASE WHEN payment_status = 'settlement' THEN invoice_id END) AS settled_invoice_count
        FROM payments
      `).then((rows) => rows[0]),
      // Pertumbuhan pendapatan bulan berjalan vs bulan lalu — kueri yang
      // SAMA dengan getAdminOperationalReport di chatbot (dikelompokkan
      // per bulan COALESCE(settled_at, created_at)).
      query<any[]>(`
        SELECT
          COALESCE(SUM(CASE
            WHEN COALESCE(settled_at, created_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')
            THEN CASE WHEN payment_status = 'settlement' THEN amount
                      WHEN payment_status = 'refunded' THEN -amount ELSE 0 END
            ELSE 0 END), 0) AS current_revenue,
          COALESCE(SUM(CASE
            WHEN COALESCE(settled_at, created_at) >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
             AND COALESCE(settled_at, created_at) < DATE_FORMAT(NOW(), '%Y-%m-01')
            THEN CASE WHEN payment_status = 'settlement' THEN amount
                      WHEN payment_status = 'refunded' THEN -amount ELSE 0 END
            ELSE 0 END), 0) AS previous_revenue
        FROM payments
      `).then((rows) => rows[0]),
      // SELURUH nilai ENUM current_status (11 status, termasuk draft)
      // sehingga rincian selalu berjumlah sama dengan total.
      query<any[]>(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN current_status = 'draft' THEN 1 ELSE 0 END) AS draft_cnt,
          SUM(CASE WHEN current_status IN ('submitted', 'assigned', 'scheduled') THEN 1 ELSE 0 END) AS open_cnt,
          SUM(CASE WHEN current_status IN ('in_diagnosis', 'estimated', 'customer_approved', 'in_repair') THEN 1 ELSE 0 END) AS in_prog_cnt,
          SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS comp_cnt,
          SUM(CASE WHEN current_status = 'cancelled' THEN 1 ELSE 0 END) AS canc_cnt,
          SUM(CASE WHEN current_status = 'complained' THEN 1 ELSE 0 END) AS compl_cnt
        FROM repair_requests
        WHERE deleted_at IS NULL
      `).then((rows) => rows[0]),
      // "Bulan Ini" = bulan kalender berjalan (N28), sama dengan chatbot.
      query<any[]>(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS new_this_month
        FROM users
        WHERE role = 'customer' AND deleted_at IS NULL
      `).then((rows) => rows[0]),
      getTechnicianVerificationStats(),
      getSatisfactionStats(),
    ]);

  const settledTotal = Number(revenueRow?.settled_total || 0);
  const refundedTotal = Number(revenueRow?.refunded_total || 0);
  const totalRevenue = settledTotal - refundedTotal;
  const settledInvoiceCount = Number(revenueRow?.settled_invoice_count || 0);
  const totalOrders = Number(statusRow?.total || 0);
  const completedOrders = Number(statusRow?.comp_cnt || 0);

  return {
    overview: {
      totalRevenue,
      totalOrders,
      openOrders: Number(statusRow?.open_cnt || 0),
      inProgressOrders: Number(statusRow?.in_prog_cnt || 0),
      completedOrders,
      cancelledOrders: Number(statusRow?.canc_cnt || 0),
      complainedOrders: Number(statusRow?.compl_cnt || 0),
      completionRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
      totalCustomers: Number(customerRow?.total || 0),
      newCustomersThisMonth: Number(customerRow?.new_this_month || 0),
      verifiedTechnicians: verification.verified,
      pendingTechnicians: verification.pending,
      // Rata-rata uang yang benar-benar masuk per invoice yang terbayar
      // (definisi N31) — 0 bila belum ada invoice yang terbayar.
      avgOrderValue:
        settledInvoiceCount > 0 ? Math.round(totalRevenue / settledInvoiceCount) : 0,
      satisfactionRate: satisfaction.satisfactionRate,
      reviewCount: satisfaction.reviewCount,
      revenueGrowthPercent: formatGrowth(
        Number(monthlyRevenueRow?.current_revenue || 0),
        Number(monthlyRevenueRow?.previous_revenue || 0)
      ),
    },
    draftOrders: Number(statusRow?.draft_cnt || 0),
  };
}

// ============================================================================
// Grafik linimasa (pendapatan & volume pesanan)
// ============================================================================

async function getTimeline(timeRange: DashboardTimeRange): Promise<TimeDataPoint[]> {
  const now = new Date();
  const timelineData: TimeDataPoint[] = [];

  if (timeRange === 'year') {
    const currentYear = now.getFullYear();
    const [monthlyOrdersRes, monthlyRevRes] = await Promise.all([
      query<any[]>(
        `SELECT
          MONTH(created_at) AS month_num,
          COUNT(*) AS order_count,
          SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS completed_count
        FROM repair_requests
        WHERE YEAR(created_at) = ? AND deleted_at IS NULL
        GROUP BY MONTH(created_at)`,
        [currentYear]
      ),
      // N31 per bulan (COALESCE(settled_at, created_at)) — definisi yang
      // sama dengan pendapatan bulanan di laporan operasional chatbot.
      query<any[]>(
        `SELECT
          MONTH(COALESCE(settled_at, created_at)) AS month_num,
          COALESCE(SUM(CASE WHEN payment_status = 'settlement' THEN amount WHEN payment_status = 'refunded' THEN -amount ELSE 0 END), 0) AS rev_total
        FROM payments
        WHERE YEAR(COALESCE(settled_at, created_at)) = ? AND payment_status IN ('settlement', 'refunded')
        GROUP BY MONTH(COALESCE(settled_at, created_at))`,
        [currentYear]
      ),
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    for (let m = 1; m <= 12; m++) {
      const ord = monthlyOrdersRes.find((x) => Number(x.month_num) === m);
      const rev = monthlyRevRes.find((x) => Number(x.month_num) === m);
      timelineData.push({
        date: monthNames[m - 1],
        rawDate: `${currentYear}-${String(m).padStart(2, '0')}`,
        revenue: Number(rev?.rev_total || 0),
        orders: Number(ord?.order_count || 0),
        completed: Number(ord?.completed_count || 0),
      });
    }
    return timelineData;
  }

  // Rentang harian. 'month' ("Bulan Ini") = tanggal 1 bulan kalender
  // berjalan sampai hari ini (N28) — BUKAN N hari bergulir ke belakang.
  let daysCount: number;
  let startDate: Date;
  if (timeRange === '7d') {
    daysCount = 7;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  } else if (timeRange === 'month') {
    daysCount = now.getDate();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    daysCount = 30;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  }
  const startDateStr = toDateKey(startDate);

  const [dailyOrdersRes, dailyRevRes] = await Promise.all([
    // TANGGAL DIKEMBALIKAN SEBAGAI STRING (DATE_FORMAT), BUKAN Date.
    // Alasannya terbukti dari kode mysql2: dengan timezone koneksi
    // '+07:00' (src/lib/db.ts), kolom DATE dikembalikan sebagai Date
    // 'YYYY-MM-DDT00:00:00+07:00' — toISOString()-nya adalah hari
    // SEBELUMNYA (17:00Z), sehingga pencocokan lama
    // (toISOString().slice(0, 10) === dateStr) TIDAK PERNAH cocok dan
    // seluruh titik linimasa selalu 0 — lalu kurva palsu ditampilkan.
    // DATE_FORMAT mengembalikan VARCHAR 'YYYY-MM-DD' sehingga pencocokan
    // string di bawah ini benar di zona waktu proses apa pun.
    query<any[]>(
      `SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d') AS order_date,
        COUNT(*) AS order_count,
        SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS completed_count
      FROM repair_requests
      WHERE created_at >= ? AND deleted_at IS NULL
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY order_date ASC`,
      [startDateStr]
    ),
    // N31 per hari (COALESCE(settled_at, created_at)) — pendapatan pada
    // tanggal uangnya benar-benar masuk, bukan tanggal invoice lunas.
    query<any[]>(
      `SELECT
        DATE_FORMAT(COALESCE(settled_at, created_at), '%Y-%m-%d') AS pay_date,
        COALESCE(SUM(CASE WHEN payment_status = 'settlement' THEN amount WHEN payment_status = 'refunded' THEN -amount ELSE 0 END), 0) AS rev_total
      FROM payments
      WHERE COALESCE(settled_at, created_at) >= ? AND payment_status IN ('settlement', 'refunded')
      GROUP BY DATE_FORMAT(COALESCE(settled_at, created_at), '%Y-%m-%d')
      ORDER BY pay_date ASC`,
      [startDateStr]
    ),
  ]);

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = toDateKey(d);
    // order_date/pay_date adalah string 'YYYY-MM-DD' (DATE_FORMAT).
    const orderMatch = dailyOrdersRes.find(
      (row) => String(row.order_date).slice(0, 10) === dateStr
    );
    const revMatch = dailyRevRes.find(
      (row) => String(row.pay_date).slice(0, 10) === dateStr
    );
    timelineData.push({
      date: toShortLabel(d),
      rawDate: dateStr,
      revenue: Number(revMatch?.rev_total || 0),
      orders: Number(orderMatch?.order_count || 0),
      completed: Number(orderMatch?.completed_count || 0),
    });
  }
  return timelineData;
}

// ============================================================================
// Rincian per kategori (dipakai dasbor dan chatbot — satu definisi)
// ============================================================================

export async function getCategoryBreakdown(): Promise<CategoryStat[]> {
  const catRows = await query<any[]>(`
    SELECT
      ac.id,
      ac.name,
      ac.slug,
      COUNT(DISTINCT rr.id) AS order_count,
      COALESCE(SUM(CASE WHEN p.payment_status = 'settlement' THEN p.amount WHEN p.payment_status = 'refunded' THEN -p.amount ELSE 0 END), 0) AS category_revenue
    FROM appliance_categories ac
    LEFT JOIN repair_requests rr ON ac.id = rr.category_id AND rr.deleted_at IS NULL
    LEFT JOIN invoices inv ON rr.id = inv.repair_request_id
    LEFT JOIN payments p ON inv.id = p.invoice_id AND p.payment_status IN ('settlement', 'refunded')
    WHERE ac.is_active = TRUE
    GROUP BY ac.id, ac.name, ac.slug
    ORDER BY order_count DESC, category_revenue DESC
  `);
  // COUNT(DISTINCT rr.id) WAJIB: satu pesanan bisa punya banyak baris
  // payments (cicilan / percobaan ulang) — COUNT(rr.id) akan menghitung
  // pesanan yang sama berkali-kali. Pendapatan memakai definisi N31 yang
  // sama dengan total pendapatan, sehingga jumlah seluruh kategori =
  // total pendapatan (untuk pesanan berkategori).
  const totalCatOrders =
    catRows.reduce((sum, r) => sum + Number(r.order_count || 0), 0) || 1;
  return catRows.map((c) => ({
    id: Number(c.id),
    name: String(c.name),
    slug: String(c.slug),
    orderCount: Number(c.order_count || 0),
    percentage: Math.round((Number(c.order_count || 0) / totalCatOrders) * 100),
    totalRevenue: Number(c.category_revenue || 0),
  }));
}

// ============================================================================
// Rincian metode pembayaran — settlement saja (definisi yang SAMA dengan
// paymentMethodsBreakdown di getAdminFinancialAnalytics chatbot).
// Pembayaran 'pending' adalah uang yang BELUM masuk dan tidak boleh
// dihitung sebagai volume yang berhasil.
// ============================================================================

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  qris: 'QRIS Instant',
  va_bca: 'BCA Virtual Account',
  va_mandiri: 'Mandiri Virtual Account',
  va_bni: 'BNI Virtual Account',
  va_bri: 'BRI Virtual Account',
  ewallet_gopay: 'GoPay',
  ewallet_ovo: 'OVO',
  ewallet_dana: 'DANA',
  cash_on_delivery: 'Tunai COD di Tempat',
};

async function getPaymentBreakdown(): Promise<PaymentStat[]> {
  const payRows = await query<any[]>(`
    SELECT
      payment_method,
      COUNT(*) AS count,
      COALESCE(SUM(amount), 0) AS total_amount
    FROM payments
    WHERE payment_status = 'settlement'
    GROUP BY payment_method
    ORDER BY total_amount DESC
  `);
  const totalPayAmt =
    payRows.reduce((acc, p) => acc + Number(p.total_amount || 0), 0) || 1;
  return payRows.map((p) => ({
    method: p.payment_method,
    label: PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method,
    count: Number(p.count || 0),
    amount: Number(p.total_amount || 0),
    percentage: Math.round((Number(p.total_amount || 0) / totalPayAmt) * 100),
  }));
}

// ============================================================================
// Pesanan terbaru — SATU BARIS PER PESANAN.
// technician_assignments tidak punya UNIQUE (repair_request_id, status):
// penugasan ulang / penawaran ke beberapa teknisi bisa membuat beberapa
// baris 'accepted' untuk satu pesanan. JOIN mentah menduplikasi pesanan di
// daftar 6 terbaru (pola yang sama dengan B23 di chatbot) — karena itu
// penugasan diambil lewat subkueri satu-baris-terbaru.
// ============================================================================

async function getRecentOrders(): Promise<RecentOrder[]> {
  const recentRows = await query<any[]>(`
    SELECT
      rr.id,
      rr.order_code,
      COALESCE(cp.full_name, u.email) AS customer_name,
      ac.name AS category_name,
      rr.device_brand,
      rr.device_model,
      rr.current_status,
      COALESCE(inv.total_amount, svc.base_price, 0) AS total_amount,
      rr.created_at,
      tp.full_name AS technician_name
    FROM repair_requests rr
    LEFT JOIN users u ON rr.customer_id = u.id
    LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
    LEFT JOIN appliance_categories ac ON rr.category_id = ac.id
    LEFT JOIN services svc ON rr.service_id = svc.id
    LEFT JOIN invoices inv ON rr.id = inv.repair_request_id
    LEFT JOIN technician_assignments ta ON ta.id = (
      SELECT ta2.id FROM technician_assignments ta2
      WHERE ta2.repair_request_id = rr.id AND ta2.status = 'accepted'
      ORDER BY ta2.created_at DESC, ta2.id DESC
      LIMIT 1
    )
    LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
    WHERE rr.deleted_at IS NULL
    ORDER BY rr.created_at DESC
    LIMIT 6
  `);
  return recentRows.map((r) => ({
    id: Number(r.id),
    orderCode: String(r.order_code),
    customerName: String(r.customer_name || 'Pelanggan'),
    categoryName: String(r.category_name || 'Alat Elektronik'),
    deviceBrand: r.device_brand || null,
    deviceModel: r.device_model || null,
    currentStatus: String(r.current_status),
    totalAmount: Number(r.total_amount || 0),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    technicianName: r.technician_name || null,
  }));
}

// ============================================================================
// Teknisi terbaik — berdasarkan rating, 4 teratas (dipakai dasbor dan
// chatbot — satu definisi). "Servis selesai" = pesanan yang BERHASIL
// diselesaikan (current_status 'completed') dengan penugasan teknisi yang
// bersangkutan berstatus 'accepted'/'completed' — definisi yang sama dengan
// filter 'completed' di /api/technician/tasks. COUNT(DISTINCT ...) agar
// penugasan ulang tidak menghitung satu pesanan dua kali, dan penugasan
// 'offered'/'rejected' tidak pernah dihitung sebagai pekerjaan orang lain.
// ============================================================================

export async function getTopTechnicians(): Promise<TopTechnician[]> {
  const techRows = await query<any[]>(`
    SELECT
      tp.id,
      tp.full_name,
      tp.rating_avg,
      tp.rating_count,
      tp.is_available,
      COUNT(DISTINCT CASE WHEN rr.current_status = 'completed' AND ta.status IN ('accepted', 'completed') THEN rr.id END) AS completed_jobs
    FROM technician_profiles tp
    LEFT JOIN technician_assignments ta ON tp.user_id = ta.technician_id
    LEFT JOIN repair_requests rr ON ta.repair_request_id = rr.id AND rr.deleted_at IS NULL
    WHERE tp.verified_status = 'verified'
    GROUP BY tp.id, tp.full_name, tp.rating_avg, tp.rating_count, tp.is_available
    ORDER BY tp.rating_avg DESC, completed_jobs DESC
    LIMIT 4
  `);
  return techRows.map((t) => ({
    id: Number(t.id),
    name: String(t.full_name),
    // rating_avg 0.00 (default kolom) = belum ada ulasan. Nilai ini
    // dipertahankan 0 — pemanggil menampilkan "Belum ada ulasan".
    ratingAvg: Number(t.rating_avg || 0),
    ratingCount: Number(t.rating_count || 0),
    completedJobs: Number(t.completed_jobs || 0),
    isAvailable: Boolean(t.is_available),
  }));
}

// ============================================================================
// Perakit utama + data kosong untuk keadaan error
// ============================================================================

export function emptyDashboardData(
  timeRange: string,
  error: string
): AdminDashboardData {
  return {
    timeRange,
    overview: {
      totalRevenue: 0,
      totalOrders: 0,
      openOrders: 0,
      inProgressOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      complainedOrders: 0,
      completionRate: 0,
      totalCustomers: 0,
      newCustomersThisMonth: 0,
      verifiedTechnicians: 0,
      pendingTechnicians: 0,
      avgOrderValue: 0,
      satisfactionRate: 0,
      reviewCount: 0,
      revenueGrowthPercent: '0.0%',
    },
    timeline: [],
    statusBreakdown: {
      draft: 0,
      submitted: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      complained: 0,
    },
    categoryBreakdown: [],
    paymentBreakdown: [],
    recentOrders: [],
    topTechnicians: [],
    serverTime: new Date().toISOString(),
    error,
  };
}

export async function getAdminDashboardData(
  timeRange: DashboardTimeRange
): Promise<AdminDashboardData> {
  const [overviewResult, timeline, categoryBreakdown, paymentBreakdown, recentOrders, topTechnicians] =
    await Promise.all([
      getOverview(),
      getTimeline(timeRange),
      getCategoryBreakdown(),
      getPaymentBreakdown(),
      getRecentOrders(),
      getTopTechnicians(),
    ]);
  const { overview, draftOrders } = overviewResult;

  return {
    timeRange,
    overview,
    timeline,
    statusBreakdown: {
      draft: draftOrders,
      submitted: overview.openOrders,
      inProgress: overview.inProgressOrders,
      completed: overview.completedOrders,
      cancelled: overview.cancelledOrders,
      complained: overview.complainedOrders,
    },
    categoryBreakdown,
    paymentBreakdown,
    recentOrders,
    topTechnicians,
    serverTime: new Date().toISOString(),
  };
}
