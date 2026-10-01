/**
 * Reference handler for ss-unified-proto (ss-api). Copy into src/handlers/ and register:
 *   "send-pricing-nudge-to-manager": handleSendPricingNudge
 * POST /api/send-pricing-nudge-to-manager
 *
 * Graph send matches send-order-to-manager.js (ORDERS_FROM + GRAPH_* env).
 */
var ORDERS_FROM = "orders@smartsolutionsai26.onmicrosoft.com";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtMoney(v) {
  var n = Number(v);
  return Number.isFinite(n) ? "$" + n.toFixed(2) : "—";
}
function fmtImpact(v) {
  var n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toFixed(2) + "/wk est.";
}

function buildPricingNudgeSubject(storeLabel, pendingCount, weekStart) {
  var w = weekStart ? String(weekStart).slice(0, 10) : "";
  return (
    "AI pricing: " +
    pendingCount +
    " item" +
    (pendingCount === 1 ? "" : "s") +
    " to enter in S2K · " +
    storeLabel +
    (w ? " · week " + w : "")
  );
}

function buildPricingNudgeHtml(stores, weekStart, weekEnd, siteBase) {
  var base = String(siteBase || "https://smartsolutionsai.us").replace(/\/$/, "");
  var week = weekStart && weekEnd ? weekStart + " – " + weekEnd : weekStart || "this week";
  var blocks = (stores || [])
    .map(function (s) {
      var link = base + "/app.html#ai-pricing/" + encodeURIComponent(String(s.id));
      var rows = (s.topItems || [])
        .map(function (it) {
          return (
            "<tr><td>" +
            escapeHtml(it.item || "—") +
            '</td><td style="text-align:right">' +
            fmtMoney(it.currentRetail) +
            " → " +
            fmtMoney(it.recommendedRetail) +
            '</td><td style="text-align:right">' +
            fmtImpact(it.impact) +
            "</td></tr>"
          );
        })
        .join("");
      return (
        '<h3 style="margin:18px 0 6px">' +
        escapeHtml(s.name || s.id) +
        ' <span style="font-weight:400;color:#666">#' +
        escapeHtml(String(s.id)) +
        "</span></h3>" +
        "<p><strong>" +
        s.pendingCount +
        "</strong> recommended price change" +
        (s.pendingCount === 1 ? "" : "s") +
        " not yet entered in S2K.</p>" +
        '<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left">Item</th><th align="right">Retail</th><th align="right">Est. impact</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="3">(see AI Pricing tab)</td></tr>') +
        "</tbody></table>" +
        '<p><a href="' +
        link +
        '">Open AI Pricing tab →</a></p>'
      );
    })
    .join("");
  return (
    '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#0f2742;line-height:1.45">' +
    "<p>Hi,</p>" +
    "<p>Smart Solutions AI has <strong>price recommendations waiting in S2K</strong> for your store(s). Week " +
    escapeHtml(week) +
    ".</p>" +
    blocks +
    '<p style="margin-top:24px">Thanks,<br>Smart Solutions<br>orders@</p></body></html>'
  );
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

async function handleSendPricingNudge(event, env) {
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

  var stores = Array.isArray(body.stores) ? body.stores : [];
  var pendingTotal = stores.reduce(function (n, s) {
    return n + (Number(s.pendingCount) || 0);
  }, 0);
  if (pendingTotal <= 0) return json(200, { ok: true, skipped: true, reason: "nothing_pending" });

  var weekStart = body.weekStart || null;
  var weekEnd = body.weekEnd || null;
  var storeLabel = stores.length === 1 ? stores[0].name || stores[0].id : stores.length + " stores";
  var subject = buildPricingNudgeSubject(storeLabel, pendingTotal, weekStart);
  var html = buildPricingNudgeHtml(stores, weekStart, weekEnd, body.siteBase);
  var dryRun = !!(body.dryRun || body.dry_run);
  if (dryRun) {
    return json(200, {
      ok: true,
      dryRun: true,
      from: ORDERS_FROM,
      to: managerEmail,
      subject: subject,
      pendingTotal: pendingTotal
    });
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
      pendingTotal: pendingTotal,
      sentAt: new Date().toISOString(),
      graphStatus: sent.status
    });
  } catch (e) {
    return json(502, { ok: false, error: e.code || "send_failed", detail: String(e.detail || e.message || e) });
  }
}
