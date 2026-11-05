import { z } from 'zod';

/**
 * Nilai status ENUM akun pengguna (users.status)
 */
export const userAccountStatusEnum = z.enum([
  'active',
  'inactive',
  'suspended',
  'pending_verification',
]);

/**
 * Nilai status ENUM verifikasi profil teknisi (technician_profiles.verified_status)
 */
export const technicianVerifiedStatusEnum = z.enum([
  'pending',
  'verified',
  'rejected',
  'suspended',
]);

/**
 * Nilai status ENUM verifikasi dokumen teknisi (technician_documents.verification_status)
 */
export const documentVerificationStatusEnum = z.enum([
  'pending',
  'approved',
  'rejected',
  'revision_required',
]);

/**
 * Nilai jenis dokumen (technician_documents.document_type)
 */
export const documentTypeEnum = z.enum([
  'competency_certificate',
  'training_certificate',
  'portfolio',
  'business_license',
  'other',
]);

/**
 * Skema validasi untuk pembaruan profil dan status teknisi (PATCH /api/admin/technicians/[id])
 */
export const updateTechnicianSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Nama lengkap teknisi minimal 2 karakter')
    .max(150, 'Nama lengkap teknisi maksimal 150 karakter')
    .optional(),
  phone_number: z
    .string()
    .trim()
    .regex(/^(\+62|62|0)[0-9]{8,15}$/, 'Format nomor telepon tidak valid (contoh: +628123456789 atau 08123456789)')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(1000, 'Bio teknisi maksimal 1000 karakter')
    .optional()
    .nullable(),
  years_of_experience: z.coerce
    .number()
    .int('Tahun pengalaman harus bilangan bulat')
    .min(0, 'Pengalaman minimal 0 tahun')
    .max(50, 'Pengalaman maksimal 50 tahun')
    .optional(),
  is_available: z.boolean().optional(),
  verified_status: technicianVerifiedStatusEnum.optional(),
  account_status: userAccountStatusEnum.optional(),
  rejection_reason: z
    .string()
    .trim()
    .max(1000, 'Alasan penolakan maksimal 1000 karakter')
    .optional()
    .nullable(),
}).refine(
  (data) => {
    // Jika verified_status diubah menjadi rejected, alasan penolakan wajib diisi
    if (data.verified_status === 'rejected' && (!data.rejection_reason || data.rejection_reason.trim().length === 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'Alasan penolakan (rejection_reason) wajib diisi saat menolak verifikasi teknisi',
    path: ['rejection_reason'],
  }
);

/**
 * Skema validasi untuk verifikasi dokumen (PATCH /api/admin/technicians/[id]/documents/[docId])
 */
export const verifyDocumentSchema = z.object({
  verification_status: documentVerificationStatusEnum,
  admin_notes: z
    .string()
    .trim()
    .max(1000, 'Catatan admin maksimal 1000 karakter')
    .optional()
    .nullable(),
}).refine(
  (data) => {
    if (
      (data.verification_status === 'rejected' || data.verification_status === 'revision_required') &&
      (!data.admin_notes || data.admin_notes.trim().length === 0)
    ) {
      return false;
    }
    return true;
  },
  {
    message: 'Catatan admin wajib diisi saat menolak atau meminta revisi dokumen',
    path: ['admin_notes'],
  }
);

/**
 * Skema validasi untuk penambahan spesialisasi kategori teknisi
 */
export const addSpecializationSchema = z.object({
  category_id: z.coerce
    .number({ message: 'Kategori peralatan wajib dipilih' })
    .int('ID kategori harus bilangan bulat')
    .positive('ID kategori tidak valid'),
  supporting_document_id: z.coerce
    .number()
    .int('ID dokumen pendukung harus bilangan bulat')
    .positive('ID dokumen pendukung tidak valid')
    .optional()
    .nullable(),
});

export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;
export type AddSpecializationInput = z.infer<typeof addSpecializationSchema>;
