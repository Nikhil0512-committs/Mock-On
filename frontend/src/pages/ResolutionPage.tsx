import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, PhoneCall, ArrowRight, Shield, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

export default function ResolutionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const promiseId = searchParams.get("id");
  const action = searchParams.get("action");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!promiseId || !action) {
      setErrorMsg("Missing dispute verification parameters.");
      setLoading(false);
      return;
    }

    // Call backend resolution API
    api
      .get(`/resolution/respond?id=${promiseId}&action=${action}`)
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        if (err.response?.status === 200) {
          setLoading(false);
        } else {
          setErrorMsg(err.response?.data?.message || "Failed to process resolution response.");
          setLoading(false);
        }
      });
  }, [promiseId, action]);

  const isNotReceived = action?.toLowerCase() === "not_received";

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#0d1527]/90 border border-white/[0.12] rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
        {/* Top ambient highlight line */}
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-3xl bg-gradient-to-r ${
            isNotReceived
              ? "from-amber-500 via-rose-500 to-amber-600"
              : "from-brand-500 via-indigo-500 to-emerald-400"
          }`}
        />

        <div className="flex items-center justify-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest pt-2">
          <Shield className="w-4 h-4 text-brand-400" />
          Mock-On Consumer AI Personal Assistant
        </div>

        {loading ? (
          <div className="py-12 space-y-4">
            <RefreshCw className="w-8 h-8 text-brand-400 animate-spin mx-auto" />
            <p className="text-sm text-white/60">Processing your dispute response...</p>
          </div>
        ) : errorMsg ? (
          <div className="space-y-4 py-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white">Notice</h1>
            <p className="text-sm text-white/70">{errorMsg}</p>
            <button
              onClick={() => navigate("/ledger")}
              className="btn-primary w-full py-3 rounded-xl font-bold text-sm"
            >
              Return to Promise Ledger
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div
              className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto shadow-xl ${
                isNotReceived
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-rose-500/20"
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/20"
              }`}
            >
              {isNotReceived ? (
                <PhoneCall className="w-8 h-8 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
            </div>

            <div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border ${
                  isNotReceived
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {isNotReceived ? "Follow-Up Call Dispatched" : "Refund Verified • Case Closed"}
              </span>
              <h1 className="text-2xl font-extrabold text-white">
                {isNotReceived
                  ? "Priority Follow-Up Dialed!"
                  : "Refund Confirmed Successfully!"}
              </h1>
            </div>

            <p className="text-sm text-white/75 leading-relaxed">
              {isNotReceived
                ? "Because you indicated that the refund has NOT been received, Mock-On AI has autonomously initiated an escalated follow-up call to the service provider helpline to demand immediate reversal."
                : "Thank you for confirming. Your promise status has been permanently updated to Fulfilled in your immutable ledger."}
            </p>

            <div className="pt-2 flex flex-col gap-3">
              {isNotReceived ? (
                <button
                  onClick={() => navigate("/call")}
                  className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25"
                >
                  <PhoneCall className="w-4 h-4" />
                  Join Live Escalation Call
                </button>
              ) : (
                <button
                  onClick={() => navigate("/ledger")}
                  className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  View Dispute Ledger
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => navigate("/ledger")}
                className="btn-ghost w-full py-2.5 rounded-xl text-xs text-white/60 hover:text-white"
              >
                Go to Promise Ledger
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

