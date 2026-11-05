import { useState, useEffect } from "react";
import {
  X,
  Users,
  Copy,
  Check,
  Share2,
  Shield,
  ExternalLink,
  Loader2,
  Ban,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { casesApi } from "../lib/api";

interface ShareFamilyModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
}

export default function ShareFamilyModal({ isOpen, onClose, caseId }: ShareFamilyModalProps) {
  const [familyUrl, setFamilyUrl] = useState<string>("");
  const [isRevoked, setIsRevoked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && caseId) {
      setLoading(true);
      setError(null);
      setFeedback(null);
      setIsRevoked(false);

      casesApi
        .shareFamily(caseId)
        .then((res) => {
          if (res.family_token) {
            setFamilyUrl(`${window.location.origin}/family/${res.family_token}`);
            setIsRevoked(false);
          } else {
            setFamilyUrl("");
            setIsRevoked(true);
          }
        })
        .catch((err) => {
          console.error("Family share error:", err);
          setError("Failed to load family link. Please try again.");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!familyUrl) return;
    navigator.clipboard.writeText(familyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    if (!familyUrl) return;
    const text = encodeURIComponent(
      `Track our consumer dispute & refund progress in real-time on Mock-On: ${familyUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await casesApi.revokeFamilyToken(caseId);
      if (res.ok) {
        setFamilyUrl("");
        setIsRevoked(true);
        setFeedback("Family access revoked. Prior links are now deactivated.");
      } else {
        setError("Could not revoke link. Please try again.");
      }
    } catch {
      setError("Failed to revoke link.");
    } finally {
      setIsRevoking(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await casesApi.regenerateFamilyToken(caseId);
      if (res.ok && res.family_token) {
        setFamilyUrl(`${window.location.origin}/family/${res.family_token}`);
        setIsRevoked(false);
        setFeedback("New family access link generated!");
      } else {
        setError("Could not regenerate link. Please try again.");
      }
    } catch {
      setError("Failed to regenerate link.");
    } finally {
      setIsRegenerating(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0d1527]/95 border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/80 p-6 sm:p-8 overflow-hidden">
        {/* Top ambient highlight line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-brand-500" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
          title="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-0.5 shadow-lg shadow-emerald-500/25 flex-shrink-0">
            <div className="w-full h-full bg-[#0d1527] rounded-[14px] flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Family Mode Sharing</h2>
              <span className="badge bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                <Sparkles className="w-2.5 h-2.5" />
                Read-Only
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Share real-time complaint updates with family members
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-white/60">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
            <span className="text-sm">Configuring cryptographic access...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm">
            {error}
          </div>
        ) : (
          <div className="space-y-5">
            {feedback && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in font-medium">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            {isRevoked || !familyUrl ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-3">
                  <Ban className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-semibold text-amber-200">Access Link Revoked</div>
                    <div className="text-amber-300/80 mt-0.5">
                      No active family link exists. Anyone with the previous link can no longer view this case.
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold shadow-lg shadow-brand-500/25"
                >
                  <RotateCcw className={`w-4 h-4 ${isRegenerating ? "animate-spin" : ""}`} />
                  {isRegenerating ? "Generating Token..." : "Generate New Family Link"}
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <label className="text-xs font-semibold text-white/60 flex items-center justify-between">
                    <span>Sharable Link</span>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-normal">
                      <Shield className="w-3 h-3" /> Secure Token
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={familyUrl}
                      className="input py-2 text-xs font-mono bg-black/40 border-white/[0.08] flex-1 select-all"
                    />
                    <button
                      onClick={handleCopy}
                      className="btn-primary py-2 px-3 text-xs flex items-center gap-1.5 rounded-xl whitespace-nowrap"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleWhatsAppShare}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share on WhatsApp
                  </button>

                  <a
                    href={familyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/80 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview View
                  </a>
                </div>

                {/* Revoke and Regenerate controls */}
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
                  <button
                    onClick={handleRevoke}
                    disabled={isRevoking}
                    className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Ban className={`w-3.5 h-3.5 ${isRevoking ? "animate-spin" : ""}`} />
                    {isRevoking ? "Revoking..." : "Revoke Access Link"}
                  </button>

                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="text-xs text-white/50 hover:text-white hover:bg-white/[0.05] py-1.5 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Generate a new token, instantly invalidating the current link"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
                    {isRegenerating ? "Regenerating..." : "Regenerate Token"}
                  </button>
                </div>
              </>
            )}

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs text-white/50 space-y-1">
              <div className="font-semibold text-white/70">Security & Privacy Guardrails</div>
              <div>
                &bull; Family viewers can see real-time status and commitments but cannot cancel complaints, advance demo clocks, or alter evidence.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
