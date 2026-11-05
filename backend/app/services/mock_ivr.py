"""
Mock IVR Engine — drives the interactive IVR call for any consumer domain.
Supports: E-Commerce, Banking/FinTech, Airlines/Travel, Telecom/DTH, Insurance, and Utilities.
Dynamically customizes IVR menus, hold segments, and agent dialogues using the user's case info.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

SCENARIOS_DIR = Path(__file__).parent.parent.parent / "scenarios"


def detect_domain(provider: str, goal: str, explicit_domain: str | None = None) -> str:
    """Intelligently detect consumer dispute domain from provider and goal."""
    if explicit_domain and explicit_domain.lower() in (
        "ecommerce", "banking", "travel", "telecom", "insurance", "utilities", "edtech", "mobility", "housing", "other"
    ):
        return explicit_domain.lower()

    text = f"{provider} {goal}".lower()
    if any(k in text for k in [
        "scaler", "upgrad", "coursera", "unacademy", "simplilearn", "course", "batch",
        "edtech", "student", "tuition", "coaching", "curriculum", "cooling-off", "placement", "fee refund"
    ]):
        return "edtech"
    if any(k in text for k in [
        "uber", "ola", "rapido", "blusmart", "ather", "cab", "ride", "trip", "crn",
        "driver", "ev", "scooter", "mobility", "toll"
    ]):
        return "mobility"
    if any(k in text for k in [
        "nobroker", "stanza", "housing.com", "nestaway", "tenant", "landlord", "pg",
        "deposit", "security deposit", "rent", "agreement", "brokerage", "society", "maintenance"
    ]):
        return "housing"
    if any(k in text for k in [
        "tata power", "bses", "adani electricity", "igl", "mgl", "electricity", "gas",
        "discom", "meter", "reading", "bill revision", "power", "utility", "ca-"
    ]):
        return "utilities"
    if any(k in text for k in [
        "amazon", "flipkart", "myntra", "swiggy", "zomato", "blinkit", "zepto",
        "meesho", "nykaa", "order", "delivery", "product", "item", "parcel", "return", "courier"
    ]):
        return "ecommerce"
    if any(k in text for k in [
        "hdfc", "sbi", "icici", "axis", "paytm", "phonepe", "gpay", "google pay",
        "cred", "bank", "upi", "card", "account", "transfer", "neft", "imps", "debit", "credit"
    ]):
        return "banking"
    if any(k in text for k in [
        "indigo", "air india", "spicejet", "makemytrip", "easemytrip", "irctc",
        "flight", "ticket", "pnr", "airline", "boarding", "hotel", "travel", "cancellation"
    ]):
        return "travel"
    if any(k in text for k in [
        "star health", "care health", "policybazaar", "insurance", "policy", "claim",
        "ergo", "lic", "cashless", "mediclaim", "tpa"
    ]):
        return "insurance"
    if any(k in text for k in [
        "jio", "airtel", "vi", "bsnl", "telecom", "broadband", "recharge", "fiber", "sim", "vas"
    ]):
        return "telecom"
    return "other"


class MockIVREngine:
    """
    State machine that drives the simulated customer care IVR call.
    States: greeting → menu → hold → agent → end
    """

    def __init__(self, scenario_id: str):
        self.scenario_id = scenario_id
        self.scenario: dict = {}
        self.state: str = "init"
        self.menu_position: str = "root"
        self.agent_turn_index: int = 0
        self._load_scenario()

    def customize_for_case(self, case):
        """
        Dynamically customize the scenario script and IVR menu for ANY consumer domain
        using the user's actual intake data: provider, identifier, amount, and grievance goal.
        """
        info = getattr(case, "approved_info", None) or {}
        provider = info.get("service_provider") or "Customer Care"
        phone = info.get("phone_number") or "+91 9103031412"
        clean_phone = phone.replace("+91", "").replace(" ", "").replace("-", "")

        identifier_val = (
            info.get("identifier_value")
            or info.get("order_id")
            or info.get("pnr")
            or info.get("transaction_id")
            or info.get("claim_id")
            or clean_phone
        )
        raw_amt = str(info.get("disputed_amount") or "1000")
        clean_amt = "".join(c for c in raw_amt if c.isdigit() or c == ".") or "1000"
        amount_num = float(clean_amt) if clean_amt.replace(".", "", 1).isdigit() else 1000.0

        ticket_no = info.get("ticket_number") or "TKT-2026-78432"
        explicit_domain = info.get("domain")
        goal_text = getattr(case, "goal", "") or ""
        domain = detect_domain(provider, goal_text, explicit_domain)

        # 1. Domain-specific Greeting & Menus
        if domain == "ecommerce":
            greeting = f"Namaskar, aapka swagat hai {provider} Customer Support Helpline mein. Behtar seva ke liye yeh call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Apni bhasha chunein. Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Returns aur Refund shikayat ke liye 1, Order delivery aur tracking ke liye 2, Payment sambandhit jankari ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Returns aur Refund shikayat", "next": "hold"},
                        {"key": "2", "label": "Order delivery status", "next": "hold"},
                        {"key": "3", "label": "Payment sambandhit", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Customer Support se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, maine {provider} par ek order return kiya tha, lekin mera ₹{clean_amt} ka refund abhi tak mere bank account mein nahi aaya hai.",
                    "intent": "refund_dispute",
                },
                {
                    "role": "agent",
                    "text": "Ji zaroor, main aapki poori madad karoongi. Kya aap apna registered mobile number ya Order ID bata sakte hain?",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Haan, mera reference number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Theek hai, maine aapka order {identifier_val} verify kiya. Item warehouse pahunch chuka hai aur ₹{clean_amt} ka refund approval pending dikh raha tha jo clear kar diya gaya hai.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, mujhe mera poora ₹{clean_amt} refund turant release chahiye.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine aapki refund grievance register kar di hai. Aapka ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke original payment account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Bilkul, ticket {ticket_no} confirmed hai. Aapko email aur SMS par poora confirmation update milega. Koi aur sahayata?",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Nahi, bas itna hi. Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} Customer Care mein call karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        elif domain == "banking":
            greeting = f"Namaskar, aapka swagat hai {provider} Helpline aur Dispute Resolution desk mein. Suraksha aur gunwatta ke liye call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Bhasha chunav ke liye Hindi ke liye 1, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "UPI aur Transaction dispute ke liye 1, Credit Card charges ke liye 2, Account services ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "UPI aur Transaction dispute", "next": "hold"},
                        {"key": "2", "label": "Credit Card charges", "next": "hold"},
                        {"key": "3", "label": "Account services", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Priority Support desk se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, mere account se ₹{clean_amt} cut gaye the transaction fail hone ke baad bhi, aur reversal abhi tak nahi aaya.",
                    "intent": "transaction_dispute",
                },
                {
                    "role": "agent",
                    "text": "Ji, main transaction check kar leti hoon. Kripya apna registered number ya transaction reference bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Haan, mera reference number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Maine check kiya. Reference {identifier_val} mein technical timeout ki wajah se debit hua tha. System ne settlement hold kiya hua tha.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Haan wahi, yeh amount turant mere bank account mein reverse hona chahiye.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine dispute request raise kar di hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Ticket {ticket_no} registered ho gaya hai. Aapko bank ki taraf se automated SMS aur email summary milegi.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Theek hai. Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} Helpline mein sampark karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        elif domain == "travel":
            greeting = f"Namaskar, aapka swagat hai {provider} Customer Care aur Booking Assistance mein. Yeh call prashikshan ke liye record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Bhasha ke liye Hindi ke liye 1, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Ticket cancellation refund ke liye 1, Rescheduling ke liye 2, Baggage claim ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Ticket cancellation refund", "next": "hold"},
                        {"key": "2", "label": "Rescheduling", "next": "hold"},
                        {"key": "3", "label": "Baggage claim", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Reservation Support se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, maine booking cancel ki thi lekin mera ₹{clean_amt} ka cancellation refund abhi tak process nahi hua hai.",
                    "intent": "travel_refund",
                },
                {
                    "role": "agent",
                    "text": "Ji zaroor, kya aap apna PNR ya booking reference number bata sakte hain?",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Haan, mera PNR number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Theek hai, maine aapka PNR {identifier_val} verify kiya. Cancellation successfully recorded hai aur ₹{clean_amt} ka refund queue mein tha.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Kripya iska refund jaldi initiate karein.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine priority process trigger kar diya hai. Aapka ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke original payment source mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Bilkul, ticket {ticket_no} active hai. Aapko email aur SMS dwara notification bhej diya gaya hai.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Nahi, bas itna hi. Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} mein call karne ke liye. Shubh yatra.",
                    "farewell": True,
                },
            ]

        elif domain == "insurance":
            greeting = f"Namaskar, aapka swagat hai {provider} Claim Support aur Grievance Cell mein. Behtar seva ke liye yeh call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Reimbursement claim settlement ke liye 1, Cashless claim ke liye 2, Policy jankari ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Reimbursement claim settlement", "next": "hold"},
                        {"key": "2", "label": "Cashless claim", "next": "hold"},
                        {"key": "3", "label": "Policy jankari", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Claim Desk se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, maine reimbursement claim submit kiya tha, lekin mera ₹{clean_amt} ka settlement abhi tak pending hai.",
                    "intent": "insurance_claim",
                },
                {
                    "role": "agent",
                    "text": "Ji, main claim file check karti hoon. Kripya apna Claim ID ya Policy number bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Haan, mera Claim number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Maine check kiya. Claim ID {identifier_val} ke saare documents verify ho chuke hain aur claim audit department se approve ho gaya hai.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, toh ₹{clean_amt} kab tak transfer hoga?",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji, finance department ko release order bhej diya hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke bank account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Ticket {ticket_no} registered ho gaya hai. Aapko claim dispatch ka email aur SMS prapt hoga.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} mein call karne ke liye. Aapka swasthya shubh rahe.",
                    "farewell": True,
                },
            ]

        elif domain == "utilities":
            greeting = f"Namaskar, aapka swagat hai {provider} Consumer Grievance aur Electricity/Gas Desk mein. Seva gunwatta ke liye call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Provisional meter reading dispute ke liye 1, Fast meter test ke liye 2, Security deposit refund ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Provisional meter reading dispute", "next": "hold"},
                        {"key": "2", "label": "Fast meter testing", "next": "hold"},
                        {"key": "3", "label": "Security deposit refund", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Billing desk se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, mere account par bina meter inspection ke ₹{clean_amt} ka provisional bill excess lagaya gaya hai. Iska bill revision chahiye.",
                    "intent": "meter_dispute",
                },
                {
                    "role": "agent",
                    "text": "Ji, main account check kar leti hoon. Kripya apna Consumer Account CA number bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Mera Consumer CA number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Theek hai, maine CA number {identifier_val} verify kiya. System mein actual consumption reading verify ho gayi hai aur ₹{clean_amt} ka excess provisional charge reverse hona approve hua hai.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, toh yeh ₹{clean_amt} kab tak adjust ya refund hoga?",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine ₹{clean_amt} ka bill revision order generate kar diya hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka credit paanch kaam karne wale dinon mein aapke bill ledger account mein adjust kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Bilkul, ticket {ticket_no} confirmed hai. Revised electricity bill aapke registered email aur SMS par bhej diya gaya hai.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} Helpline mein sampark karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        elif domain == "edtech":
            greeting = f"Namaskar, aapka swagat hai {provider} Student Support Helpline aur Grievance Cell mein. Behtar seva ke liye call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Course withdrawal aur fee refund ke liye 1, Batch deferral ke liye 2, Placement support ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Course withdrawal & refund", "next": "hold"},
                        {"key": "2", "label": "Batch deferral", "next": "hold"},
                        {"key": "3", "label": "Placement support", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Academic Support Desk se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Maine 14-day statutory cooling-off period ke andar course cancel kiya tha, lekin mera ₹{clean_amt} ka course fee refund abhi tak receive nahi hua.",
                    "intent": "course_refund",
                },
                {
                    "role": "agent",
                    "text": "Ji bilkul, main admission file check karti hoon. Kripya apna Student ID ya registered mobile number bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Mera enrollment reference number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Maine check kiya. Enrollment {identifier_val} par withdrawal request 14-day window ke andar successfully mark hai, aur refund clearance pending queue mein tha.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Kripya finance team se mera ₹{clean_amt} turant release karwayein.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine immediate fee waiver aur release approve kar diya hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke original payment bank account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Ticket {ticket_no} confirmed hai. Saath hi loan auto-debit cancellation clearance bhi generate ho gaya hai.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} mein call karne ke liye. Aapke bhavishya ke liye shubhkamnayein.",
                    "farewell": True,
                },
            ]

        elif domain == "mobility":
            greeting = f"Namaskar, aapka swagat hai {provider} Rider Support aur Trip Dispute Helpline mein. Suraksha ke liye yeh call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Trip cancellation penalty dispute ke liye 1, EV warranty service ke liye 2, Route toll excess ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Cancellation penalty dispute", "next": "hold"},
                        {"key": "2", "label": "EV warranty service", "next": "hold"},
                        {"key": "3", "label": "Route toll excess", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Priority Support se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Driver ne trip par aane se refuse kar diya tha, phir bhi mere account par ₹{clean_amt} ki cancellation penalty debit kar di gayi. Iska refund chahiye.",
                    "intent": "ride_penalty",
                },
                {
                    "role": "agent",
                    "text": "Ji, main trip ride log check kar leti hoon. Kripya apna Booking ID ya CRN reference bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Mera trip CRN number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Theek hai, maine CRN {identifier_val} verify kiya. GPS telemetry check karne par verify hua ki driver pickup location par nahi aaya tha aur auto-penalty galat lag gayi thi.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, toh ₹{clean_amt} ka reversal approve karein.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine wrongful cancellation charge reverse kar diya hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke original payment source mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Ticket {ticket_no} registered ho gaya hai aur penalty waiver receipt bhej di gayi hai.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} Helpline mein call karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        elif domain == "housing":
            greeting = f"Namaskar, aapka swagat hai {provider} Tenancy Support aur Rental Dispute Desk mein. Behtar seva ke liye call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Hindi ke liye 1 dabaen, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Security deposit refund dispute ke liye 1, Tenancy agreement ke liye 2, Society maintenance ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Security deposit refund", "next": "hold"},
                        {"key": "2", "label": "Tenancy agreement", "next": "hold"},
                        {"key": "3", "label": "Maintenance charge dispute", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} Tenancy Grievance desk se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Flat vacate karne ke baad 30-day statutory notice period poora ho gaya hai, lekin mera ₹{clean_amt} ka security deposit refund abhi tak release nahi kiya gaya.",
                    "intent": "deposit_refund",
                },
                {
                    "role": "agent",
                    "text": "Ji, main lease docket check karti hoon. Kripya apna Tenant ID ya agreement reference number bataiye.",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Mera agreement reference number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Maine check kiya. Reference {identifier_val} par move-out inspection handover sign-off clear hai aur zero property damage recorded hai.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Toh phir ₹{clean_amt} ka deposit turant release karein.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji bilkul, maine escrow disbursement initiate kar di hai. Aapka grievance ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka security deposit refund aapko paanch kaam karne wale dinon mein aapke verified bank account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Ticket {ticket_no} confirmed hai. Aapko formal NOC aur disbursement receipt email kar di gayi hai.",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} Tenancy Helpdesk mein sampark karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        else:
            # Default / Telecom / Utilities / Other
            greeting = f"Namaskar, aapka swagat hai {provider} ke customer care helpline mein. Behtar seva ke liye yeh call record ki ja sakti hai."
            menu_tree = {
                "root": {
                    "prompt": "Bhasha chunav ke liye Hindi ke liye 1, English ke liye 2 dabaen.",
                    "options": [
                        {"key": "1", "label": "Hindi", "next": "main_menu"},
                        {"key": "2", "label": "English", "next": "main_menu"}
                    ]
                },
                "main_menu": {
                    "prompt": "Billing aur refund shikayat ke liye 1, Recharge dispute ke liye 2, Baaki sahayata ke liye 3 dabaen.",
                    "options": [
                        {"key": "1", "label": "Billing aur refund shikayat", "next": "hold"},
                        {"key": "2", "label": "Recharge dispute", "next": "hold"},
                        {"key": "3", "label": "Sahayata desk", "next": "hold"}
                    ]
                }
            }
            script = [
                {
                    "role": "agent",
                    "text": f"Namaskar, mera naam Priya hai. Main {provider} customer support se baat kar rahi hoon. Main aapki kaise madad kar sakti hoon?",
                    "is_greeting": True,
                },
                {
                    "role": "user",
                    "text": f"Haan, mere account par extra ₹{clean_amt} ka anchaaha charge lagaya gaya hai. Kripya iska turant refund karein.",
                    "intent": "billing_complaint",
                },
                {
                    "role": "agent",
                    "text": "Ji zaroor, main aapki poori madad karoongi. Kya aap apna registered number bata sakte hain?",
                    "request": "identifier",
                },
                {
                    "role": "user",
                    "text": f"Haan, mera registered number hai {identifier_val}.",
                    "response": "identifier",
                },
                {
                    "role": "agent",
                    "text": f"Theek hai, maine aapka number {identifier_val} check kiya. Aapke account mein ₹{clean_amt} ka vivadit charge dikh raha hai jo anjaane mein lag gaya tha.",
                    "explains": "resolution_reason",
                },
                {
                    "role": "user",
                    "text": f"Haan wahi, mujhe mera poora ₹{clean_amt} refund wapas chahiye.",
                    "dispute": True,
                },
                {
                    "role": "agent",
                    "text": f"Ji, main samajh sakti hoon. Main aapki grievance register kar rahi hoon. Aapka ticket number hai {ticket_no}. Yeh ₹{clean_amt} ka refund aapko paanch kaam karne wale dinon mein aapke account mein credit kar diya jaega.",
                    "contains_promise": True,
                    "promise_type": "refund",
                    "amount": amount_num,
                    "deadline": "paanch kaam karne wale din",
                },
                {
                    "role": "user",
                    "text": f"Theek hai, shukriya. Ticket number {ticket_no} maine note kar liya hai.",
                    "confirmation": True,
                },
                {
                    "role": "agent",
                    "text": f"Bilkul, ticket {ticket_no} registered hai. Aapko email aur SMS par poora confirmation milega. Koi aur sahayata?",
                    "closes": True,
                },
                {
                    "role": "user",
                    "text": "Nahi, bas itna hi. Dhanyawad.",
                    "ends": True,
                },
                {
                    "role": "agent",
                    "text": f"Dhanyawad {provider} mein call karne ke liye. Aapka din shubh ho.",
                    "farewell": True,
                },
            ]

        self.scenario["greeting_text"] = greeting
        self.scenario["menu_tree"] = menu_tree
        self.scenario["agent_script"] = script
        self.scenario["domain"] = domain
        logger.info(f"Customized IVR script for Domain '{domain}', Provider '{provider}', Identifier '{identifier_val}', Amount '₹{clean_amt}'")

    def _load_scenario(self):
        path = SCENARIOS_DIR / f"{self.scenario_id}.json"
        if not path.exists():
            path = SCENARIOS_DIR / "telecom_billing_v1.json"
        with open(path, encoding="utf-8") as f:
            self.scenario = json.load(f)
        logger.info(f"Loaded scenario: {self.scenario.get('name')}")

    def get_greeting_audio(self) -> str | None:
        return self.scenario.get("greeting_audio")

    def get_hold_segment(self) -> dict:
        return self.scenario.get("hold_segment", {"duration_seconds": 6, "type": "music"})

    def get_menu_tree(self) -> dict:
        return self.scenario.get("menu_tree", {})

    def get_menu_options(self, node: str = "root") -> list[dict]:
        tree = self.get_menu_tree()
        return tree.get(node, {}).get("options", [])

    def press_key(self, key: str) -> dict:
        options = self.get_menu_options(self.menu_position)
        for opt in options:
            if opt.get("key") == key:
                next_node = opt.get("next")
                if next_node == "hold":
                    self.state = "hold"
                elif next_node == "agent":
                    self.state = "agent"
                else:
                    self.menu_position = next_node or self.menu_position
                return {"pressed": key, "next_state": self.state, "option": opt}
        return {"pressed": key, "next_state": self.state, "option": None}

    def next_agent_turn(self) -> dict | None:
        script = self.scenario.get("agent_script", [])
        if self.agent_turn_index < len(script):
            turn = script[self.agent_turn_index]
            self.agent_turn_index += 1
            return turn
        return None

    def is_ended(self) -> bool:
        return self.agent_turn_index >= len(self.scenario.get("agent_script", []))

    def end_call(self):
        self.state = "end"
