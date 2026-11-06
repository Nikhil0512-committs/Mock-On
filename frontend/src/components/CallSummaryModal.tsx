import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  Mail,
  Shield,
  ArrowRight,
  RefreshCw,
  Building2,
  IndianRupee,
  Share2,
  X,
  FileDown,
  Volume2,
  Sparkles,
  Scale,
} from "lucide-react";
import { casesApi } from "../lib/api";
import type { Case, Promise as HPromise } from "../types";
import LegalNoticeModal from "./LegalNoticeModal";

interface CallSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case | null;
  promises?: HPromise[];
  hasConclusion?: boolean;
  endReason?: string;
  onOpenFamilyModal?: () => void;
}

export default function CallSummaryModal({
  isOpen,
  onClose,
  caseData,
  promises = [],
  hasConclusion = true,
  endReason,
  onOpenFamilyModal,
}: CallSummaryModalProps) {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);

  if (!isOpen || !caseData) return null;

  const hasAnyPromises = Boolean(promises && promises.length > 0);
  const isResolved = Boolean(hasConclusion) || hasAnyPromises;
  const reasonText =
    endReason ||
    "The call ended midway before the company representative could confirm a resolution or commitment.";

  const info = (caseData.approved_info as Record<string, unknown>) || {};
  const provider = (info.service_provider as string) || "Company Support";
  const identifierType = (info.identifier_type as string) || "Reference / ID";
  const identifierVal =
    (info.identifier_value as string) || (info.phone_number as string) || "Registered Reference";
  const amount = (info.disputed_amount as string) || "Disputed Sum";
  const ticketNo = (info.ticket_number as string) || `TKT-${caseData.id.slice(0, 8).toUpperCase()}`;
  const email = caseData.user_email || "your registered email";
  const domainLabel = (info.domain_label as string) || (info.domain as string)?.toUpperCase() || "CONSUMER";

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await casesApi.resendSummary(caseData.id);
      if (res.ok) {
        setResendStatus(`Summary email dispatched to ${res.email}`);
      } else {
        setResendStatus("Failed to send email. Please check SMTP configuration.");
      }
    } catch {
      setResendStatus("Failed to send email. Please try again.");
    } finally {
      setResending(false);
      setTimeout(() => setResendStatus(null), 6000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0d1527]/95 border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/80 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Top ambient highlight line */}
        <div
          className={`h-1.5 w-full bg-gradient-to-r ${
            isResolved
              ? "from-brand-500 via-indigo-500 to-emerald-400"
              : "from-amber-500 via-rose-500 to-amber-600"
          }`}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors z-10"
          title="Close Summary"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          {/* Modal Header */}
          <div className="flex items-start gap-4">
            <div
              className={`w-13 h-13 rounded-2xl p-0.5 shadow-lg flex-shrink-0 ${
                isResolved
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25"
                  : "bg-gradient-to-br from-amber-500 to-rose-600 shadow-amber-500/25"
              }`}
            >
              <div className="w-full h-full bg-[#0d1527] rounded-[14px] flex items-center justify-center">
                {isResolved ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                )}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                    isResolved
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {isResolved
                    ? `${domainLabel} • Call Completed`
                    : `${domainLabel} • Call Inconclusive (Ended Midway)`}
                </span>
                {promises.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {promises.length} Commitment{promises.length > 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-white/40 text-xs font-mono font-medium">
                  Case #{caseData.id.slice(0, 8)}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                {isResolved
                  ? "Executive Call Summary & Outcome"
                  : "Call Ended Midway — No Conclusion Reached"}
              </h2>
            </div>
          </div>

          {/* Key Parameters Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3.5 space-y-1 hover:border-white/20 transition-all">
              <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                <Building2 className="w-3.5 h-3.5 text-brand-400" />
                <span>Provider</span>
              </div>
              <div className="font-bold text-white text-sm truncate">{provider}</div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3.5 space-y-1 hover:border-white/20 transition-all">
              <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                <Shield className="w-3.5 h-3.5 text-teal-400" />
                <span className="truncate">{identifierType}</span>
              </div>
              <div className="font-bold text-white text-sm truncate">{identifierVal}</div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3.5 space-y-1 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isResolved ? "Refund" : "Disputed Sum"}</span>
              </div>
              <div className="font-bold text-emerald-300 text-sm">₹{amount}</div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3.5 space-y-1 hover:border-brand-500/30 transition-all">
              <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Outcome</span>
              </div>
              <div
                className={`font-bold text-sm truncate ${
                  isResolved ? "text-brand-300 font-mono" : "text-amber-300"
                }`}
              >
                {isResolved
                  ? promises.length > 0
                    ? `${promises.length} Commitment${promises.length > 1 ? "s" : ""}`
                    : "Refund Promised"
                  : "0 Promises (Inconclusive)"}
              </div>
            </div>
          </div>

          {/* AI Outcome Synopsis */}
          <div
            className={`border rounded-2xl p-4.5 space-y-2.5 ${
              isResolved
                ? "bg-gradient-to-r from-brand-950/40 to-surface-card/60 border-white/[0.08] border-l-4 border-l-brand-500"
                : "bg-amber-500/10 border-amber-500/30 border-l-4 border-l-amber-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isResolved ? "text-brand-300" : "text-amber-300"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                {isResolved ? "Verified Settlement Recorded" : "Inconclusive Call Log"}
              </span>
              <span className="text-[11px] text-white/40 font-mono">
                Sarvam 105B &amp; Evidence Ledger
              </span>
            </div>
            {isResolved ? (
              <p className="text-sm text-white/85 leading-relaxed">
                Mock-On contacted <strong>{provider} Helpline</strong> on behalf of{" "}
                <strong>{identifierVal}</strong> regarding the disputed {domainLabel} transaction.
                The representative verified the complaint, logged formal docket{" "}
                <strong className="font-mono text-brand-300">#{ticketNo}</strong>, and committed to a{" "}
                <strong className="text-emerald-300">full refund of ₹{amount}</strong> credited within{" "}
                <strong>5 business days</strong>.
              </p>
            ) : (
              <div className="space-y-2 text-sm text-white/85 leading-relaxed">
                <p>
                  Mock-On contacted <strong>{provider} Helpline</strong> on behalf of{" "}
                  <strong>{identifierVal}</strong> regarding the disputed {domainLabel} transaction.
                  However, the call ended midway without reaching any settlement or refund commitment.
                </p>
                <div className="p-3 rounded-xl bg-black/40 border border-amber-500/30 text-amber-200 text-xs">
                  <span className="font-bold text-amber-400">Reason for No Conclusion: </span>
                  {reasonText}
                </div>
                <p className="text-xs text-white/60">
                  All dialog turns, timestamps, and audio records are logged into your tamper-proof Evidence Ledger as formal proof of consumer grievance contact.
                </p>
              </div>
            )}
          </div>

          {/* Email Sync Status Banner */}
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <div className="text-xs font-bold text-white tracking-wide">
                  {isResolved ? "Summary Email Dispatched" : "Inconclusive Notice Dispatched"}
                </div>
                <div className="text-xs text-white/60">
                  {isResolved
                    ? `Detailed report & 1-click check-in sent to `
                    : `Inconclusive case report & next steps sent to `}
                  <span className="text-indigo-300 font-mono font-medium">{email}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleResend}
              disabled={resending}
              className="btn-ghost text-xs py-2 px-3.5 flex items-center gap-1.5 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/20 whitespace-nowrap rounded-xl transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
              {resending ? "Dispatching..." : "Resend Email"}
            </button>
          </div>

          {resendStatus && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-fade-in flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{resendStatus}</span>
            </div>
          )}

          {/* What Happens Next Timeline */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4.5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white/40">
              {isResolved ? "Automated Follow-Through SLA" : "Recommended Next Steps"}
            </div>
            {isResolved ? (
              <div className="space-y-3 text-xs text-white/75">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <strong className="text-white">5-Day Deadline Tracking:</strong> Mock-On monitors your ₹{amount} refund deadline with precision.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/40 text-brand-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <strong className="text-white">1-Click Check-in Email:</strong> When the 5 days pass, you will receive an email asking "Did you receive your ₹{amount}?" with 1-click <em className="text-emerald-300 not-italic font-semibold">Yes</em> / <em className="text-rose-300 not-italic font-semibold">No</em> buttons.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <strong className="text-white">Statutory Escalation if Unpaid:</strong> If you click <em className="text-rose-300 not-italic font-semibold">No</em>, Mock-On automatically re-contacts {provider} and prepares your TRAI/RBI Appellate grievance file.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-white/75">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <strong className="text-white">Evidence Preserved:</strong> Mock-On has captured all utterances, audio records, and connection timestamps into your tamper-proof ledger as formal proof.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <strong className="text-white">Redial Support Desk:</strong> You can initiate a 1-click redial to re-engage with a senior representative or supervisor.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <strong className="text-white">Escalate to Ombudsman:</strong> If the provider repeatedly hangs up or fails to resolve, use your Mock-On evidence pack to file an official Ombudsman / Consumer Forum (NCH 1915) petition.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 sm:p-5 sm:px-8 border-t border-white/[0.08] bg-[#090e1b] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {!isResolved && (
              <button
                onClick={() => {
                  onClose();
                  navigate("/");
                }}
                className="btn-primary text-xs py-2 px-3.5 bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 rounded-xl shadow-lg shadow-amber-600/25"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Redial Helpline
              </button>
            )}
            {onOpenFamilyModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenFamilyModal();
                }}
                className="btn-ghost text-xs py-2 px-3 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 flex items-center gap-1.5 rounded-xl"
              >
                <Share2 className="w-3.5 h-3.5" />
                Family Link
              </button>
            )}
            <a
              href={casesApi.getTranscriptTxtUrl(caseData.id)}
              download
              className="btn-ghost text-xs py-2 px-3 text-blue-300 border border-blue-500/30 hover:bg-blue-500/10 flex items-center gap-1.5 rounded-xl"
              title="Download Verbatim Transcript TXT"
            >
              <FileDown className="w-3.5 h-3.5 text-blue-400" />
              Transcript (.TXT)
            </a>
            <a
              href={casesApi.getAudioWavUrl(caseData.id)}
              download
              className="btn-ghost text-xs py-2 px-3 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 flex items-center gap-1.5 rounded-xl"
              title="Download Audio Evidence WAV"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              Audio (.WAV)
            </a>
            <a
              href={casesApi.getEvidencePdfUrl(caseData.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs py-2 px-3 text-white/80 border border-white/10 hover:bg-white/5 flex items-center gap-1.5 rounded-xl"
            >
              <FileText className="w-3.5 h-3.5" />
              Evidence PDF
            </a>
            <button
              onClick={() => setShowLegalModal(true)}
              className="btn-ghost text-xs py-2 px-3 text-red-300 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-1.5 rounded-xl"
              title="Generate Formal NCH/RBI Statutory Grievance Dossier"
            >
              <Scale className="w-3.5 h-3.5 text-red-400" />
              Legal Notice
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              navigate("/ledger");
            }}
            className="btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 rounded-xl w-full sm:w-auto flex-shrink-0"
          >
            Review in Promise Ledger
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1-Click Formal NCH / RBI Grievance Notice Modal */}
      <LegalNoticeModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        caseId={caseData.id}
        providerName={provider}
      />
    </div>
  );
}
