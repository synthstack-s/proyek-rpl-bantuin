'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { useTheme, Theme } from './ThemeProvider';

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const options: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: 'Terang', icon: Sun },
    { value: 'dark', label: 'Gelap', icon: Moon },
    { value: 'system', label: 'Sistem', icon: Laptop },
  ];

  const CurrentIcon = resolvedTheme === 'light' ? Sun : Moon;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Pilih Tema (Gelap, Terang, Sistem)"
        title={`Tema saat ini: ${theme === 'system' ? `Sistem (${resolvedTheme})` : theme === 'dark' ? 'Gelap' : 'Terang'}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all duration-200 theme-toggle-btn shadow-xs"
      >
        <CurrentIcon className="w-4 h-4 transition-transform duration-300 hover:rotate-12" />
        {!compact && (
          <span className="text-xs font-semibold hidden sm:inline">
            {theme === 'system' ? 'Sistem' : theme === 'dark' ? 'Gelap' : 'Terang'}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-2xl border p-1.5 shadow-xl backdrop-blur-2xl z-50 transition-all duration-150 theme-dropdown-menu">
          <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 theme-dropdown-label">
            Pilih Tema
          </div>
          {options.map((option) => {
            const Icon = option.icon;
            const isSelected = theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isSelected ? 'theme-dropdown-item-active' : 'theme-dropdown-item'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{option.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

