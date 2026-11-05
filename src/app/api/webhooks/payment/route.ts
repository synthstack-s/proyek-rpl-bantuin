import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

/**
 * POST /api/webhooks/payment
 * Webhook handler resmi untuk rekonsiliasi transaksi pembayaran (Midtrans / Xendit / Standard Payment Gateway).
 * Mencegah pembayaran ganda dengan idempotency guard berdasarkan gateway_transaction_id.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON payload' }, { status: 400 });
    }

    // 1. Ekstrak data standar webhook (Mendukung Midtrans / Xendit / Internal Gateway)
    const orderId = payload.order_id || payload.external_id || payload.invoice_number;
    const transactionStatus = (payload.transaction_status || payload.status || '').toLowerCase();
    const statusCode = payload.status_code || (transactionStatus === 'settlement' || transactionStatus === 'paid' ? '200' : '400');
    const grossAmount = payload.gross_amount || payload.amount;
    const gatewayTransactionId = payload.transaction_id || payload.id || `MOCK-GW-${Date.now()}`;
    const paymentType = (payload.payment_type || payload.payment_method || 'qris').toLowerCase();
    const gatewayProvider = payload.gateway_provider || 'midtrans';

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing order_id or external_id' }, { status: 400 });
    }

    // 2. Cari data Invoice di database berdasarkan invoice_number atau id
    const invoices = await query<any[]>(
      `SELECT inv.id, inv.invoice_number, inv.repair_request_id, inv.customer_id, inv.total_amount, inv.status,
              rr.order_code
       FROM invoices inv
       JOIN repair_requests rr ON rr.id = inv.repair_request_id
       WHERE inv.invoice_number = ? OR inv.id = ?
       LIMIT 1`,
      [orderId, isNaN(Number(orderId)) ? 0 : Number(orderId)]
    );

    if (invoices.length === 0) {
      return NextResponse.json({ success: false, message: 'Invoice tidak ditemukan' }, { status: 404 });
    }

    const invoice = invoices[0];

    // 3. Verifikasi Keberadaan Transaksi yang Sudah Pernah Diproses (Idempotency Guard)
    const existingPayment = await query<any[]>(
      `SELECT id, payment_status FROM payments WHERE gateway_transaction_id = ? LIMIT 1`,
      [gatewayTransactionId]
    );

    if (existingPayment.length > 0 && existingPayment[0].payment_status === 'settlement') {
      return NextResponse.json({
        success: true,
        message: 'Notification already processed (idempotent)',
      });
    }

    // 4. Petakan Status Transaksi Gateway ke Status Internal BANTUIN
    const isSuccess =
      transactionStatus === 'settlement' ||
      transactionStatus === 'capture' ||
      transactionStatus === 'paid' ||
      (statusCode === '200' && transactionStatus !== 'deny' && transactionStatus !== 'cancel');

    const isFailure =
      transactionStatus === 'deny' ||
      transactionStatus === 'cancel' ||
      transactionStatus === 'expire' ||
      transactionStatus === 'failure';

    const mappedPaymentStatus = isSuccess ? 'settlement' : isFailure ? 'cancel' : 'pending';

    // Petakan payment method ke ENUM database
    const mappedPaymentMethod = paymentType.includes('qris')
      ? 'qris'
      : paymentType.includes('bca')
      ? 'va_bca'
      : paymentType.includes('mandiri')
      ? 'va_mandiri'
      : paymentType.includes('bni')
      ? 'va_bni'
      : paymentType.includes('bri')
      ? 'va_bri'
      : paymentType.includes('gopay')
      ? 'ewallet_gopay'
      : paymentType.includes('ovo')
      ? 'ewallet_ovo'
      : paymentType.includes('dana')
      ? 'ewallet_dana'
      : 'cash_on_delivery';

    const paymentRef = `TRX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase()}`;

    // 5. Catat atau Update Data di tabel payments
    if (existingPayment.length === 0) {
      await query(
        `INSERT INTO payments (
          payment_reference, invoice_id, payment_method, gateway_provider,
          gateway_transaction_id, amount, payment_status, gateway_response_json,
          settled_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          paymentRef,
          invoice.id,
          mappedPaymentMethod,
          gatewayProvider,
          gatewayTransactionId,
          grossAmount || invoice.total_amount,
          mappedPaymentStatus,
          JSON.stringify(payload),
          isSuccess ? new Date() : null,
        ]
      );
    } else {
      await query(
        `UPDATE payments
         SET payment_status = ?, settled_at = ?, gateway_response_json = ?, updated_at = NOW()
         WHERE gateway_transaction_id = ?`,
        [mappedPaymentStatus, isSuccess ? new Date() : null, JSON.stringify(payload), gatewayTransactionId]
      );
    }

    // 6. Jika Pembayaran Berhasil: Update Invoice & Aktifkan Garansi 30 Hari
    if (isSuccess && invoice.status !== 'paid') {
      await query(
        `UPDATE invoices
         SET status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [invoice.id]
      );

      // Perbarui timestamp repair_requests
      await query(
        `UPDATE repair_requests
         SET updated_at = NOW()
         WHERE id = ?`,
        [invoice.repair_request_id]
      );

      // Catat di repair_status_history
      await query(
        `INSERT INTO repair_status_history (
          repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes, created_at
        ) VALUES (?, 'completed', 'completed', ?, 'system', 'Pelunasan tagihan diverifikasi via Payment Gateway Webhook', NOW())`,
        [invoice.repair_request_id, invoice.customer_id]
      );

      // Kirim Notifikasi Pembayaran Berhasil ke Pelanggan
      await query(
        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
         VALUES (?, 'Pembayaran Lunas ✅', ?, 'payment', FALSE, NOW())`,
        [
          invoice.customer_id,
          `Pembayaran tagihan invoice #${invoice.invoice_number} senilai Rp ${Number(
            invoice.total_amount
          ).toLocaleString('id-ID')} telah berhasil diverifikasi. Garansi servis 30 hari Anda resmi aktif.`,
        ]
      );
    }

    return NextResponse.json({
      success: true,
      message: `Webhook handled successfully with status ${mappedPaymentStatus}`,
      data: {
        invoiceNumber: invoice.invoice_number,
        paymentStatus: mappedPaymentStatus,
        isSettled: isSuccess,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/webhooks/payment:', error);
    return NextResponse.json(
      { success: false, message: 'Internal error processing payment webhook' },
      { status: 500 }
    );
  }
}
