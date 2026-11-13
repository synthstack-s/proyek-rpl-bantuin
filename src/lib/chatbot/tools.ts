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

// Re-ekspor seluruh fungsi data service
export * from './data-service';
export * from './action-service';

// Alias kompatibilitas
export const getAdminOverview = DataService.getAdminOperationalOverview;
export const getApplianceCategories = DataService.getPublicApplianceCategories;
export const getTechnicianTasks = (userId: number) => DataService.getTechnicianAssignedTasks(userId);

/**
 * Eksekusi tool berbasis peran pengguna (Role-Based Access Control)
 * Memvalidasi apakah peran pengguna diizinkan memanggil fungsi tersebut
 * dan menyuntikkan ID sesi tepercaya untuk mencegah eksfiltrasi data orang lain (Anti-IDOR).
 */
export async function executeRoleBasedTool(
  toolName: string,
  args: any,
  userContext: ChatUserContext
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
        return {
          success: true,
          data: await DataService.getCustomerRepairs(userContext.userId, {
            status: args?.status,
            limit: args?.limit,
          }),
        };

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
        return {
          success: true,
          data: await DataService.getCustomerInvoices(userContext.userId, {
            status: args?.status,
          }),
        };

      case 'getCustomerMessages':
        if (userContext.role !== 'customer' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Pesan koordinasi perbaikan hanya dapat diakses oleh Pelanggan bersangkutan.',
          };
        }
        return {
          success: true,
          data: await DataService.getCustomerMessages(userContext.userId, args?.orderCodeOrId),
        };

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
        return {
          success: true,
          data: await DataService.getTechnicianAssignedTasks(userContext.userId, {
            status: args?.status,
            limit: args?.limit,
          }),
        };

      case 'getTechnicianPerformanceMetrics':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Metrik performa hanya dapat diakses oleh Teknisi bersangkutan.',
          };
        }
        return { success: true, data: await DataService.getTechnicianPerformanceMetrics(userContext.userId) };

      case 'executeTechnicianTaskStatusUpdate':
        if (userContext.role !== 'technician' || !userContext.userId) {
          return {
            success: false,
            error: 'Akses ditolak: Hanya teknisi yang dapat memperbarui status tugas.',
          };
        }
        return await ActionService.executeTechnicianTaskStatusUpdate(userContext, args);

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
        return { success: true, data: await DataService.getAdminOperationalOverview() };

      case 'getAdminUserStats':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Statistik pengguna sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminUserStats() };

      case 'getAdminSystemSettings':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Pengaturan konfigurasi sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminSystemSettings() };

      case 'getAdminDelayedRepairs':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data perbaikan tertunda hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminDelayedRepairs() };

      case 'getAdminTechnicianWorkload':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data beban kerja teknisi hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminTechnicianWorkload() };

      case 'getAdminFinancialAnalytics':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Data keuangan hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminFinancialAnalytics() };

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
        return { success: true, data: await DataService.getAdminRecentAuditLogs(args?.limit) };

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
        return { success: true, data: await DataService.getAdminCustomerAnalytics() };

      case 'getAdminOperationalReport':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Laporan operasional platform hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminOperationalReport() };

      case 'getAdminNotificationStatus':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Status notifikasi sistem hanya dapat diakses oleh Administrator.',
          };
        }
        return { success: true, data: await DataService.getAdminNotificationStatus() };

      case 'executeAdminCreateOperationalSnapshot':
        if (userContext.role !== 'admin') {
          return {
            success: false,
            error: 'Akses ditolak: Hanya administrator yang dapat membuat snapshot operasional.',
          };
        }
        return await ActionService.executeAdminCreateOperationalSnapshot(userContext, args);

      // ----------------------------------------------------------------------
      // TOOL DATABASE INTELLIGENCE LINTAS TABEL (Role-Governed)
      // ----------------------------------------------------------------------
      case 'queryDatabase': {
        // Menerjemahkan argumen datar dari AI menjadi spesifikasi kueri terjaga.
        // Validasi keamanan (allowlist tabel/kolom, kolom sensitif, row-level
        // scoping) ditegakkan di dalam executeGovernedDatabaseQuery.
        const splitList = (v: any): string[] | undefined => {
          if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
          if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean);
          return undefined;
        };
        const filters: DataService.GovernedQueryFilter[] = [];
        if (args?.filterColumn && args?.filterOperator) {
          filters.push({ column: args.filterColumn, operator: args.filterOperator, value: args.filterValue ?? '' });
        }
        if (args?.filterColumn2 && args?.filterOperator2) {
          filters.push({ column: args.filterColumn2, operator: args.filterOperator2, value: args.filterValue2 ?? '' });
        }
        const spec: DataService.GovernedQuerySpec = {
          table: args?.table,
          columns: splitList(args?.columns),
          joins: splitList(args?.joins),
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
        return {
          success: true,
          data: await DataService.searchDatabaseUsers(userQuery, {
            role: args?.role,
            limit: args?.limit,
          }),
        };

      case 'searchOrders':
      case 'searchDatabaseOrders':
        const orderQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.orderCode || args?.orderId || args?.device || args?.q || '');
        if (userContext.role === 'admin') {
          return {
            success: true,
            data: await DataService.searchDatabaseOrders(orderQuery, {
              status: args?.status,
              limit: args?.limit,
            }),
          };
        } else if (userContext.role === 'customer' && userContext.userId) {
          return {
            success: true,
            data: await DataService.getCustomerRepairs(userContext.userId, {
              status: args?.status,
              limit: args?.limit,
            }),
          };
        } else if (userContext.role === 'technician' && userContext.userId) {
          return {
            success: true,
            data: await DataService.getTechnicianAssignedTasks(userContext.userId, {
              status: args?.status,
              limit: args?.limit,
            }),
          };
        }
        return {
          success: false,
          error: 'Akses ditolak: Silakan masuk untuk mengakses pencarian pesanan.',
        };

      case 'searchTechnicians':
      case 'searchDatabaseTechnicians':
        const techQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.name || args?.q || '');
        return {
          success: true,
          data: await DataService.searchDatabaseTechnicians(techQuery, {
            categoryName: args?.categoryName,
            limit: args?.limit,
          }),
        };

      case 'searchInvoices':
      case 'searchDatabaseInvoices':
        const invoiceQuery = typeof args === 'string'
          ? args
          : (args?.query || args?.searchTerm || args?.invoiceNumber || args?.orderCode || args?.q || '');
        if (userContext.role === 'admin') {
          return {
            success: true,
            data: await DataService.searchDatabaseInvoices(invoiceQuery, {
              status: args?.status,
              limit: args?.limit,
            }),
          };
        } else if (userContext.role === 'customer' && userContext.userId) {
          return {
            success: true,
            data: await DataService.getCustomerInvoices(userContext.userId, {
              status: args?.status,
            }),
          };
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
