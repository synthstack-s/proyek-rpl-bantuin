/**
 * TOOLS & DATA ACCESS BRIDGE - BANTUIN AI DATABASE ASSISTANT
 * 
 * Jembatan penghubung fungsi data berizin (Allowlist Tools) dengan:
 * 1. Re-ekspor dari data-service dan action-service untuk backward compatibility.
 * 2. Eksekusi alat berbasis peran (Role-Based Access Control) yang ketat.
 * 3. Menjamin zero SQL injection dan zero unauthorized access.
 */

import { ChatUserContext } from './types';
import * as DataService from './data-service';
import * as ActionService from './action-service';
import { setPendingTechnicianAction } from './context-manager';

// Re-ekspor seluruh fungsi data service
export * from './data-service';
export * from './action-service';

// Alias kompatibilitas
export const getAdminOverview = DataService.getAdminOperationalOverview;
export const getApplianceCategories = DataService.getPublicApplianceCategories;
export const getTechnicianTasks = (userId: number) => DataService.getTechnicianAssignedTasks(userId);


/**
 * N1: data-service mengembalikan null saat database tidak dapat diakses
 * (daftar kosong mengembalikan [], agregat kosong mengembalikan objek 0).
 * null di sini berarti error, bukan "tidak ada data" — laporkan sebagai
 * error agar AI tidak menyajikan "tidak ada data" saat sebenarnya DB down.
 * (Pengecualian: pencarian objek tunggal — profil/detail — tetap
 * mengembalikan data: null, karena null di sana juga berarti "tidak ditemukan".)
 */
function dbResult(data: any): { success: boolean; data?: any; error?: string } {
  if (data === null || data === undefined) {
    return { success: false, error: 'Database tidak dapat diakses saat ini. Coba lagi nanti.' };
  }
  return { success: true, data };
}

/**
 * T8 — Tampilan publik teknisi: nama, rating, spesialisasi, pengalaman, dan
 * ketersediaan saja — TANPA nomor telepon, email, atau ID pengguna internal.
 * Dipakai untuk tamu dan peran non-admin. Kontak teknisi tetap tersedia
 * lewat jalur berizin yang sudah ada (pesanan/tugas milik sendiri, mis.
 * getCustomerRepairs / getTechnicianAssignedTasks) — bukan lewat pencarian
 * bebas ini. Admin mendapat rekaman lengkap (lihat case searchTechnicians).
 */
export function toPublicTechnicianView(t: any): {
  name: string;
  rating: number;
  reviewsCount: number;
  experienceYears: number;
  isAvailable: boolean;
  verifiedStatus: string;
  specializations: string[];
} {
  return {
    name: t?.name,
    rating: Number(t?.rating || 0),
    reviewsCount: Number(t?.reviewsCount || 0),
    experienceYears: Number(t?.experienceYears || 0),
    isAvailable: Boolean(t?.isAvailable),
    verifiedStatus: t?.verifiedStatus,
    specializations: Array.isArray(t?.specializations) ? t.specializations : [],
  };
}

/**
 * Eksekusi tool berbasis peran pengguna (Role-Based Access Control)
 * Memvalidasi apakah peran pengguna diizinkan memanggil fungsi tersebut
 * dan menyuntikkan ID sesi tepercaya untuk mencegah eksfiltrasi data orang lain (Anti-IDOR).
 *
 * S9g — `sessionId` opsional (ID numerik sesi chat): bila diisi, aksi
 * teknisi yang mengembalikan `requiresConfirmation` disimpan sebagai aksi
 * tertunda di sesi itu, sehingga jawaban "ya" teknisi dapat mengeksekusinya
 * lewat cabang konfirmasi engine. Tanpa `sessionId`, alur konfirmasi
 * tool tidak dapat diselesaikan (pemanggil wajib mengopernya bila tool
 * aksi dideklarasikan ke AI).
 */
