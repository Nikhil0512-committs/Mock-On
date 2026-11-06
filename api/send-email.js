import nodemailer from "nodemailer";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { to, subject, html, text } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing required fields: to, subject, html" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "nikhilsharma5122006@gmail.com",
        pass: "mkiyyzpoasxbyung",
      },
    });

    const info = await transporter.sendMail({
      from: '"Mock-On AI" <nikhilsharma5122006@gmail.com>',
      to,
      subject,
      text: text || undefined,
      html,
    });

    console.log("Email delivered via Vercel HTTPS relay:", info.messageId, "to:", to);
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("Vercel email relay dispatch error:", err);
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}
