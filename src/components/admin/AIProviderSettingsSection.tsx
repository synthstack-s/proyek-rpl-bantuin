'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Server,
  Zap,
  Key,
  Globe,
  Activity,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Save,
  Loader2,
  Eye,
  EyeOff,
  BarChart3,
  Clock,
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Sparkles,
  Bot,
  BrainCircuit,
  Flame,
} from 'lucide-react';

interface ProviderConfigState {
  provider: string;
  name: string;
  apiEndpoint: string;
  // T1: apiKey TIDAK PERNAH dikirim server ke browser (write-only). Key hanya
  // diwakili maskedKeyPreview + isConfigured; field input kosong berarti
  // "pertahankan key tersimpan", field terisi berarti key baru.
  maskedKeyPreview: string;
  hasKey?: boolean;
  isConfigured?: boolean;
  // M12: true bila key yang dipakai berasal dari .env karena key tersimpan
  // gagal didekripsi / dekripsi gagal.
  keyFromEnvFallback?: boolean;
  decryptionFailed?: boolean;
  selectedModel: string;
  defaultModel: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  retryLimit: number;
  lastConnectionStatus: string;
  lastTestedAt?: string | null;
  lastErrorMessage?: string | null;
}

interface GlobalAISettingsState {
  activeProvider: string;
  enableFallback: boolean;
  fallbackProvider: string;
  circuitBreakerFailureThreshold: number;
  // L6: nama field DISAMAKAN dengan server (repository.ts memakai
  // `circuitBreakerCooldownSec`) — sebelumnya UI memakai
  // `circuitBreakerCooldownSeconds`, sehingga nilai dari server tidak pernah
  // terpetakan ke state ini dan panel memakai nilai awal yang salah (60).
  circuitBreakerCooldownSec: number;
  version: number;
}

interface ModelItem {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  isDefault?: boolean;
}

interface ConnectionTestLogItem {
  // M7: bentuk ini MENYAMAKAN respons server
  // (GET /api/admin/ai/metrics -> data.recentConnectionLogs, camelCase).
  // Sebelumnya interface memakai snake_case + id yang tidak pernah dikirim
  // server, dan state ini tidak pernah dirender di mana pun (state mati).
  provider: string;
  endpoint: string;
  modelTested: string;
  status: string;
  httpStatusCode: number | null;
  responseTimeMs: number;
  testedAt: string;
  errorMessage: string | null;
}

interface AIMetricsState {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  fallbackRequests: number;
  successRatePercent: number;
  // M6/M7: null bila tidak ada data latensi (server tidak lagi mengarang angka).
  avgLatencyMs: number | null;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  providerBreakdown: Array<{
    provider: string;
    requests: number;
    tokens: number;
    avgLatencyMs: number | null;
  }>;
}

interface PresetProviderTemplate {
  name: string;
  slug: string;
  endpoint: string;
  model: string;
  iconName: string;
}

const PRESET_TEMPLATES: PresetProviderTemplate[] = [
  {
    name: 'NVIDIA NIM',
    slug: 'nvidia',
    endpoint: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.2-90b-vision-instruct',
    iconName: 'Server',
  },
  {
    name: 'DeepSeek AI',
    slug: 'deepseek',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    iconName: 'DeepSeek',
  },
  {
    name: 'OpenAI',
    slug: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    iconName: 'OpenAI',
  },
  {
    name: 'OpenRouter',
    slug: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    iconName: 'OpenRouter',
  },
  {
    name: 'Mistral AI',
    slug: 'mistral',
    endpoint: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    iconName: 'Mistral',
  },
];

interface ProviderTheme {
  name: string;
  brandColor: string;
  accentBarGradient: string;
  iconBg: string;
  iconColor: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  activeBorder: string;
  activeBadgeBg: string;
  cardGlow: string;
  primaryBtnBg: string;
  secondaryBtnHover: string;
  tabActiveBg: string;
  sliderAccent: string;
  switcherActive: string;
  switcherDot: string;
  saveBtnBg: string;
  tagline: string;
}

