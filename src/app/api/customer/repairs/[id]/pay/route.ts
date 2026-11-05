import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

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
    const { payment_method } = body;

    const validMethods = ['qris', 'bank_transfer', 'cash_on_delivery'];
    const method = validMethods.includes(payment_method) ? payment_method : 'qris';

    // 1. Verifikasi kepemilikan pesanan dan invoice
    const orders = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.customer_id, inv.id AS invoice_id, inv.invoice_number,
              inv.total_amount, inv.status AS invoice_status
       FROM repair_requests rr
       JOIN invoices inv ON inv.repair_request_id = rr.id
       WHERE rr.id = ? AND rr.customer_id = ? AND rr.deleted_at IS NULL
       LIMIT 1`,
      [repairId, session.userId]
    );

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pesanan atau tagihan invoice tidak ditemukan' },
        { status: 404 }
      );
    }

    const order = orders[0];

    if (order.invoice_status === 'paid') {
      return NextResponse.json(
        { success: false, message: 'Tagihan ini sudah berstatus lunas' },
        { status: 400 }
      );
    }

    const invoiceId = order.invoice_id;
    const totalAmount = Number(order.total_amount);

    // 2. Tandai invoice lunas
    await query(
      `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?`,
      [invoiceId]
    );

    // 3. Catat di tabel payments
    const paymentRef = `PAY-${order.invoice_number}-${Date.now().toString().slice(-4)}`;
    const gatewayTxn = `TXN-${method.toUpperCase()}-${session.userId}-${invoiceId}-${Date.now()}`;

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
      ) VALUES (?, ?, ?, ?, ?, ?, 'settlement', ?, NOW())`,
      [
        paymentRef,
        invoiceId,
        method,
        method === 'qris' ? 'qris_gateway' : method === 'bank_transfer' ? 'va_bca' : 'cash_manual',
        gatewayTxn,
        totalAmount,
        JSON.stringify({
          channel: method,
          paid_by_customer_id: session.userId,
          simulated_at: new Date().toISOString(),
        }),
      ]
    );

    // 4. Catat riwayat status
    await query(
      `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
       VALUES (?, 'completed', 'completed', ?, 'customer', ?)`,
      [repairId, session.userId, `Pembayaran invoice ${order.invoice_number} sebesar Rp ${totalAmount.toLocaleString('id-ID')} berhasil via ${method.toUpperCase()}`]
    );

    // 5. Kirim notifikasi ke pelanggan
    await query(
      `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
       VALUES (?, 'Pembayaran Berhasil Dikonfirmasi', ?, 'invoice', ?)`,
      [
        session.userId,
        `Pembayaran untuk pesanan #${order.order_code} senilai Rp ${totalAmount.toLocaleString('id-ID')} telah berhasil. Garansi resmi 30 hari BANTUIN aktif!`,
        invoiceId,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Pembayaran berhasil dikonfirmasi.',
      data: {
        paymentReference: paymentRef,
        invoiceNumber: order.invoice_number,
        amount: totalAmount,
        status: 'paid',
        paymentMethod: method,
      },
    });
  } catch (error: any) {
    console.error('Error in customer pay API:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memproses pembayaran: ' + error.message },
      { status: 500 }
    );
  }
}
