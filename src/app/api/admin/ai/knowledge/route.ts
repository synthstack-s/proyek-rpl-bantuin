import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getAllActiveKnowledge,
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  toggleKnowledgeActiveStatus,
} from '@/lib/knowledge/knowledge-service';
import { KnowledgeCategory } from '@/lib/knowledge/types';

/**
 * GET /api/admin/ai/knowledge
 * Mengambil seluruh dokumen Knowledge Base dengan pencarian dan filter
 */
export async function GET(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat melihat Knowledge Base.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';
    const category = searchParams.get('category') || '';
    const status = searchParams.get('status') || '';

    let docs = await getAllActiveKnowledge();

    if (search) {
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(search) ||
          d.summary.toLowerCase().includes(search) ||
          d.content.toLowerCase().includes(search) ||
          d.tags.some((t) => t.toLowerCase().includes(search))
      );
    }

    if (category) {
      docs = docs.filter((d) => d.category === category);
    }

    if (status === 'active') {
      docs = docs.filter((d) => d.isActive);
    } else if (status === 'inactive') {
      docs = docs.filter((d) => !d.isActive);
    }

    const categories: KnowledgeCategory[] = [
      'application_overview',
      'feature_documentation',
      'module_documentation',
      'business_rules',
      'user_guide',
      'workflow_documentation',
      'role_permission_documentation',
      'database_relationship_documentation',
      'system_configuration_documentation',
      'error_handling_documentation',
    ];

    return NextResponse.json({
      success: true,
      documents: docs,
      total: docs.length,
      categories,
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/knowledge:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil dokumen knowledge: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai/knowledge
 * Menambahkan dokumen pengetahuan baru ke Knowledge Base
 */
export async function POST(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menambah dokumen.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { slug, title, category, tags, summary, content, source, isActive } = body;

    if (!slug || !title || !category || !content) {
      return NextResponse.json(
        { success: false, message: 'Field slug, title, category, dan content wajib diisi.' },
        { status: 400 }
      );
    }

    const result = await createKnowledgeDocument(
      {
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        title: title.trim(),
        category,
        tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()) : [],
        summary: summary || '',
        content: content.trim(),
        source: source || 'Admin Manual Entry',
        isActive: isActive !== false,
      },
      Number(adminSession.id)
    );

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Dokumen Knowledge Base berhasil ditambahkan.',
      id: result.id,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/knowledge:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal membuat dokumen knowledge: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/ai/knowledge
 * Memperbarui dokumen pengetahuan yang ada atau mengubah status aktif
 */
export async function PUT(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat memperbarui dokumen.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, action, isActive, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'ID dokumen wajib disertakan.' }, { status: 400 });
    }

    if (action === 'toggle-status') {
      const result = await toggleKnowledgeActiveStatus(Number(id), Boolean(isActive));
      return NextResponse.json(result);
    }

    if (Array.isArray(updateData.tags)) {
      // already array
    } else if (typeof updateData.tags === 'string') {
      updateData.tags = updateData.tags.split(',').map((t: string) => t.trim());
    }

    const result = await updateKnowledgeDocument(Number(id), updateData);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Dokumen Knowledge Base berhasil diperbarui.',
    });
  } catch (err: any) {
    console.error('Error in PUT /api/admin/ai/knowledge:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui dokumen knowledge: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ai/knowledge
 * Menghapus dokumen pengetahuan dari Knowledge Base
 */
export async function DELETE(request: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menghapus dokumen.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    let id = idParam ? Number(idParam) : null;

    if (!id) {
      try {
        const body = await request.json();
        id = body?.id ? Number(body.id) : null;
      } catch {
        // no body
      }
    }

    if (!id) {
      return NextResponse.json({ success: false, message: 'ID dokumen wajib disertakan.' }, { status: 400 });
    }

    const result = await deleteKnowledgeDocument(id);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Dokumen Knowledge Base berhasil dihapus.',
    });
  } catch (err: any) {
    console.error('Error in DELETE /api/admin/ai/knowledge:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal menghapus dokumen knowledge: ' + err.message },
      { status: 500 }
    );
  }
}
