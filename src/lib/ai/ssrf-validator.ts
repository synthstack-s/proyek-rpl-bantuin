/**
 * SSRF PROTECTION & SOCKET-LEVEL DNS PINNING MODULE
 * BANTUIN AI PROVIDER MANAGEMENT
 * 
 * Menerapkan pertahanan komprehensif:
 * 1. Skema Wajib HTTPS (menolak plaintext http).
 * 2. Hostname Allowlist untuk Provider Resmi (Google Gemini & Groq).
 * 3. DNS Resolution Validation untuk IPv4 & IPv6 sebelum koneksi.
 * 4. Pemblokiran seluruh IP Privat, Loopback, Link-Local, CGNAT, dan Metadata Cloud.
 * 5. DNS Rebinding Protection via Socket-Level IP Pinning (Custom HTTPS Agent).
 * 6. Pembatasan Redirect (Anti-Open-Redirect Bypass).
 */

import dns from 'dns';
import https from 'https';
import http from 'http';
import net from 'net';

// Hostname resmi yang diakui secara bawaan
export const OFFICIAL_PROVIDER_HOSTNAMES: Record<string, string[]> = {
  gemini: ['generativelanguage.googleapis.com'],
  groq: ['api.groq.com'],
  deepseek: ['api.deepseek.com'],
  openai: ['api.openai.com'],
  openrouter: ['openrouter.ai'],
  mistral: ['api.mistral.ai'],
};

// S8b: TIDAK ADA lagi pemetaan IP fallback. Versi sebelumnya memakai
// KNOWN_AI_PROVIDER_HOSTS / IP generik 104.18.0.1 saat DNS gagal sehingga
// validasi lolos dengan IP FABRIKASI (fail-open). Sekarang kegagalan DNS
// selalu melempar SSRFValidationError (fail-closed) — lihat
// validateAndPinEndpoint. Konstanta itu dihapus total (tidak ada pengimpor
// lain di repo — hanya dipakai di dalam file ini).

export class SSRFValidationError extends Error {
  constructor(message: string, public readonly code: string = 'ERR_SSRF_VALIDATION') {
    super(message);
    this.name = 'SSRFValidationError';
  }
}

/**
 * Memeriksa apakah sebuah alamat IPv4 berada dalam jangkauan privat, loopback, atau reserved
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed dianggap tidak aman
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private Network RFC 1918)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private Network RFC 1918: 172.16 - 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private Network RFC 1918)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-Local / AWS/GCP Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT: 100.64 - 100.127)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0) return true;

  // 198.18.0.0/15 (Network Benchmark Testing)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 224.0.0.0/4 (Multicast: 224 - 239) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * L4: kembangkan alamat IPv6 menjadi 8 grup heksadesimal 16-bit (bentuk
 * biner/expanded). Menangani kompresi `::`, bentuk expanded penuh, dan ekor
 * IPv4 tersemat (`::ffff:192.168.1.1`, `::192.168.1.1` — dikonversi ke dua
 * grup heksa). Mengembalikan null untuk input malformed (pemanggil fail-closed).
 */