function getProviderTheme(slug: string, name?: string): ProviderTheme {
  const normalized = (slug + ' ' + (name || '')).toLowerCase();
  if (normalized.includes('gemini') || normalized.includes('google')) {
    return {
      name: 'Google Gemini',
      brandColor: '#2563EB',
      accentBarGradient: 'from-blue-500 via-indigo-500 to-sky-400',
      iconBg: 'bg-blue-50 border-blue-200 text-blue-600',
      iconColor: 'text-blue-500',
      IconComponent: Sparkles,
      activeBorder: 'border-blue-500 ring-2 ring-blue-500/25',
      activeBadgeBg: 'bg-blue-600 text-white',
      cardGlow: 'hover:shadow-blue-500/10',
      primaryBtnBg: 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
      tabActiveBg: 'bg-blue-600 text-white shadow-xs',
      sliderAccent: 'accent-blue-600',
      switcherActive: 'bg-blue-50 border-blue-400 text-blue-950 font-bold',
      switcherDot: 'border-blue-600 bg-blue-600',
      saveBtnBg: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md',
      tagline: 'Google DeepMind LLM',
    };
  }
  if (normalized.includes('nvidia')) {
    return {
      name: 'NVIDIA NIM',
      brandColor: '#76B900',
      accentBarGradient: 'from-lime-500 via-emerald-500 to-green-600',
      iconBg: 'bg-lime-50 border-lime-200 text-lime-700',
      iconColor: 'text-lime-600',
      IconComponent: Server,
      activeBorder: 'border-lime-500 ring-2 ring-lime-500/25',
      activeBadgeBg: 'bg-lime-600 text-white',
      cardGlow: 'hover:shadow-lime-500/10',
      primaryBtnBg: 'bg-lime-600 hover:bg-lime-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-lime-50 hover:text-lime-700 hover:border-lime-300',
      tabActiveBg: 'bg-lime-600 text-white shadow-xs',
      sliderAccent: 'accent-lime-600',
      switcherActive: 'bg-lime-50 border-lime-400 text-lime-950 font-bold',
      switcherDot: 'border-lime-600 bg-lime-600',
      saveBtnBg: 'bg-lime-600 hover:bg-lime-700 text-white shadow-md',
      tagline: 'GPU Accelerated AI NIM',
    };
  }
  if (normalized.includes('groq')) {
    return {
      name: 'Groq AI',
      brandColor: '#EA580C',
      accentBarGradient: 'from-orange-500 via-amber-500 to-red-500',
      iconBg: 'bg-orange-50 border-orange-200 text-orange-600',
      iconColor: 'text-orange-500',
      IconComponent: Zap,
      activeBorder: 'border-orange-500 ring-2 ring-orange-500/25',
      activeBadgeBg: 'bg-orange-600 text-white',
      cardGlow: 'hover:shadow-orange-500/10',
      primaryBtnBg: 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300',
      tabActiveBg: 'bg-orange-600 text-white shadow-xs',
      sliderAccent: 'accent-orange-600',
      switcherActive: 'bg-orange-50 border-orange-400 text-orange-950 font-bold',
      switcherDot: 'border-orange-600 bg-orange-600',
      saveBtnBg: 'bg-orange-600 hover:bg-orange-700 text-white shadow-md',
      tagline: 'Ultra-Fast LPU Engine',
    };
  }
  if (normalized.includes('deepseek')) {
    return {
      name: 'DeepSeek AI',
      brandColor: '#0284C7',
      accentBarGradient: 'from-sky-400 via-cyan-500 to-blue-600',
      iconBg: 'bg-sky-50 border-sky-200 text-sky-600',
      iconColor: 'text-sky-500',
      IconComponent: BrainCircuit,
      activeBorder: 'border-sky-500 ring-2 ring-sky-500/25',
      activeBadgeBg: 'bg-sky-600 text-white',
      cardGlow: 'hover:shadow-sky-500/10',
      primaryBtnBg: 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300',
      tabActiveBg: 'bg-sky-600 text-white shadow-xs',
      sliderAccent: 'accent-sky-600',
      switcherActive: 'bg-sky-50 border-sky-400 text-sky-950 font-bold',
      switcherDot: 'border-sky-600 bg-sky-600',
      saveBtnBg: 'bg-sky-600 hover:bg-sky-700 text-white shadow-md',
      tagline: 'Advanced Reasoning & Coding',
    };
  }
  if (normalized.includes('openrouter')) {
    return {
      name: 'OpenRouter',
      brandColor: '#7C3AED',
      accentBarGradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
      iconBg: 'bg-violet-50 border-violet-200 text-violet-600',
      iconColor: 'text-violet-500',
      IconComponent: Globe,
      activeBorder: 'border-violet-500 ring-2 ring-violet-500/25',
      activeBadgeBg: 'bg-violet-600 text-white',
      cardGlow: 'hover:shadow-violet-500/10',
      primaryBtnBg: 'bg-violet-600 hover:bg-violet-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300',
      tabActiveBg: 'bg-violet-600 text-white shadow-xs',
      sliderAccent: 'accent-violet-600',
      switcherActive: 'bg-violet-50 border-violet-400 text-violet-950 font-bold',
      switcherDot: 'border-violet-600 bg-violet-600',
      saveBtnBg: 'bg-violet-600 hover:bg-violet-700 text-white shadow-md',
      tagline: 'Universal Multi-Model Router',
    };
  }
  if (normalized.includes('openai') || normalized.includes('chatgpt') || normalized.includes('gpt')) {
    return {
      name: 'OpenAI',
      brandColor: '#059669',
      accentBarGradient: 'from-emerald-500 via-teal-500 to-green-600',
      iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      iconColor: 'text-emerald-500',
      IconComponent: Bot,
      activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/25',
      activeBadgeBg: 'bg-emerald-600 text-white',
      cardGlow: 'hover:shadow-emerald-500/10',
      primaryBtnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300',
      tabActiveBg: 'bg-emerald-600 text-white shadow-xs',
      sliderAccent: 'accent-emerald-600',
      switcherActive: 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold',
      switcherDot: 'border-emerald-600 bg-emerald-600',
      saveBtnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md',
      tagline: 'GPT Frontier Intelligence',
    };
  }
  if (normalized.includes('mistral')) {
    return {
      name: 'Mistral AI',
      brandColor: '#D97706',
      accentBarGradient: 'from-amber-500 via-orange-500 to-red-400',
      iconBg: 'bg-amber-50 border-amber-200 text-amber-700',
      iconColor: 'text-amber-500',
      IconComponent: Flame,
      activeBorder: 'border-amber-500 ring-2 ring-amber-500/25',
      activeBadgeBg: 'bg-amber-600 text-white',
      cardGlow: 'hover:shadow-amber-500/10',
      primaryBtnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300',
      tabActiveBg: 'bg-amber-600 text-white shadow-xs',
      sliderAccent: 'accent-amber-600',
      switcherActive: 'bg-amber-50 border-amber-400 text-amber-950 font-bold',
      switcherDot: 'border-amber-600 bg-amber-600',
      saveBtnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-md',
      tagline: 'Open Frontier French AI',
    };
  }
  if (normalized.includes('anthropic') || normalized.includes('claude')) {
    return {
      name: 'Anthropic Claude',
      brandColor: '#C2410C',
      accentBarGradient: 'from-amber-700 via-orange-600 to-rose-600',
      iconBg: 'bg-orange-50 border-orange-200 text-orange-700',
      iconColor: 'text-orange-600',
      IconComponent: Bot,
      activeBorder: 'border-orange-600 ring-2 ring-orange-600/25',
      activeBadgeBg: 'bg-orange-700 text-white',
      cardGlow: 'hover:shadow-orange-500/10',
      primaryBtnBg: 'bg-orange-700 hover:bg-orange-800 text-white shadow-xs',
      secondaryBtnHover: 'hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300',
      tabActiveBg: 'bg-orange-700 text-white shadow-xs',
      sliderAccent: 'accent-orange-700',
      switcherActive: 'bg-orange-50 border-orange-400 text-orange-950 font-bold',
      switcherDot: 'border-orange-600 bg-orange-600',
      saveBtnBg: 'bg-orange-700 hover:bg-orange-800 text-white shadow-md',
      tagline: 'Constitutional AI & Safety',
    };
  }
  return {
    name: name || slug,
    brandColor: '#4F46E5',
    accentBarGradient: 'from-indigo-500 via-blue-500 to-purple-500',
    iconBg: 'bg-indigo-50 border-indigo-200 text-indigo-600',
    iconColor: 'text-indigo-500',
    IconComponent: Cpu,
    activeBorder: 'border-indigo-500 ring-2 ring-indigo-500/25',
    activeBadgeBg: 'bg-indigo-600 text-white',
    cardGlow: 'hover:shadow-indigo-500/10',
    primaryBtnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs',
    secondaryBtnHover: 'hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300',
    tabActiveBg: 'bg-indigo-600 text-white shadow-xs',
    sliderAccent: 'accent-indigo-600',
    switcherActive: 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold',
    switcherDot: 'border-indigo-600 bg-indigo-600',
    saveBtnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md',
    tagline: 'Custom OpenAI-Compatible API',
  };
}

