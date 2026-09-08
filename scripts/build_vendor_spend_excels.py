#!/usr/bin/env python3
"""Build monthly + period vendor-spend Excels from Non-Fuel Invoice PDFs."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

import pdfplumber
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

MONEY = re.compile(r"-?\$[\d,]+\.\d{2}")
SKIP = re.compile(
    r"(?i)^(station\s+total|sales\s+tax|page\s+total|grand\s+total|report\s+total|"
    r"grouped by|station$|inv\s*#|1\s+station|\d+\s+of\s+\d+)"
)


def parse_money(s) -> float:
    if s is None or s == "":
        return 0.0
    s = str(s).strip().replace("$", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_pdf_tables(path: Path):
    """Vendor spend uses Inv Total (col 3), not O/S."""
    vendors = []
    cur = None
    grand_inv = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                for row in table:
                    if not row:
                        continue
                    joined = " ".join(str(c or "") for c in row)
                    if "Grand Total" in joined:
                        vals = []
                        for c in row:
                            if not c:
                                continue
                            cs = str(c).strip()
                            if MONEY.search(cs) or re.match(r"^-?[\d,]+\.\d{2}$", cs):
                                vals.append(parse_money(cs))
                        if vals:
                            grand_inv = vals[0]
                        continue
                    if not row[0] or not str(row[0]).strip():
                        continue
                    name = str(row[0]).strip()
                    if SKIP.search(name):
                        continue
                    if name.upper().startswith("TSO"):
                        if cur is not None:
                            cur["orders"] += 1
                        continue
                    inv = parse_money(row[3] if len(row) > 3 else None)
                    is_vendor_shape = len(row) >= 4 and (row[1] in (None, ""))
                    if is_vendor_shape and re.search(r"[A-Za-z]", name):
                        cur = {
                            "vendor": re.sub(r"\s+", " ", name),
                            "total": inv,
                            "orders": 0,
                        }
                        vendors.append(cur)
    return vendors, grand_inv


def month_label(mm: str) -> str:
    names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{names[int(mm)]} 2026"


def style_header(ws, row, headers):
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E79")
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row, col, h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin
    return thin


def write_month_sheet(ws, title, rows, month_total):
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:E1")
    ws["A2"] = f"Month Total Purchases: {month_total:,.2f}"
    ws["A2"].font = Font(bold=True)
    style_header(ws, 4, ["Vendor", "Orders", "Total Spend", "Avg per Order", "% of Month Total"])
    for i, r in enumerate(rows, 5):
        ws.cell(i, 1, r["vendor"]).border = thin
        c2 = ws.cell(i, 2, r["orders"]); c2.border = thin; c2.alignment = Alignment(horizontal="center")
        c3 = ws.cell(i, 3, round(r["total"], 2)); c3.border = thin; c3.number_format = "#,##0.00"
        avg = (r["total"] / r["orders"]) if r["orders"] else None
        c4 = ws.cell(i, 4, round(avg, 2) if avg is not None else ""); c4.border = thin
        if avg is not None:
            c4.number_format = "#,##0.00"
        pct = (r["total"] / month_total) if month_total else 0
        c5 = ws.cell(i, 5, pct); c5.border = thin; c5.number_format = "0.00%"
    total_row = 4 + len(rows) + 1
    ws.cell(total_row, 1, "TOTAL").font = Font(bold=True)
    ws.cell(total_row, 2, sum(r["orders"] for r in rows)).font = Font(bold=True)
    c = ws.cell(total_row, 3, round(month_total, 2)); c.font = Font(bold=True); c.number_format = "#,##0.00"
    c5 = ws.cell(total_row, 5, 1 if month_total else 0); c5.number_format = "0.00%"; c5.font = Font(bold=True)
    for i, w in enumerate([48, 10, 14, 14, 16], 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_summary_workbook(out_path: Path, client_name: str, monthly: dict):
    wb = Workbook()
    available = [m for m in sorted(monthly.keys()) if monthly[m]]
    eight = [m for m in available if m <= "08"]
    specs = [("Jan-Aug Summary", eight, "Jan–Aug 2026")]
    if any(m >= "09" for m in available):
        specs.append(("Jan-Sep Summary", available, "Jan–Sep 2026"))
    for label, month_keys, period_name in specs:
        if not month_keys:
            continue
        vendor_agg = defaultdict(lambda: {"orders": 0, "total": 0.0, "months": set()})
        period_total = 0.0
        for mm in month_keys:
            for r in monthly[mm]:
                a = vendor_agg[r["vendor"]]
                a["orders"] += r["orders"]
                a["total"] += r["total"]
                a["months"].add(mm)
                period_total += r["total"]
        rows = sorted(
            [{"vendor": v, "orders": a["orders"], "total": a["total"], "months": len(a["months"])}
             for v, a in vendor_agg.items()],
            key=lambda x: -x["total"],
        )
        ws = wb.create_sheet(label[:31])
        thin = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin"),
        )
        ws["A1"] = f"{client_name} — Vendor Spend Summary ({period_name})"
        ws["A1"].font = Font(bold=True, size=14)
        ws.merge_cells("A1:F1")
        ws["A2"] = (
            f"Period Total Purchases: {period_total:,.2f} | Months: "
            + ", ".join(month_label(m) for m in month_keys)
        )
        style_header(
            ws, 4,
            ["Vendor", "Orders", "Total Spend", "Avg per Order", "% of Period Total", "Months Active"],
        )
        for i, r in enumerate(rows, 5):
            ws.cell(i, 1, r["vendor"]).border = thin
            ws.cell(i, 2, r["orders"]).border = thin
            c3 = ws.cell(i, 3, round(r["total"], 2)); c3.border = thin; c3.number_format = "#,##0.00"
            avg = (r["total"] / r["orders"]) if r["orders"] else None
            c4 = ws.cell(i, 4, round(avg, 2) if avg is not None else ""); c4.border = thin
            if avg is not None:
                c4.number_format = "#,##0.00"
            pct = (r["total"] / period_total) if period_total else 0
            c5 = ws.cell(i, 5, pct); c5.border = thin; c5.number_format = "0.00%"
            ws.cell(i, 6, r["months"]).border = thin
        total_row = 4 + len(rows) + 1
        ws.cell(total_row, 1, "TOTAL").font = Font(bold=True)
        ws.cell(total_row, 2, sum(r["orders"] for r in rows)).font = Font(bold=True)
        c = ws.cell(total_row, 3, round(period_total, 2)); c.font = Font(bold=True); c.number_format = "#,##0.00"
        c5 = ws.cell(total_row, 5, 1 if period_total else 0); c5.number_format = "0.00%"; c5.font = Font(bold=True)
        for i, w in enumerate([48, 10, 14, 14, 16, 14], 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for mm in month_keys:
            mrows = monthly[mm]
            mtotal = sum(r["total"] for r in mrows)
            mws = wb.create_sheet(month_label(mm)[:31])
            write_month_sheet(mws, f"{client_name} — {month_label(mm)} Vendor Spend", mrows, mtotal)
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def build_all(root: Path):
    created, mismatches = [], []
    for vp in sorted(root.rglob("Vendor Purchases")):
        pdfs = sorted(vp.glob("*.pdf"))
        if not pdfs:
            continue
        client_folder = vp.parent.name
        by_month = defaultdict(list)
        for pdf in pdfs:
            m = re.search(r"(\d{2})2026\.pdf$", pdf.name)
            if m:
                by_month[m.group(1)].append(pdf)
        if not by_month:
            continue
        slug = re.sub(r"[^a-z0-9]+", "", client_folder.lower())[:24] or "client"
        monthly_data = {}
        for mm, plist in sorted(by_month.items()):
            vendors_map = defaultdict(lambda: {"orders": 0, "total": 0.0})
            grand = None
            for pdf in plist:
                parsed, g = parse_pdf_tables(pdf)
                if g is not None:
                    grand = g
                for v in parsed:
                    vendors_map[v["vendor"]]["orders"] += v["orders"]
                    vendors_map[v["vendor"]]["total"] += v["total"]
            rows = sorted(
                [{"vendor": n, "orders": d["orders"], "total": d["total"]} for n, d in vendors_map.items()],
                key=lambda x: -x["total"],
            )
            month_total = sum(r["total"] for r in rows)
            if grand is not None and abs(grand - month_total) > 0.05:
                mismatches.append((client_folder, mm, round(month_total, 2), grand, round(month_total - grand, 2)))
            monthly_data[mm] = rows
            wb = Workbook()
            ws = wb.active
            ws.title = month_label(mm)[:31]
            write_month_sheet(ws, f"{client_folder} — {month_label(mm)} Vendor Spend", rows, month_total)
            out = vp / f"{slug}_{mm}2026_vendor_spend.xlsx"
            wb.save(out)
            created.append(out)
        eight_path = vp / f"{slug}_2026_Jan-Aug_vendor_spend_summary.xlsx"
        write_summary_workbook(eight_path, client_folder, {k: v for k, v in monthly_data.items() if k <= "08"})
        created.append(eight_path)
        if any(k >= "09" for k in monthly_data):
            full_path = vp / f"{slug}_2026_Jan-Sep_vendor_spend_summary.xlsx"
            write_summary_workbook(full_path, client_folder, monthly_data)
            created.append(full_path)
    return created, mismatches


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1] / "reports" / "Clients"
    created, mismatches = build_all(root)
    print("FILES", len(created))
    print("MISMATCHES", len(mismatches))
    for m in mismatches:
        print(m)
