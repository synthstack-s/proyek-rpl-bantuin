'use client';

import { useState } from 'react';
import { MapPin, Navigation, Crosshair, Check, AlertCircle, Loader2 } from 'lucide-react';

interface InteractiveLocationPickerProps {
  latitude: number;
  longitude: number;
  addressText: string;
  onChange: (data: { latitude: number; longitude: number; addressText?: string }) => void;
}

export default function InteractiveLocationPicker({
  latitude,
  longitude,
  addressText,
  onChange,
}: InteractiveLocationPickerProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [gpsSuccess, setGpsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Peramban Anda tidak mendukung deteksi lokasi otomatis.');
      return;
    }

    setIsDetecting(true);
    setErrorMsg(null);
    setGpsSuccess(false);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsDetecting(false);
        setGpsSuccess(true);
        onChange({
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
        });
        setTimeout(() => setGpsSuccess(false), 3000);
      },
      (err) => {
        setIsDetecting(false);
        setErrorMsg('Gagal mendeteksi lokasi otomatis. Silakan atur titik koordinat secara manual.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleManualCoordChange = (field: 'lat' | 'lng', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (field === 'lat') onChange({ latitude: num, longitude });
      else onChange({ latitude, longitude: num });
    }
  };

  return (
    <div className="rounded-2xl border border-[#D8CFBC]/20 bg-[#181913]/90 p-4 space-y-3 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#D8CFBC]" />
          <span className="text-xs font-semibold text-[#FFFBF4]">Titik Koordinat Lokasi Servis</span>
        </div>
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={isDetecting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D8CFBC]/15 hover:bg-[#D8CFBC]/25 text-[#FFFBF4] border border-[#D8CFBC]/25 text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isDetecting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D8CFBC]" />
              <span>Mencari GPS...</span>
            </>
          ) : gpsSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Terkunci!</span>
            </>
          ) : (
            <>
              <Navigation className="w-3.5 h-3.5 text-[#D8CFBC]" />
              <span>GPS Otomatis</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Visual Interactive Map Radar Simulator */}
      <div className="relative h-32 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/20 overflow-hidden flex items-center justify-center group shadow-inner">
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: `radial-gradient(#D8CFBC 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#11120D] via-transparent to-[#11120D]/80" />

        {/* Center crosshair pin */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-[#D8CFBC]/20 animate-ping absolute" />
            <div className="w-8 h-8 rounded-full bg-[#1C1D17] border border-[#D8CFBC] flex items-center justify-center text-[#FFFBF4] shadow-[0_0_15px_rgba(216,207,188,0.4)]">
              <Crosshair className="w-4 h-4 text-[#D8CFBC]" />
            </div>
          </div>
          <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-[#181913]/90 border border-[#D8CFBC]/30 text-[10px] text-[#FFFBF4] font-mono shadow-sm">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>

        {/* Bottom indicator */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-[#D8CFBC]/70 z-10">
          <span>Area Radius Teknisi Terdekat: 15 KM</span>
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Siap Kunjungan
          </span>
        </div>
      </div>

      {/* Coordinates Inputs */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <div>
          <label className="block text-[11px] text-[#D8CFBC]/70 mb-1">Latitude</label>
          <input
            type="number"
            step="0.000001"
            value={latitude}
            onChange={(e) => handleManualCoordChange('lat', e.target.value)}
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-2.5 py-2 text-xs text-[#FFFBF4] font-mono focus:outline-none focus:border-[#D8CFBC] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#D8CFBC]/70 mb-1">Longitude</label>
          <input
            type="number"
            step="0.000001"
            value={longitude}
            onChange={(e) => handleManualCoordChange('lng', e.target.value)}
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-2.5 py-2 text-xs text-[#FFFBF4] font-mono focus:outline-none focus:border-[#D8CFBC] transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
