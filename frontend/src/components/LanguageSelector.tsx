import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { LANGUAGES, useI18n } from "../lib/i18n";

export default function LanguageSelector() {
  const { currentLanguage, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedLang = LANGUAGES.find((l) => l.code === currentLanguage) || LANGUAGES[0];

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button: To the right of Demo */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
          isOpen
            ? "bg-brand-500/20 text-brand-200 border-brand-500/40 shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/30"
            : "text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08]"
        }`}
        title="Change Website Regional Language / भाषा बदलें"
      >
        <Globe className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
        <span className="font-medium tracking-tight">
          {selectedLang.nativeName}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-white/50 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-brand-300" : ""
          }`}
        />
      </button>

      {/* Floating Glassmorphism Language Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 sm:w-72 rounded-2xl bg-[#0c1424]/95 backdrop-blur-2xl border border-white/[0.12] shadow-2xl shadow-black/80 z-50 p-2 animate-fade-in origin-top-right">
          {/* Header */}
          <div className="px-2.5 py-2 border-b border-white/[0.08] mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-[11px] font-bold text-white tracking-wide uppercase">
                Regional Languages
              </span>
            </div>
            <span className="text-[10px] text-white/40 font-mono">
              10 Languages
            </span>
          </div>

          {/* Languages Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-72 overflow-y-auto pr-0.5 custom-scrollbar">
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === currentLanguage;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs transition-all ${
                    isSelected
                      ? "bg-brand-500/25 border border-brand-500/50 text-white font-bold shadow-sm ring-1 ring-brand-500/30"
                      : "text-white/70 hover:text-white hover:bg-white/[0.06] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs">{lang.flag}</span>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-white truncate">
                        {lang.nativeName}
                      </div>
                      <div className="text-[10px] text-white/40 truncate">
                        {lang.name}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-brand-300 flex-shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Hint */}
          <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] px-2 text-[10px] text-white/40 text-center">
            Website instantly translates into chosen Indic language
          </div>
        </div>
      )}
    </div>
  );
}

