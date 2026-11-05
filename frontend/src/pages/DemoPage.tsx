/**
 * Demo Controls Page — scenario picker, simulated clock, service health.
 * Elevated with modern obsidian glassmorphic design and ambient lighting.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  FastForward,
  Zap,
  Server,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { format } from "date-fns";
import { demoApi, promisesApi } from "../lib/api";
import { useStore } from "../store";

export default function DemoPage() {
  const navigate = useNavigate();
  const { simulatedNow, setSimulatedNow, activeCase, setPromises } = useStore();
  const [advancing, setAdvancing] = useState(false);
  const [health, setHealth] = useState<{ sarvam_available: boolean; gnani_available?: boolean } | null>(null);
  const [daysToAdvance, setDaysToAdvance] = useState(5);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l].slice(0, 30));

  useEffect(() => {
    // Fetch current clock and status
    demoApi.getClock().then((r) => setSimulatedNow(r.simulated_now)).catch(() => {});
    demoApi.getStatus().then(setHealth).catch(() => {});
  }, []);

  const handleAdvanceClock = async () => {
    setAdvancing(true);
    try {
      const r = await demoApi.advanceClock(daysToAdvance);
      setSimulatedNow(r.simulated_now);
      addLog(`Clock advanced by ${daysToAdvance} day(s) → ${format(new Date(r.simulated_now), "dd MMM yyyy HH:mm")} IST`);
      if (activeCase) {
        const updated = await promisesApi.listForCase(activeCase.id).catch(() => []);
        setPromises(updated);
        addLog(`Refreshed ${updated.length} promise(s) — status evaluated against new deadline`);
      }
    } catch {
      addLog("Failed to advance clock");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-6 py-10">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/ledger")}
            className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 border border-white/10 hover:border-white/20 rounded-xl"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Ledger
          </button>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="font-extrabold text-2xl text-white tracking-tight">Demo Flight Deck</h1>
          <span className="badge bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs font-semibold">
            <Sparkles className="w-3 h-3" />
            Simulated Clock
          </span>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Simulated Clock Card */}
        <div className="relative overflow-hidden rounded-3xl bg-[#0d1527]/90 border border-white/[0.12] p-7 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-amber-400" />
          
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg tracking-tight">Simulated Deadline Clock</h2>
                <p className="text-xs text-white/50">Fast-forward time to trigger SLA reminders & check-ins</p>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-5 mb-5 font-mono shadow-inner">
            <div className="text-white/40 text-xs uppercase tracking-wider mb-1.5 font-sans font-medium">
              Current Simulated Time (IST)
            </div>
            <div className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-white to-emerald-300 font-mono tracking-tight">
              {simulatedNow
                ? format(new Date(simulatedNow), "dd MMM yyyy · HH:mm:ss")
                : "Real time (Live)"}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3.5">
            <div className="flex-1">
              <label className="text-xs font-semibold text-white/60 mb-1.5 block">
                Days to Advance Fast-Forward
              </label>
              <input
                type="number"
                id="days-input"
                min={1}
                max={30}
                value={daysToAdvance}
                onChange={(e) => setDaysToAdvance(Number(e.target.value))}
                className="input py-2.5 text-sm bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
              />
            </div>
            <button
              id="advance-clock-btn"
              onClick={handleAdvanceClock}
              disabled={advancing}
              className="btn-primary py-3 px-6 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-brand-500/25 whitespace-nowrap"
            >
              {advancing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FastForward className="w-4 h-4" />
              )}
              Advance Clock by {daysToAdvance} Day{daysToAdvance > 1 ? "s" : ""}
            </button>
          </div>

          <p className="text-white/40 text-xs mt-4 leading-relaxed">
            Advancing the clock triggers the background deadline worker. When a promise exceeds its statutory 5-day window, Mock-On automatically sends a check-in email with 1-click [Yes / No] resolution buttons to your inbox and queues an automated follow-up call.
          </p>
        </div>

        {/* Service Health Grid */}
        <div className="rounded-3xl bg-[#0d1527]/90 border border-white/[0.12] p-7 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg tracking-tight">Architectural Subsystem Health</h2>
                <p className="text-xs text-white/50">Live status of AI models, telco adapters, and storage</p>
              </div>
            </div>
            <button
              onClick={() => demoApi.getStatus().then(setHealth).catch(() => {})}
              className="btn-ghost text-xs py-1.5 px-3 rounded-lg border border-white/10 hover:border-white/20 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: "Backend Orchestrator", detail: "FastAPI Async Engine", ok: true },
              { name: "Neon Cloud DB", detail: "PostgreSQL + pgvector", ok: true },
              { name: "Sarvam AI 105B", detail: "Multi-modal Extraction", ok: health?.sarvam_available ?? false },
              { name: "Gnani Prisma STT", detail: "v3.0 Indian Accent 8 kHz", ok: health?.gnani_available ?? false },
              { name: "Gnani Timbre TTS", detail: "v3.0 Shivani Voice Engine", ok: health?.gnani_available ?? false },
              { name: "Email Transceiver", detail: "Gmail SMTP with Port Fallback", ok: true },
            ].map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 hover:border-white/[0.15] transition-all"
              >
                <div>
                  <div className="text-sm font-semibold text-white/90">{svc.name}</div>
                  <div className="text-xs text-white/40">{svc.detail}</div>
                </div>
                {svc.ok === true ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Online
                  </span>
                ) : svc.ok === false ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold">
                    <XCircle className="w-3.5 h-3.5" /> Offline
                  </span>
                ) : (
                  <span className="text-white/40 text-xs">Awaiting keys</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Event Activity Log */}
        <div className="rounded-3xl bg-[#0d1527]/90 border border-white/[0.12] p-7 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg tracking-tight">Event Activity Log</h2>
                <p className="text-xs text-white/50">Real-time audit trail of background worker cycles</p>
              </div>
            </div>
            <button
              onClick={() => setLog([])}
              className="btn-ghost text-xs py-1.5 px-3 rounded-lg border border-white/10 hover:border-white/20"
            >
              Clear Log
            </button>
          </div>

          <div className="bg-black/50 border border-white/[0.08] rounded-2xl p-4 font-mono text-xs space-y-1.5 max-h-52 overflow-y-auto shadow-inner">
            {log.length === 0 ? (
              <div className="text-white/30 py-3 text-center flex items-center justify-center gap-2">
                <Terminal className="w-4 h-4 text-white/20" />
                No events logged yet. Advance the simulated clock above to inspect event triggers.
              </div>
            ) : (
              log.map((line, i) => (
                <div key={i} className="text-white/70 hover:text-white transition-colors leading-relaxed">
                  <span className="text-brand-400">&gt;</span> {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
