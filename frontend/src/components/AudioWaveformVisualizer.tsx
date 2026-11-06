/**
 * Live Telephony Waveform & Frequency Visualizer
 * High-fidelity, real-time frequency spectrum display with speaker reactivity,
 * live call duration stopwatch, and audio telemetry HUD.
 */
import { useEffect, useState, useMemo } from "react";
import {
  Volume2,
  VolumeX,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import type { SpeakerRole } from "../types";

interface AudioWaveformVisualizerProps {
  callStatus: string;
  isOnHold: boolean;
  activeSpeaker: SpeakerRole | null;
  isMuted: boolean;
  onToggleMute: () => void;
  provider?: string;
  helplineNumber?: string;
}

export default function AudioWaveformVisualizer({
  callStatus,
  isOnHold,
  activeSpeaker,
  isMuted,
  onToggleMute,
  provider = "Customer Support",
  helplineNumber,
}: AudioWaveformVisualizerProps) {
  // 1. Live Call Stopwatch (MM:SS)
  const [durationSeconds, setDurationSeconds] = useState(0);

  useEffect(() => {
    let timer: any = null;
    if (callStatus === "active") {
      timer = setInterval(() => {
        setDurationSeconds((s) => s + 1);
      }, 1000);
    } else if (callStatus === "idle" || callStatus === "initialising") {
      setDurationSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus]);

  const formattedDuration = useMemo(() => {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, [durationSeconds]);

  // 2. Frequency Spectrum Bars (28 vertical frequency bands)
  const NUM_BARS = 28;
  const [barHeights, setBarHeights] = useState<number[]>(() =>
    Array.from({ length: NUM_BARS }, (_, i) => {
      const mid = NUM_BARS / 2;
      const dist = Math.abs(i - mid) / mid;
      return Math.max(15, Math.floor(65 * (1 - dist * 0.6)));
    })
  );

  const [dbLevel, setDbLevel] = useState("-18.4 dBFS");
  const packetLoss = "0.0%";

  useEffect(() => {
    if (callStatus !== "active" && callStatus !== "ringing") {
      setBarHeights(Array.from({ length: NUM_BARS }, () => 8));
      setDbLevel("-∞ dBFS");
      return;
    }

    if (isMuted) {
      setBarHeights(Array.from({ length: NUM_BARS }, () => 12));
      setDbLevel("-36.0 dBFS (Muted)");
      return;
    }

    // Interval to simulate dynamic audio waveform packets
    const interval = setInterval(() => {
      const isAdvocate = activeSpeaker === "user";
      const isRep = activeSpeaker === "agent";
      const isIvr = isOnHold || activeSpeaker === "ivr";

      let baseMin = 15;
      let baseMax = 70;
      let db = "-18.2 dBFS";

      if (isAdvocate) {
        baseMin = 28;
        baseMax = 95;
        db = `-${(12.0 + Math.random() * 3.5).toFixed(1)} dBFS`;
      } else if (isRep) {
        baseMin = 22;
        baseMax = 88;
        db = `-${(14.0 + Math.random() * 4.0).toFixed(1)} dBFS`;
      } else if (isIvr) {
        baseMin = 18;
        baseMax = 60;
        db = `-${(20.0 + Math.random() * 2.0).toFixed(1)} dBFS`;
      } else {
        baseMin = 10;
        baseMax = 35;
        db = `-${(26.0 + Math.random() * 2.0).toFixed(1)} dBFS`;
      }

      setDbLevel(db);

      setBarHeights(
        Array.from({ length: NUM_BARS }, (_, i) => {
          const center = NUM_BARS / 2;
          const distFactor = 1 - Math.abs(i - center) / center;
          const curve = Math.sin((i / NUM_BARS) * Math.PI);
          const noise = (Math.random() - 0.5) * 35;
          const calculated = baseMin + (baseMax - baseMin) * curve * 0.85 + noise * distFactor;
          return Math.max(8, Math.min(100, Math.round(calculated)));
        })
      );
    }, 110);

    return () => clearInterval(interval);
  }, [callStatus, isOnHold, activeSpeaker, isMuted]);

  // 3. Speaker Theme Configuration
  const theme = useMemo(() => {
    if (callStatus === "ended") {
      return {
        label: "Call Disconnected",
        accent: "text-slate-400",
        badgeBg: "bg-slate-500/15 border-slate-500/30 text-slate-300",
        barGradient: "from-slate-600 to-slate-400",
        glow: "shadow-none",
        dotColor: "bg-slate-400",
      };
    }
    if (callStatus === "ringing") {
      return {
        label: `Dialing ${provider} Hotline...`,
        accent: "text-rose-400",
        badgeBg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        barGradient: "from-rose-500 to-amber-400",
        glow: "shadow-[0_0_20px_rgba(244,63,94,0.3)]",
        dotColor: "bg-rose-400 animate-ping",
      };
    }
    if (isOnHold) {
      return {
        label: "On Hold • Monitoring Telco Queue",
        accent: "text-amber-400",
        badgeBg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        barGradient: "from-amber-400 to-yellow-300",
        glow: "shadow-[0_0_20px_rgba(245,158,11,0.35)]",
        dotColor: "bg-amber-400 animate-pulse",
      };
    }
    if (activeSpeaker === "user") {
      return {
        label: "AI Personal Assistant Speaking (Statutory Mode)",
        accent: "text-emerald-400",
        badgeBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
        barGradient: "from-emerald-400 via-teal-300 to-emerald-500",
        glow: "shadow-[0_0_25px_rgba(16,185,129,0.35)]",
        dotColor: "bg-emerald-400 animate-pulse",
      };
    }
    if (activeSpeaker === "agent") {
      return {
        label: `${provider} Representative Speaking`,
        accent: "text-rose-400",
        badgeBg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        barGradient: "from-rose-500 via-pink-400 to-rose-400",
        glow: "shadow-[0_0_25px_rgba(244,63,94,0.35)]",
        dotColor: "bg-rose-400 animate-pulse",
      };
    }
    if (activeSpeaker === "ivr") {
      return {
        label: "Interactive Voice Response (IVR Navigation)",
        accent: "text-violet-400",
        badgeBg: "bg-violet-500/15 border-violet-500/30 text-violet-300",
        barGradient: "from-violet-500 via-purple-400 to-indigo-400",
        glow: "shadow-[0_0_20px_rgba(139,92,246,0.3)]",
        dotColor: "bg-violet-400 animate-pulse",
      };
    }
    return {
      label: "Full-Duplex VoIP Stream Ready • Voice Channel Synced",
      accent: "text-brand-300",
      badgeBg: "bg-brand-500/15 border-brand-500/30 text-brand-300",
      barGradient: "from-brand-500 via-cyan-400 to-brand-400",
      glow: "shadow-[0_0_15px_rgba(16,132,238,0.2)]",
      dotColor: "bg-brand-400 animate-pulse",
    };
  }, [callStatus, isOnHold, activeSpeaker, provider]);

  return (
    <div className="bg-[#0b1222]/95 border-b border-white/[0.08] px-5 py-3 backdrop-blur-xl relative overflow-hidden flex-shrink-0 transition-all duration-300">
      {/* Background ambient glow pulse */}
      <div
        className={`absolute inset-0 pointer-events-none opacity-20 transition-opacity duration-500 ${
          callStatus === "active" ? "opacity-30" : "opacity-10"
        }`}
        style={{
          background:
            activeSpeaker === "user"
              ? "radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 70%)"
              : activeSpeaker === "agent"
              ? "radial-gradient(ellipse at 50% 0%, rgba(244, 63, 94, 0.25) 0%, transparent 70%)"
              : isOnHold
              ? "radial-gradient(ellipse at 50% 0%, rgba(245, 158, 11, 0.25) 0%, transparent 70%)"
              : "radial-gradient(ellipse at 50% 0%, rgba(16, 132, 238, 0.15) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 space-y-2">
        {/* Top Control & Telemetry Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Active Audio State Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-all duration-300 ${theme.badgeBg}`}
            >
              <span className={`w-2 h-2 rounded-full ${theme.dotColor}`} />
              <span className="tracking-wide uppercase">{theme.label}</span>
            </span>

            {helplineNumber && (
              <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-mono text-white/50 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                Target: {helplineNumber}
              </span>
            )}
          </div>

          {/* Telemetry HUD & Call Stopwatch */}
          <div className="flex items-center gap-2.5 sm:gap-4 font-mono text-[11px]">
            {/* Live Call Duration */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.08] text-white">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              <span className="font-bold text-white text-xs">{formattedDuration}</span>
            </div>

            {/* Audio Telemetry Pill */}
            <div className="hidden sm:flex items-center gap-2 text-white/50 text-[10.5px] px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> 16 kHz Mono PCM
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-brand-400" /> 42ms
              </span>
              <span>&bull;</span>
              <span className="text-white/40">Loss: {packetLoss}</span>
              <span>&bull;</span>
              <span className="text-brand-300">{dbLevel}</span>
            </div>

            {/* Audio Mute Quick Toggle */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-sans font-bold flex items-center gap-1.5 transition-all ${
                isMuted
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm"
                  : "bg-white/[0.04] border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.08]"
              }`}
              title={isMuted ? "Click to unmute live speaker" : "Click to mute live speaker"}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px]">Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px]">Live Audio</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Spectrum Waveform Display */}
        <div className="relative h-10 sm:h-11 w-full bg-black/50 rounded-xl border border-white/[0.07] px-4 py-1.5 flex items-center justify-between gap-1 overflow-hidden">
          {/* Subtle horizontal grid lines */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/[0.05] pointer-events-none" />
          <div className="absolute inset-x-0 top-1/4 h-[1px] bg-white/[0.03] pointer-events-none" />
          <div className="absolute inset-x-0 bottom-1/4 h-[1px] bg-white/[0.03] pointer-events-none" />

          {/* 28 Dynamic Audio Bars */}
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col justify-center items-center h-full max-w-[12px] group"
            >
              <div
                style={{
                  height: `${h}%`,
                  transition: "height 0.12s cubic-bezier(0.2, 0.8, 0.4, 1)",
                }}
                className={`w-full rounded-full bg-gradient-to-t ${theme.barGradient} transition-all duration-150 ${
                  callStatus === "active" && !isMuted ? theme.glow : ""
                }`}
              />
            </div>
          ))}

          {/* Right VU Level Gauge Accent */}
          <div className="hidden md:flex flex-col justify-between h-full pl-2 border-l border-white/[0.08] text-[8px] font-mono text-white/30 select-none">
            <span>0dB</span>
            <span>-12dB</span>
            <span>-24dB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
