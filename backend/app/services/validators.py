"""
Deterministic validators — schema checks, quote verification, date/amount parsing.
These run BEFORE any promise reaches the user confirmation step.
"""
import re
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import pytz

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")

# Indian public holidays (simplified list for demo — extend as needed)
_HOLIDAYS_2026 = {
    datetime(2026, 1, 26),  # Republic Day
    datetime(2026, 3, 25),  # Holi
    datetime(2026, 4, 14),  # Ambedkar Jayanti
    datetime(2026, 8, 15),  # Independence Day
    datetime(2026, 10, 2),  # Gandhi Jayanti
    datetime(2026, 11, 1),  # Diwali (approx)
}

# Hindi + English number words to integer mapping
_NUMBER_WORDS: dict[str, int] = {
    "ek": 1, "do": 2, "teen": 3, "tin": 3, "char": 4, "paanch": 5, "chhe": 6,
    "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "fifteen": 15,
    "twenty": 20, "thirty": 30,
}


class ValidationResult:
    def __init__(self, ok: bool, field: str, reason: str = "", value: Any = None):
        self.ok = ok
        self.field = field
        self.reason = reason
        self.value = value

    def __repr__(self):
        return f"ValidationResult(ok={self.ok}, field={self.field!r}, reason={self.reason!r})"


class PromiseValidator:
    """
    Runs deterministic checks on a Sarvam-extracted promise candidate.
    All checks must pass before the promise is shown for user confirmation.
    """

    def validate(self, candidate: dict, recent_turns: list[dict]) -> list[ValidationResult]:
        """Run all validations; return list of results."""
        results = []
        results.append(self._check_schema(candidate))
        results.append(self._check_quote_in_turns(candidate, recent_turns))
        results.append(self._check_speaker_role(candidate))
        results.append(self._check_not_statement(candidate))
        results.append(self._check_amount(candidate))
        date_result = self._check_date(candidate)
        results.append(date_result)
        return results

    def all_pass(self, results: list[ValidationResult]) -> bool:
        return all(r.ok for r in results)

    def blocking_failures(self, results: list[ValidationResult]) -> list[ValidationResult]:
        return [r for r in results if not r.ok]

    # --- Individual checks ---

    def _check_schema(self, c: dict) -> ValidationResult:
        required = ["quote", "speaker", "commitment_type"]
        for field in required:
            if not c.get(field):
                return ValidationResult(False, "schema", f"Missing required field: {field}")
        valid_types = {"refund", "correction", "callback", "technician_visit", "update", "statement"}
        if c["commitment_type"] not in valid_types:
            return ValidationResult(False, "commitment_type", f"Unknown type: {c['commitment_type']}")
        return ValidationResult(True, "schema")

    def _check_quote_in_turns(self, c: dict, turns: list[dict]) -> ValidationResult:
        """
        The quoted text must appear (or be very close) in one of the recent turns.
        First tries exact substring match, then fuzzy word overlap.
        """
        quote = c.get("quote", "").lower().strip()
        if not quote:
            return ValidationResult(False, "quote", "Empty quote")

        all_text = " ".join(
            (t.get("normalised_text") or t.get("raw_text", "")).lower()
            for t in turns
        )

        # Exact substring
        if quote in all_text:
            return ValidationResult(True, "quote", value=quote)

        # Word overlap ≥ 70%
        q_words = set(quote.split())
        overlap = sum(1 for w in q_words if w in all_text)
        ratio = overlap / max(len(q_words), 1)
        if ratio >= 0.70:
            return ValidationResult(True, "quote", f"Fuzzy match {ratio:.0%}", value=quote)

        return ValidationResult(False, "quote", f"Quote not found in transcript (overlap {ratio:.0%})")

    def _check_speaker_role(self, c: dict) -> ValidationResult:
        valid_roles = {"agent", "user", "ivr", "system"}
        role = c.get("speaker", "")
        if role not in valid_roles:
            return ValidationResult(False, "speaker", f"Invalid role: {role}")
        return ValidationResult(True, "speaker", value=role)

    def _check_not_statement(self, c: dict) -> ValidationResult:
        """
        Vague non-committal phrases or explicit refusals must never be filed as actionable promises.
        """
        refusal_phrases = [
            "no refund", "cannot refund", "can't refund", "refuse", "not possible",
            "refund nahi", "nahi hoga", "policy does not allow", "unable to process refund",
            "denied", "not approved", "no compensation", "nothing can be done",
            "nahi milega", "reject", "rejected", "cannot waive", "won't refund",
            "not eligible", "cannot assist", "cannot promise",
        ]
        vague_phrases = [
            "we will look into it", "will investigate", "will check",
            "hum dekhenge", "check karenge", "pata karenge",
        ]
        quote_lower = c.get("quote", "").lower()
        commitment_type = c.get("commitment_type", "")

        is_refusal = any(p in quote_lower for p in refusal_phrases)
        if is_refusal:
            return ValidationResult(
                False, "commitment_type",
                "Explicit refusal or denial by representative is not a promise."
            )

        is_vague = any(p in quote_lower for p in vague_phrases)
        if is_vague and commitment_type != "statement":
            return ValidationResult(
                False, "commitment_type",
                "Vague phrase must be filed as 'statement', not an actionable promise"
            )
        return ValidationResult(True, "commitment_type")

    def _check_amount(self, c: dict) -> ValidationResult:
        amount = c.get("amount")
        if amount is None:
            return ValidationResult(True, "amount", "No amount — OK")
        try:
            d = Decimal(str(amount))
            if d <= 0:
                return ValidationResult(False, "amount", f"Amount must be positive, got {d}")
            if d > Decimal("1000000"):
                return ValidationResult(False, "amount", f"Implausibly large amount: {d}")
            return ValidationResult(True, "amount", value=d)
        except InvalidOperation:
            return ValidationResult(False, "amount", f"Cannot parse amount: {amount}")

    def _check_date(self, c: dict) -> ValidationResult:
        raw = c.get("raw_date_phrase")
        if not raw:
            return ValidationResult(True, "date", "No date — OK")
        parsed = parse_date_phrase(raw)
        if parsed is None:
            return ValidationResult(
                False, "date",
                f"Could not parse date phrase: '{raw}' — needs user confirmation"
            )
        return ValidationResult(True, "date", value=parsed)


