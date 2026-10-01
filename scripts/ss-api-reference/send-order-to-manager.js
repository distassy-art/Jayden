/**
 * Reference handler for ss-unified-proto (ss-api). Copy into src/handlers/ and register:
 *   "send-order-to-manager": handleSendOrderToManager
 * POST /api/send-order-to-manager
 *
 * Branded HTML matches scripts/lib/email_html_shell.js (new Smart Solutions wordmark).
 */
var ORDERS_FROM = "orders@smartsolutionsai26.onmicrosoft.com";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keep in sync with scripts/lib/email_html_shell.js */
var EMAIL_LOGO_URL =
  "https://smartsolutionsai.us/data/branding/email/Smart-Solutions-AI-logo.png?v=20260823";
var EMAIL_FOOTER_URL =
  "https://smartsolutionsai.us/data/branding/email/footer.png?v=20260823";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapBrandedEmailHtml(bodyHtml, opts) {
  opts = opts || {};
  var pre = opts.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">' +
      escapeHtml(opts.preheader) +
      "</div>"
    : "";
  var site = escapeHtml(opts.siteBase || "https://smartsolutionsai.us");
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head>" +
    '<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#0f2742">' +
    pre +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;border:1px solid #e2e7ee">' +
    '<tr><td style="padding:22px 24px 10px;text-align:center"><a href="' +
    site +
    '"><img src="' +
    EMAIL_LOGO_URL +
    '" alt="Smart Solutions AI" width="320" style="max-width:100%;height:auto;border:0" /></a></td></tr>' +
    '<tr><td style="padding:12px 24px 28px;font-size:15px;line-height:1.55">' +
    bodyHtml +
    "</td></tr>" +
    '<tr><td style="padding:0"><img src="' +
    EMAIL_FOOTER_URL +
    '" alt="" width="600" style="max-width:100%;height:auto;display:block;border:0" /></td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

function brandedSignOff(fromMailbox) {
  return (
    '<p style="margin-top:24px;color:#526070">Thanks,<br><strong style="color:#1F4E78">Smart Solutions AI</strong><br><span style="font-size:13px">' +
    escapeHtml(fromMailbox || ORDERS_FROM) +
    "</span></p>"
  );
}

function fmtMoney(v) {
  var n = Number(v);
  return Number.isFinite(n) ? "$" + n.toFixed(2) : "—";
}

function buildOrderSubject(storeName, vendor, orderDate) {
  var v = vendor ? String(vendor) : "Order";
  var d = orderDate ? String(orderDate).slice(0, 10) : "";
  return (storeName ? storeName + " · " : "") + v + " order" + (d ? " · " + d : "");
}

function buildOrderHtml(body) {
  var store = escapeHtml(body.storeName || body.storeId || "Store");
  var vendor = escapeHtml(body.vendor || "Vendor");
  var amount = fmtMoney(body.amount);
  var date = escapeHtml(body.orderDate || "");
  var pdfUrl = body.pdfUrl ? String(body.pdfUrl) : "";
  var pdfLink = pdfUrl
    ? '<p><a href="' + escapeHtml(pdfUrl) + '">Download order PDF</a></p>'
    : "";
  var note = body.note ? "<p>" + escapeHtml(body.note) + "</p>" : "";
  var inner =
    "<p>Hi,</p>" +
    "<p>Your <strong>" +
    vendor +
    "</strong> order for <strong>" +
    store +
    "</strong>" +
    (date ? " (" + date + ")" : "") +
    " is ready.</p>" +
    "<p style=\"font-size:18px;margin:16px 0\"><strong>Amount: " +
    amount +
    "</strong></p>" +
    pdfLink +
    note +
    brandedSignOff(ORDERS_FROM);
  return wrapBrandedEmailHtml(inner, {
    preheader: vendor + " order " + amount + " for " + (body.storeName || body.storeId || "store")
  });
}

async function graphSendHtml(env, to, subject, html) {
  var tenant = env && env.GRAPH_TENANT_ID;
  var clientId = env && env.GRAPH_CLIENT_ID;
  var clientSecret = env && env.GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    var err = new Error("graph_secrets_missing");
    err.code = "graph_secrets_missing";
    throw err;
  }
  var tokenRes = await fetch(
    "https://login.microsoftonline.com/" + encodeURIComponent(tenant) + "/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: [
        "client_id=" + encodeURIComponent(clientId),
        "client_secret=" + encodeURIComponent(clientSecret),
        "scope=" + encodeURIComponent("https://graph.microsoft.com/.default"),
        "grant_type=client_credentials"
      ].join("&")
    }
  );
  var tokenJson = await tokenRes.json().catch(function () {
    return {};
  });
  if (!tokenRes.ok || !tokenJson.access_token) {
    var e2 = new Error("graph_token_failed");
    e2.detail = JSON.stringify(tokenJson).slice(0, 300);
    throw e2;
  }
  var gRes = await fetch(
    "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(ORDERS_FROM) + "/sendMail",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenJson.access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: true
      })
    }
  );
  return { status: gRes.status, ok: gRes.status === 202 || gRes.status === 200, body: await gRes.text() };
}

async function handleSendOrderToManager(event, env) {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  var body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { ok: false, error: "invalid_json" });
  }
  var managerEmail = String(body.managerEmail || "").trim();
  var forceTo = String(body.forceTo || body.testTo || "").trim();
  if (forceTo) {
    if (!/^minamorcos@/i.test(forceTo) && !/^mina\.?morcos@/i.test(forceTo)) {
      return json(400, { ok: false, error: "forceTo_not_allowed" });
    }
    managerEmail = forceTo;
  }
  if (!EMAIL_RE.test(managerEmail)) return json(400, { ok: false, error: "manager_email_required" });

  var subject = body.subject || buildOrderSubject(body.storeName, body.vendor, body.orderDate);
  var html = buildOrderHtml(body);
  var dryRun = !!(body.dryRun || body.dry_run);
  if (dryRun) {
    return json(200, { ok: true, dryRun: true, from: ORDERS_FROM, to: managerEmail, subject: subject });
  }
  try {
    var sent = await graphSendHtml(env, managerEmail, subject, html);
    if (!sent.ok) {
      return json(502, { ok: false, error: "graph_send_failed", status: sent.status, detail: sent.body.slice(0, 500) });
    }
    return json(200, {
      ok: true,
      sent: true,
      from: ORDERS_FROM,
      to: managerEmail,
      subject: subject,
      sentAt: new Date().toISOString(),
      graphStatus: sent.status
    });
  } catch (e) {
    return json(502, { ok: false, error: e.code || "send_failed", detail: String(e.detail || e.message || e) });
  }
}

function json(status, obj) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
