/**
 * Company Support Desk Switchboard — Admin Console.
 * Allows teammates/admins to answer live incoming consumer calls, speak with
 * the AI Advocate, negotiate resolution, and issue real commitments in real time.
 */
import { useEffect, useState, useRef } from "react";
import {
  Headphones,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  CheckCircle2,
  Clock,
  Send,
  Building2,
  Sparkles,
  MessageSquare,
  Mic,
  MicOff,
  XCircle,
} from "lucide-react";
import { callsApi, WS_BASE, type SwitchboardPendingItem } from "../lib/api";
import { useStore } from "../store";
import type { LiveUtterance } from "../types";

class SequentialAudioQueue {
  private queue: string[] = [];
  private isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;

  enqueue(audioB64: string) {
    this.queue.push(audioB64);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  clear() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch {}
      this.currentAudio = null;
    }
    this.queue = [];
    this.isPlaying = false;
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentAudio = null;
      return;
    }

    const nextB64 = this.queue.shift();
    if (!nextB64) {
      this.playNext();
      return;
    }

    try {
      this.isPlaying = true;
      const audio = new Audio("data:audio/wav;base64," + nextB64);
      this.currentAudio = audio;

      audio.onended = () => {
        this.playNext();
      };

      audio.onerror = () => {
        this.playNext();
      };

      audio.play().catch((err) => {
        console.warn("Audio playback interrupted or blocked:", err);
        this.playNext();
      });
    } catch {
      this.playNext();
    }
  }
}

const switchboardAudioQueue = new SequentialAudioQueue();

