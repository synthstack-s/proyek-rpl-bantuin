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
        <strong key={i} className="font-bold text-[#FFFBF4]">
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
      return <hr key={idx} className="my-2 border-t border-[#D8CFBC]/20" />;
    }
    if (trimmed.startsWith('### ')) {
      const headingText = trimmed.replace(/^###\s+/, '');
      return (
        <h4 key={idx} className="text-sm font-bold text-[#FFFBF4] mt-2 mb-1">
          {renderMarkdownInline(headingText)}
        </h4>
      );
    }
    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.replace(/^##\s+/, '');
      return (
        <h3 key={idx} className="text-base font-bold text-[#FFFBF4] mt-2.5 mb-1">
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
          <div className="overflow-x-auto my-2 rounded-xl border border-[#D8CFBC]/25 bg-[#141510]/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#D8CFBC]/20 bg-[#D8CFBC]/10">
                  {headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-3 py-2 font-semibold text-[#FFFBF4]">
                      {renderMarkdownInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10">
                {rows.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[#FFFBF4]/5">
                    {r.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-[#D8CFBC]/90 font-medium">
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

  // Inisialisasi Sesi Chatbot & Reset Otomatis Saat Berpindah Halaman
  useEffect(() => {
    let isCancelled = false;

    async function initSessionForPage() {
      // 1. Reset state percakapan seketika saat rute/halaman berubah
      setMessages([]);
      setInputMessage('');
      setErrorNotice(null);
      setSessionUuid(null);
      setSessionId(undefined);

      // Bersihkan sesi lama dari storage agar percakapan halaman sebelumnya tidak terbawa
      if (typeof window !== 'undefined') {
        localStorage.removeItem('bantuin_chat_uuid');
      }

      try {
        // 2. Buat sesi baru yang murni untuk halaman/rute ini
        const res = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageContext: {
              pathname,
              pageTitle: typeof document !== 'undefined' ? document.title : undefined,
            },
          }),
        });

        const data = await res.json();
        if (isCancelled) return;

        if (data.success && data.session) {
          setSessionUuid(data.session.sessionUuid);
          setSessionId(data.session.id);
          if (data.user) {
            setUserRole(data.user.role || 'guest');
            setUserName(data.user.name || null);
          }
          if (data.suggestions) {
            setPageSuggestions(data.suggestions);
          }

          // 3. Setel pesan sambutan baru yang khusus sesuai konteks halaman baru
          const greeting = generateWelcomeGreeting(data.user?.role || 'guest', data.user?.name, pathname);
          setMessages([
            {
              id: `welcome-${pathname}-${Date.now()}`,
              role: 'assistant',
              message: greeting,
              metadata: {
                quickSuggestions: data.suggestions || [],
              },
            },
          ]);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Gagal menginisialisasi sesi chat widget untuk halaman ini:', err);
        }
      }
    }

    initSessionForPage();

    return () => {
      isCancelled = true;
    };
  }, [pathname]);

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

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          sessionUuid: sessionUuid || undefined,
          pageContext: {
            pathname,
            pageTitle: typeof document !== 'undefined' ? document.title : undefined,
          },
        }),
      });

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
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        message: data.reply,
        metadata: {
          ...data.metadata,
          diagnosisCard: data.diagnosisCard || data.metadata?.diagnosisCard,
        },
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setErrorNotice('Terjadi kendala jaringan saat menghubungi asisten AI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset Percakapan
  const handleNewSession = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bantuin_chat_uuid');
    }
    setSessionUuid(null);
    setMessages([]);
    setIsLoading(true);
    try {
      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageContext: { pathname },
        }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setSessionUuid(data.session.sessionUuid);
        setSessionId(data.session.id);
        const greeting = generateWelcomeGreeting(userRole, userName, pathname);
        setMessages([
          {
            id: 'welcome-reset',
            role: 'assistant',
            message: `Percakapan baru telah dimulai.\n\n${greeting}`,
            metadata: {
              quickSuggestions: data.suggestions || pageSuggestions,
            },
          },
        ]);
      }
    } catch (err) {
      console.error(err);
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
            className="group relative flex items-center gap-2.5 rounded-full bg-[#181913]/90 text-[#FFFBF4] border border-[#D8CFBC]/30 px-4 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-[#D8CFBC] active:scale-95"
          >
            <div className="relative flex h-6 w-6 items-center justify-center">
              <Bot className="h-6 w-6 text-[#D8CFBC] transition group-hover:rotate-12" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D8CFBC] opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FFFBF4]"></span>
              </span>
            </div>
            <span className="text-sm font-bold tracking-wide">Tanya AI</span>
            <Sparkles className="h-4 w-4 text-[#D8CFBC]" />
          </button>
        </div>
      )}

      {/* Floating Chat Modal / Drawer (Saat Widget Terbuka di Atas Halaman Aktif) */}
      {isOpen && (
        <div
          className={`fixed z-50 flex flex-col rounded-3xl border border-[#D8CFBC]/25 bg-[#141510]/95 shadow-2xl backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
            isExpanded
              ? 'bottom-3 right-3 sm:bottom-5 sm:right-5 w-[96vw] sm:w-[540px] md:w-[680px] h-[92vh]'
              : 'bottom-3 right-3 sm:bottom-5 sm:right-5 w-[94vw] sm:w-[420px] md:w-[460px] h-[600px] max-h-[85vh]'
          }`}
        >
          {/* Top Rim Reflection */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent" />

          {/* Header Widget */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#D8CFBC]/15 bg-[#181913]/90 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#D8CFBC]/15 border border-[#D8CFBC]/25 text-[#D8CFBC] shadow-inner">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-[#FFFBF4]">BANTUIN Assistant</h3>
                  <span className="flex items-center gap-0.5 rounded-full bg-[#D8CFBC]/15 px-2 py-0.5 text-[9px] font-semibold text-[#D8CFBC] border border-[#D8CFBC]/20">
                    <Sparkles className="h-2 w-2" />
                    AI
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#D8CFBC]/70">
                  <Compass className="h-3 w-3 text-[#D8CFBC]" />
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
                className="rounded-xl p-1.5 text-[#D8CFBC]/70 hover:bg-[#D8CFBC]/10 hover:text-[#FFFBF4] transition disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              {/* Perbesar / Perkecil Ukuran */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Kecilkan Tampilan' : 'Perbesar Tampilan'}
                className="hidden sm:inline-flex rounded-xl p-1.5 text-[#D8CFBC]/70 hover:bg-[#D8CFBC]/10 hover:text-[#FFFBF4] transition"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>

              {/* Tutup Widget */}
              <button
                onClick={() => setIsOpen(false)}
                title="Tutup Widget Chat"
                className="rounded-xl p-1.5 text-[#D8CFBC]/70 hover:bg-[#D8CFBC]/10 hover:text-[#FFFBF4] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Area Pesan Chat */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
            {messages.map((m, index) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id || index}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#1C1D17] border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner mt-0.5">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm shadow-md leading-relaxed ${
                      isUser
                        ? 'bg-[#FFFBF4] text-[#11120D] font-medium rounded-br-none'
                        : 'border border-[#D8CFBC]/15 bg-[#1C1D17]/90 text-[#FFFBF4] rounded-bl-none'
                    }`}
                  >
                    <FormattedChatMessage text={m.message} />

                    {/* Bahaya Keselamatan */}
                    {m.metadata?.safetyAlert && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400 mt-0.5" />
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
                      <div className="mt-3 pt-2 border-t border-[#D8CFBC]/10 flex flex-wrap gap-1.5">
                        {m.metadata.quickSuggestions.map((chip, chipIdx) => (
                          <button
                            key={chipIdx}
                            onClick={() => handleSendMessage(chip.prompt)}
                            disabled={isLoading}
                            className="rounded-full border border-[#D8CFBC]/25 bg-[#181913] px-2.5 py-1 text-[11px] text-[#D8CFBC] transition hover:bg-[#D8CFBC]/20 hover:text-[#FFFBF4] disabled:opacity-50"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#565449] border border-[#D8CFBC]/20 text-[#FFFBF4] shadow-sm mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indikator Memproses AI */}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-[#D8CFBC]/70">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#1C1D17] border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-sm">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border border-[#D8CFBC]/15 bg-[#181913]/90 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D8CFBC]" />
                  <span>BANTUIN AI sedang memproses data...</span>
                </div>
              </div>
            )}

            {errorNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                <span>{errorNotice}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Context Chips Bar (di atas input) */}
          {pageSuggestions.length > 0 && (
            <div className="shrink-0 border-t border-[#D8CFBC]/15 bg-[#181913]/60 px-3 py-1.5 overflow-x-auto flex gap-1.5 no-scrollbar">
              {pageSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s.prompt)}
                  disabled={isLoading}
                  className="whitespace-nowrap rounded-lg border border-[#D8CFBC]/20 bg-[#1C1D17] px-2.5 py-1 text-[11px] text-[#D8CFBC] hover:border-[#D8CFBC] hover:text-[#FFFBF4] transition disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Footer Input Box */}
          <div className="shrink-0 border-t border-[#D8CFBC]/15 bg-[#181913]/90 p-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-1.5 rounded-2xl border border-[#D8CFBC]/20 bg-[#11120D] p-1 transition focus-within:border-[#D8CFBC]"
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
                className="flex-1 bg-transparent px-2.5 py-1.5 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#8B8878] outline-none disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] font-bold shadow-md transition disabled:opacity-40"
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