def parse_date_phrase(phrase: str, ref_date: datetime | None = None) -> datetime | None:
    """
    Parse Hindi/English date expressions → datetime in Asia/Kolkata.
    Returns None if unclear (caller should ask user to confirm).
    """
    if ref_date is None:
        ref_date = datetime.now(IST)

    p = phrase.lower().strip()

    # Absolute patterns: DD/MM, DD-MM-YYYY, etc.
    abs_match = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", p)
    if abs_match:
        day, month = int(abs_match.group(1)), int(abs_match.group(2))
        year = int(abs_match.group(3)) if abs_match.group(3) else ref_date.year
        if year < 100:
            year += 2000
        try:
            return IST.localize(datetime(year, month, day))
        except ValueError:
            pass

    # Relative: "N working days" / "N calendar days"
    # Match number word or digit
    num = _extract_number(p)
    if num is not None:
        if "hour" in p or "ghante" in p or "ghanta" in p:
            return ref_date + timedelta(hours=num)
        if "working" in p or "business" in p or "kaam" in p:
            return _add_working_days(ref_date, num)
        if "day" in p or "din" in p:
            return ref_date + timedelta(days=num)
        if "week" in p or "hafta" in p or "hafte" in p:
            return ref_date + timedelta(weeks=num)

    # Named: "tomorrow" / "kal"
    if "tomorrow" in p or p.strip() == "kal":
        return ref_date + timedelta(days=1)
    if "today" in p or p.strip() == "aaj":
        return ref_date

    return None  # Unknown — needs user confirmation


def _extract_number(text: str) -> int | None:
    """Extract a number (digit or word) from text."""
    # Try digit first
    digit = re.search(r"\b(\d+)\b", text)
    if digit:
        return int(digit.group(1))
    # Try word
    for word, val in _NUMBER_WORDS.items():
        if re.search(rf"\b{word}\b", text):
            return val
    return None


def _add_working_days(start: datetime, days: int) -> datetime:
    """Add N working days (Mon–Fri, excluding holidays)."""
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5 and current.replace(tzinfo=None).date() not in {
            h.date() for h in _HOLIDAYS_2026
        }:
            added += 1
    return current


# Singleton
validator = PromiseValidator()
