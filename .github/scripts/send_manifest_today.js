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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

    // Wysyłka tylko, gdy updated == dziś (YYYY-MM-DD)
    const updated = (v.updated || "").toString().trim();
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
    .map((s) => s.trim())
    .filter(Boolean);

  if (toList.length === 0) {
    console.log("MAIL_TO is empty. Not sending email.");
    return;
  }

const namesForSubject = items.map(it => it.name).join(", ");
const subject = `ACE – nowe wydanie (${today}${namesForSubject ? ", " + namesForSubject : ""})`;

  // TEXT body (fallback)
 const linesText = items.map((it, i) => {
  return [
    `${i + 1}. ${it.name}`,
    it.description ? `   ${it.description}` : "",
    it.frequency ? `   Częstotliwość: ${it.frequency}` : "",
    it.next_issue ? `   Kolejna: ${it.next_issue}` : "",
  ].filter(Boolean).join("\n");
});

const textBody =
`Nowe Wydanie Agri Commodity Experts:
Data: ${today}

${linesText.join("\n\n")}

Panel: https://raporty.ace-group.pl/
— ACE`;

  // HTML items (ładne boksy)
 const htmlItems = items
  .map((it) => `
  <div style="margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #eee;">
    <div style="font-size:15px;">
      <strong>${escapeHtml(it.name)}</strong>
    </div>
    ${
      it.description
        ? `<div style="margin-top:4px;color:#333;">${escapeHtml(it.description)}</div>`
        : ""
    }
    <div style="margin-top:8px;color:#666;font-size:12px;line-height:1.5;">
      ${it.frequency ? `Częstotliwość: ${escapeHtml(it.frequency)}<br>` : ""}
      ${it.next_issue ? `Kolejna: ${escapeHtml(it.next_issue)}<br>` : ""}
    </div>
  </div>`
  )
  .join("");

  // HTML template
  const templatePath = path.join(process.cwd(), ".github", "email-template.html");
  if (!fs.existsSync(templatePath)) {
    console.log("Missing .github/email-template.html. Not sending.");
    return;
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const htmlBody = template
    .replaceAll("{{DATE}}", escapeHtml(today))
    .replace("{{CONTENT}}", htmlItems);

  // SMTP
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  if (!host || !port || !user || !pass || !from) {
    console.log(
      "Missing SMTP env vars (SMTP_HOST/PORT/USER/PASS or MAIL_FROM). Not sending."
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" },
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

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
