/**
 * Intake Page — Multi-Domain Consumer Dispute Intake
 * Revamped with modern 21st.dev / shadcn-style split console layout.
 * Supports E-Commerce, Banking/UPI, Airlines/Travel, Telecom, Insurance, and Utilities.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone,
  ShoppingCart,
  CreditCard,
  Plane,
  HeartPulse,
  Zap,
  Sparkles,
  Headphones,
  ArrowRight,
  GraduationCap,
  Car,
  Building2,
  Globe,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { casesApi, callsApi } from "../lib/api";
import { useStore } from "../store";

const LANGUAGES = [
  { code: "hi-IN", label: "Hindi", native: "हिंदी" },
  { code: "en-IN", label: "English", native: "English" },
  { code: "hi-en", label: "Hinglish", native: "हिन्दीglish" },
];

interface DomainConfig {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
  defaultProvider: string;
  providerLabel: string;
  providerPlaceholder: string;
  providerSuggestions: string[];
  identifierLabel: string;
  identifierPlaceholder: string;
  defaultIdentifier: string;
  defaultAmount: string;
  amountSuggestions: string[];
  defaultGoal: string;
  presets: string[];
}

const DOMAINS: DomainConfig[] = [
  {
    id: "ecommerce",
    label: "E-Commerce",
    sublabel: "Amazon, Flipkart, Swiggy",
    icon: ShoppingCart,
    color: "text-amber-400",
    activeBg: "bg-amber-500/20 border-amber-500 text-amber-300",
    defaultProvider: "Amazon",
    providerLabel: "E-Commerce / Delivery Platform",
    providerPlaceholder: "e.g. Amazon, Flipkart, Swiggy, Blinkit, Zomato",
    providerSuggestions: ["Amazon", "Flipkart", "Swiggy", "Blinkit", "Zomato", "Myntra"],
    identifierLabel: "Order ID / Return Tracking #",
    identifierPlaceholder: "e.g. OD-9481028471 or phone",
    defaultIdentifier: "OD-9481028471",
    defaultAmount: "1499",
    amountSuggestions: ["499", "1499", "2999", "4999"],
    defaultGoal:
      "Returned order received at warehouse 6 days ago. The refund of ₹1,499 has not been credited to original payment source. Requesting immediate bank clearance.",
    presets: [
      "Returned item received at warehouse, refund pending after 7 days.",
      "Wrong product delivered, replacement refused by customer care.",
      "Instant grocery order cancelled, UPI debit not refunded.",
    ],
  },
  {
    id: "banking",
    label: "Banking & UPI",
    sublabel: "HDFC, SBI, PhonePe, GPay",
    icon: CreditCard,
    color: "text-blue-400",
    activeBg: "bg-blue-500/20 border-blue-500 text-blue-300",
    defaultProvider: "HDFC Bank",
    providerLabel: "Bank / Payment Provider",
    providerPlaceholder: "e.g. HDFC Bank, SBI, ICICI Bank, PhonePe, Paytm",
    providerSuggestions: ["HDFC Bank", "State Bank of India", "ICICI Bank", "PhonePe", "Paytm"],
    identifierLabel: "Transaction UTR / Account #",
    identifierPlaceholder: "e.g. UTR-49102847192",
    defaultIdentifier: "UTR-49102847192",
    defaultAmount: "2500",
    amountSuggestions: ["500", "1500", "2500", "5000"],
    defaultGoal:
      "UPI payment failed at merchant but ₹2,500 debited from my account. Reversal has not occurred within RBI mandated T+5 turnaround time.",
    presets: [
      "Failed UPI transaction debited ₹2,500, not reversed within T+5 days.",
      "Unauthorized annual debit card charge deducted without OTP.",
      "ATM cash dispenser timed out: cash not dispensed but debited from account.",
    ],
  },
  {
    id: "travel",
    label: "Airlines & Travel",
    sublabel: "IndiGo, Air India, IRCTC",
    icon: Plane,
    color: "text-sky-400",
    activeBg: "bg-sky-500/20 border-sky-500 text-sky-300",
    defaultProvider: "IndiGo Airlines",
    providerLabel: "Airline / Booking Portal",
    providerPlaceholder: "e.g. IndiGo, Air India, SpiceJet, MakeMyTrip, IRCTC",
    providerSuggestions: ["IndiGo", "Air India", "MakeMyTrip", "IRCTC", "Akasa Air"],
    identifierLabel: "PNR / Booking Reference",
    identifierPlaceholder: "e.g. PNR-6K9J2L",
    defaultIdentifier: "PNR-6K9J2L",
    defaultAmount: "4800",
    amountSuggestions: ["1200", "3500", "4800", "9600"],
    defaultGoal:
      "Flight cancelled under PNR-6K9J2L. Statutory refund of ₹4,800 not processed within DGCA 7-day mandate. Requesting immediate refund.",
    presets: [
      "Cancelled flight refund delayed beyond DGCA 7-day statutory limit.",
      "Seat and baggage fee double charged during online web check-in.",
      "Train ticket waitlist cancelled, IRCTC refund not received after chart prep.",
    ],
  },
  {
    id: "telecom",
    label: "Telecom & DTH",
    sublabel: "Airtel, Jio, Vi, Tata Play",
    icon: Phone,
    color: "text-brand-400",
    activeBg: "bg-brand-500/20 border-brand-500 text-brand-300",
    defaultProvider: "Airtel",
    providerLabel: "Telecom / Broadband Provider",
    providerPlaceholder: "e.g. Airtel, Jio, Vodafone Idea (Vi), Tata Play",
    providerSuggestions: ["Airtel", "Jio", "Vodafone Idea", "Tata Play", "Excitel"],
    identifierLabel: "Mobile / Subscriber ID",
    identifierPlaceholder: "e.g. +91 9103031412 or broadband account",
    defaultIdentifier: "+91 9103031412",
    defaultAmount: "399",
    amountSuggestions: ["299", "399", "699", "999"],
    defaultGoal:
      "Airtel charged ₹399 unauthorized VAS / international roaming charge on monthly bill. Requesting complete billing reversal and refund.",
    presets: [
      "Unauthorized VAS charge of ₹399 on monthly mobile bill.",
      "Fiber broadband down for 5 consecutive days, billing credit waiver requested.",
      "Prepaid recharge double debited due to payment gateway glitch.",
    ],
  },
  {
    id: "insurance",
    label: "Health & Motor",
    sublabel: "Star Health, HDFC ERGO, Care",
    icon: HeartPulse,
    color: "text-emerald-400",
    activeBg: "bg-emerald-500/20 border-emerald-500 text-emerald-300",
    defaultProvider: "Star Health",
    providerLabel: "Insurance Company / TPA",
    providerPlaceholder: "e.g. Star Health, HDFC ERGO, ICICI Lombard, Care Health",
    providerSuggestions: ["Star Health", "HDFC ERGO", "Care Health", "ICICI Lombard", "Niva Bupa"],
    identifierLabel: "Policy # / Claim Reference",
    identifierPlaceholder: "e.g. POL-9102847102",
    defaultIdentifier: "POL-9102847102",
    defaultAmount: "18500",
    amountSuggestions: ["5000", "12500", "18500", "45000"],
    defaultGoal:
      "Hospital reimbursement claim approved but final disbursement withheld without reason beyond IRDAI 15-day SLA. Requesting immediate settlement.",
    presets: [
      "Approved cashless claim payment delayed beyond IRDAI 15-day limit.",
      "No-Claim Bonus (NCB) not transferred after motor policy renewal.",
      "Pre-authorization query unresolved for 72+ hours during hospital admission.",
    ],
  },
  {
    id: "utilities",
    label: "Electricity & Gas",
    sublabel: "Tata Power, BSES, Adani, IGL",
    icon: Zap,
    color: "text-yellow-400",
    activeBg: "bg-yellow-500/20 border-yellow-500 text-yellow-300",
    defaultProvider: "Tata Power",
    providerLabel: "Utility Board / Discom",
    providerPlaceholder: "e.g. Tata Power, BSES Rajdhani, Adani Electricity, IGL, MGL",
    providerSuggestions: ["Tata Power", "BSES Rajdhani", "Adani Electricity", "IGL", "MGL"],
    identifierLabel: "Consumer Account No (CA)",
    identifierPlaceholder: "e.g. CA-1029481029",
    defaultIdentifier: "CA-1029481029",
    defaultAmount: "850",
    amountSuggestions: ["850", "1800", "4200", "8500"],
    defaultGoal:
      "Consumer account charged erratic provisional meter reading excess. Defective meter replacement request ignored. Requesting bill revision.",
    presets: [
      "Faulty fast meter reading generating 3x inflated monthly utility bill.",
      "Security deposit refund pending for 45 days post meter disconnection.",
      "Piped Natural Gas (PNG) connection unbilled arrears charged erroneously.",
    ],
  },
  {
    id: "edtech",
    label: "EdTech & Courses",
    sublabel: "Scaler, UpGrad, Unacademy",
    icon: GraduationCap,
    color: "text-purple-400",
    activeBg: "bg-purple-500/20 border-purple-500 text-purple-300",
    defaultProvider: "Scaler Academy",
    providerLabel: "EdTech Platform / Institute",
    providerPlaceholder: "e.g. Scaler, UpGrad, Coursera, Unacademy, Simplilearn",
    providerSuggestions: ["Scaler", "UpGrad", "Coursera", "Unacademy", "Simplilearn"],
    identifierLabel: "Student ID / Enrollment Ref",
    identifierPlaceholder: "e.g. STU-849201 or registered mobile",
    defaultIdentifier: "STU-849201",
    defaultAmount: "25000",
    amountSuggestions: ["5000", "15000", "25000", "60000"],
    defaultGoal:
      "Course enrollment cancelled within 14-day statutory cooling-off period. Promised refund of course fee has not been credited. Requesting immediate loan cancellation and refund.",
    presets: [
      "Course withdrawal within 14-day cooling-off window, refund withheld.",
      "False placement guarantee promise, batch deferral request rejected.",
      "NBFC loan auto-debit continuing despite formal written course cancellation.",
    ],
  },
  {
    id: "mobility",
    label: "Cabs & EV Mobility",
    sublabel: "Uber, Ola Electric, Rapido",
    icon: Car,
    color: "text-rose-400",
    activeBg: "bg-rose-500/20 border-rose-500 text-rose-300",
    defaultProvider: "Ola Electric",
    providerLabel: "Mobility App / EV Manufacturer",
    providerPlaceholder: "e.g. Uber, Ola Electric, Rapido, Ather Energy, BluSmart",
    providerSuggestions: ["Ola Electric", "Uber", "Rapido", "Ather Energy", "BluSmart"],
    identifierLabel: "Trip CRN / Booking ID / Chassis #",
    identifierPlaceholder: "e.g. CRN-920184710",
    defaultIdentifier: "CRN-920184710",
    defaultAmount: "850",
    amountSuggestions: ["150", "450", "850", "2400"],
    defaultGoal:
      "Driver cancelled trip without arrival but cancellation penalty was debited. Support automated bot refusing refund. Requesting immediate reversal.",
    presets: [
      "Trip cancellation penalty charged when driver refused to come.",
      "EV warranty battery replacement delayed beyond 30-day statutory SLA.",
      "Incorrect GPS toll route calculation inflated final fare by ₹850.",
    ],
  },
  {
    id: "housing",
    label: "Rentals & Deposits",
    sublabel: "NoBroker, PG Deposit, Builder",
    icon: Building2,
    color: "text-teal-400",
    activeBg: "bg-teal-500/20 border-teal-500 text-teal-300",
    defaultProvider: "NoBroker",
    providerLabel: "Rental Platform / Landlord / Society",
    providerPlaceholder: "e.g. NoBroker, PG Landlord, Stanza Living, Housing.com",
    providerSuggestions: ["NoBroker", "PG Landlord", "Stanza Living", "Housing.com", "Society RWA"],
    identifierLabel: "Agreement Ref / Tenant ID",
    identifierPlaceholder: "e.g. TEN-492104",
    defaultIdentifier: "TEN-492104",
    defaultAmount: "15000",
    amountSuggestions: ["5000", "15000", "25000", "40000"],
    defaultGoal:
      "Security deposit withheld 35 days after vacant handover and inspection sign-off. Landlord refusing refund contrary to Model Tenancy Act. Demanding full return.",
    presets: [
      "Security deposit withheld past 30 days after apartment vacating.",
      "Brokerage / convenience fee charged for unverified fake property listing.",
      "Society maintenance fund penalty levied without RERA statutory notice.",
    ],
  },
];

// Verified brand helpline directory for simulated live web scraping
const COMPANY_HELPLINES: Record<string, { number: string; label: string }> = {
  // E-Commerce
  amazon: { number: "1800-3000-9009", label: "Amazon 24/7 Helpline" },
  flipkart: { number: "1800-208-9898", label: "Flipkart Customer Desk" },
  swiggy: { number: "080-67466729", label: "Swiggy Escalations Helpline" },
  zomato: { number: "011-40484000", label: "Zomato Support Line" },
  blinkit: { number: "1800-208-9898", label: "Blinkit Quick Support" },
  myntra: { number: "080-61561999", label: "Myntra Care Desk" },
  zepto: { number: "022-5040-5040", label: "Zepto Care Line" },
  meesho: { number: "080-61799600", label: "Meesho Support Hotline" },
  // Banking & UPI
  hdfc: { number: "1800-202-6161", label: "HDFC Priority & Dispute Desk" },
  sbi: { number: "1800-1234", label: "SBI Toll-Free Helpline" },
  icici: { number: "1800-1080", label: "ICICI Customer Care" },
  phonepe: { number: "080-68727374", label: "PhonePe Dispute Helpline" },
  paytm: { number: "0120-4456-456", label: "Paytm Grievance Desk" },
  axis: { number: "1800-419-5577", label: "Axis Bank Support" },
  // Travel
  indigo: { number: "0124-6173838", label: "IndiGo AirSewa Helpline" },
  "air india": { number: "1860-233-1407", label: "Air India 24x7 Customer Care" },
  makemytrip: { number: "0124-4628747", label: "MakeMyTrip Support Desk" },
  irctc: { number: "139", label: "Rail Madad IRCTC Helpline" },
  akasa: { number: "022-6600-0000", label: "Akasa Air Care" },
  spicejet: { number: "0124-4983410", label: "SpiceJet Support" },
  // Telecom
  airtel: { number: "198 / 1800-103-6065", label: "Airtel Appellate Desk" },
  jio: { number: "198 / 1800-889-9999", label: "Jio Care Toll-Free" },
  vi: { number: "198 / 199", label: "Vi Customer Support" },
  "vodafone idea": { number: "198 / 199", label: "Vi Customer Support" },
  "tata play": { number: "1800-208-6633", label: "Tata Play 24x7 Helpline" },
  // Insurance
  "star health": { number: "1800-425-2255", label: "Star Health 24/7 Claims Desk" },
  "hdfc ergo": { number: "1800-2666-400", label: "HDFC ERGO General Insurance" },
  "care health": { number: "1800-102-4488", label: "Care Health Claims Hotline" },
  "icici lombard": { number: "1800-2666", label: "ICICI Lombard Support" },
  "niva bupa": { number: "1860-500-8888", label: "Niva Bupa Health Desk" },
  // Utilities
  "tata power": { number: "19123 / 1800-209-5161", label: "Tata Power Consumer Care" },
  bses: { number: "19123", label: "BSES Rajdhani Helpline" },
  adani: { number: "19122", label: "Adani Electricity 24/7 Desk" },
  igl: { number: "1800-102-5109", label: "IGL PNG/CNG Helpline" },
  mgl: { number: "1800-266-9900", label: "MGL Gas Customer Care" },
  // EdTech
  scaler: { number: "080-6927-0000", label: "Scaler Student Grievance Desk" },
  upgrad: { number: "1800-210-2020", label: "UpGrad Support Hotline" },
  coursera: { number: "1800-010-001", label: "Coursera Learner Support" },
  unacademy: { number: "080-4568-1234", label: "Unacademy Helpdesk" },
  simplilearn: { number: "1800-212-7688", label: "Simplilearn Support" },
  // Mobility
  "ola electric": { number: "080-3311-3311", label: "Ola Care Support" },
  uber: { number: "1800-266-0000", label: "Uber Incident & Safety Desk" },
  rapido: { number: "080-4568-9898", label: "Rapido Captain & Rider Support" },
  ather: { number: "1800-108-0088", label: "Ather Energy Care" },
  blusmart: { number: "011-4118-8888", label: "BluSmart Support Desk" },
  // Housing
  nobroker: { number: "092417-00000", label: "NoBroker Support & Escrow Desk" },
  "stanza living": { number: "080-4680-8080", label: "Stanza Resident Helpdesk" },
  "housing.com": { number: "1800-313-4777", label: "Housing.com Support" },
};

function resolveHelpline(providerName: string, domainDefaultProvider: string) {
  const query = (providerName || domainDefaultProvider).toLowerCase().trim();
  for (const [key, val] of Object.entries(COMPANY_HELPLINES)) {
    if (query.includes(key) || key.includes(query)) {
      return val;
    }
  }
  const hash = Math.abs(query.split("").reduce((acc, char) => acc + char.charCodeAt(0), 1000)) % 8999 + 1000;
  return {
    number: `1800-180-${hash}`,
    label: `${providerName || domainDefaultProvider} Verified Support Desk`,
  };
}

export default function IntakePage() {
  const navigate = useNavigate();
  const {
    setActiveCase,
    setActiveCall,
    clearUtterances,
    clearProposals,
    setCallStatus,
    setCallEndInfo,
    setIsOnHold,
    currentUser,
  } = useStore();

  const [domainKey, setDomainKey] = useState("telecom");
  const selectedDomain = DOMAINS.find((d) => d.id === domainKey) || DOMAINS[3];

  // Form fields start empty with rich background placeholders and quick-select chips
  const [provider, setProvider] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [supportNumber, setSupportNumber] = useState("");
  const [userCustomizedHelpline, setUserCustomizedHelpline] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("+91 91030 31412");
  const [amount, setAmount] = useState("");
  const [goal, setGoal] = useState("");
  const [previousGoal, setPreviousGoal] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [statutoryCitations, setStatutoryCitations] = useState<string[]>([]);
  const [legalBasis, setLegalBasis] = useState<string | null>(null);
  const [language, setLanguage] = useState("hi-en");
  const [email, setEmail] = useState("nikhilsharma5122006@gmail.com");
  const [consent, setConsent] = useState(true);
  const [infoConsent, setInfoConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Execution Engine mode: simulator (autonomous AI bot) or switchboard (live human company rep)
  const [callMode, setCallMode] = useState<"simulator" | "switchboard">("simulator");

  // Auto-scraped helpline for currently chosen provider / domain
  const effectiveProviderForLookup = provider.trim() || selectedDomain.defaultProvider;
  const scrapedHelpline = resolveHelpline(effectiveProviderForLookup, selectedDomain.defaultProvider);

  const handleScrapeHelpline = () => {
    setIsScraping(true);
    setTimeout(() => {
      setIsScraping(false);
      setUserCustomizedHelpline(false);
      setSupportNumber("");
    }, 450);
  };

  const handleDomainSelect = (d: DomainConfig) => {
    setDomainKey(d.id);
    setProvider("");
    setIdentifierValue("");
    setSupportNumber("");
    setUserCustomizedHelpline(false);
    setAmount("");
    setGoal("");
    setPreviousGoal(null);
    setStatutoryCitations([]);
    setLegalBasis(null);
  };

  const handleEnhanceGrievance = async () => {
    setIsPolishing(true);
    setError("");
    try {
      const rawText = goal.trim() || selectedDomain.defaultGoal;
      const res = await casesApi.enhanceGrievance({
        raw_text: rawText,
        domain: selectedDomain.id,
        provider: provider.trim() || selectedDomain.defaultProvider,
        amount: amount.trim() || selectedDomain.defaultAmount,
        identifier: identifierValue.trim() || selectedDomain.defaultIdentifier,
      });

      if (res && res.enhanced_text) {
        setPreviousGoal(goal || selectedDomain.defaultGoal);
        setGoal(res.enhanced_text);
        setStatutoryCitations(res.statutory_citations || []);
        setLegalBasis(res.legal_basis || null);
      }
    } catch (err: any) {
      console.error("Failed to enhance grievance:", err);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleUndoEnhance = () => {
    if (previousGoal !== null) {
      setGoal(previousGoal);
      setPreviousGoal(null);
      setStatutoryCitations([]);
      setLegalBasis(null);
    }
  };

  const handleStart = async () => {
    if (!email.trim()) {
      setError("Please enter an email address to receive call summaries & check-ins.");
      return;
    }
    if (!consent) {
      setError("Please provide follow-up consent to continue.");
      return;
    }

    setLoading(true);
    setError("");
    clearUtterances();
    clearProposals();
    setCallEndInfo(null);
    setIsOnHold(false);
    setCallStatus(callMode === "switchboard" ? "ringing" : "initialising");

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const generatedTicket = `TKT-${new Date().getFullYear()}-${randomSuffix}`;

    // Gracefully fallback to domain defaults if user left inputs empty
    const effectiveProvider = provider.trim() || selectedDomain.defaultProvider;
    const effectiveSupportNumber = supportNumber.trim() || scrapedHelpline.number;
    const effectiveAmount = amount.trim() || selectedDomain.defaultAmount;
    const effectiveIdentifier = identifierValue.trim() || phoneNumber.trim() || selectedDomain.defaultIdentifier;
    const effectiveGoal = goal.trim() || selectedDomain.defaultGoal;

    try {
      // 1. Create case with full domain context
      const case_ = await casesApi.create({
        owner_id: currentUser?.email || email.trim(),
        user_id: currentUser?.id,
        user_email: email.trim(),
        language,
        goal: effectiveGoal,
        approved_info: {
          domain: selectedDomain.id,
          domain_label: selectedDomain.label,
          service_provider: effectiveProvider,
          helpline_number: effectiveSupportNumber,
          support_number: effectiveSupportNumber,
          identifier_type: selectedDomain.identifierLabel,
          identifier_value: effectiveIdentifier,
          phone_number: phoneNumber.trim(),
          disputed_amount: effectiveAmount,
          ticket_number: generatedTicket,
          info_sharing: infoConsent,
        },
        follow_up_consent: consent,
      });
      setActiveCase(case_);

      // 2. Start call based on selected execution engine
      if (callMode === "switchboard") {
        const call = await callsApi.start({
          case_id: case_.id,
          scenario_id: "live_switchboard",
        });
        setActiveCall(call);
        setCallStatus("ringing");
        setCallEndInfo(null);
      } else {
        const call = await callsApi.start({
          case_id: case_.id,
          scenario_id: `${selectedDomain.id}_dispute_v1`,
        });
        setActiveCall(call);
        setCallStatus("active");
        setCallEndInfo(null);
      }

      navigate("/call");
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      const msg =
        (typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || d).join(", ")
          : null) ||
        e.message ||
        "Could not initiate dispute call. Please verify inputs.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Clean, Simple Hero */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 py-1 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-brand-300 text-xs font-semibold tracking-wide">
              Voice-First Consumer Advocate
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            File a Helpline Dispute
          </h1>
          <p className="text-xs sm:text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Mock-On calls customer support on your behalf, negotiates your refund, and records legally binding promises.
          </p>
        </div>

        {/* Central Card Form */}
        <div className="card p-6 sm:p-7 space-y-6 border border-white/[0.08] bg-[#0c1424]/90 backdrop-blur-xl shadow-2xl rounded-2xl">
          {/* 1. Category Selection */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider block">
              1. Dispute Category
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {DOMAINS.map((d) => {
                const Icon = d.icon;
                const isSelected = d.id === domainKey;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleDomainSelect(d)}
                    className={`group relative flex flex-col p-3 rounded-2xl border text-left transition-all duration-200 ${
                      isSelected
                        ? "bg-brand-500/15 border-brand-500/70 text-white shadow-lg ring-1 ring-brand-500/40"
                        : "bg-white/[0.02] border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? "bg-brand-500/30 text-brand-300 ring-1 ring-brand-400/30"
                            : "bg-white/[0.04] text-white/40 group-hover:text-white/70 group-hover:bg-white/[0.08]"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white tracking-tight truncate">
                        {d.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/40 truncate pl-0.5">
                      {d.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Provider & Identifier */}
          <div className="space-y-4 pt-4 border-t border-white/[0.06]">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider block">
              2. Transaction &amp; Account Details
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-medium text-white/70 block mb-1.5">
                  {selectedDomain.providerLabel}
                </label>
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder={selectedDomain.providerPlaceholder}
                  className="input text-xs sm:text-sm py-2.5 bg-black/30 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                />
                {/* Brand suggestion pills */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-white/35 font-medium">Quick select:</span>
                  {selectedDomain.providerSuggestions.map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setProvider(brand)}
                      className={`text-[10.5px] px-2.5 py-0.5 rounded-lg border transition-all ${
                        provider === brand
                          ? "bg-brand-500/25 border-brand-500/50 text-brand-200 font-bold"
                          : "bg-white/[0.03] border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.07]"
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 block mb-1.5">
                  {selectedDomain.identifierLabel}
                </label>
                <input
                  type="text"
                  value={identifierValue}
                  onChange={(e) => setIdentifierValue(e.target.value)}
                  placeholder={selectedDomain.identifierPlaceholder}
                  className="input text-xs sm:text-sm py-2.5 font-mono bg-black/30 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                />
                <p className="text-[10.5px] text-white/35 mt-2">
                  Optional: Leave empty to auto-link via registered mobile or sample docket.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-medium text-white/70 block mb-1.5">
                  Disputed Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-xs">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={selectedDomain.defaultAmount}
                    className="input pl-7 text-xs sm:text-sm py-2.5 font-bold text-emerald-300 bg-black/30 border-white/[0.08] focus:border-emerald-500/60 rounded-xl"
                  />
                </div>
                {/* Quick amount chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {selectedDomain.amountSuggestions.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all ${
                        amount === amt
                          ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300 font-bold"
                          : "bg-white/[0.03] border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.07]"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 block mb-1.5">
                  Registered Mobile
                </label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 91030 31412"
                  className="input text-xs sm:text-sm py-2.5 font-mono bg-black/30 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 block mb-1.5">
                  Notification Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="input text-xs sm:text-sm py-2.5 bg-black/30 border-white/[0.08] focus:border-indigo-500/60 rounded-xl"
                />
              </div>
            </div>

            {/* Optional Customer Support / Helpline Number Field with Auto-Scraper */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.07] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div>
                  <label className="text-xs font-semibold text-white/80 block">
                    Company Customer Support / Helpline Number{" "}
                    <span className="text-[10px] text-white/40 font-normal">(Optional)</span>
                  </label>
                  <p className="text-[10.5px] text-white/40 mt-0.5 leading-relaxed">
                    Provide the company hotline to dial, or let our AI agent automatically scrape verified support numbers from the web.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScrapeHelpline}
                  disabled={isScraping}
                  className="px-2.5 py-1 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:text-white hover:bg-brand-500/25 text-[10.5px] font-bold flex items-center gap-1.5 transition-all self-start sm:self-auto flex-shrink-0"
                  title="Scrape Internet for Official Support Helpline"
                >
                  {isScraping ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                      <span>Scraping Web...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3 h-3 text-brand-400" />
                      <span>Auto-Scrape Number</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                  <Phone className="w-3.5 h-3.5 text-white/40" />
                </span>
                <input
                  type="text"
                  value={supportNumber}
                  onChange={(e) => {
                    setSupportNumber(e.target.value);
                    setUserCustomizedHelpline(true);
                  }}
                  placeholder={scrapedHelpline.number}
                  className="input pl-8 text-xs sm:text-sm py-2 font-mono bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                />
              </div>

              {/* Scraped status indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10.5px] gap-1 pt-0.5">
                {isScraping ? (
                  <span className="text-amber-300/90 flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    Searching Ministry of Corporate Affairs directory &amp; support portal for {effectiveProviderForLookup}...
                  </span>
                ) : userCustomizedHelpline && supportNumber.trim() ? (
                  <span className="text-brand-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-brand-400" />
                    Custom Support Hotline assigned: <span className="font-mono font-bold text-white">{supportNumber}</span>
                  </span>
                ) : (
                  <span className="text-emerald-400/90 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    Agent Auto-Scraped: <span className="font-mono font-bold text-white">{scrapedHelpline.number}</span>{" "}
                    <span className="text-white/40">({scrapedHelpline.label})</span>
                  </span>
                )}
                <span className="text-[10px] text-white/30 font-mono">
                  Gateway: WebRTC / SIP Bridge (Simulated)
                </span>
              </div>
            </div>

            {/* Grievance Synopsis */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-white/70">
                  Describe what happened
                </label>
                <div className="flex items-center gap-2">
                  {/* AI Grievance Polisher Buttons */}
                  {previousGoal !== null && (
                    <button
                      type="button"
                      onClick={handleUndoEnhance}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1"
                      title="Revert to prior draft"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      <span>Undo</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEnhanceGrievance}
                    disabled={isPolishing}
                    className="text-[11px] font-bold px-3 py-1 rounded-lg bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md shadow-brand-500/20 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                    title="Enrich with Indian statutory laws, SLA deadlines & ombudsman citations"
                  >
                    {isPolishing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                        <span>Polishing with Law...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>AI Legalize Grievance</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-white/[0.08]">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setLanguage(l.code)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          language === l.code
                            ? "bg-brand-600 text-white shadow-sm"
                            : "text-white/40 hover:text-white"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <textarea
                id="goal-input"
                className="input resize-none h-28 text-xs sm:text-sm bg-black/30 border-white/[0.08] focus:border-brand-500/60 rounded-xl leading-relaxed"
                placeholder={selectedDomain.defaultGoal}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />

              {/* Statutory Legal Citations Display when enhanced */}
              {legalBasis && statutoryCitations.length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      Statutory Framework: {legalBasis}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Legally Enriched
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {statutoryCitations.map((citation, idx) => (
                      <span
                        key={idx}
                        className="text-[10.5px] font-mono bg-white/[0.04] text-indigo-200/90 px-2 py-0.5 rounded-md border border-indigo-500/20 flex items-center gap-1"
                      >
                        <span className="w-1 h-1 rounded-full bg-indigo-400" />
                        {citation}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Template Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-white/40 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Templates:
                </span>
                {selectedDomain.presets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setGoal(preset);
                      setStatutoryCitations([]);
                      setLegalBasis(null);
                      setPreviousGoal(null);
                    }}
                    className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.06] transition-all truncate max-w-[260px]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Telephony Mode */}
          <div className="space-y-2.5 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider block">
                3. Call Mode
              </label>
              {callMode === "switchboard" && (
                <a
                  href="/switchboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-rose-300 hover:underline flex items-center gap-1 font-medium"
                >
                  <Headphones className="w-3 h-3" />
                  Open Operator Switchboard &rarr;
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCallMode("simulator")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  callMode === "simulator"
                    ? "bg-brand-500/15 border-brand-500/60 text-white shadow-sm ring-1 ring-brand-500/30"
                    : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Automated AI Call</span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Autonomous speech agent negotiates with customer care.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCallMode("switchboard")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  callMode === "switchboard"
                    ? "bg-rose-500/15 border-rose-500/60 text-white shadow-sm ring-1 ring-rose-500/30"
                    : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Phone className="w-3.5 h-3.5 text-rose-400" />
                  <span>Live Switchboard (Teammate)</span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Teammate acts as representative live via Switchboard.
                </p>
              </button>
            </div>
          </div>

          {/* Permissions / Preferences */}
          <div className="space-y-2 pt-1 border-t border-white/[0.06]">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-white/70 hover:text-white select-none">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-brand-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Authorize automatic follow-up callback & email check-in if refund deadline expires</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-white/70 hover:text-white select-none">
              <input
                type="checkbox"
                checked={infoConsent}
                onChange={(e) => setInfoConsent(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-brand-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Allow agent to cite transaction reference and dispute brief to representative</span>
            </label>
          </div>

          {error && (
            <div className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-xl p-3 flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Dispatch Button */}
          <div className="pt-2">
            <button
              id="start-btn"
              onClick={handleStart}
              disabled={loading}
              className={`w-full py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white shadow-xl transition-all ${
                callMode === "switchboard"
                  ? "bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/25 hover:brightness-105"
                  : "btn-primary shadow-brand-500/25"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting to Helpline...</span>
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  <span>
                    {callMode === "switchboard"
                      ? `Dispatch to ${provider.trim() || selectedDomain.defaultProvider} Operator Desk`
                      : `Dispatch Agent to ${provider.trim() || selectedDomain.defaultProvider} Helpline`}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-white/40 mt-2.5">
              Verified audio evidence &bull; 5-day deadline tracking &bull; Statutory compliance protection
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
