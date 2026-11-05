import { query } from '../src/lib/db';

async function seedAdminOpsData() {
  console.log('--- Memeriksa & Mengisi Data Operasional Admin BANTUIN ---');

  // Ambil user customer & technician yang valid
  const customers = await query<any[]>('SELECT id FROM users WHERE role = "customer" LIMIT 5');
  const technicians = await query<any[]>('SELECT id FROM users WHERE role = "technician" LIMIT 5');
  const admins = await query<any[]>('SELECT id FROM users WHERE role = "admin" LIMIT 1');

  if (customers.length === 0 || technicians.length === 0 || admins.length === 0) {
    console.error('Pengguna customer/technician/admin belum memadai.');
    process.exit(1);
  }

  const customerId1 = customers[0].id;
  const customerId2 = customers[1]?.id || customerId1;
  const techId1 = technicians[0].id;
  const techId2 = technicians[1]?.id || techId1;
  const adminId = admins[0].id;

  // Cek apakah order mock sudah ada
  const existingOrders = await query<any[]>('SELECT id, order_code FROM repair_requests WHERE order_code LIKE "BAN-20261031-%"');
  if (existingOrders.length >= 4) {
    console.log('Data operasional mock sudah tersedia (' + existingOrders.length + ' order). Melewati seeding.');
    return;
  }

  console.log('Menambahkan data pesanan perbaikan mock...');

  // 1. Order: Submitted
  const res1: any = await query(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, service_id, device_brand, device_model,
      problem_description, problem_photos, address_text, latitude, longitude, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'BAN-20261031-10001',
      customerId1,
      1, // AC
      1, // Cuci AC Standar
      'Daikin',
      'Flash Inverter 1 PK',
      'AC tidak dingin dan mengeluarkan hembusan bau apek dari indoor unit.',
      JSON.stringify(['https://images.unsplash.com/photo-1621905251189-08b45d6a269e']),
      'Jl. Kemang Raya No. 14B, Mampang Prapatan, Jakarta Selatan',
      -6.2608,
      106.8156,
      'submitted',
    ]
  );
  const orderId1 = res1.insertId || 101;

  // 2. Order: Assigned
  const res2: any = await query(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, service_id, device_brand, device_model,
      problem_description, problem_photos, address_text, latitude, longitude, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'BAN-20261031-10002',
      customerId2,
      2, // Kulkas
      6, // Ganti thermostat
      'Sharp',
      'Kirei III 2 Pintu',
      'Bagian freezer dingin normal tetapi pintu bagian bawah tidak dingin, sayuran cepat layu.',
      JSON.stringify(['https://images.unsplash.com/photo-1584992236310-6edddc08acff']),
      'Cluster Mentari Blok C3 No. 7, Bintaro Jaya, Tangerang Selatan',
      -6.2825,
      106.7118,
      'assigned',
    ]
  );
  const orderId2 = res2.insertId || 102;

  // 3. Order: In Repair
  const res3: any = await query(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, service_id, device_brand, device_model,
      problem_description, problem_photos, address_text, latitude, longitude, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'BAN-20261031-10003',
      customerId1,
      3, // Mesin Cuci
      10, // Modul PCB
      'LG',
      'Front Loading TurboWash 8kg',
      'Mesin mati mendadak saat proses spin pengeringan dan muncul kode error OE pada layar panel.',
      JSON.stringify(['https://images.unsplash.com/photo-1626806787461-102c1bfaaea1']),
      'Apartemen Mediterania Garden Residence Tower Heliconia No. 15H, Jakarta Barat',
      -6.1772,
      106.7904,
      'in_repair',
    ]
  );
  const orderId3 = res3.insertId || 103;

  // 4. Order: Completed
  const res4: any = await query(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, service_id, device_brand, device_model,
      problem_description, problem_photos, address_text, latitude, longitude, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'BAN-20261031-10004',
      customerId2,
      1, // AC
      3, // Tambah Freon
      'Panasonic',
      'Alowa Standard 0.5 PK',
      'Pipa outdoor terdapat bunga es tebal dan udara di dalam ruangan terasa seperti kipas biasa.',
      JSON.stringify(['https://images.unsplash.com/photo-1581092160607-ee22621dd758']),
      'Perumahan Tebet Mas Indah Blok A No. 12, Tebet, Jakarta Selatan',
      -6.2255,
      106.8558,
      'completed',
    ]
  );
  const orderId4 = res4.insertId || 104;

  // 5. Order: Complained
  const res5: any = await query(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, service_id, device_brand, device_model,
      problem_description, problem_photos, address_text, latitude, longitude, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'BAN-20261031-10005',
      customerId1,
      1, // AC
      2, // Cuci AC Besar
      'Samsung',
      'WindFree Ultra 1.5 PK',
      'Setelah diservis kemarin, air bocor menetes ke lantai kamar tidur dan mengenai meja kerja.',
      JSON.stringify(['https://images.unsplash.com/photo-1585338107529-13afc5f02586']),
      'Jl. Rawamangun Muka No. 45, Pulogadung, Jakarta Timur',
      -6.1952,
      106.8821,
      'complained',
    ]
  );
  const orderId5 = res5.insertId || 105;

  // Seed Status History
  await query(
    `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
     VALUES 
     (?, NULL, 'submitted', ?, 'customer', 'Pesanan dibuat oleh pelanggan melalui aplikasi.'),
     (?, 'submitted', 'assigned', ?, 'admin', 'Admin menugaskan teknisi untuk melakukan inspeksi.'),
     (?, 'assigned', 'in_repair', ?, 'technician', 'Teknisi tiba di lokasi dan memulai pengerjaan penggantian modul.'),
     (?, 'in_repair', 'completed', ?, 'technician', 'Pekerjaan selesai, freon terisi penuh dan unit dingin optimal.'),
     (?, 'completed', 'complained', ?, 'customer', 'Pelanggan mengajukan keluhan kebocoran air pasca cuci AC.')`,
    [orderId1, customerId1, orderId2, adminId, orderId3, techId1, orderId4, techId2, orderId5, customerId1]
  );

  // Seed Technician Assignments
  await query(
    `INSERT INTO technician_assignments (repair_request_id, technician_id, assigned_by_user_id, assignment_type, status)
     VALUES 
     (?, ?, ?, 'manual_admin', 'offered'),
     (?, ?, ?, 'manual_admin', 'accepted'),
     (?, ?, ?, 'manual_admin', 'completed'),
     (?, ?, ?, 'manual_admin', 'completed')`,
    [orderId2, techId1, adminId, orderId3, techId2, adminId, orderId4, techId1, adminId, orderId5, techId2, adminId]
  );

  // Seed Invoices
  // Invoice 1: Unpaid for Order 3
  await query(
    `INSERT INTO invoices (invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date)
     VALUES (?, ?, ?, 150000.00, 300000.00, 15000.00, 465000.00, 'unpaid', DATE_ADD(NOW(), INTERVAL 2 DAY))
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    ['INV-20261031-0001', orderId3, customerId1]
  );

  // Invoice 2: Paid for Order 4
  const invRes4: any = await query(
    `INSERT INTO invoices (invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date, paid_at)
     VALUES (?, ?, ?, 120000.00, 175000.00, 15000.00, 310000.00, 'paid', NOW(), NOW())
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    ['INV-20261031-0002', orderId4, customerId2]
  );
  const invId4 = invRes4.insertId;

  // Invoice 3: Paid for Order 5
  const invRes5: any = await query(
    `INSERT INTO invoices (invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date, paid_at)
     VALUES (?, ?, ?, 95000.00, 0.00, 10000.00, 105000.00, 'paid', NOW(), NOW())
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    ['INV-20261031-0003', orderId5, customerId1]
  );
  const invId5 = invRes5.insertId;

  // Seed Payments
  if (invId4) {
    await query(
      `INSERT INTO payments (payment_reference, invoice_id, payment_method, gateway_provider, gateway_transaction_id, amount, payment_status, settled_at)
       VALUES (?, ?, 'qris', 'midtrans', ?, 310000.00, 'settlement', NOW())
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      ['PAY-20261031-7781', invId4, 'TRX-QRIS-992144']
    );
  }

  if (invId5) {
    await query(
      `INSERT INTO payments (payment_reference, invoice_id, payment_method, gateway_provider, gateway_transaction_id, amount, payment_status, settled_at)
       VALUES (?, ?, 'va_bca', 'midtrans', ?, 105000.00, 'settlement', NOW())
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      ['PAY-20261031-8892', invId5, 'TRX-BCA-102938']
    );
  }

  // Seed Complaint for Order 5
  await query(
    `INSERT INTO repair_complaints (
      complaint_code, repair_request_id, complainant_user_id, category, description,
      evidence_photos, status, resolution_summary, handled_by_admin_id
    ) VALUES (?, ?, ?, 'poor_workmanship', ?, ?, 'submitted', NULL, NULL)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [
      'CMP-20261031-0001',
      orderId5,
      customerId1,
      'Air menetes sangat deras dari casing AC indoor hingga membasahi karpet dan meja kerja. Mohon dikirimkan teknisi penanganan garansi segera.',
      JSON.stringify(['https://images.unsplash.com/photo-1585338107529-13afc5f02586']),
    ]
  );

  console.log('✅ Seeding data operasional mock selesai dengan sukses!');
}

seedAdminOpsData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error saat seeding:', err);
    process.exit(1);
  });

