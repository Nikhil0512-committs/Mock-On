import { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Download,
  ExternalLink,
  ShieldAlert,
  Scale,
  Loader2,
} from "lucide-react";
import { casesApi } from "../lib/api";

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string | null;
  providerName?: string;
}

export default function LegalNoticeModal({
  isOpen,
  onClose,
  caseId,
}: LegalNoticeModalProps) {
  const [data, setData] = useState<{
    portal_name: string;
    portal_url: string;
    alt_portal_name: string;
    alt_portal_url: string;
    ticket_number: string;
    provider: string;
    disputed_amount: string;
    consumer_name: string;
    statutory_act: string;
    complaint_subject: string;
    complaint_body: string;
    pdf_url: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);

  useEffect(() => {
    if (!isOpen || !caseId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    casesApi
      .getLegalNoticeData(caseId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        console.error("Failed to fetch legal notice data:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const handleCopyBody = () => {
    if (!data?.complaint_body) return;
    navigator.clipboard.writeText(data.complaint_body);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCopySubject = () => {
    if (!data?.complaint_subject) return;
    navigator.clipboard.writeText(data.complaint_subject);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-3xl bg-[#0c1424] border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/90 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-amber-500 to-indigo-500" />

        {/* Modal Header */}
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
              <Scale className="w-4 sm:w-5 h-4 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Statutory Grievance Dossier &amp; Legal Notice
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                  NCH 1915 &bull; CPA 2019
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Pre-compiled for direct submission to the National Consumer Helpline &amp; Sectoral Ombudsman.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/50">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
              <p className="text-xs">Assembling evidence, timestamps, and statutory citations...</p>
            </div>
          ) : !data ? (
            <div className="py-16 text-center text-white/40 text-xs">
              Could not load grievance notice data for this case.
            </div>
          ) : (
            <>
              {/* Quick Summary Pill Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] uppercase font-bold text-white/40 block">Respondent</span>
                  <span className="text-xs font-bold text-white truncate block mt-0.5">
                    {data.provider}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] uppercase font-bold text-white/40 block">Disputed Sum</span>
                  <span className="text-xs font-bold text-emerald-400 block mt-0.5 font-mono">
                    ₹{data.disputed_amount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] uppercase font-bold text-white/40 block">Ticket Docket</span>
                  <span className="text-xs font-bold text-indigo-300 truncate block mt-0.5 font-mono">
                    #{data.ticket_number}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] uppercase font-bold text-white/40 block">Authority / Act</span>
                  <span className="text-xs font-bold text-amber-300 truncate block mt-0.5">
                    CPA 2019 Sec 2(47)
                  </span>
                </div>
              </div>

              {/* Subject Line Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white/70">Complaint Subject Line</span>
                  <button
                    onClick={handleCopySubject}
                    className="text-[11px] text-brand-400 hover:text-brand-300 font-bold flex items-center gap-1"
                  >
                    {copiedSubject ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Subject</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-mono text-white/80 select-all">
                  {data.complaint_subject}
                </div>
              </div>

              {/* Full Pre-filled Complaint Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white/70">
                    Formal Grievance Petition Text (Ready to Paste)
                  </span>
                  <button
                    onClick={handleCopyBody}
                    className="px-3 py-1 rounded-lg bg-brand-500/20 border border-brand-500/40 text-[11px] text-brand-300 hover:text-white hover:bg-brand-500/30 font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Full Petition</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={data.complaint_body}
                  className="w-full h-56 p-3.5 rounded-xl bg-black/50 border border-white/[0.08] text-xs font-mono text-white/85 leading-relaxed resize-none focus:outline-none focus:border-brand-500/40"
                />
              </div>

              {/* Direct Portal Jump Buttons */}
              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  <span>One-Click Govt Grievance Portals</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Open the official redressal portal, paste the copied petition text above, and attach the official PDF notice:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={data.portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
                  >
                    <span>{data.portal_name}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={data.alt_portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] hover:bg-white/[0.08] text-white/80 text-xs font-medium flex items-center gap-1.5 transition-all"
                  >
                    <span>National Consumer Helpline (NCH - 1915)</span>
                    <ExternalLink className="w-3 h-3 text-white/40" />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-black/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-white/40 text-center sm:text-left">
            Certified electronic record under Indian Evidence Act Section 65B &bull; armour365™ Voice Proxy
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {caseId && (
              <a
                href={casesApi.getLegalNoticePdfUrl(caseId)}
                download
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/25"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official Legal Notice (PDF)</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/80 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
