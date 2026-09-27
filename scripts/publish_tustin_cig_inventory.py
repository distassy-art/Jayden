#!/usr/bin/env python3
"""Add the Tustin cigarette count on top of the live worker.

The physical count is already saved in S2K (SKU Inventory CIG COUNT 09262026,
transaction 28742). This script does not post another adjustment.

It downloads the worker that is live right now and only inserts the Tustin
block. Every existing line stays. Budget, billing, Command Center, and the
Arco Db count are checked before the new version is left in place. Site
assets stay in place.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ACCOUNT = "1ad267ec20bc187ad2fe348f66ed7acf"
OAUTH_CLIENT = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
TOML = Path("/home/ubuntu/.config/.wrangler/config/default.toml")


def load_token() -> str:
    text = TOML.read_text()
    match = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
    if not match:
        raise SystemExit("wrangler oauth token missing")
    return match.group(1)


def refresh_token() -> str:
    text = TOML.read_text()
    refresh = re.search(r'refresh_token\s*=\s*"([^"]+)"', text)
    if not refresh:
        raise SystemExit("wrangler refresh token missing")
    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh.group(1),
            "client_id": OAUTH_CLIENT,
        }
    ).encode()
    req = urllib.request.Request(
        "https://dash.cloudflare.com/oauth2/token",
        data=body,
        headers={"User-Agent": "ss-tustin-cig", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode())
    token = payload.get("access_token")
    new_refresh = payload.get("refresh_token") or refresh.group(1)
    expires_in = int(payload.get("expires_in") or 3600)
    if not token:
        raise SystemExit("oauth refresh returned no access token")
    from datetime import datetime, timedelta, timezone

    exp = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    text = re.sub(r'oauth_token\s*=\s*"[^"]*"', f'oauth_token = "{token}"', text, count=1)
    text = re.sub(r'refresh_token\s*=\s*"[^"]*"', f'refresh_token = "{new_refresh}"', text, count=1)
    text = re.sub(r'expiration_time\s*=\s*"[^"]*"', f'expiration_time = "{exp}"', text, count=1)
    TOML.write_text(text)
    print(f"refreshed oauth token, expires {exp}", flush=True)
    return token


def api(token: str, method: str, url: str, data: bytes | None = None, headers: dict | None = None):
    hdrs = {"Authorization": f"Bearer {token}", "User-Agent": "ss-tustin-cig"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read()
            return resp.status, resp.headers.get("content-type") or "", raw, resp.headers
    except urllib.error.HTTPError as err:
        raw = err.read()
        if err.code == 401:
            raise
        raise SystemExit(f"{method} {url} -> {err.code} {raw[:400]!r}") from err


def extract_worker(raw: bytes) -> str:
    text = raw.decode("utf-8")
    marker = 'name="worker.js"'
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("worker.js part not found")
    rest = text[idx:]
    sep = rest.find("\r\n\r\n")
    if sep < 0:
        raise SystemExit("worker.js body not found")
    body = rest[sep + 4 :]
    end = body.rfind("\r\n--")
    if end < 0:
        raise SystemExit("worker.js end boundary not found")
    return body[:end]


def node_check(script: str, name: str) -> None:
    path = Path(f"/tmp/{name}-check.js")
    path.write_text(script)
    subprocess.check_call(["node", "--check", str(path)])
    print(f"node --check ok {name} bytes={path.stat().st_size}", flush=True)


def encode_multipart(script: str, metadata: dict) -> tuple[bytes, str]:
    boundary = "----sstustin" + uuid.uuid4().hex
    meta = json.dumps(metadata).encode()
    parts = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="metadata"\r\n',
        b"Content-Type: application/json\r\n\r\n",
        meta,
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n',
        b"Content-Type: application/javascript+module\r\n\r\n",
        script.encode(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), boundary


def current_version(token: str, name: str) -> str:
    status, _ctype, raw, _headers = api(
        token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/deployments",
    )
    if status != 200:
        raise SystemExit(f"deployments {name} {status}")
    payload = json.loads(raw)
    versions = ((payload.get("result") or {}).get("deployments") or [])[0]["versions"]
    return versions[0]["version_id"]


def deploy_version(token: str, name: str, version_id: str) -> None:
    body = json.dumps(
        {"strategy": "percentage", "versions": [{"percentage": 100, "version_id": version_id}]}
    ).encode()
    status, _ctype, raw, _headers = api(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/deployments",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise SystemExit(f"deploy {name} {status} {raw[:400]!r}")
    payload = json.loads(raw)
    if not payload.get("success"):
        raise SystemExit(f"deploy failed {name} {raw[:400]!r}")
    print(f"deployed {name} {version_id}", flush=True)


def binding_names(token: str, name: str) -> list[str]:
    status, _ctype, raw, _headers = api(
        token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/settings",
    )
    if status != 200:
        raise SystemExit(f"settings {name} {status}")
    bindings = (json.loads(raw).get("result") or {}).get("bindings") or []
    return sorted(f"{b.get('type')}:{b.get('name')}" for b in bindings)

PDF_DIR_DEFAULT = Path("/tmp/tustin-cig")
PREFIX = "/inventory/42674/2026-09-26"
MARK = "ss-tustin-cig-v1"
BLOCK_START = "/* ss-tustin-cig-v1 */"
BLOCK_END = "/* ss-tustin-cig-v1-end */"
SHELL_OLD = (
    "  const headers = noStoreHeaders({\n"
    '    "Content-Type": "text/html; charset=utf-8",\n'
    '    "X-SS-Shell-Source": source,'
)
SHELL_NEW = (
    "  chosen = ssAddTustinCig(chosen);\n"
    "  const headers = noStoreHeaders({\n"
    '    "Content-Type": "text/html; charset=utf-8",\n'
    '    "X-SS-Shell-Source": source,'
)
ASSET_OLD = (
    "      return new Response(out.body, { status: out.status, statusText: out.statusText, headers: headers2 });\n"
    "    }\n"
    "    const res = await env.ASSETS.fetch(request);"
)
ASSET_NEW = (
    "      return new Response(out.body, { status: out.status, statusText: out.statusText, headers: headers2 });\n"
    "    }\n"
    "    const tustinCigPdf = ssTustinCigPdf(p);\n"
    "    if (tustinCigPdf) return tustinCigPdf;\n"
    "    const res = await env.ASSETS.fetch(request);"
)
LOG_NEEDLE = (
    '{ group: "Count", label: "Cigarette count", note: "Actual cost, then minus, then plus", '
    'href: "/inventory/42352/2026-09-26/count.pdf" }\n'
    "      ]\n"
    "    }\n"
    "  ];"
)
KPI_OLD = 'kpi("Overall", overall, "Count is above the book")'
KPI_NEW = 'kpi("Overall", overall, f.overall < 0 ? "Book is above the count" : "Count is above the book")'
LOG_OPEN = "(function () {\n  var LOG = ["

PDFS = [
    ("scan-1.pdf", "42674 Tustin cigarette scan page 1.pdf"),
    ("scan-2.pdf", "42674 Tustin cigarette scan page 2.pdf"),
    ("scan-3.pdf", "42674 Tustin cigarette scan page 3.pdf"),
    ("qoh-packs.pdf", "42674 SKU Sales packs dept 200.pdf"),
    ("qoh-cartons.pdf", "42674 SKU Sales cartons dept 281.pdf"),
    ("s2k-change.pdf", "42674 SKU Inventory CIG COUNT 09262026.pdf"),
    ("count.pdf", "42674 Tustin cigarette count.pdf"),
]


def cents(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def money(value: Decimal) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.2f}"


def whole(value: Decimal) -> str:
    if value == value.to_integral_value():
        return str(int(value))
    return format(value, "f")


def brand_of(desc: str) -> str:
    name = desc.upper()
    rules = [
        ("AMERICAN SPIRIT", "American Spirit"),
        ("CAMEL", "Camel"),
        ("MARLBORO", "Marlboro"),
        ("MARL ", "Marlboro"),
        ("NEWPORT", "Newport"),
        ("PALL MALL", "Pall Mall"),
        ("PALLSAV", "Pall Mall"),
        ("PARLIAMENT", "Parliament"),
        ("KOOL", "Kool"),
        ("LUCKY", "Lucky Strike"),
        ("WINSTON", "Winston"),
        ("SENECA", "Seneca"),
        ("LVB", "LVB Montego"),
        ("CROWN", "Crown"),
    ]
    for prefix, brand in rules:
        if name.startswith(prefix):
            return brand
    return desc.split()[0]


def load_count(pdf_dir: Path) -> dict:
    rows = json.loads((pdf_dir / "matched.json").read_text())
    actual_packs = Decimal(0)
    actual_cost = Decimal(0)
    book = Decimal(0)
    minus_packs = Decimal(0)
    minus_cost = Decimal(0)
    plus_packs = Decimal(0)
    plus_cost = Decimal(0)
    zero = 0
    brands: dict[str, dict] = {}
    priced = []
    for row in rows:
        unit = Decimal(str(row["unit"]))
        actual = Decimal(str(row["actual"]))
        qoh = Decimal(str(row["qoh"]))
        diff = actual - qoh
        line_actual = cents(actual * unit)
        line_book = cents(qoh * unit)
        line_delta = cents(row["cost_delta"])
        actual_packs += actual
        actual_cost += line_actual
        book += line_book
        brand = brand_of(row["desc"])
        bucket = brands.setdefault(
            brand,
            {"minus": Decimal(0), "plus": Decimal(0), "minus_packs": Decimal(0), "plus_packs": Decimal(0)},
        )
        if diff < 0:
            minus_packs += -diff
            minus_cost += -line_delta
            bucket["minus"] += -line_delta
            bucket["minus_packs"] += -diff
        elif diff > 0:
            plus_packs += diff
            plus_cost += line_delta
            bucket["plus"] += line_delta
            bucket["plus_packs"] += diff
        else:
            zero += 1
        priced.append(
            {
                **row,
                "line_actual": line_actual,
                "line_book": line_book,
                "line_delta": line_delta,
                "brand": brand,
            }
        )
    overall = plus_cost - minus_cost
    biggest = max(brands.items(), key=lambda item: item[1]["minus"])
    return {
        "rows": priced,
        "actual_packs": actual_packs,
        "actual_cost": actual_cost,
        "book": book,
        "minus_packs": minus_packs,
        "minus_cost": minus_cost,
        "plus_packs": plus_packs,
        "plus_cost": plus_cost,
        "zero": zero,
        "overall": overall,
        "brands": brands,
        "biggest_name": biggest[0],
        "biggest_minus": biggest[1]["minus"],
        "marlboro_plus": brands["Marlboro"]["plus"],
        "lines": len(priced),
    }


def inventory_entry(count: dict) -> dict:
    return {
        "stationId": "42674",
        "client": "Tustin",
        "dateLabel": "September 26, 2026",
        "category": "Cigarettes",
        "period": (
            "Count written September 26, 2026. On that date, S2K quantity on hand was set to those counted packs "
            "(SKU Inventory CIG COUNT 09262026, transaction 28742)."
        ),
        "summary": (
            f"The actual count is {money(count['actual_cost'])} for {whole(count['actual_packs'])} packs. "
            f"Minus is {money(count['minus_cost'])}, where the book is above the count. "
            f"Plus is {money(count['plus_cost'])}, where the count is above the book. "
            f"Overall is negative {money(abs(count['overall']))}. "
            f"The book on the counted lines is {money(count['book'])}. "
            f"The biggest minus is {count['biggest_name']} at {money(count['biggest_minus'])}. "
            f"Marlboro's plus is {money(count['marlboro_plus'])}. "
            "Every counted line, including American Spirit Turquoise, was written. "
            f"Those {count['lines']} lines now have quantity on hand equal to the physical count."
        ),
        "finding": {
            "actualPacks": int(count["actual_packs"]),
            "actualCost": float(count["actual_cost"]),
            "minusPacks": int(count["minus_packs"]),
            "minusCost": float(count["minus_cost"]),
            "plusPacks": int(count["plus_packs"]),
            "plusCost": float(count["plus_cost"]),
            "overall": float(count["overall"]),
        },
        "files": [
            {"group": "Scans", "label": "Scan page 1", "note": "Handwritten quantity, September 26", "href": f"{PREFIX}/scan-1.pdf"},
            {"group": "Scans", "label": "Scan page 2", "note": "Handwritten quantity, September 26", "href": f"{PREFIX}/scan-2.pdf"},
            {"group": "Scans", "label": "Scan page 3", "note": "Handwritten quantity, September 26", "href": f"{PREFIX}/scan-3.pdf"},
            {
                "group": "S2K quantity on hand",
                "label": "Packs, department 200",
                "note": "S2K SKU Sales PDF from before the quantity-on-hand change, August 1 through September 26",
                "href": f"{PREFIX}/qoh-packs.pdf",
            },
            {
                "group": "S2K quantity on hand",
                "label": "Cartons, department 281",
                "note": "S2K SKU Sales PDF from before the quantity-on-hand change, August 1 through September 26",
                "href": f"{PREFIX}/qoh-cartons.pdf",
            },
            {
                "group": "S2K quantity on hand",
                "label": "Quantity on hand change",
                "note": "SKU Inventory CIG COUNT 09262026. The counted packs, 389 total.",
                "href": f"{PREFIX}/s2k-change.pdf",
            },
            {
                "group": "Count",
                "label": "Cigarette count",
                "note": "Actual cost, then minus, then plus",
                "href": f"{PREFIX}/count.pdf",
            },
        ],
    }


def transform_html(html: str, entry: dict) -> str:
    if MARK in html:
        return html
    if LOG_NEEDLE not in html:
        return html
    body = json.dumps(entry, indent=2)
    if not LOG_NEEDLE.endswith("\n  ];"):
        raise SystemExit("inventory log needle drifted")
    inserted = LOG_NEEDLE[: -len("\n  ];")] + ",\n" + body + "\n  ];"
    html = html.replace(LOG_NEEDLE, inserted, 1)
    if KPI_OLD not in html:
        raise SystemExit("overall caption not found")
    html = html.replace(KPI_OLD, KPI_NEW, 1)
    if LOG_OPEN not in html:
        raise SystemExit("inventory log open not found")
    html = html.replace(LOG_OPEN, "(function () {\n  /* " + MARK + " */\n  var LOG = [", 1)
    return html


def write_count_pdf(path: Path, count: dict) -> None:
    from fpdf import FPDF

    pdf = FPDF(format="letter", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    width = pdf.epw

    def paragraph(text: str, size: int = 10, bold: bool = False, height: float = 5) -> None:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "B" if bold else "", size)
        pdf.multi_cell(width, height, text)

    def rule() -> None:
        y = pdf.get_y() + 1
        pdf.line(pdf.l_margin, y, pdf.l_margin + width, y)
        pdf.set_y(y + 2)

    def section(title: str, rows: list[dict], amount_key: str) -> None:
        pdf.ln(2)
        paragraph(title, 12, True, 6)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_x(pdf.l_margin)
        heads = [
            (10, "#"),
            (78, "Description"),
            (16, "Actual"),
            (16, "Book"),
            (18, "Diff"),
            (22, "Unit"),
            (width - 160, "Amount"),
        ]
        for col_w, label in heads:
            pdf.cell(col_w, 5, label, border="B")
        pdf.ln(6)
        pdf.set_font("Helvetica", "", 8)
        for row in rows:
            amount = row[amount_key]
            values = [
                (10, str(row["n"])),
                (78, row["desc"][:42]),
                (16, whole(Decimal(str(row["actual"])))),
                (16, whole(Decimal(str(row["qoh"])))),
                (18, whole(Decimal(str(row["diff"])))),
                (22, f"{Decimal(str(row['unit'])):.4f}"),
                (width - 160, money(amount)),
            ]
            pdf.set_x(pdf.l_margin)
            for col_w, label in values:
                pdf.cell(col_w, 4.6, label)
            pdf.ln(4.6)

    paragraph("Tustin #42674 cigarette count", 16, True, 7)
    paragraph("September 26, 2026. Packs compared with S2K quantity on hand.", 10, False, 5)
    paragraph(
        f"Actual {money(count['actual_cost'])} for {whole(count['actual_packs'])} packs. "
        f"Minus {money(count['minus_cost'])} ({whole(count['minus_packs'])} packs). "
        f"Plus {money(count['plus_cost'])} ({whole(count['plus_packs'])} packs). "
        f"Overall {money(count['overall'])}. Book on counted lines {money(count['book'])}.",
        10,
        False,
        5,
    )
    paragraph(
        f"Biggest minus is {count['biggest_name']} at {money(count['biggest_minus'])}. "
        f"Marlboro plus is {money(count['marlboro_plus'])}. "
        "American Spirit Turquoise is included. Quantity on hand was set to the counted packs "
        "(SKU Inventory CIG COUNT 09262026, transaction 28742).",
        10,
        False,
        5,
    )
    rule()
    by_sheet = sorted(count["rows"], key=lambda row: row["n"])
    section("Actual cost", by_sheet, "line_actual")
    minus_rows = sorted((row for row in count["rows"] if Decimal(str(row["diff"])) < 0), key=lambda row: row["line_delta"])
    plus_rows = sorted((row for row in count["rows"] if Decimal(str(row["diff"])) > 0), key=lambda row: -row["line_delta"])
    section("Minus, book above the count", minus_rows, "line_delta")
    section("Plus, count above the book", plus_rows, "line_delta")
    pdf.output(path)


def write_change_pdf(path: Path, count: dict) -> None:
    from fpdf import FPDF

    pdf = FPDF(format="letter", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    width = pdf.epw

    def paragraph(text: str, size: int = 10, bold: bool = False, height: float = 5) -> None:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "B" if bold else "", size)
        pdf.multi_cell(width, height, text)

    paragraph("SKU Inventory", 16, True, 7)
    paragraph("Tustin #42674", 12, True, 6)
    paragraph("September 26, 2026", 10, False, 5)
    paragraph("Reference CIG COUNT 09262026. Transaction 28742. Site 247.", 10, False, 5)
    paragraph(
        f"Quantity on hand set to the physical count. {count['lines']} lines. "
        f"{whole(count['actual_packs'])} packs.",
        10,
        False,
        5,
    )
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(pdf.l_margin)
    cols = [(10, "#"), (96, "Description"), (40, "UPC"), (width - 146, "Quantity on hand")]
    for col_w, label in cols:
        pdf.cell(col_w, 5, label, border="B")
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 8)
    for row in sorted(count["rows"], key=lambda item: item["n"]):
        pdf.set_x(pdf.l_margin)
        values = [
            (10, str(row["n"])),
            (96, row["desc"][:48]),
            (40, row["upc"]),
            (width - 146, whole(Decimal(str(row["actual"])))),
        ]
        for col_w, label in values:
            pdf.cell(col_w, 4.6, label)
        pdf.ln(4.6)
    pdf.output(path)


def build_pdfs(pdf_dir: Path, count: dict) -> None:
    write_count_pdf(pdf_dir / "count.pdf", count)
    write_change_pdf(pdf_dir / "s2k-change.pdf", count)
    for name, _filename in PDFS:
        file_path = pdf_dir / name
        blob = file_path.read_bytes()
        if not blob.startswith(b"%PDF"):
            raise SystemExit(f"{name} is not a PDF")
    change = (pdf_dir / "s2k-change.pdf").read_bytes().lower()
    summary = (pdf_dir / "count.pdf").read_bytes().lower()
    if b"invoice" in change or b"invoice" in summary:
        raise SystemExit("generated PDF used the word invoice")


def js_block(pdf_dir: Path, entry: dict) -> str:
    files = []
    for name, filename in PDFS:
        encoded = base64.b64encode((pdf_dir / name).read_bytes()).decode("ascii")
        files.append(f'  "{PREFIX}/{name}": {{ name: {json.dumps(filename)}, b64: "{encoded}" }}')
    entry_json = json.dumps(entry)
    needle_json = json.dumps(LOG_NEEDLE)
    pdf_map = ",\n".join(files)
    return f"""{BLOCK_START}
