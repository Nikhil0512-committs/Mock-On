/**
 * Live Call Page — real-time transcript with speaker chips, hold indicator,
 * and AI Mission Control evidence sidebar.
 * Elevated with modern 21st.dev / shadcn-style split terminal design.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone,
  PhoneOff,
  PhoneCall,
  Clock,
  Wifi,
  ChevronRight,
  Users,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Volume2,
  VolumeX,
  FileDown,
  Shield,
  Sparkles,
  Radio,
  FileCheck,
  Send,
  Mic,
  MicOff,
  ShieldAlert,
  Zap,
  Brain,
} from "lucide-react";
import { useStore } from "../store";
import { useCallWebSocket } from "../hooks/useCallWebSocket";
import { callsApi, casesApi, promisesApi } from "../lib/api";
import { deduplicateConsecutivePhrases } from "./SwitchboardPage";
import ShareFamilyModal from "../components/ShareFamilyModal";
import CallSummaryModal from "../components/CallSummaryModal";
import AudioWaveformVisualizer from "../components/AudioWaveformVisualizer";
import type { SpeakerRole } from "../types";

function SpeakerChip({ role }: { role: SpeakerRole }) {
  const classes: Record<SpeakerRole, string> = {
    agent: "text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono tracking-wider",
    user: "text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono tracking-wider",
    ivr: "chip-ivr",
    system: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/40 font-mono",
  };
  const labels: Record<SpeakerRole, string> = {
    agent: "COMPANY REPRESENTATIVE",
    user: "MOCK-ON AI ADVOCATE",
    ivr: "TELCO IVR",
    system: "SYSTEM RADAR",
  };
  return <span className={classes[role]}>{labels[role]}</span>;
}

function HoldIndicator() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-4 animate-fade-in">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-amber-500/20 hold-ripple" />
        <div className="absolute inset-0 rounded-full bg-amber-500/10 hold-ripple-delay" />
        <div className="relative w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center animate-hold-ring">
          <Clock className="w-8 h-8 text-amber-400" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-amber-300 font-bold text-sm tracking-wide">Call Placed on Hold</p>
        <p className="text-white/40 text-xs mt-0.5">Please wait, representative is reviewing your docket…</p>
      </div>
    </div>
  );
}

export default function CallPage() {
  const navigate = useNavigate();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [userMessageInput, setUserMessageInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const accumulatedTextRef = useRef<string>("");
  const silenceTimerRef = useRef<any>(null);

  const toggleMic = () => {
    if (isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (_) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      const text = deduplicateConsecutivePhrases((userMessageInput || accumulatedTextRef.current).trim());
      if (text && activeCall) {
        setUserMessageInput("");
        accumulatedTextRef.current = "";
        callsApi.sendCallMessage(activeCall.id, {
          speaker: "user",
          text,
          auto_advocate_reply: false,
        }).catch(() => {});
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice recognition is supported on Chrome, Edge, and modern browsers.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            accumulatedTextRef.current += (accumulatedTextRef.current ? " " : "") + res[0].transcript.trim();
          } else {
            interim += res[0].transcript;
          }
        }
        const combined = (accumulatedTextRef.current + " " + interim).trim();
        const clean = deduplicateConsecutivePhrases(combined);
        if (clean) {
          setUserMessageInput(clean);
        }

        if (clean.length >= 2 && activeCall) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const candidate = clean.trim();
            if (candidate && activeCall) {
              setUserMessageInput("");
              accumulatedTextRef.current = "";
              callsApi.sendCallMessage(activeCall.id, {
                speaker: "user",
                text: candidate,
                auto_advocate_reply: false,
              }).catch(() => {});
            }
          }, 1200);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      accumulatedTextRef.current = "";
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (e) {
      setIsListening(false);
    }
  };

  const {
    activeCall,
    setActiveCall,
    activeCase,
    setActiveCase,
    utterances,
    callStatus,
    setCallStatus,
    callEndInfo,
    setCallEndInfo,
    isOnHold,
    pendingProposals,
    removeProposal,
    setActiveTab,
    setPromises,
    isAudioMuted,
    setIsAudioMuted,
    evasionRadar,
  } = useStore();

  useCallWebSocket(activeCall?.id ?? null);

  // Sync callStatus when activeCall changes
  useEffect(() => {
    if (activeCall) {
      if (
        activeCall.status === "ringing" ||
        activeCall.status === "active" ||
        activeCall.status === "initialising"
      ) {
        setCallStatus(activeCall.status);
        setCallEndInfo(null);
        setSummaryModalOpen(false);
      }
    }
  }, [activeCall?.id]);

  // If activeCase is set but activeCall is null (e.g. page refresh), fetch latest call for case
  useEffect(() => {
    if (activeCase && !activeCall) {
      callsApi
        .getLatestForCase(activeCase.id)
        .then((latestCall) => {
          if (latestCall) {
            setActiveCall(latestCall);
            if (
              latestCall.status === "ringing" ||
              latestCall.status === "active" ||
              latestCall.status === "initialising"
            ) {
              setCallStatus(latestCall.status);
              setCallEndInfo(null);
              setSummaryModalOpen(false);
            }
          }
        })
        .catch(() => {});
    }
  }, [activeCase?.id, activeCall]);

  // If no active case in store, try fetching the most recent case from API
  useEffect(() => {
    if (!activeCase) {
      casesApi
        .list()
        .then((list) => {
          if (list && list.length > 0) {
            setActiveCase(list[0]);
          }
        })
        .catch(() => {});
    }
  }, [activeCase, setActiveCase]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [utterances]);

  // Refresh promises and open summary modal ONLY when call actively transitions to ended
  const prevCallStatusRef = useRef(callStatus);
  useEffect(() => {
    if (
      (prevCallStatusRef.current === "active" || prevCallStatusRef.current === "ringing") &&
      callStatus === "ended" &&
      activeCase
    ) {
      promisesApi
        .listForCase(activeCase.id)
        .then((fetched) => {
          if (fetched && fetched.length > 0) {
            setPromises(fetched);
          }
        })
        .catch(() => {})
        .finally(() => {
          setSummaryModalOpen(true);
        });
    }
    prevCallStatusRef.current = callStatus;
  }, [callStatus, activeCase, setPromises]);

  const handleEndCall = async () => {
    if (activeCall) {
      await callsApi.end(activeCall.id, { reason: "Call ended midway by consumer before resolution" }).catch(() => {});
    }
    navigate("/ledger");
  };

  const handleConfirmProposal = async (index: number, confirm: boolean, enableFollowUp = false) => {
    const proposal = pendingProposals[index];
    if (!proposal?.promise_data) return;

    const promiseId = (proposal.promise_data as { id?: string }).id;
    if (!promiseId) {
      removeProposal(index);
      return;
    }

    await promisesApi
      .confirm(promiseId, { confirmed: confirm, enable_follow_up: enableFollowUp })
      .catch(() => {});
    removeProposal(index);

    if (activeCase) {
      const updated = await promisesApi.listForCase(activeCase.id).catch(() => []);
      setPromises(updated);
    }

    // Autonomous Agent: When a refund commitment is confirmed, autonomously conclude the call session
    if (confirm && activeCall && callStatus === "active") {
      callsApi.end(activeCall.id, { reason: "Autonomous Resolution: Refund commitment confirmed" }).catch(() => {});
    }
  };

  const statusColour = {
    active: "text-emerald-400",
    ringing: "text-rose-400 animate-pulse",
    ended: "text-slate-400",
    error: "text-rose-400",
    initialising: "text-amber-400",
    idle: "text-white/30",
  }[callStatus] || "text-white/30";

  const isSessionActive = Boolean(activeCall && callStatus !== "idle");
  const isRadarActive = isSessionActive || utterances.length > 0;
  const caseInfo = (activeCase?.approved_info as Record<string, unknown>) || {};
  const domain = ((caseInfo.domain as string) || "telecom").toLowerCase();
  const provider = (caseInfo.service_provider as string) || (activeCase ? "Customer Care" : "");
  const identifierVal = (caseInfo.identifier_value as string) || (caseInfo.phone_number as string) || "";
  const identifierLabel = (caseInfo.identifier_type as string) || "Account Ref";
  const disputedAmount = (caseInfo.disputed_amount as string) || "";
  const ticketNumber = (caseInfo.ticket_number as string) || (activeCase ? `TKT-${activeCase.id.slice(0, 8).toUpperCase()}` : "");
  const currentPromises = useStore((s) => s.promises);
  const isCallResolved =
    Boolean(callEndInfo?.hasConclusion) ||
    currentPromises.length > 0 ||
    pendingProposals.length > 0;

  const getSlaDetails = () => {
    switch (domain) {
      case "banking":
        return {
          law: "RBI Integrated Ombudsman Scheme",
          rule: "Mandatory T+5 reversal for failed UPI/ATM debits. ₹100/day statutory delay compensation.",
        };
      case "ecommerce":
        return {
          law: "Consumer Protection (E-Commerce) Rules 2020",
          rule: "Mandatory 48-hr grievance acknowledgment & 30-day statutory resolution timeline for returned item refunds.",
        };
      case "travel":
        return {
          law: "DGCA Passenger Charter & AirSewa",
          rule: "Statutory ticket cancellation refund within 7 working days. Mandatory delay compensation.",
        };
      case "insurance":
        return {
          law: "IRDAI Policyholder Protection Mandate",
          rule: "15-day grievance turnaround time. Bima Bharosa Ombudsman escalation eligibility.",
        };
      case "utilities":
        return {
          law: "Electricity Act 2003 & SERC Standards",
          rule: "Mandatory provisional billing revision within 7 days. Fast meter inspection verification.",
        };
      case "edtech":
        return {
          law: "UGC Online Learning Guidelines & CPA 2019",
          rule: "Mandatory cooling-off withdrawal refund. Strict prohibition of unfair auto-debit loan continuation.",
        };
      case "mobility":
        return {
          law: "Motor Vehicle Aggregator Guidelines 2020",
          rule: "Mandatory refund for driver-cancelled trips & algorithmic toll surcharge rectification.",
        };
      case "housing":
        return {
          law: "Model Tenancy Act 2021 & RERA",
          rule: "Mandatory return of security deposit within 30 days of handover with interest penalty for default.",
        };
      case "telecom":
      default:
        return {
          law: "TRAI Quality of Service Mandate",
          rule: "30-day statutory resolution window. Prohibits unauthorized billing & VAS without double-consent.",
        };
    }
  };
  const sla = getSlaDetails();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Top Bar Navigation */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.08] bg-[#090e1b]/90 backdrop-blur-xl flex-shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  callStatus === "active"
                    ? "bg-emerald-400"
                    : callStatus === "ringing"
                    ? "bg-rose-500 animate-ping"
                    : callStatus === "ended"
                    ? "bg-slate-400"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              {callStatus === "active" && (
                <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              )}
            </div>
            <span className={`text-xs font-bold tracking-wide uppercase ${statusColour}`}>
              {callStatus === "active"
                ? "Live Telephony Stream"
                : callStatus === "ringing"
                ? "Ringing Support Desk…"
                : callStatus === "ended"
                ? "Call Concluded"
                : callStatus === "initialising"
                ? "Dialing Helpline…"
                : "Idle Session"}
            </span>

            {callStatus === "active" && (
              <div className="flex items-center gap-[2.5px] h-3 ml-1.5 pl-2 border-l border-white/10">
                <span className="w-[2px] bg-emerald-400 rounded-full animate-wave-1 h-full" />
                <span className="w-[2px] bg-emerald-400 rounded-full animate-wave-2 h-full" />
                <span className="w-[2px] bg-emerald-400 rounded-full animate-wave-3 h-full" />
                <span className="w-[2px] bg-emerald-400 rounded-full animate-wave-4 h-full" />
              </div>
            )}
          </div>

          {activeCase && (
            <>
              <span className="text-white/40 text-xs font-mono hidden sm:inline px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                Case #{activeCase.id.slice(0, 8)}
              </span>
              {Boolean((caseInfo.helpline_number as string) || (caseInfo.support_number as string)) && (
                <span className="text-amber-300 text-xs font-mono hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Phone className="w-3 h-3 text-amber-400" />
                  Dialing: {(caseInfo.helpline_number as string) || (caseInfo.support_number as string)}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Mute/Unmute */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className={`btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-xl transition-all ${
              isAudioMuted
                ? "text-amber-400 border border-amber-500/40 bg-amber-500/10 shadow-sm"
                : "text-white/70 hover:text-white border border-white/10"
            }`}
            title={isAudioMuted ? "Click to unmute" : "Click to mute"}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isAudioMuted ? "Muted" : "Voice On"}</span>
          </button>

          {callStatus === "ended" && (
            <button
              onClick={() => setSummaryModalOpen(true)}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 rounded-xl shadow-lg shadow-brand-500/25 animate-pulse"
            >
              <FileText className="w-3.5 h-3.5" />
              Executive Summary
            </button>
          )}

          {activeCase && (
            <button
              onClick={() => setFamilyModalOpen(true)}
              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-xl"
            >
              <Users className="w-3.5 h-3.5" />
              Family Link
            </button>
          )}

          <button
            id="view-ledger-btn"
            onClick={() => { setActiveTab("ledger"); navigate("/ledger"); }}
            className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1 rounded-xl"
          >
            Ledger <ChevronRight className="w-3 h-3 text-white/40" />
          </button>

          <button
            id="end-call-btn"
            onClick={handleEndCall}
            className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-xl"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            End Call
          </button>
        </div>
      </header>

      {/* Split Terminal Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Real-Time Audio Transcript (65%) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#070c18] relative">
          {/* Live Telephony Waveform & Frequency Visualizer */}
          <AudioWaveformVisualizer
            callStatus={callStatus}
            isOnHold={isOnHold}
            activeSpeaker={utterances.length > 0 ? utterances[utterances.length - 1].speaker : null}
            isMuted={isAudioMuted}
            onToggleMute={() => setIsAudioMuted(!isAudioMuted)}
            provider={provider}
            helplineNumber={(caseInfo.helpline_number as string) || (caseInfo.support_number as string)}
          />

          {callStatus === "ended" && (
            isCallResolved ? (
              <div className="bg-gradient-to-r from-brand-950/70 to-indigo-950/70 border-b border-brand-500/30 px-6 py-2.5 flex items-center justify-between gap-4 animate-fade-in flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-white">Call Completed &amp; Legally Logged.</span>{" "}
                    <span className="text-white/60">SLA monitoring activated for ₹{disputedAmount}.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeCase && (
                    <>
                      <a
                        id="call-transcript-txt-btn"
                        href={casesApi.getTranscriptTxtUrl(activeCase.id)}
                        download
                        className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1 text-blue-300 border border-blue-500/30 hover:bg-blue-500/10 rounded-lg"
                        title="Download Verbatim Transcript TXT"
                      >
                        <FileDown className="w-3.5 h-3.5 text-blue-400" />
                        Transcript (.TXT)
                      </a>
                      <a
                        id="call-audio-wav-btn"
                        href={casesApi.getAudioWavUrl(activeCase.id)}
                        download
                        className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-lg"
                        title="Download Audio Evidence WAV"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        Audio (.WAV)
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => setSummaryModalOpen(true)}
                    className="btn-primary text-xs py-1 px-3 flex items-center gap-1 rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Review Summary
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-950/80 to-rose-950/80 border-b border-amber-500/40 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 animate-fade-in flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-amber-300">Call Ended Midway — No Conclusion Reached.</span>{" "}
                    <span className="text-white/70">
                      Reason: {callEndInfo?.reason || "Call disconnected before representative could confirm a commitment."}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate("/")}
                    className="btn-primary text-xs py-1 px-3 bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1 rounded-lg shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Redial Helpline
                  </button>
                  {activeCase && (
                    <a
                      id="call-transcript-txt-btn"
                      href={casesApi.getTranscriptTxtUrl(activeCase.id)}
                      download
                      className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1 text-blue-300 border border-blue-500/30 hover:bg-blue-500/10 rounded-lg"
                      title="Download Verbatim Transcript TXT"
                    >
                      <FileDown className="w-3.5 h-3.5 text-blue-400" />
                      Transcript (.TXT)
                    </a>
                  )}
                  <button
                    onClick={() => setSummaryModalOpen(true)}
                    className="btn-ghost text-xs py-1 px-3 text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 flex items-center gap-1 rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Review Notice
                  </button>
                </div>
              </div>
            )
          )}

          {isOnHold && <HoldIndicator />}

          {/* Transcript Message Stream */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {callStatus === "ringing" && (
              <div className="p-6 rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 text-center space-y-3 animate-pulse my-6">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-300">
                  <PhoneCall className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">
                    Ringing {provider} Support Desk Switchboard...
                  </h3>
                  <div className="text-[11px] font-mono text-amber-300/90 flex items-center justify-center gap-1.5 my-1">
                    <Phone className="w-3 h-3 text-amber-400" />
                    Target Helpline: <span className="font-bold text-white">{(caseInfo.helpline_number as string) || (caseInfo.support_number as string) || "1800-Auto-Scraped"}</span>
                  </div>
                  <p className="text-xs text-white/60 max-w-sm mx-auto mt-1 leading-relaxed">
                    Waiting for representative to pick up. Teammate or admin can answer live on the{" "}
                    <a
                      href="/switchboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-rose-300 underline font-bold hover:text-white"
                    >
                      Support Desk Switchboard &rarr;
                    </a>
                  </p>
                </div>
              </div>
            )}

            {utterances.length === 0 && !isOnHold && callStatus === "active" && (
              <div className="p-6 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/40 text-center space-y-3 animate-pulse my-6">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-300">
                  <PhoneCall className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">
                    Connected with {provider} Support Desk
                  </h3>
                  <div className="text-[11px] font-mono text-emerald-300/90 flex items-center justify-center gap-1.5 my-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Live Telephony Audio Channel Active</span>
                  </div>
                  <p className="text-xs text-white/60 max-w-sm mx-auto mt-1 leading-relaxed">
                    Company support specialist has answered the line. Mock-On AI Advocate (Shivani) is actively negotiating and advocating on your behalf.
                  </p>
                </div>
              </div>
            )}

            {utterances.length === 0 && !isOnHold && callStatus !== "ringing" && callStatus !== "active" && (
              <div className="text-center py-20 text-white/40 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/25 flex items-center justify-center mx-auto text-brand-400">
                  <Wifi className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">No Call in Progress</h3>
                  <p className="text-xs text-white/50 max-w-sm mx-auto mt-1 leading-relaxed">
                    Select a consumer dispute domain on the Intake page to dispatch the Mock-On AI advocate.
                  </p>
                </div>
                <button
                  id="go-to-intake-btn"
                  onClick={() => navigate("/")}
                  className="btn-primary inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4.5 rounded-xl shadow-lg shadow-brand-500/25"
                >
                  <PhoneCall className="w-4 h-4 text-emerald-300" /> Start Dispute Intake
                </button>
              </div>
            )}

            {utterances.map((u) => (
              <div
                key={u.id}
                className={`animate-slide-up flex gap-3 ${u.speaker === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className="flex-shrink-0 pt-1">
                  <SpeakerChip role={u.speaker} />
                </div>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-lg ${
                    u.speaker === "agent"
                      ? "bg-[#181124] border border-rose-500/30 text-slate-100 shadow-black/40"
                      : u.speaker === "user"
                      ? "bg-[#0d2227] border border-emerald-500/30 text-slate-100 shadow-black/40"
                      : u.speaker === "ivr"
                      ? "bg-violet-950/40 border border-violet-500/25 text-violet-200/90 italic font-mono text-xs"
                      : "bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs"
                  }`}
                >
                  {/* AI Advocate Statutory CoT Reasoning */}
                  {u.speaker === "user" && u.thought_process && (
                    <div className="mb-2.5 p-2.5 rounded-xl bg-purple-950/50 border border-purple-500/30 text-purple-200 text-xs shadow-inner">
                      <div className="flex items-center gap-1.5 font-bold text-purple-300 uppercase tracking-wider text-[10px] mb-1">
                        <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse flex-shrink-0" />
                        <span>AI Advocate Statutory Strategy (CoT)</span>
                      </div>
                      <p className="font-mono text-[11px] leading-relaxed text-purple-100/90">
                        {u.thought_process}
                      </p>
                    </div>
                  )}

                  <div className="leading-relaxed">{u.text}</div>
                  {u.latencyMs && (
                    <div className="text-white/30 text-[10px] font-mono mt-1 text-right">
                      {u.latencyMs}ms
                    </div>
                  )}
                </div>
              </div>
            ))}

            {callStatus === "ended" && !isCallResolved && utterances.length > 0 && (
              <div className="p-4.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2.5 animate-slide-up my-3">
                <div className="flex items-center justify-between font-bold text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    Live Advocacy Call Ended Midway Without Conclusion
                  </span>
                  <span className="font-mono text-[10px] bg-amber-500/20 px-2.5 py-0.5 rounded-full text-amber-400">
                    Evidence Preserved
                  </span>
                </div>
                <p className="text-white/75 leading-relaxed">
                  This advocacy phone session ended before the company representative provided a resolution or commitment.
                  <br />
                  <span className="font-bold text-amber-300">Stated Reason: </span>
                  {callEndInfo?.reason || "Call disconnected midway by company desk / representative before settlement."}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => navigate("/")}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Redial {provider} Helpline
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("ledger");
                      navigate("/ledger");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-white/80 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5 text-teal-400" />
                    Ombudsman Evidence Pack
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Voice / Interjection Bar for Active Calls */}
          {activeCall && callStatus === "active" && (
            <div className="p-3 border-t border-white/[0.08] bg-[#090e1b]/95 px-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Mock-On AI Advocate is speaking with the Company Support Desk on your behalf
                </span>
                <span className="text-[10px] text-white/40">Autonomous Voice Mode &bull; You can listen in or optionally interject</span>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!userMessageInput.trim() || !activeCall) return;
                  const text = userMessageInput.trim();
                  setUserMessageInput("");
                  if (isListening) toggleMic();
                  await callsApi.sendCallMessage(activeCall.id, {
                    speaker: "user",
                    text,
                    auto_advocate_reply: false,
                  });
                }}
                className="flex items-center gap-2"
              >
                {/* Voice Microphone Capture */}
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isListening
                      ? "bg-rose-600 text-white border-rose-500 animate-pulse ring-4 ring-rose-500/30"
                      : "bg-white/[0.04] text-white/70 hover:text-white border-white/[0.1] hover:bg-white/[0.08]"
                  }`}
                  title={isListening ? "Listening... click to stop" : "Click to speak with microphone"}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-4 h-4 text-white" />
                      <span className="text-[11px] hidden sm:inline">Listening...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-emerald-400" />
                      <span className="text-[11px] hidden sm:inline">Voice Mic</span>
                    </>
                  )}
                </button>

                <input
                  type="text"
                  value={userMessageInput}
                  onChange={(e) => setUserMessageInput(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening to your voice... Speak now"
                      : "Speak into mic or type consumer facts..."
                  }
                  className="flex-1 input py-2 text-xs bg-black/40 border-white/[0.08] rounded-xl focus:border-brand-500/60"
                />
                <button
                  type="submit"
                  disabled={!userMessageInput.trim()}
                  className="btn-primary py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}
        </main>

        {/* Right Column: AI Mission Control & Evidence Sidebar (35%) */}
        <aside className="w-88 sm:w-96 border-l border-white/[0.08] flex flex-col overflow-hidden bg-[#0a0f1d]/95 backdrop-blur-xl flex-shrink-0 shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-white">
                Live Evidence &amp; SLA Radar
              </h3>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                isSessionActive
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 animate-pulse"
                  : utterances.length > 0
                  ? "bg-brand-500/15 text-brand-300 border-brand-500/30"
                  : "bg-white/[0.04] text-white/40 border-white/[0.08]"
              }`}
            >
              {isSessionActive ? "Active Call" : utterances.length > 0 ? "Session Log" : "Standby"}
            </span>
          </div>

          {!isRadarActive ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-white/30 mb-1">
                <Radio className="w-5 h-5 text-brand-400/50" />
              </div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Telemetry on Standby</h4>
              <p className="text-xs text-white/40 max-w-[220px] leading-relaxed">
                Real-time corporate evasion detection, statutory SLA tracking, and verbal commitment extraction activate automatically when an advocacy call is in flight.
              </p>
              <button
                onClick={() => navigate("/")}
                className="btn-primary text-xs py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 mt-2"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Start Dispute Intake</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Active Dispute Profile Box */}
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                  Active Docket Reference
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-white/40 text-[10px] block">Provider</span>
                    <span className="font-bold text-white truncate block">{provider || "Helpline Desk"}</span>
                  </div>
                  <div>
                    <span className="text-white/40 text-[10px] block">{identifierLabel}</span>
                    <span className="font-mono text-white truncate block">{identifierVal || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-white/40 text-[10px] block">Disputed Sum</span>
                    <span className="font-bold text-emerald-400 block">{disputedAmount ? `₹${disputedAmount}` : "In Review"}</span>
                  </div>
                  <div>
                    <span className="text-white/40 text-[10px] block">Ticket Number</span>
                    <span className="font-mono text-brand-300 font-bold truncate block">{ticketNumber || "Auto-Generated"}</span>
                  </div>
                  <div className="col-span-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-white/40 text-[10px]">Dialed Support Helpline</span>
                    <span className="font-mono text-amber-300 font-bold text-[11px] flex items-center gap-1">
                      <Phone className="w-3 h-3 text-amber-400" />
                      {(caseInfo.helpline_number as string) || (caseInfo.support_number as string) || "1800-Auto-Scraped"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Corporate Evasion & Commitment Meter (Feature 2) */}
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-brand-400" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                      Evasion &amp; Commitment Meter
                    </span>
                  </div>
                  <span
                    className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      evasionRadar?.tactic === "firm_commitment"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : evasionRadar?.tactic === "coupon_diversion"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                        : evasionRadar?.tactic === "explicit_refusal"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                        : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                    }`}
                  >
                    {evasionRadar ? evasionRadar.label : "Monitoring Speech..."}
                  </span>
                </div>

                {/* Dynamic Segmented Gauge */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-white/50">Binding Certainty</span>
                    <span
                      className={
                        (evasionRadar?.score ?? 50) >= 75
                          ? "text-emerald-400 font-bold"
                          : (evasionRadar?.score ?? 50) >= 30
                          ? "text-amber-400 font-bold"
                          : "text-rose-400 font-bold"
                      }
                    >
                      {evasionRadar ? `${evasionRadar.score}%` : "50% Neutral"}
                    </span>
                  </div>
                  <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden flex">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        (evasionRadar?.score ?? 50) >= 75
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-emerald-500/50"
                          : (evasionRadar?.score ?? 50) >= 30
                          ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-amber-500/50"
                          : "bg-gradient-to-r from-rose-600 to-red-500 shadow-rose-500/50"
                      }`}
                      style={{ width: `${evasionRadar?.score ?? 50}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-white/30 font-mono">
                    <span>0% Evasion / Refusal</span>
                    <span>50% Inquiry</span>
                    <span>100% Firm Promise</span>
                  </div>
                </div>

                {/* Real-time Tactic & Counter-Action Dossier */}
                {evasionRadar ? (
                  <div
                    className={`p-2.5 rounded-xl text-xs space-y-1.5 border ${
                      evasionRadar.tactic === "coupon_diversion"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                        : evasionRadar.tactic === "firm_commitment"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                        : evasionRadar.tactic === "explicit_refusal"
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                        : "bg-white/[0.04] border-white/[0.08] text-white/70"
                    }`}
                  >
                    <div className="flex items-start gap-1.5 font-bold text-[11px]">
                      <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-brand-400" />
                      <span>{evasionRadar.law_citation}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">{evasionRadar.summary}</p>
                    <div className="pt-1 border-t border-white/10 text-[10px] text-white/90 font-mono">
                      <strong className="text-brand-300">AI Advocate Action:</strong> {evasionRadar.counter_action}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] text-white/40 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                    <span>Real-time evasion analysis active. Speech analyzed on every turn.</span>
                  </div>
                )}
              </div>

              {/* Pending Proposals & Commitments Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Captured Commitments
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                    {pendingProposals.length + currentPromises.length} Logged
                  </span>
                </div>

                {pendingProposals.length === 0 && currentPromises.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/[0.08] text-center space-y-1.5 py-6">
                    <div className="w-8 h-8 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto animate-pulse">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div className="text-xs font-semibold text-white/70">
                      {isSessionActive ? "Listening for commitments..." : "No commitments captured yet"}
                    </div>
                    <p className="text-[11px] text-white/40 leading-relaxed max-w-[220px] mx-auto">
                      AI analyzes representative statements to extract legally binding refund dates and amounts.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {pendingProposals.map((proposal, i) => (
                      <ProposalCard
                        key={`prop-${i}`}
                        proposal={proposal}
                        onConfirm={(followUp) => handleConfirmProposal(i, true, followUp)}
                        onReject={() => handleConfirmProposal(i, false)}
                      />
                    ))}

                    {currentPromises.map((p, i) => (
                      <div
                        key={`conf-${i}`}
                        className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-300 uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40">
                            {p.commitment_type} &bull; Confirmed
                          </span>
                          {p.amount && (
                            <span className="font-extrabold text-emerald-300 text-sm">
                              ₹{p.amount}
                            </span>
                          )}
                        </div>
                        <p className="text-white/90 text-xs leading-relaxed">{p.summary}</p>
                        {p.quoted_text && (
                          <blockquote className="text-white/60 text-[11px] italic border-l-2 border-emerald-400 pl-2">
                            "{p.quoted_text}"
                          </blockquote>
                        )}
                        {p.raw_date_phrase && (
                          <span className="text-[10px] text-emerald-300/80 font-mono block">
                            Timeline: {p.raw_date_phrase}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Statutory Protection Telemetry Card */}
              <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-brand-300 font-bold text-[11px]">
                  <FileCheck className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                  <span>{sla.law}</span>
                </div>
                <p className="text-white/70 text-[11px] leading-relaxed">
                  {sla.rule}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {activeCase && (
        <>
          <ShareFamilyModal
            isOpen={familyModalOpen}
            onClose={() => setFamilyModalOpen(false)}
            caseId={activeCase.id}
          />
          <CallSummaryModal
            isOpen={summaryModalOpen}
            onClose={() => setSummaryModalOpen(false)}
            caseData={activeCase}
            promises={
              currentPromises.length > 0
                ? currentPromises
                : pendingProposals.length > 0
                ? (pendingProposals.map((p, idx) => {
                    const pd = (p.promise_data || p) as any;
                    return {
                      id: `prop-${idx}`,
                      case_id: activeCase.id,
                      commitment_type: pd.commitment_type || "refund",
                      amount: pd.amount,
                      raw_date_phrase: pd.raw_date_phrase || "5 business days",
                      user_confirmed: true,
                      status: "confirmed",
                      created_at: new Date().toISOString(),
                    };
                  }) as any)
                : []
            }
            hasConclusion={isCallResolved}
            endReason={callEndInfo?.reason}
            onOpenFamilyModal={() => setFamilyModalOpen(true)}
          />
        </>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  onConfirm,
  onReject,
}: {
  proposal: { promise_data: Record<string, unknown>; needs_date_confirmation: boolean };
  onConfirm: (followUp: boolean) => void;
  onReject: () => void;
}) {
  const p = proposal.promise_data;
  return (
    <div className="p-4 space-y-3 animate-slide-up rounded-2xl border border-amber-500/40 bg-[#141b2c] shadow-lg shadow-amber-500/10 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
          {(p.commitment_type as string) ?? "Promise"}
        </span>
        {p.amount != null && (
          <span className="text-base font-extrabold text-amber-300">
            ₹{p.amount as number}
          </span>
        )}
      </div>

      {Boolean(p.quoted_text) && (
        <blockquote className="text-white/80 text-xs italic border-l-2 border-amber-500/60 pl-3 leading-relaxed bg-black/30 py-1.5 rounded-r-lg font-mono">
          "{p.quoted_text as string}"
        </blockquote>
      )}

      {Boolean(p.raw_date_phrase) && (
        <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{p.raw_date_phrase as string}</span>
          {proposal.needs_date_confirmation && (
            <span className="text-rose-400 ml-1 text-[10px] font-normal">⚠ needs clarification</span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onConfirm(false)}
          className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold py-2 rounded-xl border border-emerald-500/40 transition-all shadow-sm"
        >
          ✓ Confirm
        </button>
        <button
          onClick={onReject}
          className="flex-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold py-2 rounded-xl border border-rose-500/30 transition-all"
        >
          ✗ Reject
        </button>
      </div>

      <button
        onClick={() => onConfirm(true)}
        className="w-full bg-brand-500/20 hover:bg-brand-500/30 text-brand-200 text-xs font-bold py-2 rounded-xl border border-brand-500/35 transition-all shadow-sm"
      >
        ✓ Confirm + Enable 5-Day SLA Follow-up
      </button>
    </div>
  );
}