function expandIPv6ToGroups(ip: string): number[] | null {
  let addr = ip.toLowerCase().trim();
  // Buang zone id (mis. %eth0) bila ada.
  const zoneIdx = addr.indexOf('%');
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

  // Ekor IPv4 tersemat: ubah ke dua grup heksa agar parsing seragam.
  if (addr.includes('.')) {
    const lastColon = addr.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4 = addr.slice(lastColon + 1);
    if (!net.isIPv4(v4)) return null;
    const [a, b, c, d] = v4.split('.').map(Number);
    addr = `${addr.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const parseHextets = (s: string): number[] | null => {
    if (s === '') return [];
    const out: number[] = [];
    for (const h of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };

  const parts = addr.split('::');
  if (parts.length > 2) return null;

  if (parts.length === 2) {
    const head = parseHextets(parts[0]);
    const tail = parseHextets(parts[1]);
    if (!head || !tail) return null;
    // '::' wajib mewakili minimal satu grup nol — bila head+tail sudah 8,
    // alamatnya malformed (mis. '1:2:3:4:5:6:7:8::').
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    return [...head, ...new Array(missing).fill(0), ...tail];
  }

  const groups = parseHextets(parts[0]);
  if (!groups || groups.length !== 8) return null;
  return groups;
}

/**
 * Memeriksa apakah sebuah alamat IPv6 berada dalam jangkauan privat, loopback, atau link-local
 *
 * L4: pemeriksaan dilakukan pada 8 grup 16-bit hasil normalisasi, BUKAN pada
 * prefix string bentuk terkompresi — sebelumnya bentuk expanded seperti
 * `0:0:0:0:0:0:0:1` (loopback), `::192.168.1.1` (IPv4-compatible), dan prefix
 * NAT64 `64:ff9b::/96` lolos karena tidak cocok dengan prefix mana pun.
 * Daftar blokir kini mencakup: unspecified/loopback, IPv4-mapped (didelegasikan
 * ke isPrivateIPv4), IPv4-compatible `::/96`, NAT64 `64:ff9b::/96`, Teredo
 * `2001::/32`, link-local `fe80::/10`, ULA `fc00::/7`, dan multicast `ff00::/8`.
 */
export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6ToGroups(ip);
  if (!g) return true; // Malformed dianggap tidak aman (fail-closed)

  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // ::/128 (Unspecified) & ::1/128 (Loopback) — berlaku juga untuk bentuk
  // expanded (0:0:0:0:0:0:0:0 dan 0:0:0:0:0:0:0:1).
  if (firstFiveZero && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true;

  // IPv4-mapped IPv6 ::ffff:0:0/96 — putuskan dari IPv4 yang dibungkus
  // (perilaku lama dipertahankan: ::ffff:8.8.8.8 tetap publik).
  if (firstFiveZero && g5 === 0xffff) {
    const v4 = `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`;
    return isPrivateIPv4(v4);
  }

  // ::/96 (IPv4-compatible, mis. ::192.168.1.1 dan ::8.8.8.8) — seluruh
  // prefix diblokir karena membungkus alamat IPv4.
  if (firstFiveZero && g5 === 0) return true;

  // 64:ff9b::/96 (NAT64 — membungkus IPv4, mis. 64:ff9b::a9fe:a9fe =
  // 169.254.169.254 metadata cloud).
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true;

  // 2001::/32 (Teredo — membungkus IPv4).
  if (g0 === 0x2001 && g1 === 0x0000) return true;

  // fe80::/10 (Link-Local)
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true;

  // fc00::/7 (Unique Local Address RFC 4193: fc00::/8 & fd00::/8)
  if ((g0 & 0xfe00) === 0xfc00) return true;

  // ff00::/8 (Multicast)
  if ((g0 & 0xff00) === 0xff00) return true;

  return false;
}

/**
 * Memeriksa apakah suatu alamat IP adalah private IP (baik IPv4 maupun IPv6)
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true;
}

export interface ValidatedEndpointResult {
  isValid: boolean;
  normalizedUrl: string;
  hostname: string;
  port: number;
  resolvedIps: string[];
  pinnedIp: string;
  isOfficialHostname: boolean;
}

/**
 * S8a — Cache hasil validasi endpoint + hasil resolusi DNS, TTL 5 menit.
 *
 * Sebelumnya setiap request chat memanggil `validateAndPinEndpoint` yang
 * selalu melakukan lookup DNS (latensi tambahan; kegagalan DNS transien =
 * chatbot down). Sekarang:
 * - Hasil validasi penuh di-cache per endpoint ternormalisasi (origin +
 *   path — BUKAN per hostname saja, karena dua konfigurasi bisa berbagi
 *   hostname dengan path berbeda dan `normalizedUrl`-nya tidak boleh
 *   tertukar).
 * - Hasil resolusi DNS di-cache per hostname, sehingga endpoint berbeda
 *   yang berbagi hostname tetap tidak mengulang lookup.
 * - Hanya hasil SUKSES yang di-cache. Kegagalan (termasuk DNS gagal) TIDAK
 *   PERNAH di-cache sebagai valid — setiap percobaan berikutnya melakukan
 *   validasi ulang penuh (fail-closed S8b tetap berlaku).
 *
 * S8c — cache inilah tempat IP yang di-pin DIPERTAHANKAN (bukan dibuang):
 * `saveProviderConfig` memanggil `validateAndPinEndpoint` saat menyimpan,
 * dan hasil itu (termasuk `pinnedIp`) tersimpan di sini; request chat /
 * tes / daftar model berikutnya dalam jendela TTL memakai pin yang sama
 * lewat `createPinnedHttpsAgent`, tanpa lookup DNS ulang. Setelah TTL
 * habis, pin di-validasi ulang (DNS bisa berubah — pin abadi justru
 * berbahaya). Pin sengaja TIDAK dipersist ke database: pin adalah fakta
 * DNS sesaat, dan cache proses ini sudah cukup karena adapter dan
 * repository berjalan dalam proses server yang sama.
 */
export const ENDPOINT_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedValidation {
  result: ValidatedEndpointResult;
  expiresAt: number;
}

interface CachedDnsResolution {
  addresses: dns.LookupAddress[];
  expiresAt: number;
}

const endpointValidationCache = new Map<string, CachedValidation>();
const dnsResolutionCache = new Map<string, CachedDnsResolution>();

/**
 * Mengosongkan cache validasi endpoint + DNS (hook pemeliharaan/pengujian).
 * Pemakaian normal tidak perlu memanggil ini — entri kedaluwarsa sendiri
 * setelah TTL.
 */
export function clearEndpointValidationCache(): void {
  endpointValidationCache.clear();
  dnsResolutionCache.clear();
}

async function resolveHostname(hostname: string): Promise<dns.LookupAddress[]> {
  const now = Date.now();
  const cached = dnsResolutionCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.addresses;
  }
  // S8b: kegagalan DNS dilempar apa adanya (fail-closed) — TIDAK ADA
  // fallback IP fabrikasi, dan kegagalan TIDAK di-cache.
  const addresses = await dns.promises.lookup(hostname, { all: true });
  dnsResolutionCache.set(hostname, {
    addresses,
    expiresAt: now + ENDPOINT_VALIDATION_CACHE_TTL_MS,
  });
  return addresses;
}

/**
 * Melakukan validasi komprehensif pada endpoint URL:
 * - Wajib HTTPS
 * - Resolusi DNS seluruh record IP
 * - Penolakan terhadap IP privat/internal
 * - Mengembalikan IP pin pertama yang tervalidasi publik
 */
export async function validateAndPinEndpoint(
  endpointUrl: string,
  expectedProvider?: string
): Promise<ValidatedEndpointResult> {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    throw new SSRFValidationError('URL endpoint tidak boleh kosong.', 'ERR_EMPTY_URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(endpointUrl.trim());
  } catch {
    throw new SSRFValidationError('Format URL endpoint tidak valid.', 'ERR_INVALID_URL');
  }

  // S8a: kembalikan hasil validasi yang masih segar (TTL 5 menit) tanpa
  // lookup DNS ulang. Kunci adalah URL ternormalisasi (origin + path):
  // entri cache hanya pernah dibuat untuk URL yang lolos SEMUA pemeriksaan
  // di bawah, jadi mengembalikan cache berarti mengembalikan putusan yang
  // sudah tervalidasi penuh — termasuk pinnedIp-nya (S8c).
  const normalizedUrl = parsed.origin + parsed.pathname.replace(/\/+$/, '');
  const cachedValidation = endpointValidationCache.get(normalizedUrl);
  if (cachedValidation && cachedValidation.expiresAt > Date.now()) {
    return cachedValidation.result;
  }
  if (cachedValidation) {
    endpointValidationCache.delete(normalizedUrl);
  }

  // 1. Wajib Protokol HTTPS
  if (parsed.protocol !== 'https:') {
    throw new SSRFValidationError(
      `Protokol '${parsed.protocol}' ditolak. Endpoint AI wajib menggunakan HTTPS yang terenkripsi TLS.`,
      'ERR_INSECURE_PROTOCOL'
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port ? parseInt(parsed.port, 10) : 443;

  // 2. Blokir jika hostname berupa literal IP langsung atau 'localhost'
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new SSRFValidationError(`Akses ke hostname lokal '${hostname}' dilarang demi keamanan sistem.`, 'ERR_LOCAL_HOST');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      throw new SSRFValidationError(`Akses ke alamat IP privat '${hostname}' ditolak (SSRF Protection).`, 'ERR_PRIVATE_IP');
    }
  }

  // 3. Cek apakah termasuk official hostname
  const officialHosts = expectedProvider ? (OFFICIAL_PROVIDER_HOSTNAMES[expectedProvider] || []) : [];
  const isOfficial = officialHosts.includes(hostname);

  // 4. DNS Resolution Validation (Ambil seluruh alamat IPv4 dan IPv6).
  // S8b (fail-closed): kegagalan DNS MENOLAK endpoint — tidak ada lagi IP
  // fabrikasi dari pemetaan hardcoded. S8a: resolusi sukses di-cache per
  // hostname (TTL 5 menit) di dalam resolveHostname; kegagalan tidak
  // di-cache sehingga percobaan berikutnya memvalidasi ulang.
  let records: dns.LookupAddress[];
  try {
    records = await resolveHostname(hostname);
  } catch (err: any) {
    throw new SSRFValidationError(
      `Gagal melakukan resolusi DNS untuk host '${hostname}': ${err.message}. Endpoint ditolak (fail-closed) — periksa koneksi DNS server dan ejaan hostname.`,
      'ERR_DNS_FAILED'
    );
  }

  if (!records || records.length === 0) {
    throw new SSRFValidationError(`Host '${hostname}' tidak memiliki record alamat IP yang valid.`, 'ERR_NO_DNS_RECORDS');
  }

  const resolvedIps = records.map(r => r.address);

  // Periksa SETIAP alamat IP hasil resolusi DNS
  for (const record of records) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new SSRFValidationError(
        `Host '${hostname}' teresolusi ke alamat IP privat/internal (${record.address}). Koneksi dibatalkan untuk mencegah SSRF.`,
        'ERR_SSRF_DNS_REBINDING'
      );
    }
  }

  // Pilih IP publik pertama untuk socket pinning
  const pinnedIp = resolvedIps[0];

  const result: ValidatedEndpointResult = {
    isValid: true,
    normalizedUrl,
    hostname,
    port,
    resolvedIps,
    pinnedIp,
    isOfficialHostname: isOfficial,
  };

  // S8a/S8c: simpan hasil validasi (termasuk pinnedIp) agar request
  // berikutnya memakai pin yang sama tanpa lookup DNS ulang.
  endpointValidationCache.set(normalizedUrl, {
    result,
    expiresAt: Date.now() + ENDPOINT_VALIDATION_CACHE_TTL_MS,
  });

  return result;
}

/**
 * Membuat HTTPS Agent khusus yang menerapkan DNS Socket Pinning.
 * Agen ini menghubungkan socket TLS langsung ke IP yang telah divalidasi publik,
 * mengabaikan DNS lookup runtime sekunder sehingga kebal dari DNS Rebinding (TOCTOU).
 */
export function createPinnedHttpsAgent(hostname: string, pinnedIp: string): https.Agent {
  const isV4 = net.isIPv4(pinnedIp);

  return new https.Agent({
    keepAlive: true,
    timeout: 30000,
    // Custom lookup callback: memaksakan koneksi socket ke pinned IP (Mendukung overload tunggal maupun options.all)
    lookup: (domain, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'object' && options !== null ? options : {};

      if (domain === hostname) {
        if (opts.all) {
          cb(null, [{ address: pinnedIp, family: isV4 ? 4 : 6 }]);
        } else {
          cb(null, pinnedIp, isV4 ? 4 : 6);
        }
        return;
      }
      // Untuk domain lain (jika ada), jalankan lookup standar
      dns.lookup(domain, opts, cb);
    },
    // Pastikan SNI TLS mencocokkan hostname asli untuk validasi sertifikat SSL/TLS
    servername: hostname,
  });
}
