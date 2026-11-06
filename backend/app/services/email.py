"""
Email notification service using Gmail SMTP (smtplib via asyncio.to_thread).
Sends post-call summaries, 5-day deadline check-in emails with 1-click action buttons,
and escalation notices.
"""
import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.user = settings.smtp_user
        self.password = settings.smtp_password
        self.sender = settings.smtp_from
        self._sent_dedup: dict[str, float] = {}

    def _is_duplicate(self, dedup_key: str, cooldown_seconds: int = 300) -> bool:
        """Check if an email with this key was already dispatched within cooldown."""
        import time
        now = time.time()
        last_sent = self._sent_dedup.get(dedup_key, 0)
        if (now - last_sent) < cooldown_seconds:
            logger.info("Email suppressed by idempotency guard: %s (sent %.1fs ago)", dedup_key, now - last_sent)
            return True
        self._sent_dedup[dedup_key] = now
        return False

    @property
    def is_configured(self) -> bool:
        return bool(self.host and self.user and self.password)

    def _send_sync(self, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
        """Synchronous SMTP sender run in background thread with automatic retries and port fallback."""
        import ssl

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.sender
        msg["To"] = to_email

        if text_body:
            msg.set_content(text_body)
            msg.add_alternative(html_body, subtype="html")
        else:
            msg.set_content(html_body, subtype="html")

        # Always try Port 465 (Direct SSL) first for sub-second delivery, fallback to 587
        ports = [465, 587] if self.port == 465 else [self.port, 465, 587]
        # Deduplicate while preserving order
        ports = list(dict.fromkeys(ports))

        last_exc = None
        for current_port in ports:
            try:
                ctx = ssl.create_default_context()
                if current_port == 465:
                    with smtplib.SMTP_SSL(self.host, 465, context=ctx, timeout=15) as server:
                        if self.user and self.password:
                            server.login(self.user, self.password)
                        server.send_message(msg)
                    return True
                else:
                    with smtplib.SMTP(self.host, 587, timeout=15) as server:
                        server.starttls(context=ctx)
                        if self.user and self.password:
                            server.login(self.user, self.password)
                        server.send_message(msg)
                    return True
            except Exception as e:
                last_exc = e
                logger.warning(f"SMTP dispatch on port {current_port} failed: {e}. Trying alternate port...")

        if last_exc:
            logger.error(f"All SMTP dispatch attempts failed: {last_exc}")
            raise last_exc
        return False

    async def _send(self, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
        """Internal helper to dispatch an HTML email via SMTP."""
        if not self.is_configured:
            logger.warning("SMTP is not configured. Email to %s skipped.", to_email)
            return False

        if not to_email:
            logger.warning("No recipient email specified.")
            return False

        try:
            await asyncio.to_thread(self._send_sync, to_email, subject, html_body, text_body)
            logger.info("Email sent successfully to %s: %s", to_email, subject)
            return True
        except Exception as e:
            logger.error("Failed to send email to %s: %s", to_email, e, exc_info=True)
            return False

    async def send_call_summary(
        self,
        to_email: str,
        case_id: str,
        provider: str,
        phone_number: str = "Registered Mobile",
        ticket_number: str = "Pending Docket",
        amount_str: str = "In Review",
        due_date_str: str = "in 3 business days",
        promises: list[dict] = None,
        identifier_label: str = "Reference",
        identifier_val: str = None,
        domain: str = "telecom",
        force: bool = False,
        call_id: Optional[str] = None,
        outcome_status: str = "RESOLVED_PROMISED",
        outcome_title: Optional[str] = None,
        executive_summary: Optional[str] = None,
        next_step: Optional[str] = None,
    ) -> bool:
        """Send post-call summary with extracted commitments, ticket details, and domain context."""
        dedup_key = f"summary:{to_email}:{case_id}:{call_id or ticket_number}"
        if not force and self._is_duplicate(dedup_key, cooldown_seconds=15):
            return True

        title_suffix = outcome_title or f"Dispute with {provider} (Ticket #{ticket_number})"
        subject = f"[Mock-On Summary] {title_suffix}"
        case_url = f"{settings.public_frontend_url}/ledger/{case_id}"

        id_disp = f"{identifier_label} ({identifier_val})" if identifier_val else f"phone number {phone_number}"
        id_detail_val = identifier_val or phone_number

        # Theme styling based on autonomous outcome
        is_resolved = (outcome_status == "RESOLVED_PROMISED")
        is_refused = (outcome_status == "REFUSED_ESCALATED")

        if is_resolved:
            header_gradient = "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
            badge_text = "Commitment Logged & Monitored"
            status_text = "Resolution Agreed by Representative"
            status_color = "#059669"
        elif is_refused:
            header_gradient = "linear-gradient(135deg, #e11d48 0%, #be123c 100%)"
            badge_text = "Statutory Refusal Recorded"
            status_text = "Refused by Representative — Escalated"
            status_color = "#e11d48"
        else:
            header_gradient = "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
            badge_text = "Call Summary & Follow-Up"
            status_text = "Call Concluded — Follow-Up Active"
            status_color = "#4f46e5"

        summary_text = executive_summary or (
            f"I represented {phone_number} on a live phone call with {provider} customer support regarding {id_disp}. "
            f"All dialogue turns have been recorded into your immutable evidence ledger."
        )

        next_action_text = next_step or (
            "Mock-On AI is tracking the resolution deadline and will automatically escalate if needed."
        )

        promises_html = ""
        if promises:
            for p in promises:
                p_amount = f"₹{p.get('amount')}" if p.get('amount') else amount_str
                p_type = p.get('type', 'Refund Commitment').replace('_', ' ').title()
                p_due = p.get('deadline_phrase') or due_date_str
                promises_html += f"""
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 14px; font-weight: 600; color: #1e293b;">{p_type}</td>
                    <td style="padding: 10px 14px; color: #059669; font-weight: 700;">{p_amount}</td>
                    <td style="padding: 10px 14px; color: #475569;">{p_due}</td>
                </tr>
                """
        elif is_resolved:
            promises_html = f"""
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #1e293b;">Disputed Charge Refund</td>
                <td style="padding: 10px 14px; color: #059669; font-weight: 700;">{amount_str}</td>
                <td style="padding: 10px 14px; color: #475569;">{due_date_str}</td>
            </tr>
            """

        table_section = ""
        if promises_html:
            table_section = f"""
            <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin: 20px 0 10px 0;">Logged Commitments</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background: #f1f5f9; text-align: left; color: #64748b;">
                  <th style="padding: 10px 14px;">Action Promised</th>
                  <th style="padding: 10px 14px;">Amount</th>
                  <th style="padding: 10px 14px;">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {promises_html}
              </tbody>
            </table>
            """

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); }}
            .header {{ background: {header_gradient}; padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); letter-spacing: 0.05em; }}
            .title {{ font-size: 22px; font-weight: 800; margin: 12px 0 6px 0; }}
            .subtitle {{ font-size: 13px; opacity: 0.9; margin: 0; }}
            .content {{ padding: 28px; }}
            .summary-box {{ background: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; font-size: 14px; color: #1e293b; line-height: 1.6; }}
            .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }}
            .card-title {{ font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 6px; letter-spacing: 0.05em; }}
            .card-val {{ font-size: 14px; font-weight: 600; color: #0f172a; }}
            .action-box {{ background: #eef2ff; border: 1px solid #c7d2fe; padding: 14px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px; color: #3730a3; line-height: 1.5; }}
            .btn {{ display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }}
            .footer {{ padding: 20px 28px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">{badge_text}</span>
              <h1 class="title">Mock-On AI Post-Call Summary</h1>
              <p class="subtitle">Direct Report from your AI Personal Assistant (Shivani)</p>
            </div>
            
            <div class="content">
              <div class="summary-box">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #4f46e5; margin-bottom: 6px; letter-spacing: 0.05em;">
                  Executive Summary &bull; Personal AI Advocate (Shivani)
                </div>
                {summary_text}
              </div>

              <div class="card">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <div>
                    <div class="card-title">Service Provider</div>
                    <div class="card-val">{provider}</div>
                  </div>
                  <div>
                    <div class="card-title">Complaint Ticket #</div>
                    <div class="card-val" style="color: #4f46e5;">{ticket_number}</div>
                  </div>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <div>
                    <div class="card-title">{identifier_label}</div>
                    <div class="card-val" style="font-family: monospace;">{id_detail_val}</div>
                  </div>
                  <div>
                    <div class="card-title">Autonomous Status</div>
                    <div class="card-val" style="color: {status_color};">{status_text}</div>
                  </div>
                </div>
              </div>

              {table_section}

              <div class="action-box">
                <strong>Next Steps:</strong> {next_action_text}
              </div>

              <div style="text-align: center; margin: 24px 0 12px 0;">
                <a href="{case_url}" class="btn">View Immutable Evidence Pack</a>
              </div>
            </div>

            <div class="footer">
              Mock-On &bull; Voice-First AI Consumer Advocate &bull; Powered by Gnani AI & Sarvam AI
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)
        return await self._send(to_email, subject, html_body)

    async def send_deadline_checkin(
        self,
        to_email: str,
        case_id: str,
        promise_id: str,
        provider: str,
        ticket_number: str = "Pending Docket",
        amount_str: str = "Disputed Refund",
        due_date_str: str = "5 days",
        domain: str = "telecom",
    ) -> bool:
        """
        Send 5-day deadline check-in email with 1-click Yes/No action buttons.
        User clicking Yes marks promise fulfilled.
        User clicking No triggers follow-up re-contact call & statutory escalation.
        """
        if self._is_duplicate(f"checkin:{promise_id}", cooldown_seconds=86400):
            return True
        subject = f"[Action Required] Did you receive your {amount_str} refund from {provider}?"
        
        # Clickable action URLs handled by backend resolution endpoint
        yes_url = f"{settings.public_backend_url}/resolution/respond?id={promise_id}&action=received"
        no_url = f"{settings.public_backend_url}/resolution/respond?id={promise_id}&action=not_received"
        case_url = f"{settings.public_frontend_url}/ledger/{case_id}"

        if domain == "ecommerce":
            next_action_text = f"Mock-On will automatically schedule an automated follow-up call with {provider} referencing your ticket number, and prepare your National Consumer Helpline (NCH - 1915) & E-Daakhil consumer petition."
        elif domain == "banking":
            next_action_text = f"Mock-On will automatically schedule an automated follow-up call with {provider} referencing your ticket number, and file your RBI Integrated Ombudsman claim with ₹100/day statutory compensation."
        elif domain == "travel":
            next_action_text = f"Mock-On will automatically schedule an automated follow-up call with {provider} referencing your PNR/ticket number, and compile your DGCA CAR / AirSewa grievance representation."
        elif domain == "insurance":
            next_action_text = f"Mock-On will automatically schedule an automated follow-up call with {provider} referencing your claim number, and compile your IRDAI Bima Bharosa Ombudsman petition."
        else:
            next_action_text = f"Mock-On will automatically schedule an automated follow-up call with {provider} referencing your ticket number, and compile your statutory escalation complaint."

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); }}
            .header {{ background: linear-gradient(135deg, #d97706 0%, #ea580c 100%); padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); letter-spacing: 0.05em; }}
            .title {{ font-size: 22px; font-weight: 800; margin: 12px 0 6px 0; }}
            .content {{ padding: 28px; }}
            .summary-box {{ background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 18px; margin-bottom: 24px; }}
            .btn-yes {{ display: inline-block; background: #16a34a; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; margin-right: 12px; margin-bottom: 8px; }}
            .btn-no {{ display: inline-block; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; margin-bottom: 8px; }}
            .footer {{ padding: 20px 28px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Deadline Check-in</span>
              <h1 class="title">Did you receive your refund?</h1>
              <p style="font-size: 13px; opacity: 0.9; margin: 0;">The promised resolution timeline of {due_date_str} has passed.</p>
            </div>
            
            <div class="content">
              <p style="font-size: 15px; line-height: 1.5; color: #1e293b; margin-top: 0;">
                Hello, <strong>{provider}</strong> previously committed to issue a refund of <strong>{amount_str}</strong> under Ticket <strong>#{ticket_number}</strong>.
              </p>

              <div class="summary-box">
                <div style="font-size: 13px; color: #92400e; margin-bottom: 6px;"><strong>Promised Resolution:</strong></div>
                <div style="font-size: 16px; color: #78350f; font-weight: 700;">
                  {amount_str} Refund &bull; Ticket #{ticket_number}
                </div>
                <div style="font-size: 12px; color: #b45309; margin-top: 4px;">
                  Deadline reached according to Mock-On Promise Ledger.
                </div>
              </div>

              <div style="text-align: center; margin: 30px 0 20px 0;">
                <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px;">
                  Has this refund credited to your account?
                </p>
                <div>
                  <a href="{yes_url}" class="btn-yes">&#10003; Yes, Received</a>
                  <a href="{no_url}" class="btn-no">&#10007; No, Not Received</a>
                </div>
              </div>

              <div style="background: #f8fafc; border-radius: 8px; padding: 14px; font-size: 12px; color: #64748b; line-height: 1.5;">
                <strong>What happens if you click No:</strong> {next_action_text}
              </div>

              <div style="text-align: center; margin-top: 20px;">
                <a href="{case_url}" style="font-size: 13px; color: #4f46e5; text-decoration: underline;">Or view full case history in Mock-On</a>
              </div>
            </div>

            <div class="footer">
              Mock-On &bull; Automated Consumer Protection &bull; Powered by Gnani AI
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)

    async def send_resolution_update(
        self,
        to_email: str,
        case_id: str,
        provider: str,
        action: str,  # 'received' or 'not_received'
        ticket_number: str = "Dispute Reference",
        force: bool = False,
    ) -> bool:
        """Send confirmation of the user's Yes/No selection."""
        if not force and self._is_duplicate(f"res_update:{to_email}:{case_id}:{action}", cooldown_seconds=300):
            return True
        case_url = f"{settings.public_frontend_url}/ledger/{case_id}"
        if action == "received":
            subject = f"[Mock-On] Case Resolved: {provider} Ticket #{ticket_number} Closed"
            msg = f"We have updated your case to <strong>Fulfilled</strong>. Thank you for using Mock-On!"
            badge = "Case Resolved"
            header_color = "linear-gradient(135deg, #10b981 0%, #059669 100%)"
        else:
            subject = f"[Mock-On] Escalation Triggered: {provider} Ticket #{ticket_number}"
            msg = f"Since your refund was not received, Mock-On has flagged this promise as <strong>Overdue</strong> and initiated an automated re-contact with {provider} and prepared the TRAI Stage 2 escalation pack."
            badge = "Escalation Initiated"
            header_color = "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; }}
            .header {{ background: {header_color}; padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); }}
            .content {{ padding: 28px; }}
            .btn {{ display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">{badge}</span>
              <h1 style="font-size: 22px; margin: 12px 0 0 0;">Status Update</h1>
            </div>
            <div class="content">
              <p style="font-size: 15px; line-height: 1.6; color: #1e293b;">{msg}</p>
              <div style="text-align: center; margin-top: 24px;">
                <a href="{case_url}" class="btn">View Updated Case in Mock-On</a>
              </div>
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)

    async def send_call_dispatched(
        self,
        to_email: str,
        case_id: str,
        provider: str,
        identifier_label: str = "Reference",
        identifier_val: str = "Account Identifier",
        amount_str: str = "Disputed Sum",
        ticket_number: str = "Pending Docket",
        goal: str = "Dispute billing charges",
        force: bool = False,
    ) -> bool:
        """Send notification when an AI Advocate call has been dispatched."""
        if not force and self._is_duplicate(f"dispatched:{to_email}:{case_id}:{ticket_number}", cooldown_seconds=300):
            return True
        subject = f"[Mock-On] Call Dispatched: AI Advocate contacting {provider} (Docket #{ticket_number})"
        case_url = f"{settings.public_frontend_url}/call"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b1120; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }}
            .header {{ background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); letter-spacing: 0.05em; }}
            .content {{ padding: 28px; }}
            .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }}
            .btn {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; }}
            .footer {{ padding: 20px 28px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Live Advocate Dispatch</span>
              <h1 style="font-size: 22px; margin: 12px 0 6px 0;">Mock-On AI Call Initiated</h1>
              <p style="font-size: 13px; opacity: 0.9; margin: 0;">Our AI Advocate has connected to {provider} regarding your grievance.</p>
            </div>
            <div class="content">
              <p style="font-size: 15px; color: #1e293b; line-height: 1.5; margin-top: 0;">
                Hello, Mock-On AI has dispatched a live telephony session with <strong>{provider} Helpline</strong> on your behalf.
              </p>
              <div class="card">
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Docket Overview</div>
                <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">{amount_str} Disputed Sum &bull; Ticket #{ticket_number}</div>
                <div style="font-size: 13px; color: #475569;"><strong>{identifier_label}:</strong> {identifier_val}</div>
                <div style="font-size: 13px; color: #475569; margin-top: 4px;"><strong>Grievance:</strong> {goal}</div>
              </div>
              <div style="text-align: center; margin: 24px 0 12px 0;">
                <a href="{case_url}" class="btn">View Live Call & Evidence Radar</a>
              </div>
            </div>
            <div class="footer">
              Mock-On &bull; Voice-First AI Consumer Protection
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)

    async def send_refusal_notice(
        self,
        to_email: str,
        case_id: str,
        provider: str,
        identifier_val: str,
        amount_str: str,
        ticket_number: str,
        rep_statement: str,
        force: bool = False,
    ) -> bool:
        """Send notification when a company representative refuses resolution, initiating escalation."""
        if not force and self._is_duplicate(f"refusal:{to_email}:{case_id}:{ticket_number}", cooldown_seconds=1800):
            return True
        subject = f"[Mock-On] Statutory Notice: {provider} Refused Settlement (Ticket #{ticket_number})"
        case_url = f"{settings.public_frontend_url}/ledger/{case_id}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b1120; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; }}
            .header {{ background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); }}
            .content {{ padding: 28px; }}
            .box {{ background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 18px; margin-bottom: 20px; }}
            .btn {{ display: inline-block; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; }}
            .footer {{ padding: 20px 28px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Statutory Violation Logged</span>
              <h1 style="font-size: 22px; margin: 12px 0 6px 0;">Representative Refusal Recorded</h1>
              <p style="font-size: 13px; opacity: 0.9; margin: 0;">Settlement denied by {provider} for Docket #{ticket_number}.</p>
            </div>
            <div class="content">
              <p style="font-size: 15px; color: #1e293b; line-height: 1.5; margin-top: 0;">
                During the live telephone advocacy session, the representative for <strong>{provider}</strong> stated:
              </p>
              <div class="box">
                <div style="font-size: 13px; font-style: italic; color: #991b1b; margin-bottom: 8px;">"{rep_statement}"</div>
                <div style="font-size: 12px; color: #7f1d1d;"><strong>Docket Reference:</strong> #{identifier_val} &bull; Disputed Sum: {amount_str}</div>
              </div>
              <div style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 14px; font-size: 13px; color: #334155; margin-bottom: 20px; line-height: 1.5;">
                <strong>Anti-Hallucination & Legal Protection:</strong> Mock-On has recorded zero promises and locked the refusal into tamper-proof evidence. Refusing provisional billing resolution without physical inspection violates statutory consumer regulations. Mock-On has compiled your Ombudsman escalation representation.
              </div>
              <div style="text-align: center; margin: 24px 0 12px 0;">
                <a href="{case_url}" class="btn">View Evidence Pack & Ombudsman Filing</a>
              </div>
            </div>
            <div class="footer">
              Mock-On &bull; Automated Statutory Consumer Protection
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)

    async def send_inconclusive_call_notice(
        self,
        to_email: str,
        case_id: str,
        provider: str,
        ticket_number: str = "Dispute Reference",
        amount_str: str = "Disputed Sum",
        reason: str = "Call disconnected midway before a resolution or refund commitment was confirmed.",
        identifier_label: str = "Reference",
        identifier_val: str = "Account Identifier",
        force: bool = False,
    ) -> bool:
        """
        Send notification when a live advocacy call ends midway without reaching any conclusion or commitment.
        Updates the user clearly with the exact reason and actionable next steps (redial or escalate).
        """
        if not force and self._is_duplicate(f"inconclusive:{to_email}:{case_id}:{ticket_number}", cooldown_seconds=600):
            return True
        subject = f"[Mock-On Notice] Call Inconclusive: Dispute with {provider} (Ticket #{ticket_number})"
        case_url = f"{settings.public_frontend_url}/ledger/{case_id}"
        redial_url = f"{settings.public_frontend_url}/"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b1120; margin: 0; padding: 24px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }}
            .header {{ background: linear-gradient(135deg, #b45309 0%, #ea580c 100%); padding: 32px 28px; color: white; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); letter-spacing: 0.05em; }}
            .title {{ font-size: 22px; font-weight: 800; margin: 12px 0 6px 0; }}
            .content {{ padding: 28px; }}
            .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }}
            .reason-box {{ background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 16px; margin-bottom: 20px; }}
            .btn-redial {{ display: inline-block; background: #ea580c; color: #ffffff !important; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; margin-right: 10px; margin-bottom: 8px; }}
            .btn-secondary {{ display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; margin-bottom: 8px; }}
            .footer {{ padding: 20px 28px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Call Inconclusive &bull; Ended Midway</span>
              <h1 class="title">No Conclusion Reached with {provider}</h1>
              <p style="font-size: 13px; opacity: 0.9; margin: 0;">The advocacy phone call was ended before any settlement or resolution could be reached.</p>
            </div>
            <div class="content">
              <p style="font-size: 15px; color: #1e293b; line-height: 1.5; margin-top: 0;">
                Hello, Mock-On AI contacted <strong>{provider} Customer Care</strong> regarding <strong>{identifier_label} ({identifier_val})</strong>. However, the call ended midway without any resolution or commitment.
              </p>

              <div class="reason-box">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #92400e; margin-bottom: 4px; letter-spacing: 0.05em;">
                  Reason for No Conclusion:
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #78350f;">
                  {reason}
                </div>
              </div>

              <div class="card">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Provider</div>
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a;">{provider}</div>
                  </div>
                  <div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Ticket #</div>
                    <div style="font-size: 14px; font-weight: 700; color: #ea580c; font-family: monospace;">{ticket_number}</div>
                  </div>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Disputed Sum</div>
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a;">{amount_str}</div>
                  </div>
                  <div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Outcome Status</div>
                    <div style="font-size: 14px; font-weight: 700; color: #d97706;">Inconclusive (0 Commitments)</div>
                  </div>
                </div>
              </div>

              <div style="background: #f8fafc; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; color: #475569; line-height: 1.6;">
                <strong>Evidence Preserved:</strong> Mock-On has captured all utterances, audio records, and connection timestamps into your tamper-proof ledger. Even though the call was cut short, this log serves as legal evidence demonstrating your attempt to resolve the matter with the company.
              </div>

              <div style="text-align: center; margin: 24px 0 12px 0;">
                <a href="{redial_url}" class="btn-redial">&#x21bb; Redial Helpline</a>
                <a href="{case_url}" class="btn-secondary">View Case & Escalate</a>
              </div>
            </div>
            <div class="footer">
              Mock-On &bull; Voice-First AI Consumer Protection &bull; Tamper-Proof Evidence Ledger
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(to_email, subject, html_body)


email_service = EmailService()