const SS_TUSTIN_CIG_PDFS = {{
{pdf_map}
}};
function ssDecodeB64(b64) {{
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}}
function ssTustinCigPdf(pathname) {{
  const file = SS_TUSTIN_CIG_PDFS[pathname];
  if (!file) return null;
  return new Response(ssDecodeB64(file.b64), {{
    status: 200,
    headers: {{
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="' + file.name.replace(/"/g, "") + '"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }}
  }});
}}
function ssAddTustinCig(html) {{
  const mark = "{MARK}";
  if (!html || html.includes(mark)) return html;
  const needle = {needle_json};
  if (!html.includes(needle)) return html;
  const entry = {entry_json};
  const inserted = needle.slice(0, -5) + ",\\n" + JSON.stringify(entry, null, 2) + "\\n  ];";
  html = html.replace(needle, inserted);
  html = html.replace({json.dumps(KPI_OLD)}, {json.dumps(KPI_NEW)});
  html = html.replace({json.dumps(LOG_OPEN)}, "(function () {{\\n  /* " + mark + " */\\n  var LOG = [");
  return html;
}}
{BLOCK_END}
"""


def without_block(script: str) -> str:
    if BLOCK_START in script and BLOCK_END in script:
        pre, _, tail = script.partition(BLOCK_START)
        _, _, post = tail.partition(BLOCK_END)
        return pre + post
    return script


def assert_additive(before: str, after: str) -> None:
    """The publish may insert lines. It may not drop or rewrite a line that is already live."""
    after_core = without_block(after)
    missing = [line for line in without_block(before).splitlines() if line.strip() and line not in after_core]
    if missing:
        raise SystemExit(
            f"publish would change {len(missing)} existing worker lines; first is {missing[0]!r}"
        )
    print(f"additive ok, existing lines kept ({len(without_block(before).splitlines())})", flush=True)


def splice_worker(script: str, block: str) -> str:
    if BLOCK_START in script and BLOCK_END in script:
        pre, _, tail = script.partition(BLOCK_START)
        _, _, post = tail.partition(BLOCK_END)
        script = pre + block + post.lstrip("\n")
    else:
        needle = "var worker_default = {"
        if script.count(needle) != 1:
            raise SystemExit(f"worker_default count {script.count(needle)}")
        script = script.replace(needle, block + "\n" + needle, 1)
    if "ssAddTustinCig(chosen)" not in script:
        if SHELL_OLD not in script:
            raise SystemExit("shell hook site not found")
        script = script.replace(SHELL_OLD, SHELL_NEW, 1)
    if "ssTustinCigPdf(p)" not in script:
        if ASSET_OLD not in script:
            raise SystemExit("asset hook site not found")
        script = script.replace(ASSET_OLD, ASSET_NEW, 1)
    if script.count("function ssAddTustinCig") != 1:
        raise SystemExit("tustin transform was not inserted once")
    return script


def download_script(token: str) -> tuple[str, str]:
    try:
        _status, _ctype, raw, _headers = api(
            token,
            "GET",
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/ss-unified-proto",
        )
    except urllib.error.HTTPError as err:
        if err.code != 401:
            raise
        token = refresh_token()
        _status, _ctype, raw, _headers = api(
            token,
            "GET",
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/ss-unified-proto",
        )
    return token, extract_worker(raw)


def preflight_html(entry: dict) -> None:
    req = urllib.request.Request(
        "https://smartsolutionsai.us/app.html?nocache=tustin-cig-preflight",
        headers={"User-Agent": "ss-tustin-cig", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        html = resp.read().decode("utf-8", "replace")
    Path("/tmp/tustin-app-preflight.html").write_text(html)
    out = transform_html(html, entry)
    if '"stationId": "42674"' not in out and '"stationId":"42674"' not in out:
        raise SystemExit("live shell did not accept the Tustin inventory entry")
    if "2938.42" not in out:
        raise SystemExit("Arco Db inventory entry is missing from the transformed shell")
    for marker in ("function buildBudget(", "ss-billing-simple-v1", "ss-command-simple-v1"):
        if marker not in out:
            raise SystemExit(f"transformed shell lost {marker}")
    again = transform_html(out, entry)
    if again != out:
        raise SystemExit("Tustin inventory transform is not idempotent")
    if out.count(KPI_NEW) != 1:
        raise SystemExit("overall caption was not updated once")
    print("preflight html ok", flush=True)


def upload_proto(token: str, script: str) -> str:
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-01",
        "compatibility_flags": [],
        "keep_assets": True,
        "keep_bindings": ["assets"],
        "annotations": {"workers/message": "Add Tustin cigarette count without replacing the live worker"},
    }
    body, boundary = encode_multipart(script, metadata)
    status, _ctype, raw, _headers = api(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/ss-unified-proto/versions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    if status != 200:
        raise SystemExit(f"version upload {status} {raw[:400]!r}")
    payload = json.loads(raw)
    if not payload.get("success"):
        raise SystemExit(f"version upload failed {raw[:400]!r}")
    version_id = (payload.get("result") or {}).get("id")
    if not version_id:
        raise SystemExit("no version id")
    print(f"uploaded ss-unified-proto version {version_id}", flush=True)
    return version_id


def fetch_live(path: str) -> tuple[dict, bytes]:
    req = urllib.request.Request(
        "https://smartsolutionsai.us" + path,
        headers={"User-Agent": "ss-tustin-cig", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return dict(resp.headers), resp.read()


def shell_stamp() -> str:
    headers, body = fetch_live("/app.html?nocache=additive-stamp")
    text = body.decode("utf-8", "replace")
    match = re.search(r"DATA_STAMP = '([^']+)'", text)
    stamp = match.group(1) if match else ""
    header_stamp = headers.get("X-SS-Shell-Stamp") or headers.get("x-ss-shell-stamp") or ""
    return header_stamp or stamp


def confirm_previous_pages(stamp: str) -> None:
    headers, html_bytes = fetch_live("/app.html?nocache=additive-confirm")
    html = html_bytes.decode("utf-8", "replace")
    live_stamp = headers.get("X-SS-Shell-Stamp") or headers.get("x-ss-shell-stamp") or ""
    if stamp and live_stamp != stamp:
        raise SystemExit(f"shell stamp changed from {stamp} to {live_stamp}")
    for marker in (
        "function buildBudget(",
        "ss-billing-simple-v1",
        "ss-command-simple-v1",
        "2938.42",
        "ss-tustin-cig-v1",
        '"stationId": "42674"',
    ):
        if marker not in html:
            raise SystemExit(f"live app lost {marker}")
    _arco_headers, arco = fetch_live("/inventory/42352/2026-09-26/count.pdf")
    if not arco.startswith(b"%PDF"):
        raise SystemExit("Arco Db count PDF is no longer a PDF")
    _tustin_headers, tustin = fetch_live("/inventory/42674/2026-09-26/count.pdf")
    if not tustin.startswith(b"%PDF"):
        raise SystemExit("Tustin count PDF is not being served")
    _budget_headers, budget = fetch_live("/budget-targets.json?nocache=additive-confirm")
    if b"71400" not in budget:
        raise SystemExit("budget targets no longer include the Arco Db figure")
    print(f"previous pages still present, shell {live_stamp or stamp}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-dir", type=Path, default=PDF_DIR_DEFAULT)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    count = load_count(args.pdf_dir)
    print(
        "actual",
        whole(count["actual_packs"]),
        money(count["actual_cost"]),
        "minus",
        whole(count["minus_packs"]),
        money(count["minus_cost"]),
        "plus",
        whole(count["plus_packs"]),
        money(count["plus_cost"]),
        "overall",
        money(count["overall"]),
        "book",
        money(count["book"]),
        "biggest",
        count["biggest_name"],
        money(count["biggest_minus"]),
        flush=True,
    )
    expected = {
        "actual_cost": Decimal("4156.74"),
        "minus_cost": Decimal("6974.64"),
        "plus_cost": Decimal("362.13"),
        "overall": Decimal("-6612.51"),
        "book": Decimal("10769.24"),
        "biggest_name": "Marlboro",
        "biggest_minus": Decimal("3746.71"),
        "lines": 69,
        "actual_packs": Decimal(389),
    }
    for key, value in expected.items():
        if count[key] != value:
            raise SystemExit(f"unexpected {key}: {count[key]!r}")
    entry = inventory_entry(count)
    if "invoice" in entry["summary"].lower() or "invoice" in entry["period"].lower():
        raise SystemExit("page copy used the word invoice")
    build_pdfs(args.pdf_dir, count)
    (args.pdf_dir / "totals.json").write_text(json.dumps(entry, indent=2) + "\n")
    print("pdfs written", flush=True)
    token = load_token()
    token, script = download_script(token)
    print(f"downloaded ss-unified-proto bytes={len(script)}", flush=True)
    updated = splice_worker(script, js_block(args.pdf_dir, entry))
    assert_additive(script, updated)
    print(f"patched bytes={len(updated)}", flush=True)
    node_check(updated, "ss-unified-proto-tustin")
    harness = Path("/tmp/tustin-cig-harness.mjs")
    match = re.search(r"function ssAddTustinCig\(html\) \{.*?\n\}", updated, re.S)
    if not match:
        raise SystemExit("could not extract ssAddTustinCig")
    harness.write_text(
        match.group(0)
        + """
import fs from "fs";
const html = fs.readFileSync("/tmp/tustin-app-preflight.html", "utf8");
const out = ssAddTustinCig(html);
if (!out.includes('"stationId": "42674"')) process.exit(2);
if (!out.includes("2938.42")) process.exit(3);
if (ssAddTustinCig(out) !== out) process.exit(4);
if (!out.includes('f.overall < 0 ? "Book is above the count"')) process.exit(5);
fs.writeFileSync("/tmp/tustin-app-transformed.html", out);
console.log("js transform ok");
"""
    )
    preflight_html(entry)
    subprocess.check_call(["node", str(harness)])
    if args.check_only:
        Path("/tmp/ss-unified-proto-tustin.js").write_text(updated)
        print("check-only done", flush=True)
        return
    before = binding_names(token, "ss-unified-proto")
    print(f"bindings before: {before}", flush=True)
    previous = current_version(token, "ss-unified-proto")
    stamp = shell_stamp()
    print(f"shell stamp before {stamp}", flush=True)
    version_id = upload_proto(token, updated)
    deploy_version(token, "ss-unified-proto", version_id)
    after = binding_names(token, "ss-unified-proto")
    print(f"bindings after: {after}", flush=True)
    missing = [item for item in before if item not in after]
    try:
        if missing:
            raise SystemExit(f"bindings dropped {missing}")
        last_check = None
        for attempt in range(6):
            try:
                confirm_previous_pages(stamp)
                last_check = None
                break
            except SystemExit as err:
                last_check = err
                print(f"confirm attempt {attempt + 1} failed: {err}", flush=True)
                time.sleep(2)
        if last_check:
            raise last_check
    except SystemExit:
        print("page check failed; rolling back", flush=True)
        deploy_version(token, "ss-unified-proto", previous)
        raise
    print(json.dumps({"previous": previous, "uploaded": version_id}))


if __name__ == "__main__":
    main()
