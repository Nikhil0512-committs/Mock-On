/**
 * Family View Page — read-only case status for trusted family members.
 * Accessed via token: /family/:token
 * Elevated with modern obsidian glassmorphic design and ambient lighting.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  HelpCircle,
  Building2,
  IndianRupee,
  Receipt,
  Calendar,
  Lock,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { familyApi } from "../lib/api";
import type { PromiseStatus } from "../types";

const STATUS_ICON: Record<PromiseStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  due_soon: AlertCircle,
  overdue: XCircle,
  fulfilled: CheckCircle2,
  unable_to_verify: HelpCircle,
};

export default function FamilyPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{
    case: Record<string, unknown>;
    promises: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    familyApi
      .get(token)
      .then(setData)
      .catch(() => setError("Invalid or expired family view link."));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-8 text-center bg-[#0d1527]/90 border border-rose-500/30 rounded-3xl shadow-2xl backdrop-blur-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Error</h2>
          <p className="text-sm text-white/60 mb-5 leading-relaxed">{error}</p>
          <p className="text-xs text-white/40">
            Please ask the dispute filer to generate a fresh link from their Mock-On dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/60 text-sm font-medium">Loading verified case records...</span>
        </div>
      </div>
    );
  }

  const caseData = data.case;
  const promises = data.promises;

  const provider = (caseData.provider as string) || "Company Support";
  const idType = (caseData.identifier_type as string) || "Reference / ID";
  const idVal = (caseData.identifier_value as string) || (caseData.phone_number as string) || "Registered Phone";
  const ticketNo = (caseData.ticket_number as string) || `TKT-${String(caseData.id || "REF").slice(0, 8).toUpperCase()}`;
  const amount = (caseData.disputed_amount as string) || "0";

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-4 shadow-lg shadow-emerald-500/10">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-300 text-xs font-bold uppercase tracking-wider">
            Family Mode &bull; Read Only Verified
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2.5">
          Case Status & Settlement Tracker
        </h1>
        <p className="text-white/50 text-sm max-w-lg mx-auto leading-relaxed">
          Real-time dispute commitments and refund tracking recorded by Mock-On Voice-First AI Advocate.
        </p>
      </div>

      {/* Case Overview Micro-Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0d1527]/90 border border-white/[0.1] rounded-2xl p-4 space-y-1 hover:border-white/20 transition-all shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
            <Building2 className="w-3.5 h-3.5 text-brand-400" />
            <span>Provider</span>
          </div>
          <div className="font-bold text-white text-base truncate">{provider}</div>
        </div>

        <div className="bg-[#0d1527]/90 border border-white/[0.1] rounded-2xl p-4 space-y-1 hover:border-white/20 transition-all shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span className="truncate">{idType}</span>
          </div>
          <div className="font-bold text-white text-base truncate">{idVal}</div>
        </div>

        <div className="bg-[#0d1527]/90 border border-white/[0.1] rounded-2xl p-4 space-y-1 hover:border-amber-500/30 transition-all shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
            <Receipt className="w-3.5 h-3.5 text-amber-400" />
            <span>Ticket #</span>
          </div>
          <div className="font-bold text-brand-300 text-base truncate font-mono">{ticketNo}</div>
        </div>

        <div className="bg-[#0d1527]/90 border border-white/[0.1] rounded-2xl p-4 space-y-1 hover:border-emerald-500/30 transition-all shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
            <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
            <span>Refund</span>
          </div>
          <div className="font-bold text-emerald-300 text-base">₹{amount}</div>
        </div>
      </div>

      {/* Case Grievance Card */}
      <div className="rounded-3xl bg-[#0d1527]/90 border border-white/[0.12] p-6 mb-6 space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            Grievance Overview
          </span>
          <span className={`badge ${(caseData.status as string) === "resolved" ? "badge-fulfilled" : "badge-pending"}`}>
            {(caseData.status as string)?.toUpperCase() || "OPEN"}
          </span>
        </div>
        <p className="text-white/85 text-sm leading-relaxed">{caseData.goal as string}</p>
        <div className="flex items-center gap-4 text-xs text-white/40 pt-3 border-t border-white/[0.08]">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-white/30" />
            Opened: {format(new Date(caseData.created_at as string), "dd MMM yyyy")}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
            <Lock className="w-3.5 h-3.5" /> Verbatim Voice Evidence Protected
          </span>
        </div>
      </div>

      {/* Commitments & Promises Section */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-white text-lg flex items-center gap-2">
            Logged Company Commitments
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white/70">
              {promises.length}
            </span>
          </h2>
          <span className="text-xs text-white/40 font-mono">Immutable Ledger</span>
        </div>

        {promises.length === 0 ? (
          <div className="rounded-3xl bg-[#0d1527]/90 border border-white/[0.1] p-8 text-center text-white/40 shadow-xl">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30 text-brand-400" />
            <p className="text-sm">Call completed. Extracting commitments from telecom agent...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promises.map((p) => {
              const status = (p.status as PromiseStatus) || "pending";
              const Icon = STATUS_ICON[status] ?? Clock;
              const typeLabel = (p.commitment_type as string || "Refund").replace("_", " ").toUpperCase();
              return (
                <div
                  key={p.id as string}
                  className="rounded-2xl bg-[#0d1527]/90 border border-white/[0.1] p-5 space-y-3 hover:border-brand-500/30 transition-all shadow-xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm tracking-wide">{typeLabel}</span>
                    <span className={`badge badge-${status}`}>
                      <Icon className="w-3 h-3" />
                      {status}
                    </span>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed">{p.summary as string}</p>

                  <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.08] text-sm">
                    {p.amount != null ? (
                      <span className="text-emerald-300 font-extrabold text-base">₹{p.amount as number}</span>
                    ) : (
                      <span className="text-emerald-300 font-extrabold text-base">₹{amount}</span>
                    )}

                    {Boolean(p.due_at) ? (
                      <span className="text-white/50 text-xs">
                        Resolution Due:{" "}
                        <strong className="text-white/90">
                          {format(new Date(p.due_at as string), "dd MMM yyyy")}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-white/50 text-xs">
                        Resolution Due: <strong className="text-white/90">in 5 business days</strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Protection Notice Banner */}
      <div className="p-4.5 rounded-2xl bg-brand-500/10 border border-brand-500/25 text-xs text-brand-200 leading-relaxed flex items-start gap-3 shadow-lg">
        <Shield className="w-5 h-5 flex-shrink-0 mt-0.5 text-brand-400" />
        <div>
          <strong className="text-white font-semibold">Automatic Deadline Protection:</strong> Mock-On AI actively tracks the 5-day deadline. If the refund of ₹{amount} is not credited by {provider}, Mock-On will alert the user and trigger re-contact and formal TRAI Tier-2 escalation.
        </div>
      </div>

      <p className="text-center text-white/30 text-xs mt-10">
        Mock-On &bull; Voice-First AI Consumer Protection &bull; Built for India
      </p>
    </div>
  );
}
