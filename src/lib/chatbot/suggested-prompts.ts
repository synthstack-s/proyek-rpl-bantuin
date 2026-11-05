/**
 * SUGGESTED PROMPTS - BANTUIN AI DATABASE ASSISTANT
 * 
 * Menghasilkan rekomendasi pertanyaan cepat yang dinamis dan relevan
 * berdasarkan peran pengguna (Customer, Technician, Admin, Guest),
 * halaman yang sedang diakses, dan konteks percakapan.
 */

import { QuickSuggestion, UserRole } from './types';

export function getRoleBasedSuggestedPrompts(
  role: UserRole,
  currentPath?: string,
  contextData?: { hasUnpaidInvoice?: boolean; hasActiveOrder?: boolean; activeOrderCode?: string }
): QuickSuggestion[] {
  const p = (currentPath || '/').toLowerCase();

  // 1. CUSTOMER
  if (role === 'customer') {
    if (contextData?.activeOrderCode) {
      return [
        { label: 'Status Perbaikan', prompt: `Bagaimana status perbaikan untuk pesanan #${contextData.activeOrderCode}?` },
        { label: 'Siapa Teknisi Saya?', prompt: `Siapa teknisi yang menangani pesanan #${contextData.activeOrderCode}?` },
        { label: 'Diagnosis Kerusakan', prompt: `Apa diagnosis kerusakan perangkat pesanan #${contextData.activeOrderCode}?` },
        { label: 'Estimasi Biaya', prompt: `Berapa estimasi biaya perbaikan #${contextData.activeOrderCode}?` },
      ];
    }

    if (p.startsWith('/customer/repairs')) {
      return [
        { label: 'Status Perbaikan Terkini', prompt: 'Bagaimana status perbaikan terbaru saya?' },
        { label: 'Siapa Teknisi Saya?', prompt: 'Siapa teknisi yang menangani pesanan saya?' },
        { label: 'Diagnosis Perangkat', prompt: 'Apa diagnosis kerusakan perangkat saya?' },
        { label: 'Riwayat Perbaikan', prompt: 'Tampilkan riwayat perbaikan saya.' },
      ];
    }

    return [
      { label: 'Status Perbaikan Saya', prompt: 'Bagaimana status perbaikan saya?' },
      { label: 'Tagihan Belum Dibayar', prompt: 'Apakah ada tagihan yang belum dibayar?' },
      { label: 'Teknisi Pesanan Saya', prompt: 'Siapa teknisi yang menangani pesanan saya?' },
      { label: 'Riwayat Perbaikan', prompt: 'Tampilkan riwayat perbaikan saya.' },
      { label: 'Cara Memesan Layanan', prompt: 'Bagaimana cara memesan layanan?' },
    ];
  }

  // 2. TECHNICIAN
  if (role === 'technician') {
    if (p.startsWith('/technician/dashboard') || p.startsWith('/technician/tasks')) {
      return [
        { label: 'Tugas Hari Ini', prompt: 'Apa saja tugas saya hari ini?' },
        { label: 'Tugas Mendekati Deadline', prompt: 'Tampilkan tugas mendekati deadline.' },
        { label: 'Diagnosis Perangkat', prompt: 'Apa diagnosis perangkat yang saya tangani?' },
        { label: 'Riwayat Pekerjaan', prompt: 'Tampilkan riwayat pekerjaan saya.' },
        { label: 'Ringkasan Pekerjaan', prompt: 'Buat ringkasan pekerjaan saya.' },
      ];
    }

    return [
      { label: 'Tugas Saya Hari Ini', prompt: 'Apa saja tugas saya hari ini?' },
      { label: 'Tugas Mendekati Deadline', prompt: 'Tampilkan tugas mendekati deadline.' },
      { label: 'Diagnosis Perangkat', prompt: 'Apa diagnosis perangkat yang saya tangani?' },
      { label: 'Riwayat Pekerjaan Selesai', prompt: 'Tampilkan riwayat pekerjaan saya.' },
      { label: 'Ringkasan Kinerja', prompt: 'Buat ringkasan pekerjaan saya.' },
    ];
  }

  // 3. ADMIN
  if (role === 'admin') {
    if (p.startsWith('/admin/technicians') || p.startsWith('/admin/assignments')) {
      return [
        { label: 'Statistik Teknisi', prompt: 'Tampilkan statistik teknisi.' },
        { label: 'Teknisi Beban Tertinggi', prompt: 'Siapa teknisi yang memiliki beban kerja tertinggi?' },
        { label: 'Performa Teknisi', prompt: 'Bagaimana performa teknisi bulan ini?' },
        { label: 'Pesanan Belum Ditugaskan', prompt: 'Pesanan mana yang belum mendapatkan teknisi?' },
      ];
    }

    if (p.startsWith('/admin/payments')) {
      return [
        { label: 'Total Transaksi Bulan Ini', prompt: 'Berapa total transaksi bulan ini?' },
        { label: 'Pendapatan Tercatat', prompt: 'Berapa total pendapatan tercatat?' },
        { label: 'Tagihan Belum Dibayar', prompt: 'Berapa tagihan belum dibayar?' },
      ];
    }

    return [
      { label: 'Total Pesanan Bulan Ini', prompt: 'Berapa total pesanan bulan ini?' },
      { label: 'Statistik Teknisi', prompt: 'Tampilkan statistik teknisi.' },
      { label: 'Perbaikan Tertunda', prompt: 'Apa saja perbaikan yang tertunda?' },
      { label: 'Total Transaksi Bulan Ini', prompt: 'Berapa total transaksi bulan ini?' },
      { label: 'Laporan Operasional Hari Ini', prompt: 'Buat laporan operasional hari ini.' },
    ];
  }

  // 4. GUEST (TAMU PUBLIK)
  return [
    { label: 'Apa itu BANTUIN?', prompt: 'Apa itu BANTUIN?' },
    { label: 'Layanan yang Tersedia', prompt: 'Layanan apa saja yang tersedia?' },
    { label: 'Cara Mendaftar', prompt: 'Bagaimana cara mendaftar?' },
    { label: 'Proses Pemesanan', prompt: 'Bagaimana proses pemesanan?' },
    { label: 'Apakah Memerlukan OTP?', prompt: 'Apakah pendaftaran memerlukan OTP?' },
  ];
}