export default function AIProviderSettingsSection() {
  const [configs, setConfigs] = useState<Record<string, ProviderConfigState>>({});
  const [globalSettings, setGlobalSettings] = useState<GlobalAISettingsState>({
    activeProvider: 'gemini',
    enableFallback: true,
    fallbackProvider: 'groq',
    circuitBreakerFailureThreshold: 3,
    // L6: nilai awal 30 (default server) — sebelumnya 60, padahal server
    // memakai 30 detik secara default; nilai riil dari server dipetakan di
    // loadData (fallback 30 bila tidak ada).
    circuitBreakerCooldownSec: 30,
    version: 1,
  });
  const [metrics, setMetrics] = useState<AIMetricsState | null>(null);
  const [testLogs, setTestLogs] = useState<ConnectionTestLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Form input states per provider slug
  // T1: inputKeys HANYA berisi key yang admin ketik di sesi ini (key baru).
  // Server tidak pernah mengirim key tersimpan ke browser, jadi field kosong
  // berarti "pertahankan key tersimpan" — backend sudah mendukung pola ini
  // (saveProviderConfig: apiKey kosong = pertahankan key lama). Field TIDAK
  // di-prefill dari server (lihat loadData) dan dikosongkan setelah save
  // berhasil (lihat handleSaveConfig).
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [endpoints, setEndpoints] = useState<Record<string, string>>({
    gemini: 'https://generativelanguage.googleapis.com',
    groq: 'https://api.groq.com/openai/v1',
  });
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({
    gemini: 'gemini-3.5-flash',
    groq: 'openai/gpt-oss-120b',
  });
  const [params, setParams] = useState<
    Record<string, { temp: number; maxTokens: number; timeout: number; retries: number }>
  >({
    gemini: { temp: 0.7, maxTokens: 2048, timeout: 30000, retries: 2 },
    groq: { temp: 0.7, maxTokens: 2048, timeout: 30000, retries: 2 },
  });

  // Dynamic models state
  const [availableModels, setAvailableModels] = useState<Record<string, ModelItem[]>>({});
  const [isLoadingModels, setIsLoadingModels] = useState<Record<string, boolean>>({});
  // M4: apakah daftar model terakhir untuk provider ini benar-benar live
  // (true) atau daftar cadangan karena pengambilan live gagal (false).
  // undefined = belum pernah diambil.
  const [modelsLive, setModelsLive] = useState<Record<string, boolean>>({});

  // Testing & saving states
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [testResultModal, setTestResultModal] = useState<{
    provider: string;
    endpoint: string;
    modelTested: string;
    status: string;
    httpStatusCode: number | null;
    responseTimeMs: number;
    testedAt: string;
    errorMessage: string | null;
    // L2: model pengganti hasil auto-heal (bila tes memakai model lain dari
    // yang diminta) — modal menawarkan untuk menyimpannya sebagai model
    // terpilih; tidak pernah dipersist otomatis.
    healedModel?: string | null;
  } | null>(null);

  const [isSavingConfig, setIsSavingConfig] = useState<Record<string, boolean>>({});
  // L14: status penghapusan API key per provider.
  const [isClearingKey, setIsClearingKey] = useState<Record<string, boolean>>({});
  const [isSwitchingActive, setIsSwitchingActive] = useState<boolean>(false);
  const [isSwitchingFallback, setIsSwitchingFallback] = useState<boolean>(false);
  const [pendingActiveProvider, setPendingActiveProvider] = useState<string | null>(null);

  // Accordion & Tab states
  const [showConfigForms, setShowConfigForms] = useState<boolean>(true);
  const [activeFormTab, setActiveFormTab] = useState<string>('gemini');

  // Modal Tambah Provider Baru
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [isAddingProvider, setIsAddingProvider] = useState<boolean>(false);
  // L10: visibilitas input API key di modal tambah provider — default
  // tersembunyi (password), sama seperti form utama.
  const [showNewProviderKey, setShowNewProviderKey] = useState<boolean>(false);
  const [newProviderForm, setNewProviderForm] = useState({
    name: '',
    slug: '',
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
  });

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [configsRes, metricsRes] = await Promise.all([
        fetch('/api/admin/ai/configs'),
        fetch('/api/admin/ai/metrics'),
      ]);

      if (configsRes.ok) {
        const cData = await configsRes.json();
        if (cData.success) {
          const rawConfigs = cData.configs || cData.data?.configs || {};
          const rawGlobal = cData.globalSettings || cData.data?.globalSettings;

          // Normalisasi array atau object map
          let configMap: Record<string, ProviderConfigState> = {};
          if (Array.isArray(rawConfigs)) {
            for (const item of rawConfigs) {
              if (item?.provider) configMap[item.provider] = item;
            }
          } else if (typeof rawConfigs === 'object' && rawConfigs !== null) {
            configMap = rawConfigs;
          }

          setConfigs(configMap);
          if (rawGlobal) {
            // L6: petakan global settings secara eksplisit (bukan set mentah)
            // agar nama field server (`circuitBreakerCooldownSec`) terpetakan
            // benar ke state UI; fallback 30 detik bila server tidak mengirim
            // nilai cooldown (bukan 60 seperti nilai awal lama).
            setGlobalSettings({
              activeProvider: rawGlobal.activeProvider ?? 'gemini',
              enableFallback: Boolean(rawGlobal.enableFallback),
              fallbackProvider: rawGlobal.fallbackProvider ?? 'groq',
              circuitBreakerFailureThreshold: Number(rawGlobal.circuitBreakerFailureThreshold ?? 3),
              circuitBreakerCooldownSec: Number(rawGlobal.circuitBreakerCooldownSec ?? 30),
              version: Number(rawGlobal.version ?? 1),
            });
          }

          // Sinkronisasikan state form per provider
          const nextEndpoints: Record<string, string> = {};
          const nextModels: Record<string, string> = {};
          const nextParams: Record<string, { temp: number; maxTokens: number; timeout: number; retries: number }> = {};

          for (const [providerKey, conf] of Object.entries(configMap)) {
            const presetMatch = PRESET_TEMPLATES.find((p) => p.slug === providerKey);
            const defaultEndpoint = conf.apiEndpoint || presetMatch?.endpoint || (providerKey === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.groq.com/openai/v1');
            const defaultModel = conf.selectedModel || conf.defaultModel || presetMatch?.model || (providerKey === 'gemini' ? 'gemini-2.0-flash' : 'llama-3.3-70b-versatile');

            nextEndpoints[providerKey] = defaultEndpoint;
            nextModels[providerKey] = defaultModel;
            nextParams[providerKey] = {
              temp: conf.temperature ?? 0.7,
              maxTokens: conf.maxOutputTokens ?? 2048,
              timeout: conf.requestTimeoutMs ?? 30000,
              retries: conf.retryLimit ?? 2,
            };
            // T1: JANGAN prefill API key — server tidak mengirimnya, dan
            // inputKeys sengaja TIDAK disentuh di sini agar key yang sedang
            // admin ketik tidak hilang saat loadData berjalan (mis. pindah
            // tab atau setelah tes koneksi). Field kosong = pertahankan key
            // tersimpan; handleSaveConfig mengosongkan field setelah save.
          }

          setEndpoints((prev) => ({ ...prev, ...nextEndpoints }));
          setSelectedModels((prev) => ({ ...prev, ...nextModels }));
          setParams((prev) => ({ ...prev, ...nextParams }));

          // L9: validasi activeFormTab TIDAK lagi di sini — dipisah ke
          // useEffect tersendiri di bawah agar loadData tidak bergantung
          // pada activeFormTab (lihat dependensi useCallback).
        }
      }

      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        // M7: route mengembalikan { success, data: { summary,
        // providerBreakdown, recentConnectionLogs } } — sebelumnya UI membaca
        // mData.metrics (tidak ada) sehingga strip telemetri tidak pernah
        // tampil. Petakan nama field server ke AIMetricsState di sini.
        if (mData.success && mData.data) {
          const summary = mData.data.summary || {};
          const total = Number(summary.totalRequests || 0);
          const success = Number(summary.successfulRequests || 0);
          setMetrics({
            totalRequests: total,
            successRequests: success,
            failedRequests: Number(summary.failedRequests || 0),
            fallbackRequests: Number(summary.fallbackCount || 0),
            successRatePercent: total > 0 ? Math.round((success / total) * 100) : 0,
            avgLatencyMs: summary.averageResponseTimeMs != null ? Number(summary.averageResponseTimeMs) : null,
            // Server tidak melacak split prompt/completion — isi 0 (bukan angka karangan).
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalTokens: Number(summary.totalTokensUsed || 0),
            providerBreakdown: Array.isArray(mData.data.providerBreakdown)
              ? mData.data.providerBreakdown.map((p: any) => ({
                  provider: String(p.provider),
                  requests: Number(p.requests || 0),
                  tokens: Number(p.tokens || 0),
                  avgLatencyMs: p.avgLatencyMs != null ? Number(p.avgLatencyMs) : null,
                }))
              : [],
          });
          setTestLogs(Array.isArray(mData.data.recentConnectionLogs) ? mData.data.recentConnectionLogs : []);
        }
      }
    } catch (err: any) {
      showToast('error', 'Gagal memuat konfigurasi AI: ' + err.message);
    } finally {
      setIsLoading(false);
    }
    // L9: dependensi KOSONG — loadData sengaja tidak bergantung pada
    // activeFormTab. Sebelumnya setiap ganti tab form membuat useCallback
    // baru, yang memicu useEffect di bawah untuk mengambil ulang seluruh
    // config dari server tanpa kebutuhan. Validasi tab dipisah ke useEffect
    // tersendiri (lihat di bawah); showToast stabil karena hanya memakai
    // setToast + setTimeout (tidak ada stale closure).
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // L9: validasi tab form terpisah dari pengambilan data — bila tab aktif
  // tidak ada lagi di daftar provider (mis. provider dihapus), pindah ke
  // provider pertama. Efek ini TIDAK mengambil ulang config dari server.
  useEffect(() => {
    const keys = Object.keys(configs);
    if (keys.length > 0 && !configs[activeFormTab]) {
      setActiveFormTab(keys[0] || 'gemini');
    }
  }, [configs, activeFormTab]);

  // Fetch available models for provider
  // T2: API key TIDAK PERNAH dikirim lewat query string. Bila admin mengetik
  // key baru di form (belum disimpan), key dikirim via POST body; bila field
  // kosong, server memakai key tersimpan (GET tanpa key).
  // M4: bila respons `isLive: false`, daftar adalah cadangan hardcoded —
  // tampilkan peringatan "daftar cadangan", JANGAN toast sukses.
  const fetchModels = async (provider: string) => {
    try {
      setIsLoadingModels((prev) => ({ ...prev, [provider]: true }));
      const formKey = (inputKeys[provider] || '').trim();
      const endpoint = (endpoints[provider] || '').trim();
      let res: Response;
      if (formKey) {
        // Menguji key yang belum disimpan — key lewat POST body.
        res = await fetch('/api/admin/ai/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey: formKey, apiEndpoint: endpoint || undefined }),
        });
      } else {
        // Server memakai key tersimpan; hanya provider (+ endpoint) di URL.
        const queryParams = new URLSearchParams({ provider });
        if (endpoint) {
          queryParams.set('apiEndpoint', endpoint);
        }
        res = await fetch(`/api/admin/ai/models?${queryParams.toString()}`);
      }
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.models)) {
        setAvailableModels((prev) => ({ ...prev, [provider]: data.models }));
        setModelsLive((prev) => ({ ...prev, [provider]: data.isLive !== false }));
        if (data.isLive === false) {
          showToast('info', `Daftar cadangan — pengambilan live gagal (${configs[provider]?.name || provider}): ${data.error || 'provider tidak dapat dihubungi'}. Model di bawah ini bukan daftar live.`);
        } else {
          showToast('info', `Berhasil memuat ${data.models.length} model aktif dari ${configs[provider]?.name || provider}`);
        }
      } else {
        showToast('error', data.message || `Gagal mengambil model dari ${provider}`);
      }
    } catch (err: any) {
      showToast('error', 'Koneksi gagal mengambil model: ' + err.message);
    } finally {
      setIsLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // Live Connection Test
  const handleTestConnection = async (provider: string) => {
    try {
      setIsTesting((prev) => ({ ...prev, [provider]: true }));
      const body: any = {
        provider,
        apiEndpoint: endpoints[provider],
        selectedModel: selectedModels[provider],
        requestTimeoutMs: params[provider]?.timeout || 30000,
      };

      if (inputKeys[provider] && inputKeys[provider].trim()) {
        body.apiKey = inputKeys[provider].trim();
      }

      // H1 + T1: beri tahu server apakah tes ini memakai kredensial tersimpan.
      // Sejak T1, key tersimpan tidak pernah dikirim ke browser, jadi
      // dirty-tracking key menjadi sederhana: field key KOSONG berarti
      // manager memakai key tersimpan (override kosong diabaikan di
      // testProviderConnection) → tes tersimpan. Field TERISI berarti admin
      // mengetik key baru (belum disimpan) → tes override: hasilnya dicatat
      // di log tetapi TIDAK boleh menimpa status tersimpan.
      // Endpoint/model yang diedit juga membuat tes menjadi override
      // meskipun key-nya tidak berubah (dibandingkan dengan config yang
      // dimuat dari server), karena tes itu tidak lagi mencerminkan
      // konfigurasi tersimpan.
      const trimmedInputKey = (inputKeys[provider] || '').trim();
      const keyIsStored = trimmedInputKey.length === 0;
      const storedConf = configs[provider];
      const endpointIsStored =
        !endpoints[provider] || !storedConf?.apiEndpoint ||
        endpoints[provider].trim() === storedConf.apiEndpoint.trim();
      const modelIsStored =
        !selectedModels[provider] || !storedConf?.selectedModel ||
        selectedModels[provider].trim() === storedConf.selectedModel.trim();
      body.usesStoredCredentials = keyIsStored && endpointIsStored && modelIsStored;

      const res = await fetch('/api/admin/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        setTestResultModal(data.result);
        if (data.result.status === 'success' || data.connected || data.result.httpStatusCode === 200) {
          showToast('success', `Tes koneksi ${configs[provider]?.name || provider} berhasil terkoneksi! (${data.result.responseTimeMs}ms)`);
          setConfigs((prev) => ({
            ...prev,
            [provider]: {
              ...prev[provider],
              lastConnectionStatus: 'connected',
              lastErrorMessage: null,
              lastTestedAt: new Date().toISOString(),
            },
          }));
        } else {
          showToast('error', `Tes koneksi ${configs[provider]?.name || provider}: ${data.result.errorMessage || data.result.status}`);
        }
        await loadData();
      } else {
        showToast('error', data.message || 'Tes koneksi gagal dijalankan');
      }
    } catch (err: any) {
      showToast('error', 'Error menguji koneksi: ' + err.message);
    } finally {
      setIsTesting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // Save Provider Config
  // L2: `modelOverride` dipakai penawaran simpan model hasil heal dari modal
  // tes — selectedModels state belum tentu ter-update saat save dipanggil
  // (setState asinkron), jadi model pengganti diteruskan langsung.
  const handleSaveConfig = async (provider: string, modelOverride?: string) => {
    try {
      setIsSavingConfig((prev) => ({ ...prev, [provider]: true }));
      const payload: any = {
        provider,
        apiEndpoint: endpoints[provider],
        selectedModel: modelOverride || selectedModels[provider],
        temperature: params[provider]?.temp ?? 0.7,
        maxOutputTokens: params[provider]?.maxTokens ?? 2048,
        requestTimeoutMs: params[provider]?.timeout ?? 30000,
        retryLimit: params[provider]?.retries ?? 2,
      };

      if (inputKeys[provider] && inputKeys[provider].trim()) {
        payload.apiKey = inputKeys[provider].trim();
      }

      const res = await fetch('/api/admin/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `Konfigurasi ${configs[provider]?.name || provider} berhasil disimpan.`);
        // T1: kosongkan field key setelah save berhasil — key kini tersimpan
        // di server dan field kosong berarti "pertahankan key tersimpan".
        // (Sebelumnya field dipertahankan berisi key plaintext hasil prefill.)
        setInputKeys((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        // Pembaruan optimistis dari respons server — hanya memakai nilai
        // yang benar-benar dikembalikan server (tanpa fallback 'connected'
        // atau lastTestedAt buatan: status harus mencerminkan hasil probe
        // server, bukan klaim dari UI).
        if (data.config) {
          setConfigs((prev) => ({
            ...prev,
            [provider]: {
              ...prev[provider],
              ...data.config,
              lastConnectionStatus:
                data.config.lastConnectionStatus || prev[provider]?.lastConnectionStatus,
              lastErrorMessage:
                data.config.lastErrorMessage ?? prev[provider]?.lastErrorMessage ?? null,
              lastTestedAt: data.config.lastTestedAt || prev[provider]?.lastTestedAt,
            },
          }));
        }
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal menyimpan konfigurasi');
      }
    } catch (err: any) {
      showToast('error', 'Error saat menyimpan: ' + err.message);
    } finally {
      setIsSavingConfig((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // L2: simpan model pengganti hasil auto-heal sebagai model terpilih.
  // Dipanggil dari tombol penawaran di modal hasil tes — model tersimpan
  // TIDAK pernah diubah otomatis oleh tes; admin yang memutuskan.
  const handleSaveHealedModel = async () => {
    if (!testResultModal?.healedModel) return;
    const provider = testResultModal.provider;
    const healedModel = testResultModal.healedModel;
    setSelectedModels((prev) => ({ ...prev, [provider]: healedModel }));
    setTestResultModal(null);
    await handleSaveConfig(provider, healedModel);
  };

  // L14: hapus API key tersimpan (dengan konfirmasi). Konfigurasi lain
  // (endpoint, model, parameter) TETAP tersimpan — hanya key yang dihapus
  // dan status menjadi not_configured. Satu-satunya cara mencabut key
  // provider bawaan (Gemini/Groq) tanpa mengedit DB langsung.
  const handleClearApiKey = async (provider: string) => {
    const conf = configs[provider];
    const isActive = globalSettings.activeProvider === provider;
    const confirmed = confirm(
      `Hapus API key tersimpan untuk '${conf?.name || provider}'?\n\n` +
        `Key akan dihapus dari database dan .env.local. ` +
        `Konfigurasi lain (endpoint, model, parameter) tetap tersimpan.\n` +
        (isActive
          ? `PERINGATAN: provider ini sedang AKTIF — chat akan gagal sampai API key baru disimpan.\n`
          : ``) +
        `Lanjutkan?`
    );
    if (!confirmed) return;

    try {
      setIsClearingKey((prev) => ({ ...prev, [provider]: true }));
      const res = await fetch('/api/admin/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, clearApiKey: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message || `API key ${conf?.name || provider} berhasil dihapus.`);
        // Kosongkan field key yang sedang diketik (bila ada) agar tidak
        // tertukar dengan key yang baru saja dihapus.
        setInputKeys((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal menghapus API key');
      }
    } catch (err: any) {
      showToast('error', 'Error saat menghapus API key: ' + err.message);
    } finally {
      setIsClearingKey((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // Add Custom Provider
  const handleAddCustomProvider = async () => {
    if (!newProviderForm.slug.trim() || !newProviderForm.name.trim() || !newProviderForm.endpoint.trim()) {
      showToast('error', 'Nama Provider, Slug ID, dan Endpoint wajib diisi.');
      return;
    }

    try {
      setIsAddingProvider(true);
      const sanitizedSlug = newProviderForm.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

      const payload = {
        provider: sanitizedSlug,
        name: newProviderForm.name.trim(),
        apiEndpoint: newProviderForm.endpoint.trim(),
        apiKey: newProviderForm.apiKey.trim(),
        selectedModel: newProviderForm.model.trim() || 'default-model',
        defaultModel: newProviderForm.model.trim() || 'default-model',
        temperature: newProviderForm.temperature,
        maxOutputTokens: newProviderForm.maxTokens,
        requestTimeoutMs: 30000,
        retryLimit: 2,
      };

      const res = await fetch('/api/admin/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `Provider '${newProviderForm.name}' berhasil ditambahkan dan langsung TERKONEKSI!`);
        setShowAddModal(false);
        // (Tab dipindah SETELAH loadData di bawah — L9. Pembaruan optimistis
        // configs tidak diperlukan karena loadData mengambil status probe
        // asli dari server.)
        setNewProviderForm({
          name: '',
          slug: '',
          endpoint: 'https://api.openai.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2048,
        });
        setShowNewProviderKey(false);
        await loadData();
        // L9: pindah tab SETELAH loadData selesai — efek validasi tab
        // (useEffect terpisah) akan me-reset tab ke provider pertama bila
        // tab diset sebelum provider baru ada di state configs.
        setActiveFormTab(sanitizedSlug);
      } else {
        showToast('error', data.message || 'Gagal menambahkan provider');
      }
    } catch (err: any) {
      showToast('error', 'Gagal membuat provider baru: ' + err.message);
    } finally {
      setIsAddingProvider(false);
    }
  };

  // Delete Custom Provider
  const handleDeleteCustomProvider = async (provider: string) => {
    if (provider === 'gemini' || provider === 'groq') {
      showToast('error', 'Provider bawaan sistem (Gemini & Groq) tidak dapat dihapus.');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus provider AI '${configs[provider]?.name || provider}'?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/ai/configs?provider=${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message || `Provider '${configs[provider]?.name || provider}' berhasil dihapus.`);
        setConfigs((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        setActiveFormTab('gemini');
        // Bersihkan sisa state form provider yang dihapus.
        setInputKeys((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        setAvailableModels((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        setModelsLive((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal menghapus provider');
      }
    } catch (err: any) {
      showToast('error', 'Error saat menghapus: ' + err.message);
    }
  };

  // Confirm Switch Active Provider
  const handleConfirmSwitchActive = async () => {
    if (!pendingActiveProvider) return;
    try {
      setIsSwitchingActive(true);
      const res = await fetch('/api/admin/ai/active-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProvider: pendingActiveProvider }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(
          'success',
          `Provider aktif berhasil dialihkan ke ${configs[pendingActiveProvider]?.name || pendingActiveProvider}`
        );
        setPendingActiveProvider(null);
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal mengubah provider aktif');
      }
    } catch (err: any) {
      showToast('error', 'Error berpindah provider: ' + err.message);
    } finally {
      setIsSwitchingActive(false);
    }
  };

  // Toggle Fallback — M8: toggle memakai provider cadangan yang DIPILIH
  // admin di dropdown (globalSettings.fallbackProvider), BUKAN provider
  // non-aktif pertama secara arbitrer. Bila pilihan tersimpan tidak valid
  // (sama dengan provider aktif / tidak ada di daftar), pakai provider
  // non-aktif pertama sebagai cadangan terakhir. Server memvalidasi bahwa
  // provider cadangan punya API key saat fallback diaktifkan.
  const handleToggleFallback = async (enabled: boolean) => {
    try {
      setIsSwitchingFallback(true);
      const allProviderKeys = Object.keys(configs);
      const selectedFallback = globalSettings.fallbackProvider;
      const fallbackTarget =
        (selectedFallback &&
          selectedFallback !== globalSettings.activeProvider &&
          allProviderKeys.includes(selectedFallback)
          ? selectedFallback
          : allProviderKeys.find((p) => p !== globalSettings.activeProvider)) ||
        (globalSettings.activeProvider === 'gemini' ? 'groq' : 'gemini');

      const res = await fetch('/api/admin/ai/fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableFallback: enabled,
          fallbackProvider: fallbackTarget,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `Automatic Fallback berhasil ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal mengubah pengaturan fallback');
      }
    } catch (err: any) {
      showToast('error', 'Error memperbarui fallback: ' + err.message);
    } finally {
      setIsSwitchingFallback(false);
    }
  };

  // M8: ganti provider cadangan dari dropdown, tanpa mengubah status
  // on/off fallback. Bila fallback sedang aktif, server memvalidasi key
  // provider baru (menolak bila tanpa key); bila nonaktif, pilihan hanya
  // disimpan untuk dipakai saat fallback diaktifkan nanti.
  const handleChangeFallbackProvider = async (provider: string) => {
    if (!provider || provider === globalSettings.fallbackProvider) return;
    if (provider === globalSettings.activeProvider) {
      showToast('error', 'Provider cadangan tidak boleh sama dengan provider aktif.');
      return;
    }
    try {
      setIsSwitchingFallback(true);
      const res = await fetch('/api/admin/ai/fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableFallback: globalSettings.enableFallback,
          fallbackProvider: provider,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `Provider cadangan diubah ke ${configs[provider]?.name || provider}.`);
        await loadData();
      } else {
        showToast('error', data.message || 'Gagal mengubah provider cadangan');
      }
    } catch (err: any) {
      showToast('error', 'Error mengubah provider cadangan: ' + err.message);
    } finally {
      setIsSwitchingFallback(false);
    }
  };

  const renderStatusBadge = (status: string | undefined, errorMessage?: string | null) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </span>
        );
      case 'connection_error': {
        const isSaldoHabis = errorMessage && (
          errorMessage.toLowerCase().includes('saldo') ||
          errorMessage.toLowerCase().includes('insufficient') ||
          errorMessage.toLowerCase().includes('402')
        );
        if (isSaldoHabis) {
          return (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-800 cursor-help"
              title={errorMessage || 'Saldo Akun Penyedia AI Habis (HTTP 402)'}
            >
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Saldo Habis (402)
            </span>
          );
        }
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-700 cursor-help"
            title={errorMessage || 'Terjadi kesalahan koneksi'}
          >
            <AlertCircle className="w-3 h-3 text-rose-500" />
            Connection Error
          </span>
        );
      }
      case 'disconnected':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-800"
            title={errorMessage || 'Belum terhubung'}
          >
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            Disconnected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 border border-gray-200 text-gray-600">
            Not Configured
          </span>
        );
    }
  };

  const providerEntries = Object.entries(configs);

  return (
    <div className="space-y-6 bg-white dark:bg-[#141510] accent-white p-5 sm:p-6 rounded-3xl border border-gray-200/90 dark:border-[#D8CFBC]/15 shadow-md ai-provider-white-container text-gray-900 dark:text-[#FFFBF4]">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-xs sm:text-sm font-medium transition-all transform animate-in slide-in-from-bottom-5 ${toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
              : toast.type === 'error'
                ? 'bg-rose-950 border-rose-800 text-rose-200'
                : 'bg-indigo-950 border-indigo-800 text-indigo-200'
            }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-indigo-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Confirmation Modal Switch Active Provider */}
      {pendingActiveProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-gray-900 ai-modal-box">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Konfirmasi Pengalihan Provider AI</h3>
                <p className="text-xs text-gray-500">Perubahan berlaku instan untuk sesi percakapan berikutnya.</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-200 ai-subcard">
              Apakah Anda yakin ingin mengalihkan provider aktif ke{' '}
              <strong className="text-gray-900 font-bold">
                {configs[pendingActiveProvider]?.name || pendingActiveProvider}
              </strong>
              ? Sistem akan menggunakan model{' '}
              <span className="font-mono text-amber-600 font-bold">
                {configs[pendingActiveProvider]?.selectedModel || 'default'}
              </span>{' '}
              sebagai sumber inferensi percakapan Chatbot+.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingActiveProvider(null)}
                disabled={isSwitchingActive}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition ai-btn-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitchActive}
                disabled={isSwitchingActive}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 transition shadow-md flex items-center gap-2"
              >
                {isSwitchingActive && <Loader2 className="w-4 h-4 animate-spin" />}
                Konfirmasi & Alihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Provider Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-gray-900 ai-modal-box">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Tambah Provider AI Baru</h3>
                  <p className="text-xs text-gray-500">
                    Tambahkan layanan AI OpenAI-compatible tanpa mengubah kodingan.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowNewProviderKey(false);
                }}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Template Presets */}
            <div>
              <span className="text-[11px] font-bold text-gray-700 block mb-2">
                Pilih Template Cepat (1-Klik Isi):
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_TEMPLATES.map((tmpl) => {
                  const tmplTheme = getProviderTheme(tmpl.slug, tmpl.name);
                  const TmplIcon = tmplTheme.IconComponent;
                  const isSelected = newProviderForm.slug === tmpl.slug;
                  return (
                    <button
                      key={tmpl.slug}
                      type="button"
                      onClick={() => {
                        setNewProviderForm((prev) => ({
                          ...prev,
                          name: tmpl.name,
                          slug: tmpl.slug,
                          endpoint: tmpl.endpoint,
                          model: tmpl.model,
                        }));
                      }}
                      className={`p-2 rounded-xl border text-left text-xs transition flex items-center gap-2 ${
                        isSelected
                          ? `${tmplTheme.switcherActive} shadow-xs`
                          : 'bg-white border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-50 ai-btn-white'
                      }`}
                    >
                      <div className={`p-1 rounded-lg border shrink-0 ${tmplTheme.iconBg}`}>
                        <TmplIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <strong className="block text-[11px] text-gray-900 truncate">{tmpl.name}</strong>
                        <span className="text-[10px] text-gray-500 truncate block">{tmpl.model}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-800 block mb-1">
                    Nama Provider *
                  </label>
                  <input
                    type="text"
                    value={newProviderForm.name}
                    onChange={(e) => setNewProviderForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Contoh: DeepSeek AI"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-800 block mb-1">
                    Provider Slug ID *
                  </label>
                  <input
                    type="text"
                    value={newProviderForm.slug}
                    onChange={(e) =>
                      setNewProviderForm((p) => ({
                        ...p,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
                      }))
                    }
                    placeholder="contoh: deepseek"
                    // L13: slug dibatasi 50 karakter (kolom provider VARCHAR(50)).
                    maxLength={50}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 font-mono outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-800 block mb-1">
                  API Endpoint (HTTPS) *
                </label>
                <input
                  type="text"
                  value={newProviderForm.endpoint}
                  onChange={(e) => setNewProviderForm((p) => ({ ...p, endpoint: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 font-mono outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-800 block mb-1">
                  API Key (Disimpan dengan Enkripsi AES-256-GCM)
                </label>
                {/* L10: input bertipe password + eye-toggle, sama seperti form
                    utama — sebelumnya type="text" sehingga key selalu tampil
                    plaintext (risiko shoulder-surfing / tangkapan layar). */}
                <div className="relative">
                  <input
                    type={showNewProviderKey ? 'text' : 'password'}
                    value={newProviderForm.apiKey}
                    onChange={(e) => setNewProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
                    placeholder="sk-... atau API Key rahasia provider"
                    className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 font-mono outline-none focus:border-amber-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewProviderKey((prev) => !prev)}
                    title={showNewProviderKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition p-1"
                  >
                    {showNewProviderKey ? (
                      <EyeOff className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-800 block mb-1">
                  Model AI Utama *
                </label>
                <input
                  type="text"
                  value={newProviderForm.model}
                  onChange={(e) => setNewProviderForm((p) => ({ ...p, model: e.target.value }))}
                  placeholder="Contoh: deepseek-chat, gpt-4o, mistral-large-latest"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 font-mono outline-none focus:border-amber-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Temperature ({newProviderForm.temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={newProviderForm.temperature}
                    onChange={(e) =>
                      setNewProviderForm((p) => ({ ...p, temperature: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Max Output Tokens
                  </label>
                  <input
                    type="number"
                    value={newProviderForm.maxTokens}
                    onChange={(e) =>
                      setNewProviderForm((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setShowNewProviderKey(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition ai-btn-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddCustomProvider}
                disabled={isAddingProvider}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAddingProvider && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan Provider Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Test Result Modal */}
      {testResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-gray-900 ai-modal-box">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${testResultModal.status === 'success'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}
                >
                  {testResultModal.status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Hasil Uji Koneksi Langsung</h3>
                  <p className="text-xs text-gray-500">
                    Provider: <span className="font-semibold text-gray-900 uppercase">{testResultModal.provider}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTestResultModal(null)}
                className="text-gray-400 hover:text-gray-700 text-xs font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs bg-gray-50 p-3.5 rounded-xl border border-gray-200 ai-subcard">
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-500">Status Diagnosa:</span>
                <span
                  className={`font-bold ${testResultModal.status === 'success' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                >
                  {testResultModal.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-500">HTTP Status Code:</span>
                <span className="font-mono text-gray-900 font-semibold">{testResultModal.httpStatusCode ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-500">Response Time (Latency):</span>
                <span className="font-mono font-bold text-gray-900">{testResultModal.responseTimeMs} ms</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-500">Model Diuji:</span>
                <span className="font-mono text-gray-700 font-semibold">{testResultModal.modelTested}</span>
              </div>
              {testResultModal.errorMessage && testResultModal.status !== 'success' && (
                <div className="pt-2">
                  <span className="text-rose-600 font-semibold block mb-1">Rincian Error:</span>
                  <p className="font-mono text-[11px] text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200 break-words">
                    {testResultModal.errorMessage}
                  </p>
                </div>
              )}
            </div>

            {/* L2: penawaran simpan model hasil auto-heal — tes memakai model
                pengganti karena model yang diminta tidak tersedia; model
                tersimpan belum berubah sampai admin menekan tombol ini. */}
            {testResultModal.healedModel && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-2">
                <p className="leading-relaxed">
                  Model yang diminta tidak tersedia, sehingga tes memakai model pengganti{' '}
                  <span className="font-mono font-bold text-amber-900">{testResultModal.healedModel}</span>.
                  Model tersimpan belum berubah.
                </p>
                <button
                  type="button"
                  onClick={handleSaveHealedModel}
                  disabled={isSavingConfig[testResultModal.provider]}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingConfig[testResultModal.provider] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Simpan {testResultModal.healedModel} sebagai model terpilih
                </button>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setTestResultModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition ai-btn-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bagian AI Provider Management */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-xs">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                AI Provider Management
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300">
                v{globalSettings.version}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Kelola Google Gemini, Groq AI, dan Provider Kustom. Enkripsi AES-256-GCM, pengujian live, active provider switcher, dan automatic fallback.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Tombol Tambah Provider AI */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Provider AI
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-50 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs accent-white ai-btn-white"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>

          <button
            type="button"
            onClick={() => setShowConfigForms(!showConfigForms)}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-50 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs accent-white ai-btn-white"
          >
            {showConfigForms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showConfigForms ? 'Sembunyikan Form' : 'Buka Form'}
          </button>
        </div>
      </div>

      {/* 1. PROVIDER OVERVIEW CARDS (DINAMIS SEMUA PROVIDER DENGAN TEMA BRAND MASING-MASING) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providerEntries.map(([providerKey, conf]) => {
          const theme = getProviderTheme(providerKey, conf.name);
          const isActive = globalSettings.activeProvider === providerKey;
          const isFallback =
            globalSettings.enableFallback &&
            globalSettings.fallbackProvider === providerKey &&
            !isActive;
          const ProviderIcon = theme.IconComponent;

          return (
            <div
              key={providerKey}
              className={`rounded-2xl border transition-all shadow-xs bg-white dark:bg-[#181913] relative overflow-hidden flex flex-col justify-between ai-white-card accent-white ${
                theme.cardGlow
              } ${
                isActive
                  ? theme.activeBorder
                  : 'border-gray-200 dark:border-[#D8CFBC]/12 hover:border-gray-300 dark:hover:border-[#D8CFBC]/25'
              }`}
            >
              {/* Top Accent Gradient Bar Berdasarkan Tema Brand Provider */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${theme.accentBarGradient}`} />

              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                <div>
                  {isActive && (
                    <div
                      className={`absolute top-1.5 right-0 ${theme.activeBadgeBg} text-[10px] font-black px-3 py-0.5 rounded-bl-xl shadow-xs uppercase tracking-wider`}
                    >
                      ACTIVE PROVIDER
                    </div>
                  )}
                  {isFallback && (
                    <div className="absolute top-1.5 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-xl shadow-xs uppercase tracking-wider">
                      FALLBACK STANDBY
                    </div>
                  )}

                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${theme.iconBg}`}
                    >
                      <ProviderIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 pr-14">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{conf.name}</h3>
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium block truncate">
                        {theme.tagline}
                      </span>
                      <div className="mt-1.5">{renderStatusBadge(conf.lastConnectionStatus, conf.lastErrorMessage)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs bg-gray-50/90 p-2.5 rounded-xl border border-gray-200/80 ai-subcard">
                    <div>
                      <span className="text-gray-500 block text-[10px]">Model Aktif:</span>
                      <span className="font-mono text-gray-900 text-xs font-semibold truncate block">
                        {conf.selectedModel || conf.defaultModel}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px]">Status API Key:</span>
                      {conf.isConfigured || conf.maskedKeyPreview ? (
                        <span className="text-emerald-600 text-[11px] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Tersimpan
                        </span>
                      ) : (
                        <span className="text-amber-600 text-[11px] font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Belum Diisi
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-gray-500 font-mono truncate">
                    Endpoint: {conf.apiEndpoint}
                  </div>

                  {conf.lastErrorMessage && conf.lastConnectionStatus !== 'connected' && (
                    <div
                      className="mt-2 text-[11px] p-2 rounded-xl border bg-rose-50 border-rose-200 text-rose-700 flex items-start gap-1.5"
                      title={conf.lastErrorMessage}
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 text-[10px] leading-tight">
                        {conf.lastErrorMessage}
                      </span>
                    </div>
                  )}

                  {conf.lastErrorMessage && conf.lastConnectionStatus === 'connected' && conf.lastErrorMessage.includes('Saldo') && (
                    <div
                      className="mt-2 text-[11px] p-2 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-1.5"
                      title={conf.lastErrorMessage}
                    >
                      <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 text-[10px] leading-tight">
                        {conf.lastErrorMessage}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(providerKey)}
                      disabled={isTesting[providerKey]}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-gray-700 border border-gray-300 ${theme.secondaryBtnHover} flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50 accent-white ai-btn-white`}
                    >
                      {isTesting[providerKey] ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5" />
                      )}
                      Tes Koneksi
                    </button>

                    {providerKey !== 'gemini' && providerKey !== 'groq' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomProvider(providerKey)}
                        title={`Hapus Provider ${conf.name}`}
                        className="p-1.5 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => setPendingActiveProvider(providerKey)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold ${theme.primaryBtnBg} transition shadow-xs flex items-center gap-1`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Pilih Jadi Aktif
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. ACTIVE PROVIDER SWITCHER & AUTOMATIC FALLBACK TOGGLE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/90 p-4 rounded-2xl border border-gray-200 ai-subcard accent-white">
        <div>
          <label className="text-xs font-bold text-gray-900 block mb-2">
            Pilih Provider Aktif (Single Source of Truth)
          </label>
          <div className="flex flex-wrap gap-2">
            {providerEntries.map(([slug, c]) => {
              const pTheme = getProviderTheme(slug, c.name);
              const isSelected = globalSettings.activeProvider === slug;
              const PIcon = pTheme.IconComponent;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    if (!isSelected) setPendingActiveProvider(slug);
                  }}
                  className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition ${
                    isSelected
                      ? `${pTheme.switcherActive} shadow-2xs`
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 accent-white ai-btn-white'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full border ${
                      isSelected ? pTheme.switcherDot : 'border-gray-400'
                    }`}
                  />
                  <PIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-gray-900 block">Automatic Fallback Engine</label>
              <p className="text-[11px] text-gray-500">
                Beralih ke provider cadangan jika kuota habis (429) atau timeout.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleFallback(!globalSettings.enableFallback)}
              disabled={isSwitchingFallback}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${globalSettings.enableFallback ? 'bg-emerald-600' : 'bg-zinc-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${globalSettings.enableFallback ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            {/* L6: nilai threshold & cooldown dari server (fallback 3x / 30s)
                — sebelumnya hardcoded "3x" dan "60 detik", padahal default
                server adalah 30 detik. */}
            Circuit Breaker aktif (Threshold: {globalSettings.circuitBreakerFailureThreshold ?? 3}x kegagalan berturut-turut, Cooldown: {globalSettings.circuitBreakerCooldownSec ?? 30} detik)
          </div>
          {/* M8: pemilih provider cadangan — sebelumnya toggle memilih
              provider non-aktif pertama secara arbitrer (bisa provider tanpa
              key, sehingga fallback mati diam-diam). Provider aktif tidak
              bisa dipilih sebagai cadangan. */}
          <div className="mt-3">
            <label className="text-[11px] font-semibold text-gray-900 block mb-1">
              Provider Cadangan (Fallback)
            </label>
            <select
              value={globalSettings.fallbackProvider}
              onChange={(e) => handleChangeFallbackProvider(e.target.value)}
              disabled={isSwitchingFallback}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 outline-none focus:border-amber-500 text-xs disabled:opacity-50"
            >
              {Object.entries(configs)
                .filter(([slug]) => slug !== globalSettings.activeProvider)
                .map(([slug, c]) => (
                  <option key={slug} value={slug}>
                    {c.name}
                    {c.isConfigured || c.maskedKeyPreview ? '' : ' — tanpa API key'}
                  </option>
                ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Provider cadangan dipakai saat provider aktif gagal (kuota habis/429 atau timeout). Provider tanpa API key tidak dapat dipakai sebagai cadangan saat fallback aktif.
            </p>
          </div>
        </div>
      </div>

      {/* 3. DETAILED API CONFIGURATION FORMS (DYNAMIC TAB PER PROVIDER) */}
      {showConfigForms && (
        <div className="bg-gray-50/90 p-5 rounded-2xl border border-gray-200 space-y-4 ai-subcard accent-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 pb-3 gap-2">
            <div className="flex items-center flex-wrap gap-2">
              {providerEntries.map(([slug, c]) => {
                const pTheme = getProviderTheme(slug, c.name);
                const isCurrentTab = activeFormTab === slug;
                const TabIcon = pTheme.IconComponent;
                return (
                  <div key={slug} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setActiveFormTab(slug)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        isCurrentTab
                          ? `${pTheme.tabActiveBg} font-black shadow-xs`
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 accent-white ai-btn-white'
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.name}</span>
                      {slug !== 'gemini' && slug !== 'groq' && (
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomProvider(slug);
                          }}
                          title={`Hapus provider ${c.name}`}
                          className="ml-1 p-0.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Tersimpan aman dengan enkripsi AES-256-GCM
            </span>
          </div>

          {/* Form Content untuk Tab Aktif */}
          {configs[activeFormTab] && (
            <div className="space-y-4 text-xs">
              {/* API Key Input with Eye Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                    {configs[activeFormTab].name} API Key
                    {configs[activeFormTab].isConfigured || configs[activeFormTab].maskedKeyPreview ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Tersimpan & Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        Belum Diisi
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] text-gray-500">
                    {showKeys[activeFormTab] ? 'Mode: Terbuka (Plaintext)' : 'Mode: Tersembunyi (Password)'}
                  </span>
                </div>

                <div className="relative">
                  <input
                    type={showKeys[activeFormTab] ? 'text' : 'password'}
                    value={inputKeys[activeFormTab] !== undefined ? inputKeys[activeFormTab] : ''}
                    onChange={(e) =>
                      setInputKeys((prev) => ({ ...prev, [activeFormTab]: e.target.value }))
                    }
                    placeholder={
                      configs[activeFormTab].maskedKeyPreview ||
                      `Masukkan API Key untuk ${configs[activeFormTab].name}...`
                    }
                    className="w-full pl-3 pr-10 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 font-mono outline-none focus:border-amber-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowKeys((prev) => ({ ...prev, [activeFormTab]: !prev[activeFormTab] }))
                    }
                    title={showKeys[activeFormTab] ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition p-1"
                  >
                    {showKeys[activeFormTab] ? (
                      <EyeOff className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  💡 Kosongkan field ini untuk mempertahankan API key yang sudah tersimpan — isi hanya bila ingin mengganti key. Setelah disimpan, kunci dienkripsi kuat menggunakan AES-256-GCM dan tidak pernah ditampilkan lagi.
                </p>
                {/* M12: key dari .env karena dekripsi key tersimpan gagal —
                    admin wajib tahu sistem tidak memakai key yang disimpannya. */}
                {configs[activeFormTab].keyFromEnvFallback && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2 mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Peringatan: API key tersimpan gagal didekripsi, sistem sementara memakai API key dari environment (.env). Simpan ulang API key provider ini.
                    </span>
                  </p>
                )}
              </div>

              {/* Endpoint & Model Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-900 block mb-1">
                    API Endpoint (Wajib HTTPS)
                  </label>
                  <input
                    type="text"
                    value={endpoints[activeFormTab] || ''}
                    onChange={(e) =>
                      setEndpoints((prev) => ({ ...prev, [activeFormTab]: e.target.value }))
                    }
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-900">Selected Model</label>
                    <button
                      type="button"
                      onClick={() => fetchModels(activeFormTab)}
                      disabled={isLoadingModels[activeFormTab]}
                      className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 transition"
                    >
                      <RotateCcw
                        className={`w-3 h-3 ${isLoadingModels[activeFormTab] ? 'animate-spin' : ''}`}
                      />
                      Ambil Model API
                    </button>
                  </div>

                  {availableModels[activeFormTab] && availableModels[activeFormTab].length > 0 ? (
                    <select
                      value={selectedModels[activeFormTab] || ''}
                      onChange={(e) =>
                        setSelectedModels((prev) => ({ ...prev, [activeFormTab]: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 outline-none font-mono focus:border-amber-500"
                    >
                      {availableModels[activeFormTab].map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={selectedModels[activeFormTab] || ''}
                      onChange={(e) =>
                        setSelectedModels((prev) => ({ ...prev, [activeFormTab]: e.target.value }))
                      }
                      placeholder="Masukkan nama model..."
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono outline-none focus:border-amber-500 transition"
                    />
                  )}
                  {/* M4: tandai daftar cadangan agar admin tidak mengira
                      daftar ini diambil live dari provider. */}
                  {modelsLive[activeFormTab] === false && availableModels[activeFormTab] && availableModels[activeFormTab].length > 0 && (
                    <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Daftar cadangan — pengambilan live gagal. Periksa API key / koneksi provider.
                    </p>
                  )}
                </div>
              </div>

              {/* Sliders Parameter Operasional */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Temp: <strong className="text-gray-900">{params[activeFormTab]?.temp ?? 0.7}</strong>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={params[activeFormTab]?.temp ?? 0.7}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        [activeFormTab]: {
                          ...prev[activeFormTab],
                          temp: parseFloat(e.target.value),
                        },
                      }))
                    }
                    className={`w-full ${getProviderTheme(activeFormTab, configs[activeFormTab]?.name).sliderAccent}`}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Max Output Tokens
                  </label>
                  <input
                    type="number"
                    value={params[activeFormTab]?.maxTokens ?? 2048}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        [activeFormTab]: {
                          ...prev[activeFormTab],
                          maxTokens: parseInt(e.target.value) || 2048,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={params[activeFormTab]?.timeout ?? 30000}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        [activeFormTab]: {
                          ...prev[activeFormTab],
                          timeout: parseInt(e.target.value) || 30000,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">Retries</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={params[activeFormTab]?.retries ?? 2}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        [activeFormTab]: {
                          ...prev[activeFormTab],
                          retries: parseInt(e.target.value) || 2,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  {/* L14: hapus API key tersimpan (dengan konfirmasi) —
                      konfigurasi lain tetap tersimpan. Tampil hanya bila ada
                      key tersimpan. Berlaku juga untuk Gemini/Groq (satu-satunya
                      cara mencabut key provider bawaan tanpa edit DB). */}
                  {(configs[activeFormTab].isConfigured || configs[activeFormTab].maskedKeyPreview) && (
                    <button
                      type="button"
                      onClick={() => handleClearApiKey(activeFormTab)}
                      disabled={isClearingKey[activeFormTab]}
                      title="Hapus API key tersimpan (konfigurasi lain tetap tersimpan)"
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isClearingKey[activeFormTab] ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Key className="w-3.5 h-3.5 text-rose-500" />
                      )}
                      Hapus API Key
                    </button>
                  )}
                  {activeFormTab !== 'gemini' && activeFormTab !== 'groq' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomProvider(activeFormTab)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      Hapus Provider
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestConnection(activeFormTab)}
                    disabled={isTesting[activeFormTab]}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-gray-700 ${getProviderTheme(activeFormTab, configs[activeFormTab]?.name).secondaryBtnHover} border border-gray-300 transition flex items-center gap-1.5 disabled:opacity-50 accent-white ai-btn-white`}
                  >
                    {isTesting[activeFormTab] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    Tes Koneksi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveConfig(activeFormTab)}
                    disabled={isSavingConfig[activeFormTab]}
                    className={`px-4 py-2 rounded-xl text-xs font-bold ${getProviderTheme(activeFormTab, configs[activeFormTab]?.name).saveBtnBg} transition shadow-sm flex items-center gap-1.5 disabled:opacity-50`}
                  >
                    {isSavingConfig[activeFormTab] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Simpan {configs[activeFormTab].name}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. QUICK AI TELEMETRY STRIP */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-200 text-xs ai-subcard">
          <div>
            <span className="text-gray-500 text-[10px] block">Total Panggilan AI</span>
            <span className="font-bold text-gray-900 font-mono text-sm">{metrics.totalRequests}</span>
          </div>
          <div>
            <span className="text-gray-500 text-[10px] block">Success Rate</span>
            <span className="font-bold text-emerald-600 font-mono text-sm">
              {metrics.successRatePercent}%
            </span>
          </div>
          <div>
            <span className="text-gray-500 text-[10px] block">Rerata Latency</span>
            <span className="font-bold text-gray-900 font-mono text-sm">{metrics.avgLatencyMs != null ? `${metrics.avgLatencyMs} ms` : '—'}</span>
          </div>
          <div>
            <span className="text-gray-500 text-[10px] block">Akumulasi Token</span>
            <span className="font-bold text-amber-600 font-mono text-sm">
              {metrics.totalTokens.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      )}

      {/* M7: Riwayat tes koneksi — sebelumnya state testLogs tidak pernah
          dirender di mana pun (state mati). Sekarang ditampilkan ringkas. */}
      {testLogs.length > 0 && (
        <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-xs ai-subcard">
          <div className="font-semibold text-gray-700 mb-2">Riwayat Tes Koneksi Terakhir</div>
          <ul className="space-y-1.5">
            {testLogs.slice(0, 5).map((log, i) => (
              <li key={`${log.provider}-${log.testedAt}-${i}`} className="flex flex-wrap items-center gap-x-2 text-gray-600">
                <span className="font-mono font-semibold text-gray-900">{log.provider}</span>
                <span className="font-mono">{log.modelTested}</span>
                <span className={log.status === 'success' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {log.status}{log.httpStatusCode != null ? ` (${log.httpStatusCode})` : ''}
                </span>
                <span>{log.responseTimeMs} ms</span>
                <span className="text-gray-400">{log.testedAt ? new Date(log.testedAt).toLocaleString('id-ID') : ''}</span>
                {log.errorMessage && log.status !== 'success' && (
                  <span className="text-red-500 w-full truncate">{log.errorMessage}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SparkleIcon(props: any) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
