#!/usr/bin/env python3
"""Post Vista margin line: American Spirit sky (047995205404), qty 8 — supplement tran."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_vista_count as vc  # noqa: E402

SUPP_TRANREF = "CIG COUNT 09292026 B"
META = vc.WORKDIR / "post-meta-supplement.json"
# Margin note showed 047995205404; Vista S2K catalog is 047995200404 (same as other stores).
UPC = "047995200404"
MARGIN_NOTE_UPC = "047995205404"
QTY = 8
DESC = "American Spirit sky"


def post_supplement(session, line: dict) -> dict:
    if META.exists():
        prior = json.loads(META.read_text())
        if prior.get("id") and prior.get("tranref") == SUPP_TRANREF:
            return {"skipped": True, "id": prior["id"], "reason": "already posted (local meta)"}
    existing = vc.find_existing_tran(session, SUPP_TRANREF)
    if existing:
        return {"skipped": True, "id": existing.get("id"), "reason": "already posted in S2K"}

    tran_lines = [
        {
            "varid": line["varid"],
            "qty": float(line["actual"]),
            "cal_type": 0,
            "props": json.dumps({"sold": 0}),
            "model_dirty": True,
        }
    ]
    item = {
        "siteid": vc.SITEID,
        "tranref": SUPP_TRANREF,
        "trandate": vc.TRANDATE,
        "trandate2": vc.TRANDATE,
        "trantype": 10,
        "lines": tran_lines,
        "deleted_lines": [],
        "props": json.dumps(
            {
                "note": (
                    f"{vc.NAME} cigarette count supplement {vc.TRANDATE}. "
                    f"Margin note American Spirit sky ({MARGIN_NOTE_UPC} on sheet margin; S2K UPC {UPC}), 8 packs. "
                    f"Primary transaction {vc.TRANREF}."
                )
            }
        ),
        "model_dirty": True,
    }
    body = {
        "type": "item",
        "trantype": 10,
        "data": [item],
        "create_new": True,
        "return_get": True,
    }
    xsrf = session.cookies.get("XSRF-TOKEN")
    hdr = {"X-XSRF-TOKEN": xsrf} if xsrf else {}
    r = session.post(
        "https://store.s2kprime.com/api/tran/update/item-10-undefined",
        json=body,
        headers=hdr,
        timeout=120,
    )
    if r.status_code == 200 and "error" not in r.text.lower():
        data = r.json()
        if isinstance(data, list) and data:
            return {"skipped": False, "id": data[0].get("id"), "response": data[0]}
    raise RuntimeError(f"supplement post failed {r.status_code} {r.text[:400]}")


def main() -> None:
    logins = vc.build_all.load_logins()
    session, _ = vc.build_all.login(*logins["hotmail"])
    vc.build_all.switch(session, vc.ACCOUNT)

    qoh_path = vc.WORKDIR / "latest-qoh.json"
    if qoh_path.exists():
        qoh_by_upc = json.loads(qoh_path.read_text())
    else:
        packs_path = vc.pull_packs_xlsx(session)
        qoh_by_upc = vc.parse_qoh(packs_path)

    prod = vc.product_lookup(session, UPC)
    if not prod:
        raise SystemExit(f"no S2K product for UPC {UPC}")
    q = qoh_by_upc.get(UPC, {})
    qoh = float(q.get("qoh", 0))
    cost = float(q.get("cost") or 0)
    if cost <= 0 and prod.get("cost"):
        cost = float(prod["cost"])
    diff = float(QTY) - qoh
    line = {
        "n": 115,
        "upc": UPC,
        "desc": (prod.get("desc") or DESC).strip(),
        "actual": QTY,
        "qoh": qoh,
        "diff": diff,
        "cost": cost,
        "cost_delta": vc.round2(diff * cost),
        "varid": prod["id"],
        "qoh_asof": q.get("dt"),
        "dept": q.get("dept", "CIGARETTES - PACKS"),
    }
    post = post_supplement(session, line)
    tranid = post.get("id")
    meta = {
        "id": tranid,
        "tranref": SUPP_TRANREF,
        "trandate": vc.TRANDATE,
        "siteid": int(vc.SITEID),
        "nlines": 1,
        "post": post,
        "line": line,
    }
    META.write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))

    # Merge into packet + refresh summary/PDFs
    out_lines = json.loads((vc.OUT / "lines.json").read_text())
    if not any(r.get("upc") == UPC for r in out_lines):
        out_lines.append(line)
    (vc.OUT / "lines.json").write_text(json.dumps(out_lines, indent=2))

    actual_packs = sum(int(r["actual"]) for r in out_lines)
    actual_cost = vc.round2(sum(r["actual"] * r["cost"] for r in out_lines))
    minus = [r for r in out_lines if r["diff"] < 0]
    plus = [r for r in out_lines if r["diff"] > 0]
    minus_packs = sum(-r["diff"] for r in minus)
    plus_packs = sum(r["diff"] for r in plus)
    minus_cost = vc.round2(sum(-r["cost_delta"] for r in minus if r["cost_delta"] < 0))
    plus_cost = vc.round2(sum(r["cost_delta"] for r in plus if r["cost_delta"] > 0))
    overall = vc.round2(plus_cost - minus_cost)

    primary_id = json.loads((vc.WORKDIR / "post-meta.json").read_text()).get("id")
    summary = {
        "station": vc.STATION,
        "name": vc.NAME,
        "siteid": int(vc.SITEID),
        "date": vc.TRANDATE,
        "tranref": vc.TRANREF,
        "tranid": primary_id,
        "supplementTranref": SUPP_TRANREF,
        "supplementTranid": tranid,
        "linesPosted": len(out_lines) - 1,
        "supplementLinesPosted": 1,
        "marginPosted": [{"upc": UPC, "desc": DESC, "qty": QTY, "tranid": tranid}],
        "actualPacks": int(actual_packs),
        "actualCost": actual_cost,
        "minusPacks": int(minus_packs),
        "minusCost": minus_cost,
        "plusPacks": int(plus_packs),
        "plusCost": plus_cost,
        "overall": overall,
        "post": json.loads((vc.WORKDIR / "post-meta.json").read_text()).get("post", {}),
        "supplementPost": post,
        "narrative": (
            f"Vista S2K site {vc.SITEID}: actual {vc.money(actual_cost)} for {int(actual_packs)} packs "
            f"({len(out_lines) - 1} sheet lines plus margin American Spirit sky). "
            f"Primary {vc.TRANREF} transaction {primary_id}; supplement {SUPP_TRANREF} transaction {tranid}. "
            f"Minus {vc.money(minus_cost)} ({int(minus_packs)} packs), "
            f"plus {vc.money(plus_cost)} ({int(plus_packs)} packs). Overall {vc.money(overall)}."
        ),
    }
    (vc.WORKDIR / "summary.json").write_text(json.dumps(summary, indent=2))
    (Path("/workspace/vista-cigarette-count/summary.json")).write_text(json.dumps(summary, indent=2))

    vc.write_pdfs(out_lines, summary, primary_id)
    entry = vc.build_entry(summary, primary_id)
    entry["heading"] = (
        f"Count written September 29, 2026 from CIG SHEET 09292026. On that date, S2K quantity on hand was set to "
        f"those counted packs (SKU Inventory {vc.TRANREF}, S2K site {vc.SITEID}, transaction {primary_id}, "
        f"plus supplement {SUPP_TRANREF}, transaction {tranid}). "
        f"American Spirit sky, 8 packs on the margin note (S2K UPC {UPC}), was posted on the supplement."
    )
    entry["summary"] = summary["narrative"]
    entry["count"] = {
        "actualPacks": summary["actualPacks"],
        "actualCost": summary["actualCost"],
        "minusPacks": summary["minusPacks"],
        "minusCost": summary["minusCost"],
        "plusPacks": summary["plusPacks"],
        "plusCost": summary["plusCost"],
        "overall": summary["overall"],
    }
    s2k_note = entry["files"][3]
    s2k_note["note"] = (
        f"SKU Inventory {vc.TRANREF} (114 lines) and supplement {SUPP_TRANREF} "
        f"(American Spirit sky). {int(actual_packs)} packs total."
    )
    (vc.OUT / "entry.json").write_text(json.dumps(entry, indent=2))


if __name__ == "__main__":
    main()
