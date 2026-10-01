/**
 * Branded HTML wrapper for Smart Solutions outbound mail (orders@, audit@ via Graph).
 * Copy into ss-api handlers or require from Jayden reference scripts.
 */
var DEFAULT_BRANDING = {
  siteBase: "https://smartsolutionsai.us",
  logoUrl:
    "https://smartsolutionsai.us/data/branding/email/Smart-Solutions-AI-logo.png?v=20260823",
  footerUrl:
    "https://smartsolutionsai.us/data/branding/email/footer.png?v=20260823",
  accentColor: "#1F4E78",
  textColor: "#0f2742"
};

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} bodyHtml - inner HTML (already escaped where needed)
 * @param {{ preheader?: string, branding?: object }} [opts]
 */
function wrapBrandedEmailHtml(bodyHtml, opts) {
  opts = opts || {};
  var b = Object.assign({}, DEFAULT_BRANDING, opts.branding || {});
  var pre = opts.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">' +
      escapeHtml(opts.preheader) +
      "</div>"
    : "";
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>" +
    '<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:' +
    b.textColor +
    '">' +
    pre +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e7ee">' +
    '<tr><td style="padding:22px 24px 10px;text-align:center"><a href="' +
    escapeHtml(b.siteBase) +
    '" style="text-decoration:none"><img src="' +
    escapeHtml(b.logoUrl) +
    '" alt="Smart Solutions AI" width="320" style="max-width:100%;height:auto;border:0;display:block;margin:0 auto" /></a></td></tr>' +
    '<tr><td style="padding:12px 24px 28px;font-size:15px;line-height:1.55">' +
    bodyHtml +
    "</td></tr>" +
    '<tr><td style="padding:0;line-height:0;font-size:0"><img src="' +
    escapeHtml(b.footerUrl) +
    '" alt="" width="600" style="max-width:100%;height:auto;display:block;border:0" /></td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

function brandedSignOff(fromMailbox) {
  var mb = fromMailbox || "orders@smartsolutionsai26.onmicrosoft.com";
  return (
    '<p style="margin-top:24px;color:#526070">Thanks,<br><strong style="color:' +
    DEFAULT_BRANDING.accentColor +
    '">Smart Solutions AI</strong><br><span style="font-size:13px">' +
    escapeHtml(mb) +
    "</span></p>"
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_BRANDING: DEFAULT_BRANDING,
    escapeHtml: escapeHtml,
    wrapBrandedEmailHtml: wrapBrandedEmailHtml,
    brandedSignOff: brandedSignOff
  };
}