export async function executeRoleBasedTool(
  toolName: string,
  args: any,
  userContext: ChatUserContext,
  sessionId?: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    switch (toolName) {
      // ----------------------------------------------------------------------
      // TOOL PUBLIK (Dapat diakses Tamu, Pelanggan, Teknisi, Admin)
      // ----------------------------------------------------------------------
      case 'getPublicCatalog':
        return { success: true, data: await DataService.getPublicCatalog() };

      case 'getAppGuide':
        return { success: true, data: DataService.getAppGuide(args?.topic) };

      case 'getApplianceCategories':
      case 'getPublicApplianceCategories':
        return { success: true, data: await DataService.getPublicApplianceCategories() };

      // ----------------------------------------------------------------------
      // TOOL KHUSUS CUSTOMER (Hanya Pelanggan Terautentikasi)
      // ----------------------------------------------------------------------
      case 'getCustomerProfile':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Data profil pelanggan hanya dapat diakses oleh Pelanggan yang telah masuk.',
          };
        }
        return { success: true, data: await DataService.getCustomerProfile(userContext.userId) };

      case 'getCustomerRepairs':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Riwayat pesanan hanya dapat diakses oleh Pelanggan yang telah masuk.',
          };
        }
        return dbResult(
          await DataService.getCustomerRepairs(userContext.userId, {
            status: args?.status,
            limit: args?.limit,
          })
        );

      case 'getCustomerRepairDetail':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Rincian pesanan hanya dapat diakses oleh Pelanggan yang telah masuk.',
          };
        }
        return {
          success: true,
          data: await DataService.getCustomerRepairDetail(userContext.userId, args?.orderCodeOrId),
        };

      case 'getCustomerInvoices':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Data tagihan hanya dapat diakses oleh Pelanggan yang telah masuk.',
          };
        }
        return dbResult(
          await DataService.getCustomerInvoices(userContext.userId, {
            status: args?.status,
          })
        );

      case 'getCustomerMessages':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Pesan koordinasi perbaikan hanya dapat diakses oleh Pelanggan bersangkutan.',
          };
        }
        return dbResult(await DataService.getCustomerMessages(userContext.userId, args?.orderCodeOrId));

      // ----------------------------------------------------------------------
      // TOOL KHUSUS TEKNISI (Hanya Teknisi Terautentikasi)
      // ----------------------------------------------------------------------
      case 'getTechnicianProfile':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Data profil teknisi hanya dapat diakses oleh Teknisi terverifikasi.',
          };
        }
        return { success: true, data: await DataService.getTechnicianProfile(userContext.userId) };

      case 'getTechnicianTasks':
      case 'getTechnicianAssignedTasks':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Fitur tugas teknisi hanya dapat diakses oleh Teknisi terverifikasi.',
          };
        }
        return dbResult(
          await DataService.getTechnicianAssignedTasks(userContext.userId, {
            status: args?.status,
            limit: args?.limit,
          })
        );

      case 'getTechnicianPerformanceMetrics':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Metrik performa hanya dapat diakses oleh Teknisi bersangkutan.',
          };
        }
        return dbResult(await DataService.getTechnicianPerformanceMetrics(userContext.userId));

      case 'executeTechnicianTaskStatusUpdate':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Hanya teknisi yang dapat memperbarui status tugas.',
          };
        }
        // F10 + S9g: hasil action-service diteruskan utuh — termasuk
        // requiresConfirmation + confirmationPrompt pada panggilan pertama
        // tanpa confirmed — agar AI dapat menanyakan konfirmasi ke teknisi.
        // `confirmed` dari argumen AI SELALU DIBUANG: model AI tidak boleh
        // mengonfirmasi atas nama teknisi (bila tidak, satu tool call AI
        // bisa mengeksekusi mutasi status tanpa teknisi pernah menjawab
        // "ya"). Eksekusi hanya terjadi lewat cabang konfirmasi engine,
        // yang memanggil action-service langsung dengan confirmed: true
        // setelah teknisi menjawab "ya" — dan cabang itu memakai aksi
        // tertunda yang disimpan di bawah (bila sessionId tersedia).
        // (Tool ini saat ini tidak dideklarasikan ke AI di engine.ts, jadi
        // jalur ini dorman sampai dideklarasikan; alur konfirmasi utama
        // adalah jalur regex di engine.ts.)
        const { confirmed: _ignoredConfirmed, ...technicianActionArgs } = args || {};
        const technicianActionResult = await ActionService.executeTechnicianTaskStatusUpdate(
          userContext,
          technicianActionArgs
        );
        if (
          technicianActionResult.requiresConfirmation &&
          typeof sessionId === 'number' &&
          userContext.userId &&
          technicianActionResult.data?.orderCode &&
          technicianActionResult.data?.action
        ) {
          setPendingTechnicianAction(sessionId, {
            orderCode: String(technicianActionResult.data.orderCode),
            action: technicianActionResult.data.action,
            userId: userContext.userId,
            createdAt: Date.now(),
          });
        }
        return technicianActionResult;

      // ----------------------------------------------------------------------
      // TOOL KHUSUS ADMINISTRATOR (Hanya Admin Terautentikasi)
      // ----------------------------------------------------------------------
      case 'getAdminOverview':
      case 'getAdminOperationalOverview':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Ringkasan operasional hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminOperationalOverview());

      case 'getAdminUserStats':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Statistik pengguna sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminUserStats());

      case 'getAdminSystemSettings':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Pengaturan konfigurasi sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminSystemSettings());

      case 'getAdminDelayedRepairs':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data perbaikan tertunda hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminDelayedRepairs());

      case 'getAdminTechnicianWorkload':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data beban kerja teknisi hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminTechnicianWorkload());

      case 'getAdminFinancialAnalytics':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data keuangan hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminFinancialAnalytics());

      case 'getAdminSystemHealth':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Diagnostik kesehatan sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminSystemHealth() };

      case 'getAdminRecentAuditLogs':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Log audit hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminRecentAuditLogs(args?.limit));

      case 'getCustomerCancellationGuide':
        return { success: true, data: DataService.getCustomerCancellationGuide() };

      case 'getCustomerComplaintGuide':
        return { success: true, data: DataService.getCustomerComplaintGuide() };

      case 'getTechnicianSOP':
        return { success: true, data: DataService.getTechnicianSOP(args?.topic) };

      case 'getAdminCustomerAnalytics':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Analitik pelanggan hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminCustomerAnalytics());

      case 'getAdminOperationalReport':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Laporan operasional platform hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminOperationalReport());

      case 'getAdminNotificationStatus':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Status notifikasi sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return dbResult(await DataService.getAdminNotificationStatus());

      case 'executeAdminCreateOperationalSnapshot':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Hanya administrator yang dapat membuat snapshot operasional.',
          };
        }
        // S9g (pengerasan sekeluarga): `confirmed` dari argumen AI dibuang
        // — model tidak boleh mengonfirmasi pembuatan snapshot atas nama
        // admin; konfirmasi harus datang dari admin sendiri lewat alur
        // dua langkah action-service.
        const { confirmed: _ignoredSnapshotConfirmed, ...snapshotArgs } = args || {};
        return await ActionService.executeAdminCreateOperationalSnapshot(userContext, snapshotArgs);

      // ----------------------------------------------------------------------
      // TOOL DATABASE INTELLIGENCE LINTAS TABEL (Role-Governed)
      // ----------------------------------------------------------------------
      case 'queryDatabase': {
        // Menerjemahkan argumen datar dari AI menjadi spesifikasi kueri terjaga.
        // Validasi keamanan (allowlist tabel/kolom, kolom sensitif, row-level
        // scoping) ditegakkan di dalam executeGovernedDatabaseQuery.
        //
        // B7/B13 (didokumentasikan ke AI lewat system prompt; teks deskripsi
        // tool di engine.ts perlu diselaraskan — lihat FIX_NOTES.md):
        // - count/sum di atas JOIN menghitung BARIS HASIL JOIN (satu baris
        //   dasar bisa terhitung berkali-kali); gunakan count_distinct
        //   untuk menghitung baris dasar yang unik, dan sum/avg atas kolom
        //   tabel dasar bersama JOIN ditolak server dengan penjelasan.
        // - Filter pada kolom tabel JOIN membuat LEFT JOIN berperilaku
        //   seperti INNER JOIN (baris tanpa pasangan terbuang) — pisahkan
        //   kueri hitungan total dan hitungan berfilter.
        const splitList = (v: any): string[] | undefined => {
          if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
          if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean);
          return undefined;
        };
        // N23: entri JOIN boleh menyebut FK eksplisit dengan sintaks
        // "tabel:foreignKey" (mis. "users:technician_id") untuk memilih
        // relasi kedua bila dua tabel punya lebih dari satu relasi.
        // Entri tanpa ':' berperilaku seperti sebelumnya (relasi pertama).
        const splitJoins = (v: any): DataService.GovernedQuerySpec['joins'] => {
          const list = splitList(v);
          if (!list) return undefined;
          return list.map((entry) => {
            const idx = entry.indexOf(':');
            if (idx === -1) return entry;
            return { table: entry.slice(0, idx).trim(), via: entry.slice(idx + 1).trim() };
          });
        };
        // B11: filter sebagai array (maksimal 5) — kueri status + rentang
        // tanggal butuh 3 kondisi dan tidak muat dalam 2 filter lama.
        // Bentuk array didukung server; bentuk DEKLARASI di engine.ts adalah
        // flat filterColumn..filterColumn5 (array tidak dideklarasikan
        // karena adapter Gemini hanya mengubah tipe properti level-atas
        // menjadi huruf besar — tipe bersarang huruf kecil akan ditolak
        // Gemini, huruf besar akan ditolak Groq/OpenAI).
        const filters: DataService.GovernedQueryFilter[] = [];
        if (Array.isArray(args?.filters) && args.filters.length > 0) {
          if (args.filters.length > 5) {
            return { success: false, error: 'Maksimal 5 filter per kueri.' };
          }
          for (const raw of args.filters) {
            const column = typeof raw?.column === 'string' ? raw.column.trim() : '';
            const operator = typeof raw?.operator === 'string' ? raw.operator.trim() : '';
            if (!column || !operator) {
              return { success: false, error: 'Setiap filter harus memiliki column dan operator.' };
            }
            filters.push({ column, operator: operator as DataService.GovernedQueryFilter['operator'], value: raw?.value ?? '' });
          }
        } else {
          // Bentuk flat: filterColumn..filterColumn5 (dideklarasikan di
          // engine.ts) — loop agar tidak ada filter yang terlewat.
          const flatFilters: Array<[string, string, any]> = [
            [args?.filterColumn, args?.filterOperator, args?.filterValue],
            [args?.filterColumn2, args?.filterOperator2, args?.filterValue2],
            [args?.filterColumn3, args?.filterOperator3, args?.filterValue3],
            [args?.filterColumn4, args?.filterOperator4, args?.filterValue4],
            [args?.filterColumn5, args?.filterOperator5, args?.filterValue5],
          ];
          for (const [column, operator, value] of flatFilters) {
            if (column && operator) {
              filters.push({ column, operator, value: value ?? '' });
            }
          }
        }
        const spec: DataService.GovernedQuerySpec = {
          table: args?.table,
          columns: splitList(args?.columns),
          joins: splitJoins(args?.joins),
          filters: filters.length > 0 ? filters : undefined,
          aggregate: args?.aggregateFunction
            ? { function: args.aggregateFunction, column: args?.aggregateColumn }
            : undefined,
          groupBy: args?.groupBy || undefined,
          orderBy: args?.orderByColumn
            ? { column: args.orderByColumn, direction: args?.orderByDirection }
            : undefined,
          limit: args?.limit,
        };
        return await DataService.executeGovernedDatabaseQuery(spec, userContext);
      }

      case 'searchUsers':
      case 'searchDatabaseUsers':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Pencarian seluruh basis data pengguna hanya diizinkan untuk Administrator demi perlindungan privasi.',
          };
        }
        const userQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.phone || args?.phoneNumber || args?.email || args?.name || args?.q || '');
        // A16 — getter pencarian mengembalikan null saat DB error (tiga
        // keadaan); dbResult mengubahnya menjadi error bersih, bukan
        // success:true dengan data null.
        return dbResult(await DataService.searchDatabaseUsers(userQuery, {
          role: args?.role,
          limit: args?.limit,
        }));

      case 'searchOrders':
      case 'searchDatabaseOrders':
        const orderQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.orderCode || args?.orderId || args?.device || args?.q || '');
        if (userContext.role === 'admin') {
          // A16 — null = DB error; dbResult mengubahnya menjadi error bersih.
          return dbResult(await DataService.searchDatabaseOrders(orderQuery, {
            status: args?.status,
            limit: args?.limit,
          }));
        } else if (userContext.role === 'customer' && userContext.userId) {
          return dbResult(
            await DataService.getCustomerRepairs(userContext.userId, {
              status: args?.status,
              limit: args?.limit,
            })
          );
        } else if (userContext.role === 'technician' && userContext.userId) {
          return dbResult(
            await DataService.getTechnicianAssignedTasks(userContext.userId, {
              status: args?.status,
              limit: args?.limit,
            })
          );
        }
        return {
          success: false,
          error: 'Akses ditolak: Silakan masuk untuk mengakses pencarian pesanan.',
        };

      case 'searchTechnicians':
      case 'searchDatabaseTechnicians': {
        const techQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.name || args?.q || '');
        // N16: opsi includeUnverified HANYA diisi untuk admin yang secara
        // eksplisit memintanya — nilai mentah dari argumen AI tidak pernah
        // diteruskan langsung, agar tamu tidak bisa meminta daftar teknisi
        // pending/rejected/suspended.
        const technicians = await DataService.searchDatabaseTechnicians(techQuery, {
          categoryName: args?.categoryName,
          limit: args?.limit,
          includeUnverified: userContext.role === 'admin' && args?.includeUnverified === true,
        });
        // A16 — null = DB error (bukan "tidak ada teknisi"); tanpa penjaga
        // ini, `.map(...)` di bawah melempar TypeError untuk peran non-admin.
        if (technicians === null) return dbResult(null);
        // T8: admin mendapat rekaman lengkap (termasuk kontak) untuk
        // keperluan operasional; semua peran lain — tamu, customer,
        // teknisi — hanya mendapat tampilan publik tanpa PII kontak.
        // Tidak ada aturan RBAC yang memberi peran non-admin hak atas
        // kontak teknisi sembarang; kontak teknisi yang ditugaskan tetap
        // tersedia lewat pesanan/tugas milik sendiri.
        if (userContext.role === 'admin') {
          return { success: true, data: technicians };
        }
        return { success: true, data: technicians.map(toPublicTechnicianView) };
      }

      case 'searchInvoices':
      case 'searchDatabaseInvoices':
        const invoiceQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.invoiceNumber || args?.orderCode || args?.q || '');
        if (userContext.role === 'admin') {
          // A16 — null = DB error; dbResult mengubahnya menjadi error bersih.
          return dbResult(await DataService.searchDatabaseInvoices(invoiceQuery, {
            status: args?.status,
            limit: args?.limit,
          }));
        } else if (userContext.role === 'customer' && userContext.userId) {
          return dbResult(
            await DataService.getCustomerInvoices(userContext.userId, {
              status: args?.status,
            })
          );
        }
        return {
          success: false,
          error: 'Akses ditolak: Data tagihan invoice hanya dapat diakses oleh pihak berwenang.',
        };

      case 'getDatabaseTableMetadata':
      case 'getTableSchema':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Informasi skema database hanya dapat diakses oleh Administrator.',
          };
        }
        const { getTableSchemaMetadata } = await import('./schema-registry');
        return {
          success: true,
          data: getTableSchemaMetadata(args?.tableName),
        };

      default:
        return { success: false, error: `Tool ${toolName} tidak dikenal.` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal mengeksekusi tool basis data.' };
  }
}
