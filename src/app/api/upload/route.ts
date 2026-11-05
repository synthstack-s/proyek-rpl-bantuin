import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_FOLDERS = ['repairs', 'technicians', 'chat', 'reviews', 'avatars'] as const;
type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/upload
 * Endpoint aman untuk mengunggah berkas gambar atau dokumen PDF (multipart/form-data).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verifikasi Autentikasi Pengguna (Customer, Teknisi, atau Admin)
    const userSession = await getUserSession();
    const adminSession = !userSession ? await getAdminSession() : null;
    const session = userSession || adminSession;

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda harus login untuk mengunggah berkas' },
        { status: 401 }
      );
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderInput = (formData.get('folder') as string | null) || 'repairs';

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'Berkas (file) wajib dilampirkan' },
        { status: 400 }
      );
    }

    // 3. Validasi Target Folder (Mencegah Path Traversal)
    const targetFolder: AllowedFolder = ALLOWED_FOLDERS.includes(folderInput as AllowedFolder)
      ? (folderInput as AllowedFolder)
      : 'repairs';

    // 4. Validasi Tipe Konten MIME
    const mimeType = file.type;
    const fileExt = ALLOWED_MIME_TYPES[mimeType];

    if (!fileExt) {
      return NextResponse.json(
        {
          success: false,
          message: 'Format berkas tidak didukung. Format yang diperbolehkan: JPG, PNG, WEBP, GIF, PDF',
        },
        { status: 400 }
      );
    }

    // 5. Validasi Ukuran Berkas
    const isPdf = mimeType === 'application/pdf';
    const maxSize = isPdf ? MAX_DOC_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

    if (file.size > maxSize) {
      const maxMb = maxSize / (1024 * 1024);
      return NextResponse.json(
        {
          success: false,
          message: `Ukuran berkas melebihi batas maksimum (${maxMb} MB)`,
        },
        { status: 400 }
      );
    }

    // 6. Buat Nama Berkas Unik dan Simpan
    const randomUuid = crypto.randomUUID();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `${Date.now()}_${randomUuid.slice(0, 8)}${fileExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadDirPath = path.join(process.cwd(), 'public', 'uploads', targetFolder);
    const destinationFilePath = path.join(uploadDirPath, uniqueFileName);

    await writeFile(destinationFilePath, buffer);

    const publicUrl = `/uploads/${targetFolder}/${uniqueFileName}`;

    return NextResponse.json({
      success: true,
      message: 'Berkas berhasil diunggah',
      data: {
        url: publicUrl,
        fileName: uniqueFileName,
        originalName: sanitizedOriginalName,
        size: file.size,
        mimeType: mimeType,
      },
    });
  } catch (error: any) {
    console.error('Error in /api/upload:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memproses unggahan berkas' },
      { status: 500 }
    );
  }
}
