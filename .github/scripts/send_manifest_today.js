const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

function todayPL() {
  // YYYY-MM-DD w strefie Europe/Warsaw
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function safeJoinUrl(base, p) {
  if (!base) return p || "";
  const b = base.endsWith("/") ? base : base + "/";
  const pp = (p || "").replace(/^\//, "");
  return b + pp;
}

async function main() {
  const manifestPath = path.join(process.cwd(), "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log("No manifest.json found, exiting.");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const today = todayPL();

  const baseUrl = process.env.BASE_URL || "";
  const items = [];

  for (const [key, v] of Object.entries(manifest)) {
    if (!v || typeof v !== "object") continue;

    // U Ciebie pola to np. updated / next_issue / frequency / path / category
    const updated = v.updated || "";
    if (updated === today) {
      items.push({
        name: v.name || key,
        description: v.description || "",
        path: v.path || "",
        category: v.category || "",
        frequency: v.frequency || "",
        next_issue: v.next_issue || "",
        url: safeJoinUrl(baseUrl, v.path || ""),
      });
    }
  }

  if (items.length === 0) {
    console.log(`No items updated today (${today}). Not sending email.`);
    return;
  }

  const toList = (process.env.MAIL_TO || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (toList.length === 0) {
    console.log("MAIL_TO is empty. Not sending email.");
    return;
  }

  const subject = `ACE – nowe raporty (${today})`;

  const linesText = items.map((it, i) => {
    return [
      `${i + 1}. ${it.name}`,
      it.description ? `   ${it.description}` : "",
      it.category ? `   Kategoria: ${it.category}` : "",
      it.frequency ? `   Częstotliwość: ${it.frequency}` : "",
      it.next_issue ? `   Kolejna: ${it.next_issue}` : "",
      it.url ? `   Link: ${it.url}` : "",
    ].filter(Boolean).join("\n");
  });

  const textBody =
`Cześć,
Poniżej raporty zaktualizowane dziś (${today}):

${linesText.join("\n\n")}

— ACE`;

  const htmlItems = items.map(it => `
    <li style="margin:0 0 12px 0;">
      <div><strong>${escapeHtml(it.name)}</strong></div>
      ${it.description ? `<div>${escapeHtml(it.description)}</div>` : ""}
      <div style="color:#444;">
        ${it.category ? `Kategoria: ${escapeHtml(it.category)}<br>` : ""}
        ${it.frequency ? `Częstotliwość: ${escapeHtml(it.frequency)}<br>` : ""}
        ${it.next_issue ? `Kolejna: ${escapeHtml(it.next_issue)}<br>` : ""}
        ${it.url ? `Link: <a href="${it.url}">${it.url}</a>` : ""}
      </div>
    </li>
  `).join("");

  const htmlBody =
`<div style="font-family:Arial, sans-serif; font-size:14px; line-height:1.4;">
  <p>Cześć,<br>
  Poniżej raporty zaktualizowane dziś (<strong>${today}</strong>):</p>
  <ul style="padding-left:18px; margin:0;">
    ${htmlItems}
  </ul>
  <p style="margin-top:16px;">— ACE</p>
</div>`;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  if (!host || !port || !user || !pass || !from) {
    console.log("Missing SMTP env vars (SMTP_HOST/PORT/USER/PASS or MAIL_FROM). Not sending.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: toList.join(","),
    subject,
    text: textBody,
    html: htmlBody,
  });

  console.log("Email sent:", info.messageId);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
