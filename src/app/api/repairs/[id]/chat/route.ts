import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { sendChatMessageSchema } from '@/lib/validations/chat';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repairs/[id]/chat
 * Mengambil ruang chat dan riwayat percakapan antara Pelanggan & Teknisi.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userSession = await getUserSession();
    const adminSession = !userSession ? await getAdminSession() : null;
    const session = userSession || adminSession;

    if (!session) {
      return NextResponse.json({ success: false, message: 'Akses ditolak: Anda belum login' }, { status: 401 });
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    // 1. Dapatkan detail pesanan, pelanggan, dan teknisi yang ditugaskan
    const orders = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.customer_id, rr.current_status AS repair_status,
              cp.full_name AS customer_name, u_cust.phone_number AS customer_phone,
              ta.technician_id,
              tp.full_name AS technician_name, u_tech.phone_number AS technician_phone
       FROM repair_requests rr
       JOIN users u_cust ON u_cust.id = rr.customer_id
       LEFT JOIN customer_profiles cp ON cp.user_id = u_cust.id
       LEFT JOIN technician_assignments ta ON ta.repair_request_id = rr.id AND ta.status IN ('offered', 'accepted', 'completed')
       LEFT JOIN users u_tech ON u_tech.id = ta.technician_id
       LEFT JOIN technician_profiles tp ON tp.user_id = u_tech.id
       WHERE rr.id = ? AND rr.deleted_at IS NULL
       ORDER BY ta.id DESC
       LIMIT 1`,
      [repairId]
    );

    if (orders.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan perbaikan tidak ditemukan' }, { status: 404 });
    }

    const order = orders[0];

    // 2. Verifikasi Hak Akses: Hanya Pelanggan Pemilik, Teknisi yang Ditugaskan, atau Admin
    const isCustomer = session.role === 'customer' && session.userId === order.customer_id;
    const isTechnician = session.role === 'technician' && session.userId === order.technician_id;
    const isAdmin = session.role === 'admin';

    if (!isCustomer && !isTechnician && !isAdmin) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda tidak memiliki izin untuk melihat percakapan ini' },
        { status: 403 }
      );
    }

    if (!order.technician_id) {
      return NextResponse.json({
        success: true,
        data: {
          room: null,
          messages: [],
          orderCode: order.order_code,
          message: 'Belum ada teknisi yang ditugaskan untuk pesanan ini',
        },
      });
    }

    // 3. Cari atau Inisialisasi repair_chat_rooms
    let rooms = await query<any[]>(
      `SELECT id, repair_request_id, customer_id, technician_id, is_active, created_at
       FROM repair_chat_rooms
       WHERE repair_request_id = ?
       LIMIT 1`,
      [repairId]
    );

    let roomId: number;
    if (rooms.length === 0) {
      const createRoom = await query<any>(
        `INSERT INTO repair_chat_rooms (repair_request_id, customer_id, technician_id, is_active)
         VALUES (?, ?, ?, TRUE)`,
        [repairId, order.customer_id, order.technician_id]
      );
      roomId = createRoom.insertId;
      rooms = [{ id: roomId, repair_request_id: repairId, customer_id: order.customer_id, technician_id: order.technician_id, is_active: true }];
    } else {
      roomId = rooms[0].id;
    }

    // 4. Tandai pesan yang diterima sebagai sudah dibaca (is_read = true)
    if (!isAdmin) {
      await query(
        `UPDATE repair_chat_messages
         SET is_read = TRUE
         WHERE chat_room_id = ? AND sender_id != ? AND is_read = FALSE`,
        [roomId, session.userId]
      );
    }

    // 5. Ambil riwayat pesan
    const messages = await query<any[]>(
      `SELECT cm.id, cm.chat_room_id, cm.sender_id, cm.message_type, cm.content,
              cm.attachment_url, cm.is_read, cm.created_at,
              COALESCE(cp.full_name, tp.full_name, 'Admin') AS sender_name, u.role AS sender_role
       FROM repair_chat_messages cm
       JOIN users u ON u.id = cm.sender_id
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN technician_profiles tp ON tp.user_id = u.id
       WHERE cm.chat_room_id = ?
       ORDER BY cm.created_at ASC`,
      [roomId]
    );

    const otherParty = isCustomer
      ? { role: 'technician', name: order.technician_name, phone: order.technician_phone, id: order.technician_id }
      : { role: 'customer', name: order.customer_name, phone: order.customer_phone, id: order.customer_id };

    return NextResponse.json({
      success: true,
      data: {
        room: rooms[0],
        orderCode: order.order_code,
        otherParty,
        currentUserId: session.userId,
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          senderRole: m.sender_role,
          messageType: m.message_type,
          content: m.content,
          attachmentUrl: m.attachment_url,
          isRead: Boolean(m.is_read),
          createdAt: m.created_at,
          isSelf: m.sender_id === session.userId,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/repairs/[id]/chat:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil percakapan' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/repairs/[id]/chat
 * Mengirimkan pesan baru ke ruang chat pesanan perbaikan.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userSession = await getUserSession();
    const adminSession = !userSession ? await getAdminSession() : null;
    const session = userSession || adminSession;

    if (!session) {
      return NextResponse.json({ success: false, message: 'Akses ditolak: Anda belum login' }, { status: 401 });
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const validation = sendChatMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.error.issues[0]?.message || 'Input pesan tidak valid' },
        { status: 400 }
      );
    }

    const { content, message_type, attachment_url } = validation.data;

    // 1. Dapatkan detail pesanan dan partisipan
    const orders = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.customer_id, rr.current_status AS repair_status,
              ta.technician_id
       FROM repair_requests rr
       LEFT JOIN technician_assignments ta ON ta.repair_request_id = rr.id AND ta.status IN ('offered', 'accepted', 'completed')
       WHERE rr.id = ? AND rr.deleted_at IS NULL
       ORDER BY ta.id DESC
       LIMIT 1`,
      [repairId]
    );

    if (orders.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan perbaikan tidak ditemukan' }, { status: 404 });
    }

    const order = orders[0];

    // 2. Verifikasi Otorisasi Partisipan
    const isCustomer = session.role === 'customer' && session.userId === order.customer_id;
    const isTechnician = session.role === 'technician' && session.userId === order.technician_id;
    const isAdmin = session.role === 'admin';

    if (!isCustomer && !isTechnician && !isAdmin) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda tidak memiliki izin untuk mengirim pesan dalam chat ini' },
        { status: 403 }
      );
    }

    if (!order.technician_id) {
      return NextResponse.json(
        { success: false, message: 'Belum ada teknisi yang ditugaskan, obrolan belum dapat dimulai' },
        { status: 400 }
      );
    }

    // 3. Dapatkan atau Buat Room
    let rooms = await query<any[]>(
      `SELECT id, is_active FROM repair_chat_rooms WHERE repair_request_id = ? LIMIT 1`,
      [repairId]
    );

    let roomId: number;
    if (rooms.length === 0) {
      const createRoom = await query<any>(
        `INSERT INTO repair_chat_rooms (repair_request_id, customer_id, technician_id, is_active)
         VALUES (?, ?, ?, TRUE)`,
        [repairId, order.customer_id, order.technician_id]
      );
      roomId = createRoom.insertId;
    } else {
      roomId = rooms[0].id;
    }

    // 4. Masukkan Pesan ke repair_chat_messages
    const insertResult = await query<any>(
      `INSERT INTO repair_chat_messages (
        chat_room_id, sender_id, message_type, content, attachment_url, is_read
      ) VALUES (?, ?, ?, ?, ?, FALSE)`,
      [roomId, session.userId, message_type, content, attachment_url || null]
    );

    // 5. Kirim Notifikasi ke Lawan Bicara
    const recipientUserId = isCustomer ? order.technician_id : order.customer_id;
    const senderRoleName = isCustomer ? 'Pelanggan' : isTechnician ? 'Teknisi' : 'Admin BANTUIN';

    await query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, 'chat', FALSE, NOW())`,
      [
        recipientUserId,
        `Pesan Baru dari ${senderRoleName} 💬`,
        `[#${order.order_code}] ${content.length > 60 ? content.slice(0, 57) + '...' : content}`,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Pesan berhasil terkirim',
      data: {
        id: insertResult.insertId,
        chatRoomId: roomId,
        senderId: session.userId,
        messageType: message_type,
        content: content,
        attachmentUrl: attachment_url || null,
        isRead: false,
        createdAt: new Date().toISOString(),
        isSelf: true,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/repairs/[id]/chat:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengirimkan pesan' },
      { status: 500 }
    );
  }
}
