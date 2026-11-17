'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Sparkles,
  X,
  Send,
  User,
  RotateCcw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Maximize2,
  Minimize2,
  Compass,
} from 'lucide-react';
import { DiagnosisCardView } from './DiagnosisCardView';
import { DiagnosisCard, QuickSuggestion } from '@/lib/chatbot/types';
import {
  initWidgetSession,
  type InitWidgetSessionResult,
  type WidgetFetchFn,
  type WidgetSessionStorage,
} from '@/lib/chatbot/widget-session';

interface UIMessage {
  id?: number | string;
  role: 'user' | 'assistant' | 'system';
  message: string;
  metadata?: {
    model?: string;
    diagnosisCard?: DiagnosisCard | null;
    quickSuggestions?: QuickSuggestion[];
    safetyAlert?: string | null;
    topicRefused?: boolean;
  };
  createdAt?: string;
}

/**
 * Renderer ringan untuk memformat Markdown (Bold, Lists, Headings, dan Tabel) secara visual
 */
function renderMarkdownInline(content: string) {
  if (!content) return null;
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-[#FFFBF4]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function renderTextLines(lines: string[]) {
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed === '---') {
      return <hr key={idx} className="my-2 border-t border-slate-200 dark:border-[#D8CFBC]/20" />;
    }
    if (trimmed.startsWith('### ')) {
      const headingText = trimmed.replace(/^###\s+/, '');
      return (
        <h4 key={idx} className="text-sm font-bold text-slate-900 dark:text-[#FFFBF4] mt-2 mb-1">
          {renderMarkdownInline(headingText)}
        </h4>
      );
    }
    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.replace(/^##\s+/, '');
      return (
        <h3 key={idx} className="text-base font-bold text-slate-900 dark:text-[#FFFBF4] mt-2.5 mb-1">
          {renderMarkdownInline(headingText)}
        </h3>
      );
    }
    return (
      <div key={idx} className="min-h-[1.25rem]">
        {renderMarkdownInline(line)}
      </div>
    );
  });
}

