import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/payments/[id]
 * Mengambil detail invoice lengkap beserta seluruh riwayat percobaan transaksi pembayaran.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const invoiceId = parseInt(id, 10);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ success: false, message: 'ID invoice tidak valid' }, { status: 400 });
    }

    // 1. Ambil data Invoice
    const invoices: any = await query(
      `SELECT 
        inv.*,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        rr.address_text,
        COALESCE(cp.full_name, 'Pelanggan #' + inv.customer_id) AS customer_name,
        u.phone_number AS customer_phone,
        u.email AS customer_email
      FROM invoices inv
      JOIN repair_requests rr ON inv.repair_request_id = rr.id
      LEFT JOIN users u ON inv.customer_id = u.id
      LEFT JOIN customer_profiles cp ON inv.customer_id = cp.user_id
      WHERE inv.id = ?`,
      [invoiceId]
    );

    if (invoices.length === 0) {
      return NextResponse.json({ success: false, message: 'Invoice tidak ditemukan' }, { status: 404 });
    }

    // 2. Ambil riwayat Payments
    const payments: any = await query(
      `SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC`,
      [invoiceId]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...invoices[0],
        payments,
      },
    });
  } catch (error: any) {
    console.error('[Admin Payment Detail Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail tagihan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/payments/[id]
 * Konfirmasi pelunasan manual (COD / Transfer Bank) atau pembatalan invoice oleh administrator.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const invoiceId = parseInt(id, 10);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ success: false, message: 'ID invoice tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { action, payment_method, notes } = body;

    const existing: any = await query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (existing.length === 0) {
      return NextResponse.json({ success: false, message: 'Invoice tidak ditemukan' }, { status: 404 });
    }
    const invoice = existing[0];

    if (action === 'manual_settlement') {
      if (invoice.status === 'paid') {
        return NextResponse.json({ success: false, message: 'Invoice ini sudah berstatus lunas' }, { status: 400 });
      }

      const method = payment_method || 'cash_on_delivery';

      // 1. Update Invoice menjadi 'paid'
      await query(
        'UPDATE invoices SET status = "paid", paid_at = NOW() WHERE id = ?',
        [invoiceId]
      );

      // 2. Buat / Update transaksi di tabel payments
      const paymentRef = `PAY-MANUAL-${invoice.invoice_number}-${Date.now().toString().slice(-4)}`;
      await query(
        `INSERT INTO payments (
          payment_reference,
          invoice_id,
          payment_method,
          gateway_provider,
          gateway_transaction_id,
          amount,
          payment_status,
          gateway_response_json,
          settled_at
        ) VALUES (?, ?, ?, 'manual_admin', ?, ?, 'settlement', ?, NOW())`,
        [
          paymentRef,
          invoiceId,
          method,
          `MANUAL-ADM-${session.userId}-${invoiceId}-${Date.now()}`,
          invoice.total_amount,
          JSON.stringify({ verified_by_admin: session.userId, notes: notes || 'Pelunasan manual diverifikasi admin' }),
        ]
      );

      // 3. Kirim notifikasi pembayaran lunas ke pelanggan
      await query(
        `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
         VALUES (?, 'Pembayaran Berhasil Dikonfirmasi', ?, 'payment', 'invoices', ?)`,
        [
          invoice.customer_id,
          `Tagihan ${invoice.invoice_number} sebesar Rp ${Number(invoice.total_amount).toLocaleString('id-ID')} telah dikonfirmasi lunas oleh admin. Terima kasih!`,
          invoiceId,
        ]
      );

      // 4. Catat Audit Log
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'MANUAL_PAYMENT_SETTLEMENT',
        entityName: 'invoices',
        entityId: invoiceId,
        oldValues: { status: invoice.status, paid_at: invoice.paid_at },
        newValues: { status: 'paid', payment_method: method, notes },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Tagihan ${invoice.invoice_number} berhasil diverifikasi LUNAS`,
      });
    }

    if (action === 'cancel_invoice') {
      if (invoice.status === 'paid') {
        return NextResponse.json({ success: false, message: 'Invoice yang sudah lunas tidak dapat dibatalkan langsung' }, { status: 400 });
      }

      await query('UPDATE invoices SET status = "cancelled" WHERE id = ?', [invoiceId]);

      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'CANCEL_INVOICE',
        entityName: 'invoices',
        entityId: invoiceId,
        oldValues: { status: invoice.status },
        newValues: { status: 'cancelled', notes },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Tagihan ${invoice.invoice_number} berhasil dibatalkan`,
      });
    }

    return NextResponse.json({ success: false, message: 'Aksi tidak didukung' }, { status: 400 });
  } catch (error: any) {
    console.error('[Admin Payment Update Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memproses pembayaran: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