export default function SwitchboardPage() {
  const { currentUser } = useStore();
  const [pendingCalls, setPendingCalls] = useState<SwitchboardPendingItem[]>([]);
  const [activeCallItem, setActiveCallItem] = useState<SwitchboardPendingItem | null>(null);
  const operatorName = currentUser?.full_name || "Tata / Airtel Support Specialist";
  const [transcript, setTranscript] = useState<LiveUtterance[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastPromise, setLastPromise] = useState<any | null>(null);
  const [refusalDetected, setRefusalDetected] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [endCallModalOpen, setEndCallModalOpen] = useState(false);
  const [endReason, setEndReason] = useState(
    "Representative disconnected midway before settlement could be confirmed"
  );
  const silenceTimerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const lastSentTextRef = useRef<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const startRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onresult = (event: any) => {
        let currentUtterance = "";
        let isFinal = false;

        for (let i = 0; i < event.results.length; ++i) {
          currentUtterance += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }

        setMessageInput(currentUtterance);

        // When utterance is final or pauses for 1000ms, auto-send
        if (autoSendVoice && currentUtterance.trim()) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
          const delay = isFinal ? 350 : 1200;
          silenceTimerRef.current = setTimeout(() => {
            const candidate = currentUtterance.trim();
            if (candidate && candidate.toLowerCase() !== lastSentTextRef.current.toLowerCase()) {
              lastSentTextRef.current = candidate;
              handleSendMessage(candidate);
              setMessageInput("");
            }
          }, delay);
        }
      };

      recognition.onerror = () => {
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) startRecognition();
          }, 300);
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) startRecognition();
          }, 200);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  const toggleMic = () => {
    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
      if (messageInput.trim()) {
        const candidate = messageInput.trim();
        if (candidate.toLowerCase() !== lastSentTextRef.current.toLowerCase()) {
          lastSentTextRef.current = candidate;
          handleSendMessage(candidate);
        }
        setMessageInput("");
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice recognition is supported on Chrome, Edge, and modern browsers.");
      return;
    }

    isListeningRef.current = true;
    setIsListening(true);
    startRecognition();
  };

  // Poll for queued/active calls every 3 seconds
  const fetchPending = async () => {
    try {
      const items = await callsApi.getSwitchboardPending();
      setPendingCalls(items);
      // Auto-attach if we are already in an active call and need state sync
      if (activeCallItem) {
        const fresh = items.find((it) => it.call.id === activeCallItem.call.id);
        if (fresh) {
          setActiveCallItem(fresh);
        }
      }
    } catch (e) {
      // ignore network errors during poll
    }
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [activeCallItem?.call.id]);

  // Connect to the WebSocket when an active call is selected
  useEffect(() => {
    if (!activeCallItem) return;

    const callId = activeCallItem.call.id;
    const ws = new WebSocket(`${WS_BASE}/ws/calls/${callId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "utterance") {
          const raw = msg.data || msg;
          const text = (raw.text || "").trim();
          const speaker = raw.speaker || "agent";
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === speaker && last.text.trim().toLowerCase() === text.toLowerCase()) {
              return prev; // Deduplicate consecutive identical utterances
            }
            if (raw.id && prev.some((u) => u.id === raw.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: raw.id || `u-${Date.now()}`,
                speaker,
                text,
                isFinal: true,
                latencyMs: raw.latencyMs,
                sequence: Date.now(),
              },
            ];
          });

          // Audio voice output: play Advocate AI speech out loud for the representative!
          if (speaker === "user" && text) {
            if (raw.audio_b64) {
              switchboardAudioQueue.enqueue(raw.audio_b64 as string);
            } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
              try {
                const utter = new SpeechSynthesisUtterance(text);
                utter.rate = 1.05;
                window.speechSynthesis.speak(utter);
              } catch {}
            }
          }
        } else if (msg.type === "promise_proposed") {
          const prop = msg.proposal?.promise_data || msg.proposal;
          setLastPromise(prop);
        } else if (msg.type === "radar_update") {
          if (msg.data?.status === "refused") {
            setRefusalDetected(msg.data?.detail || "Representative refused settlement");
          }
        } else if (msg.type === "call_ended") {
          switchboardAudioQueue.clear();
          setActiveCallItem(null);
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      switchboardAudioQueue.clear();
    };
  }, [activeCallItem?.call.id]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleAcceptCall = async (item: SwitchboardPendingItem) => {
    try {
      // Unlock browser audio context on user gesture
      try {
        const dummy = new Audio();
        dummy.play().catch(() => {});
      } catch {}

      switchboardAudioQueue.clear();
      lastSentTextRef.current = "";
      await callsApi.acceptCall(item.call.id, operatorName);
      setActiveCallItem({
        ...item,
        call: { ...item.call, status: "active" },
      });
      setTranscript([]);
      setLastPromise(null);
      setRefusalDetected(null);
      fetchPending();
    } catch (err) {
      alert("Could not answer call. It may have already concluded.");
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || messageInput).trim();
    if (!textToSend || !activeCallItem) return;

    // Prevent immediate accidental duplicate submissions
    if (!customText && textToSend.toLowerCase() === lastSentTextRef.current.toLowerCase()) {
      return;
    }
    lastSentTextRef.current = textToSend;

    setSending(true);
    try {
      const res = await callsApi.sendCallMessage(activeCallItem.call.id, {
        speaker: "agent",
        text: textToSend,
        auto_advocate_reply: true,
      });
      if (!customText) setMessageInput("");
      if (res.promise_detected) {
        // Will also be received over WS
      }
    } catch (err) {
      alert("Failed to send message over call.");
    } finally {
      setSending(false);
    }
  };

  const handleEndCall = async (selectedReason?: string) => {
    if (!activeCallItem) return;
    const finalReason =
      selectedReason ||
      endReason ||
      "Representative terminated live session midway before reaching resolution.";
    try {
      await callsApi.end(activeCallItem.call.id, { reason: finalReason });
      setEndCallModalOpen(false);
      setActiveCallItem(null);
      fetchPending();
    } catch (err) {
      // ignore
    }
  };

  const ringingCalls = pendingCalls.filter((p) => p.call.status === "ringing");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0e1628]/90 border border-white/[0.1] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-brand-500" />
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-amber-600 p-0.5 shadow-lg shadow-rose-500/20 flex-shrink-0">
            <div className="w-full h-full bg-[#0e1628] rounded-[14px] flex items-center justify-center">
              <Headphones className="w-6 h-6 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Company Support Desk Switchboard
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Admin Console
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Answer live consumer advocate disputes, converse with the AI advocate, and negotiate resolutions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-white/40 block">Signed in Operator</span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {currentUser?.email || "admin@mockon.ai (Demo Operator)"}
            </span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" title="Switchboard Online" />
        </div>
      </div>

      {/* Main Grid: Left = Call Queue, Right = Active Call Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 Cols): Incoming / Ringing Queue */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/80 flex items-center gap-2">
              <PhoneForwarded className="w-4 h-4 text-rose-400" />
              <span>Incoming Queue ({ringingCalls.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (confirm("Clear all stale and pending calls from the queue?")) {
                    await callsApi.clearSwitchboardQueue();
                    fetchPending();
                  }
                }}
                className="text-xs text-white/40 hover:text-rose-400 transition-colors"
                title="Dismiss and clear all calls in queue"
              >
                Clear Queue
              </button>
              <span className="text-white/20">&bull;</span>
              <button
                onClick={fetchPending}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {ringingCalls.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-white/30">
                <Clock className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white/70">Switchboard Standby</p>
              <p className="text-xs text-white/40 max-w-xs mx-auto leading-relaxed">
                Waiting for incoming consumer disputes. Go to <span className="text-brand-300 font-mono">/intake</span> in another window or tab and dispatch a call using "Live Company Operator".
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ringingCalls.map((item) => {
                const info = (item.case.approved_info as Record<string, any>) || {};
                const provider = info.service_provider || "Service Provider";
                const amount = info.disputed_amount || "1,000";
                const acc = info.identifier_value || info.phone_number || "Reference";
                const isFollowUp = !!info.is_follow_up || (item.case.goal || "").toUpperCase().includes("OVERDUE");

                return (
                  <div
                    key={item.call.id}
                    className={`p-5 rounded-2xl bg-gradient-to-br from-rose-950/40 via-[#11192e] to-black/60 border-2 ${
                      isFollowUp ? "border-rose-400 shadow-rose-900/60" : "border-rose-500/60 shadow-rose-950/50"
                    } shadow-xl space-y-3 relative overflow-hidden animate-pulse`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-xs font-extrabold text-rose-300 uppercase tracking-wider">
                          {isFollowUp ? "OVERDUE FOLLOW-UP • RINGING" : "INCOMING CALL • RINGING"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isFollowUp && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40">
                            Deadline Passed
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                          ₹{amount}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-base font-bold text-white flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-brand-400" />
                        <span>{provider}</span>
                      </div>
                      <div className="text-xs text-white/50 font-mono mt-0.5">
                        Docket Account: #{acc}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] text-xs text-white/70 italic line-clamp-2">
                      "{item.case.goal}"
                    </div>

                    <button
                      onClick={() => handleAcceptCall(item)}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all"
                    >
                      <PhoneCall className="w-4 h-4" />
                      Answer &amp; Connect Call
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Demo Help */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
            <div className="font-bold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              How Live Teammate Demo Works:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-white/50 leading-relaxed">
              <li>Open Mock-On in two browser windows or tabs.</li>
              <li>In Window 1, submit an intake grievance and select <b>"Live Company Operator (Switchboard)"</b>.</li>
              <li>In Window 2 (this Switchboard), the incoming call rings immediately.</li>
              <li>Click <b>"Answer &amp; Connect Call"</b> to converse live with Advocate AI and negotiate the refund.</li>
            </ol>
          </div>
        </div>

        {/* Right Column (7 Cols): Live Support Desk Console */}
        <div className="lg:col-span-7 space-y-4">
          {activeCallItem ? (
            <div className="rounded-3xl bg-[#0b1222] border border-white/[0.12] shadow-2xl flex flex-col h-[650px] overflow-hidden">
              {/* Active Call Header */}
              <div className="p-4 border-b border-white/[0.08] bg-[#0e1628] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>LIVE WITH CONSUMER ADVOCATE</span>
                      {((activeCallItem.case.approved_info as any)?.is_follow_up || (activeCallItem.case.goal || "").includes("OVERDUE")) && (
                        <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40 font-bold uppercase">
                          Overdue Follow-Up
                        </span>
                      )}
                      <span className="text-[10px] text-emerald-400 font-mono">
                        #{activeCallItem.call.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50">
                      Dispute: {(activeCallItem.case.approved_info as any)?.service_provider} &bull; ₹
                      {(activeCallItem.case.approved_info as any)?.disputed_amount}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (lastPromise) {
                      handleEndCall("Call concluded with verified commitment on ledger.");
                    } else {
                      setEndCallModalOpen(true);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  End Call
                </button>
              </div>

              {/* Detected Promise Alert Banner if detected */}
              {lastPromise && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between px-4 animate-slide-up">
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      Promise Extracted: {lastPromise.summary || "Full Refund"} (₹{lastPromise.amount})
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-500/20 px-2 py-0.5 rounded-full">
                    Sarvam 105B Verified
                  </span>
                </div>
              )}

              {/* Refusal Detected Banner if representative refused */}
              {refusalDetected && (
                <div className="p-3 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between px-4 animate-slide-up">
                  <div className="flex items-center gap-2 text-xs text-rose-300 font-semibold">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>
                      Refusal Recorded: Zero Promises Extracted &bull; Advocate AI Notified for Ombudsman Escalation
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-mono bg-rose-500/20 px-2 py-0.5 rounded-full">
                    Anti-Hallucination Active
                  </span>
                </div>
              )}

              {/* Live Transcript Stream */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/20">
                {transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-white/40 space-y-2">
                    <MessageSquare className="w-8 h-8 opacity-40 text-emerald-400" />
                    <p className="text-xs max-w-sm">
                      Call connected. As the company representative, speak via <b>Voice Mic</b> or click an <b>Opening Greeting</b> below to start the live conversation.
                    </p>
                  </div>
                ) : (
                  transcript.map((u) => {
                    const isOperator = u.speaker === "agent";
                    return (
                      <div
                        key={u.id}
                        className={`flex flex-col ${isOperator ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span
                            className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isOperator
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                            }`}
                          >
                            {isOperator ? "YOU (COMPANY REPRESENTATIVE)" : "MOCK-ON AI ADVOCATE"}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            isOperator
                              ? "bg-rose-600/20 border border-rose-500/30 text-white rounded-tr-none"
                              : "bg-[#141b2c] border border-white/[0.1] text-white/90 rounded-tl-none shadow-md"
                          }`}
                        >
                          {u.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptBottomRef} />
              </div>

              {/* Quick Commitment Actions & Representative Responses */}
              <div className="p-3.5 border-t border-white/[0.08] bg-[#0e1628]/95 space-y-3">
                {/* 1. Opening Greetings (Rep speaks first) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-semibold flex items-center gap-1.5 text-emerald-400">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      1. Opening Greetings (Rep speaks first):
                    </span>
                    <span className="text-[10px] text-white/40">Starts 2-way call &amp; asks language</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() =>
                        handleSendMessage(
                          `${(activeCallItem.case.approved_info as any)?.service_provider || "Tata Power"} customer support mein aapka swagat hai. Aap kis bhasha mein baat karna chahenge, aur main aapki kya sahayata kar sakta hoon?`
                        )
                      }
                      disabled={sending}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] text-emerald-300 transition-all font-medium flex items-center gap-1.5"
                    >
                      <span>🙏</span>
                      <span>Hindi / Hinglish Greeting</span>
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          `Thank you for calling ${(activeCallItem.case.approved_info as any)?.service_provider || "Tata Power"} customer support. Which language do you prefer to speak in, and how can I help you today?`
                        )
                      }
                      disabled={sending}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-[11px] text-blue-300 transition-all font-medium flex items-center gap-1.5"
                    >
                      <span>👋</span>
                      <span>English Greeting</span>
                    </button>
                  </div>
                </div>

                {/* 2. Step-by-Step Questions (Rep asks, AI responds without blabbering) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-semibold flex items-center gap-1.5 text-amber-400">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                      2. Step-by-Step Dialogue (Ask specific questions):
                    </span>
                    <span className="text-[10px] text-white/40">Advocate answers specifically as asked</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Kripya apna consumer account ya CA number batayein?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      🔢 Ask CA Number
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Aapke bill mein kya dikkat ya problem aa rahi hai, kripya explain karein?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      ❓ Ask Problem Details
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Disputed bill ka amount kitna hai?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      💰 Ask Disputed Amount
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Under company billing policy, provisional reading adjustments cannot be approved without a paid inspection fee. We cannot refund or adjust this charge."
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-[11px] text-rose-300 transition-all font-medium"
                    >
                      ❌ Refuse Refund (Policy Denial)
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          `We have verified your grievance. We will issue a full refund of ₹${(activeCallItem.case.approved_info as any)?.disputed_amount || "8,500"} directly to your bank account within 3 working days.`
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] text-emerald-300 transition-all font-medium"
                    >
                      ✅ Commit Full Refund (3 Days)
                    </button>
                  </div>
                </div>

                {/* Custom Message Input with Voice Mic */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2 pt-1"
                >
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isListening
                        ? "bg-rose-600 text-white border-rose-500 animate-pulse ring-4 ring-rose-500/30"
                        : "bg-white/[0.04] text-white/70 hover:text-white border-white/[0.1] hover:bg-white/[0.08]"
                    }`}
                    title={isListening ? "Listening... click to stop & send" : "Speak representative response with microphone"}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-4 h-4 text-white" />
                        <span className="text-[11px] hidden sm:inline">Listening...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-rose-400" />
                        <span className="text-[11px] hidden sm:inline">Voice Mic</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoSendVoice(!autoSendVoice)}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                      autoSendVoice
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-white/[0.04] border-white/[0.08] text-white/40"
                    }`}
                    title="When enabled, your spoken words are automatically sent when you stop speaking"
                  >
                    {autoSendVoice ? "Auto-Send On" : "Manual"}
                  </button>

                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={
                      isListening
                        ? "Listening to representative voice... Speak now"
                        : "Type representative response or speak to advocate..."
                    }
                    disabled={sending}
                    className="flex-1 input py-2.5 text-xs bg-black/40 border-white/[0.1] rounded-xl focus:border-rose-500/60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageInput.trim()}
                    className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="h-[650px] rounded-3xl bg-white/[0.02] border border-white/[0.08] flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Headphones className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Call Selected</h3>
                <p className="text-xs text-white/40 max-w-sm mt-1 leading-relaxed">
                  When a consumer calls from the Intake page, the incoming call will appear on the left queue. Click "Answer &amp; Connect Call" to start the live session.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* End Call Inconclusive Reason Modal */}
      {endCallModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-[#0d1527] border border-white/[0.12] rounded-3xl p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <PhoneOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">End Call Midway</h3>
                <p className="text-xs text-white/50">
                  No resolution promise recorded. Specify reason to update the user:
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Quick Reason Selection:
              </label>
              <div className="space-y-1.5">
                {[
                  "Representative disconnected midway before settlement could be confirmed",
                  "Call ended early without reaching an agreement",
                  "Line dropped / communication timeout during conversation",
                  "Dispute resolution denied under company billing guidelines",
                  "Shift ended / Operator unable to resolve at this desk",
                ].map((r, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEndReason(r)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all border ${
                      endReason === r
                        ? "bg-rose-500/20 border-rose-500/50 text-white font-medium"
                        : "bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1">
                Custom Reason Note:
              </label>
              <input
                type="text"
                value={endReason}
                onChange={(e) => setEndReason(e.target.value)}
                className="input w-full py-2 px-3 text-xs bg-black/40 border-white/[0.1] rounded-xl text-white"
                placeholder="Describe reason for midway disconnect..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEndCallModalOpen(false)}
                className="btn-ghost text-xs py-2 px-3.5 rounded-xl text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleEndCall()}
                className="btn-primary text-xs py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30"
              >
                Confirm End Call &amp; Update User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