function FormattedChatMessage({ text }: { text: string }) {
  if (!text) return null;

  // Cek apakah pesan memuat tabel Markdown (| Col 1 | Col 2 |)
  if (text.includes('|') && text.includes('---')) {
    const lines = text.split('\n');
    const tableLines: string[] = [];
    const beforeLines: string[] = [];
    const afterLines: string[] = [];
    let inTable = false;
    let tableDone = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (!tableDone) {
          inTable = true;
          tableLines.push(trimmed);
        } else {
          afterLines.push(line);
        }
      } else {
        if (inTable) {
          inTable = false;
          tableDone = true;
        }
        if (!tableDone) {
          beforeLines.push(line);
        } else {
          afterLines.push(line);
        }
      }
    }

    if (tableLines.length >= 3) {
      const headerLine = tableLines[0];
      const dataLines = tableLines.slice(2); // Lewati baris separator |:---|

      const headers = headerLine
        .split('|')
        .slice(1, -1)
        .map((h) => h.trim());

      const rows = dataLines.map((row) =>
        row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
      );

      return (
        <div className="space-y-2">
          {beforeLines.length > 0 && (
            <div className="space-y-1">{renderTextLines(beforeLines)}</div>
          )}
          <div className="overflow-x-auto my-2 rounded-xl border border-slate-200 bg-white dark:border-[#D8CFBC]/25 dark:bg-[#141510]/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 dark:border-[#D8CFBC]/20 dark:bg-[#D8CFBC]/10">
                  {headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-3 py-2 font-semibold text-slate-900 dark:text-[#FFFBF4]">
                      {renderMarkdownInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#D8CFBC]/10">
                {rows.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-[#FFFBF4]/5">
                    {r.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-slate-700 dark:text-[#D8CFBC]/90 font-medium">
                        {renderMarkdownInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {afterLines.length > 0 && (
            <div className="space-y-1">{renderTextLines(afterLines)}</div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="space-y-1">
      {renderTextLines(text.split('\n'))}
    </div>
  );
}

/**
 * Ekstraktor ringkasan visual antarmuka/layar (DOM Interface Awareness)
 * Membaca data yang terlihat di dashboard atau halaman saat ini tanpa menyertakan input sensitif.
 */
function extractCurrentInterfaceSummary(): {
  pathname: string;
  pageTitle: string;
  visibleContentSummary: string;
  screenData: Record<string, any>;
} {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { pathname: '/', pageTitle: '', visibleContentSummary: '', screenData: {} };
  }

  const pathname = window.location.pathname || '/';
  const pageTitle = document.title || '';
  const screenData: Record<string, any> = {};

  // 1. Ekstraksi kartu metrik / angka statistik terlihat di layar
  const foundStats: string[] = [];
  const statElements = document.querySelectorAll(
    '[data-stat-card], .stat-card, [data-stat-label], [data-metric], [aria-label*="stat" i], .text-2xl.font-bold, .text-3xl.font-bold, .text-xl.font-bold'
  );
  statElements.forEach((el) => {
    const parent = el.closest('div, section, article');
    const label = parent?.querySelector('span, p, h3, h4, [class*="text-xs"], [class*="text-sm"]')?.textContent?.trim() || '';
    const val = el.textContent?.trim() || '';
    if (val && label && val !== label && val.length < 50 && label.length < 80) {
      foundStats.push(`${label}: ${val}`);
    }
  });

  // 2. Ekstraksi judul halaman / bagian konten utama
  const headings: string[] = [];
  document.querySelectorAll('main h1, main h2, main h3, h1, h2').forEach((h) => {
    const text = h.textContent?.trim();
    if (text && text.length > 2 && text.length < 100 && !headings.includes(text)) {
      headings.push(text);
    }
  });

  // 3. Ekstraksi tab / filter aktif
  const activeTabs: string[] = [];
  document.querySelectorAll('[role="tab"][aria-selected="true"], [data-active="true"], button[class*="bg-amber-600"], button[class*="active"]').forEach((tab) => {
    const text = tab.textContent?.trim();
    if (text && text.length < 50 && !activeTabs.includes(text)) {
      activeTabs.push(text);
    }
  });

  // 4. Ekstraksi judul kolom tabel jika ada
  const tableHeaders: string[] = [];
  document.querySelectorAll('main table th, table th').forEach((th) => {
    const text = th.textContent?.trim();
    if (text && text.length < 40 && !tableHeaders.includes(text)) {
      tableHeaders.push(text);
    }
  });

  // 5. Ekstraksi beberapa baris data tabel terlihat (maks 5 baris)
  const tableRows: string[] = [];
  document.querySelectorAll('main table tbody tr, table tbody tr').forEach((tr, idx) => {
    if (idx < 5) {
      const rowCells = Array.from(tr.querySelectorAll('td'))
        .map((td) => td.textContent?.trim() || '')
        .filter((c) => c.length > 0 && c.length < 60)
        .slice(0, 5);
      if (rowCells.length > 0) {
        tableRows.push(rowCells.join(' | '));
      }
    }
  });

  // 6. Susun ringkasan terstruktur
  const summaryParts: string[] = [];
  if (headings.length > 0) {
    summaryParts.push(`Judul/Bagian Layar: ${headings.slice(0, 4).join(' > ')}`);
  }
  if (activeTabs.length > 0) {
    summaryParts.push(`Tab/Filter Aktif: ${activeTabs.join(', ')}`);
  }
  if (foundStats.length > 0) {
    const uniqueStats = Array.from(new Set(foundStats)).slice(0, 10);
    summaryParts.push(`Kartu/Metrik Statistik Terlihat: ${uniqueStats.join('; ')}`);
    screenData.visibleStats = uniqueStats;
  }
  if (tableHeaders.length > 0) {
    summaryParts.push(`Kolom Tabel di Layar: ${tableHeaders.join(', ')}`);
  }
  if (tableRows.length > 0) {
    summaryParts.push(`Contoh Baris Data Terlihat:\n${tableRows.join('\n')}`);
  }

  // 7. Snippet teks container utama jika informasi di atas minim
  if (summaryParts.length === 0) {
    const mainEl = document.querySelector('main') || document.body;
    const cloned = mainEl.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll('script, style, input, textarea, svg, noscript').forEach((el) => el.remove());
    const rawText = (cloned.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (rawText) {
      summaryParts.push(`Ringkasan Konten Layar: ${rawText}`);
    }
  }

  return {
    pathname,
    pageTitle,
    visibleContentSummary: summaryParts.join('\n\n').slice(0, 2000),
    screenData,
  };
}

/**
 * Storage sesi widget — localStorage bila tersedia, fallback in-memory
 * yang tidak menyimpan apa-apa (SSR/private mode): init tetap jalan,
 * hanya tanpa pemakaian ulang antar muat halaman.
 */
function getWidgetSessionStorage(): WidgetSessionStorage {
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage;
    } catch {
      // localStorage bisa gagal (private mode) — pakai fallback di bawah.
    }
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

const widgetFetch: WidgetFetchFn = (url, init) => fetch(url, init);

export function ChatbotWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionUuid, setSessionUuid] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [userRole, setUserRole] = useState<string>('guest');
  const [userName, setUserName] = useState<string | null>(null);
  const [pageSuggestions, setPageSuggestions] = useState<QuickSuggestion[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dedup StrictMode (dev): pemanggilan efek kedua menempel pada promise
  // in-flight yang sama, bukan POST kedua.
  const sessionInitRef = useRef<{
    pathname: string;
    promise: Promise<InitWidgetSessionResult>;
  } | null>(null);
  // Halaman yang sesinya sudah siap — buka-tutup widget di halaman yang
  // sama tidak mengulang init (percakapan dipertahankan).
  const sessionReadyRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isOpen]);

  // Cek jika URL memiliki parameter ?chat=true atau #chat
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('chat') === 'true' || window.location.hash === '#chat') {
        setIsOpen(true);
      }
    }
  }, []);

  // Inisialisasi Sesi Chatbot — MALAS (lazy) + pakai ulang sesi tersimpan.
  //
  // PERBAIKAN (loop sesi): efek ini dulu berjalan pada SETIAP mount dan
  // SETIAP perpindahan halaman — bahkan saat widget TERTUTUP — dan selalu
  // membuat sesi BARU (UUID lama dihapus dari storage, tidak pernah
  // dipakai ulang). Widget terpasang global di root layout, jadi setiap
  // navigasi/refresh = POST /api/chat/session baru (2x di dev karena
  // React StrictMode), sampai kena 429 (batas 10/menit/IP) dan mengisi
  // tabel ai_consultation_sessions dengan sesi yatim.
  //
  // Aturan baru:
  // - Selama widget TERTUTUP, efek tidak melakukan apa-apa (nol request).
  // - Saat widget DIBUKA, sesi diinisialisasi lewat initWidgetSession:
  //   UUID tersimpan untuk halaman yang sama DIPAKAI ULANG (1 SELECT,
  //   tanpa INSERT); pindah halaman saat widget terbuka tetap mendapat
  //   sesi baru (reset per halaman dipertahankan).
  // - Buka-tutup widget di halaman yang sama tidak mengulang init —
  //   percakapan dipertahankan.
  useEffect(() => {
    if (!isOpen) return;
    if (sessionReadyRef.current === pathname) return;

    let isCancelled = false;

    // Reset state percakapan seketika saat rute/halaman berubah
    setMessages([]);
    setInputMessage('');
    setErrorNotice(null);
    setSessionUuid(null);
    setSessionId(undefined);

    const pageInfo = extractCurrentInterfaceSummary();

    // Dedup StrictMode (dev): pemanggilan efek kedua menempel pada
    // promise in-flight yang sama, bukan POST kedua.
    let initPromise: Promise<InitWidgetSessionResult>;
    if (
      sessionInitRef.current &&
      sessionInitRef.current.pathname === pathname
    ) {
      initPromise = sessionInitRef.current.promise;
    } else {
      initPromise = initWidgetSession({
        fetchFn: widgetFetch,
        storage: getWidgetSessionStorage(),
        pathname,
        pageContext: pageInfo,
      });
      sessionInitRef.current = { pathname, promise: initPromise };
      // Bersihkan ref begitu selesai agar init berikutnya (mis. sesudah
      // reset manual) tidak menempel pada promise lama.
      void initPromise.then(
        () => {
          if (sessionInitRef.current?.promise === initPromise) {
            sessionInitRef.current = null;
          }
        },
        () => {
          if (sessionInitRef.current?.promise === initPromise) {
            sessionInitRef.current = null;
          }
        }
      );
    }

    void initPromise.then((result) => {
      if (isCancelled) return;
      if (!result.ok) {
        setErrorNotice(result.message);
        return;
      }
      sessionReadyRef.current = pathname;
      setSessionUuid(result.data.sessionUuid);
      setSessionId(result.data.sessionId);
      setUserRole(result.data.userRole);
      setUserName(result.data.userName);
      setPageSuggestions(result.data.suggestions as QuickSuggestion[]);

      // Setel pesan sambutan baru yang khusus sesuai konteks halaman baru
      const greeting = generateWelcomeGreeting(
        result.data.userRole,
        result.data.userName,
        pathname
      );
      setMessages([
        {
          id: `welcome-${pathname}-${Date.now()}`,
          role: 'assistant',
          message: greeting,
          metadata: {
            quickSuggestions: result.data.suggestions as QuickSuggestion[],
          },
        },
      ]);
    });

    return () => {
      isCancelled = true;
    };
  }, [pathname, isOpen]);

  function generateWelcomeGreeting(role: string, name?: string | null, path?: string): string {
    const p = (path || '/').toLowerCase();
    const who = name ? ` ${name}` : '';

    if (role === 'admin' || p.startsWith('/admin')) {
      return `Halo Administrator${who}! Saya **BANTUIN Assistant**. Saya dapat membantu memeriksa **statistik seluruh pengguna**, **pengaturan konfigurasi sistem**, serta **ringkasan operasional pesanan perbaikan** secara langsung dari database BANTUIN. Ada data yang ingin diperiksa?`;
    }

    if (role === 'customer' || p.startsWith('/customer')) {
      return `Halo${who}! Saya **BANTUIN Assistant**, asisten AI resmi Anda. Anda dapat menanyakan **alat rumah tangga apa saja yang didukung BANTUIN**, mengecek **data diri Anda**, melacak **status pesanan perbaikan**, atau konsultasi kerusakan perangkat elektronik Anda. Ada yang bisa saya bantu?`;
    }

    if (role === 'technician' || p.startsWith('/technician')) {
      return `Halo Rekan Teknisi${who}! Saya **BANTUIN Assistant**. Anda dapat memeriksa **jadwal kunjungan perbaikan Anda hari ini** atau panduan keselamatan kerja BANTUIN.`;
    }

    return `Halo! Saya **BANTUIN Assistant**, siap membantu Anda mengenali **kategori peralatan rumah tangga yang dilayani BANTUIN**, konsultasi awal kerusakan (AC, Kulkas, Mesin Cuci, Pompa Air, TV, Dapur), serta panduan pemesanan teknisi resmi. Apa kendala yang Anda alami?`;
  }

  // Handler Kirim Pesan
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isLoading) return;

    setErrorNotice(null);
    setInputMessage('');

    const userMsg: UIMessage = {
      id: Date.now().toString(),
      role: 'user',
      message: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();
    const streamingAssistantMsg: UIMessage = {
      id: assistantMsgId,
      role: 'assistant',
      message: '',
      createdAt: new Date().toISOString(),
    };

    try {
      const pageInfo = extractCurrentInterfaceSummary();
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          sessionUuid: sessionUuid || undefined,
          pageContext: pageInfo,
          stream: true,
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      // JIKA SERVER MENDUKUNG REAL-TIME STREAMING RESPONSES (SSE)
      if (contentType.includes('text/event-stream') && res.body) {
        setMessages((prev) => [...prev, streamingAssistantMsg]);
        setIsLoading(false);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const block of parts) {
            if (!block.trim()) continue;
            const eventMatch = block.match(/^event:\s*(\w+)/m);
            const dataMatch = block.match(/^data:\s*(.+)$/m);
            const eventType = eventMatch ? eventMatch[1] : 'token';
            const rawData = dataMatch ? dataMatch[1] : '';

            if (!rawData) continue;

            try {
              const parsed = JSON.parse(rawData);

              if (eventType === 'token' && parsed.text) {
                accumulatedText += parsed.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, message: accumulatedText }
                      : msg
                  )
                );
              } else if (eventType === 'metadata') {
                if (parsed.session?.sessionUuid && parsed.session.sessionUuid !== sessionUuid) {
                  setSessionUuid(parsed.session.sessionUuid);
                }
                if (parsed.metadata?.quickSuggestions && parsed.metadata.quickSuggestions.length > 0) {
                  setPageSuggestions(parsed.metadata.quickSuggestions);
                }
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          metadata: {
                            ...parsed.metadata,
                            diagnosisCard: parsed.diagnosisCard || parsed.metadata?.diagnosisCard,
                          },
                        }
                      : msg
                  )
                );
              }
            } catch {
              // Abaikan kegagalan parse JSON parsial
            }
          }
        }
      } else {
        // FALLBACK STANDAR NON-STREAMING (JSON)
        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorNotice(data.message || 'Gagal memproses pesan.');
          setIsLoading(false);
          return;
        }

        if (data.session?.sessionUuid && data.session.sessionUuid !== sessionUuid) {
          setSessionUuid(data.session.sessionUuid);
        }

        if (data.metadata?.quickSuggestions && data.metadata.quickSuggestions.length > 0) {
          setPageSuggestions(data.metadata.quickSuggestions);
        }

        const assistantMsg: UIMessage = {
          id: assistantMsgId,
          role: 'assistant',
          message: data.reply,
          metadata: {
            ...data.metadata,
            diagnosisCard: data.diagnosisCard || data.metadata?.diagnosisCard,
          },
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      setErrorNotice('Terjadi kendala jaringan saat menghubungi asisten AI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset Percakapan (tombol eksplisit) — paksa sesi baru.
  const handleNewSession = async () => {
    sessionInitRef.current = null;
    sessionReadyRef.current = null;
    setSessionUuid(null);
    setSessionId(undefined);
    setMessages([]);
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const pageInfo = extractCurrentInterfaceSummary();
      const result = await initWidgetSession({
        fetchFn: widgetFetch,
        storage: getWidgetSessionStorage(),
        pathname,
        pageContext: pageInfo,
        forceNew: true,
      });
      if (!result.ok) {
        setErrorNotice(result.message);
        return;
      }
      sessionReadyRef.current = pathname;
      setSessionUuid(result.data.sessionUuid);
      setSessionId(result.data.sessionId);
      const greeting = generateWelcomeGreeting(userRole, userName, pathname);
      const newSuggestions = result.data.suggestions as QuickSuggestion[];
      setMessages([
        {
          id: 'welcome-reset',
          role: 'assistant',
          message: `Percakapan baru telah dimulai.\n\n${greeting}`,
          metadata: {
            quickSuggestions:
              newSuggestions.length > 0 ? newSuggestions : pageSuggestions,
          },
        },
      ]);
    } catch (err) {
      console.error(err);
      setErrorNotice('Terjadi kendala jaringan saat menghubungi asisten AI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Format Nama Halaman Konteks untuk Header
  const getPageContextLabel = () => {
    if (pathname.startsWith('/admin/users')) return 'Konteks: Manajemen Pengguna';
    if (pathname.startsWith('/admin/settings')) return 'Konteks: Konfigurasi Sistem';
    if (pathname.startsWith('/admin/repairs')) return 'Konteks: Kelola Pesanan';
    if (pathname.startsWith('/admin')) return 'Konteks: Administrator';
    if (pathname.startsWith('/customer/repairs/new')) return 'Konteks: Form Pemesanan';
    if (pathname.startsWith('/customer/repairs/')) return 'Konteks: Rincian Pesanan';
    if (pathname.startsWith('/customer')) return 'Konteks: Pelanggan';
    if (pathname.startsWith('/technician')) return 'Konteks: Teknisi';
    return 'Konteks: Beranda Layanan';
  };

  return (
    <>
      {/* Floating Trigger Button (Saat Widget Tertutup) */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in duration-300">
          <button
            onClick={() => setIsOpen(true)}
            className="chatbot-floating-trigger group relative flex items-center gap-2.5 rounded-full bg-white text-slate-900 border border-slate-200/90 dark:bg-[#181913]/90 dark:text-[#FFFBF4] dark:border-[#D8CFBC]/30 px-4 py-3 shadow-xl dark:shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-slate-400 dark:hover:border-[#D8CFBC] active:scale-95"
          >
            <div className="relative flex h-6 w-6 items-center justify-center">
              <Bot className="h-6 w-6 text-amber-600 dark:text-[#D8CFBC] transition group-hover:rotate-12" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 dark:bg-[#D8CFBC] opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 dark:bg-[#FFFBF4]"></span>
              </span>
            </div>
            <span className="text-sm font-bold tracking-wide">Tanya AI</span>
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-[#D8CFBC]" />
          </button>
        </div>
      )}

      {/* Floating Chat Modal / Drawer (Saat Widget Terbuka di Atas Halaman Aktif) */}
      {isOpen && (
        <div
          className={`chatbot-modal-window fixed z-50 flex flex-col rounded-3xl border border-slate-200 dark:border-[#D8CFBC]/25 bg-white/95 dark:bg-[#141510]/95 text-slate-900 dark:text-[#FFFBF4] shadow-2xl backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
            isExpanded
              ? 'bottom-3 right-3 sm:bottom-5 sm:right-5 w-[96vw] sm:w-[540px] md:w-[680px] h-[92vh]'
              : 'bottom-3 right-3 sm:bottom-5 sm:right-5 w-[94vw] sm:w-[420px] md:w-[460px] h-[600px] max-h-[85vh]'
          }`}
        >
          {/* Top Rim Reflection */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-300/40 dark:via-[#D8CFBC]/30 to-transparent" />

          {/* Header Widget */}
          <div className="chatbot-header flex shrink-0 items-center justify-between border-b border-slate-200 dark:border-[#D8CFBC]/15 bg-slate-50/90 dark:bg-[#181913]/90 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 dark:bg-[#D8CFBC]/15 border border-amber-500/20 dark:border-[#D8CFBC]/25 text-amber-600 dark:text-[#D8CFBC] shadow-inner">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-[#FFFBF4]">BANTUIN Assistant</h3>
                  <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 dark:bg-[#D8CFBC]/15 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-[#D8CFBC] border border-amber-500/20 dark:border-[#D8CFBC]/20">
                    <Sparkles className="h-2 w-2" />
                    AI
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#D8CFBC]/70">
                  <Compass className="h-3 w-3 text-amber-600 dark:text-[#D8CFBC]" />
                  <span className="truncate max-w-[180px] sm:max-w-[240px] font-mono">{getPageContextLabel()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Reset Sesi */}
              <button
                onClick={handleNewSession}
                disabled={isLoading}
                title="Mulai Sesi Baru"
                className="rounded-xl p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-[#D8CFBC]/70 dark:hover:bg-[#D8CFBC]/10 dark:hover:text-[#FFFBF4] transition disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              {/* Perbesar / Perkecil Ukuran */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Kecilkan Tampilan' : 'Perbesar Tampilan'}
                className="hidden sm:inline-flex rounded-xl p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-[#D8CFBC]/70 dark:hover:bg-[#D8CFBC]/10 dark:hover:text-[#FFFBF4] transition"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>

              {/* Tutup Widget */}
              <button
                onClick={() => setIsOpen(false)}
                title="Tutup Widget Chat"
                className="rounded-xl p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-[#D8CFBC]/70 dark:hover:bg-[#D8CFBC]/10 dark:hover:text-[#FFFBF4] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Area Pesan Chat */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar bg-white/50 dark:bg-transparent">
            {messages.map((m, index) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id || index}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#1C1D17] border border-slate-200 dark:border-[#D8CFBC]/20 text-amber-600 dark:text-[#D8CFBC] shadow-inner mt-0.5">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm shadow-md leading-relaxed ${
                      isUser
                        ? 'chatbot-bubble-user bg-slate-900 text-white dark:bg-[#FFFBF4] dark:text-[#11120D] font-medium rounded-br-none shadow-md'
                        : 'chatbot-bubble-assistant border border-slate-200 dark:border-[#D8CFBC]/15 bg-slate-50/90 dark:bg-[#1C1D17]/90 text-slate-900 dark:text-[#FFFBF4] rounded-bl-none shadow-xs'
                    }`}
                  >
                    <FormattedChatMessage text={m.message} />

                    {/* Bahaya Keselamatan */}
                    {m.metadata?.safetyAlert && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                        <div>{m.metadata.safetyAlert}</div>
                      </div>
                    )}

                    {/* Kartu Diagnosis Terstruktur */}
                    {m.metadata?.diagnosisCard && (
                      <DiagnosisCardView
                        card={m.metadata.diagnosisCard}
                        sessionId={sessionId}
                        sessionUuid={sessionUuid || undefined}
                      />
                    )}

                    {/* Quick Suggestion Chips */}
                    {m.metadata?.quickSuggestions && m.metadata.quickSuggestions.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-[#D8CFBC]/10 flex flex-wrap gap-1.5">
                        {m.metadata.quickSuggestions.map((chip, chipIdx) => (
                          <button
                            key={chipIdx}
                            onClick={() => handleSendMessage(chip.prompt)}
                            disabled={isLoading}
                            className="chatbot-chip rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-[#D8CFBC]/25 dark:bg-[#181913] dark:text-[#D8CFBC] dark:hover:bg-[#D8CFBC]/20 dark:hover:text-[#FFFBF4] px-2.5 py-1 text-[11px] transition disabled:opacity-50"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white dark:bg-[#565449] dark:border dark:border-[#D8CFBC]/20 dark:text-[#FFFBF4] shadow-sm mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indikator Memproses AI */}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#D8CFBC]/70">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#1C1D17] border border-slate-200 dark:border-[#D8CFBC]/20 text-amber-600 dark:text-[#D8CFBC] shadow-sm">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#D8CFBC]/15 bg-slate-50/90 dark:bg-[#181913]/90 px-3 py-2 text-slate-700 dark:text-[#FFFBF4]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-[#D8CFBC]" />
                  <span>BANTUIN AI sedang memproses respons...</span>
                </div>
              </div>
            )}

            {errorNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/40 p-2.5 text-xs text-rose-800 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorNotice}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Context Chips Bar (di atas input) */}
          {pageSuggestions.length > 0 && (
            <div className="chatbot-chips-bar shrink-0 border-t border-slate-200 dark:border-[#D8CFBC]/15 bg-slate-50/80 dark:bg-[#181913]/60 px-3 py-1.5 overflow-x-auto flex gap-1.5 no-scrollbar">
              {pageSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s.prompt)}
                  disabled={isLoading}
                  className="chatbot-chip whitespace-nowrap rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 dark:border-[#D8CFBC]/20 dark:bg-[#1C1D17] dark:text-[#D8CFBC] dark:hover:border-[#D8CFBC] dark:hover:text-[#FFFBF4] px-2.5 py-1 text-[11px] transition disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Footer Input Box */}
          <div className="chatbot-footer shrink-0 border-t border-slate-200 dark:border-[#D8CFBC]/15 bg-slate-50/90 dark:bg-[#181913]/90 p-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="chatbot-input-form flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white dark:border-[#D8CFBC]/20 dark:bg-[#11120D] p-1 transition focus-within:border-amber-500 dark:focus-within:border-[#D8CFBC] shadow-xs"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  userRole === 'admin'
                    ? 'Tanya statistik pengguna, konfigurasi, atau perbaikan...'
                    : userRole === 'customer'
                    ? 'Tanya data diri, alat rumah tangga, atau konsultasi...'
                    : 'Ceritakan kerusakan perangkat rumah tangga Anda...'
                }
                maxLength={2000}
                disabled={isLoading}
                className="chatbot-input-field flex-1 bg-transparent px-2.5 py-1.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 dark:text-[#FFFBF4] dark:placeholder-[#8B8878] outline-none disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="chatbot-send-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#D8CFBC] dark:text-[#11120D] font-bold shadow-md transition disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
