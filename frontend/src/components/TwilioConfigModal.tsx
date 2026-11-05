import { useState, useEffect } from "react";
import { X, Phone, Key, Shield, Check, ExternalLink, RefreshCw, AlertCircle, Radio } from "lucide-react";
import { twilioApi, type TwilioStatus } from "../lib/api";

interface TwilioConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function TwilioConfigModal({ isOpen, onClose, onSaved }: TwilioConfigModalProps) {
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [status, setStatus] = useState<TwilioStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const data = await twilioApi.getStatus();
      setStatus(data);
      if (data.phone_number && data.phone_number !== "Not set") {
        setPhoneNumber(data.phone_number);
      }
      if (data.public_url && !data.public_url.startsWith("Auto-detect")) {
        setPublicUrl(data.public_url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountSid.trim() || !authToken.trim() || !phoneNumber.trim()) {
      setFeedback({ text: "Please enter Account SID, Auth Token, and Twilio Phone Number.", ok: false });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await twilioApi.saveConfig({
        account_sid: accountSid.trim(),
        auth_token: authToken.trim(),
        phone_number: phoneNumber.trim(),
        public_url: publicUrl.trim() || undefined,
      });

      if (res.ok) {
        setFeedback({ text: "Twilio credentials saved & validated successfully!", ok: true });
        await loadStatus();
        if (onSaved) onSaved();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedback({ text: "Failed to save configuration.", ok: false });
      }
    } catch {
      setFeedback({ text: "Error saving Twilio configuration.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0d1527]/95 border border-white/[0.12] rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 overflow-hidden">
        {/* Top ambient highlight line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-brand-500" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
          title="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-red-600 p-0.5 shadow-lg shadow-rose-500/25 flex-shrink-0">
            <div className="w-full h-full bg-[#0d1527] rounded-[14px] flex items-center justify-center">
              <Radio className="w-6 h-6 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Twilio Telco Bridge Setup
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  status?.configured
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                }`}
              >
                {status?.configured ? "✓ Configured" : "Setup Required"}
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Bridge outbound mobile calls to Gnani Prisma STT &amp; Timbre TTS
            </p>
          </div>
        </div>

        {/* Instructions banner */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs text-white/70 space-y-1.5 mb-5">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            Hackathon Live Phone Proof:
          </div>
          <ol className="list-decimal list-inside space-y-1 text-white/60 text-[11px] leading-relaxed">
            <li>Verify your teammate's mobile number in <strong>Twilio Console &rarr; Verified Caller IDs</strong> (+91).</li>
            <li>Outbound caller ID provisioned: <strong>+17403037691</strong>.</li>
            <li>Twilio bridges 8kHz audio via WebSocket into <strong>Prisma STT &rarr; Sarvam &rarr; Timbre TTS</strong>.</li>
          </ol>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Twilio Account SID
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="input text-xs pl-10 py-2.5 font-mono bg-black/40 border-white/[0.08] focus:border-rose-500/60 rounded-xl"
              />
            </div>
            {status?.account_sid_masked && status.account_sid_masked !== "Not set" && (
              <span className="text-[10px] text-emerald-400 mt-1 block">
                ✓ Currently loaded: {status.account_sid_masked}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Twilio Auth Token
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="input text-xs pl-10 py-2.5 font-mono bg-black/40 border-white/[0.08] focus:border-rose-500/60 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Twilio Virtual Phone Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1xxxxxxxxxx"
                className="input text-xs pl-10 py-2.5 font-mono bg-black/40 border-white/[0.08] focus:border-rose-500/60 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Public ngrok / Tunnel URL <span className="text-white/40 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <ExternalLink className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="url"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://xxxx-xx-xx.ngrok-free.app"
                className="input text-xs pl-10 py-2.5 font-mono bg-black/40 border-white/[0.08] focus:border-rose-500/60 rounded-xl"
              />
            </div>
            <span className="text-[10px] text-white/40 mt-1 block">
              Leave blank to automatically detect from the request host.
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedback.ok
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
              }`}
            >
              {feedback.ok ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-xs py-2 px-3.5 text-white/60 hover:text-white rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-xs py-2.5 px-4 flex items-center gap-1.5 rounded-xl shadow-lg shadow-brand-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
              <span>{saving ? "Saving..." : "Save Configuration"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
