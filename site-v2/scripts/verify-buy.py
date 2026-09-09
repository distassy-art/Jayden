#!/usr/bin/env python3
"""Recompute the buy page's figures straight from manager.json and compare.

The console derives the open month in JavaScript. This does the same arithmetic
in Python, from the raw feed, without reading any of that code — so a mistake
has to be made twice, in two languages, to survive.

    node scripts/dump-buy.mjs > /tmp/buy.json
    curl -s http://localhost:8787/api/data/manager.json > /tmp/manager.json
    python3 scripts/verify-buy.py /tmp/buy.json /tmp/manager.json
"""

import json
import re
import sys
from calendar import monthrange
from collections import defaultdict

TOTAL_ROW = re.compile(r"^total\b", re.I)
SUMMABLE = ["sales", "purchases", "store_profit", "gas_vol", "gas_profit", "total_profit"]

checks = 0
failures = 0


def close(a, b, tol=0.02):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return abs(float(a) - float(b)) <= tol


def check(ok, message):
    global checks, failures
    checks += 1
    if not ok:
        failures += 1
        print(f"  FAIL  {message}")


def num(value):
    return float(value) if isinstance(value, (int, float)) else None


def main():
    console = json.load(open(sys.argv[1]))
    feed = json.load(open(sys.argv[2]))
    stations = {str(s["id"]): s for s in feed["stations"]}

    print(f"Verifying the open month for {len(stations)} stores\n")

    # ---- per store -------------------------------------------------------
    print("Per store")
    for store in console["stores"]:
        raw = stations.get(store["id"])
        check(raw is not None, f"{store['id']}: not in the feed")
        if raw is None:
            continue

        mtd = raw.get("mtd") or {}
        for key in SUMMABLE:
            if num(mtd.get(key)) is not None:
                check(close(store["mtd"].get(key), mtd[key]),
                      f"{store['id']} mtd {key}: {store['mtd'].get(key)} vs {mtd[key]}")

        # Margin and buy ratio are recomputed, never carried over.
        if num(mtd.get("sales")):
            check(close(store["mtd"]["margin"], mtd["store_profit"] / mtd["sales"], 1e-6),
                  f"{store['id']}: store margin does not divide out")
            check(close(store["mtd"]["buy_ratio"], mtd["purchases"] / mtd["sales"], 1e-6),
                  f"{store['id']}: buy ratio does not divide out")

        # Department budget, with any synthetic total row dropped.
        items = [i for i in ((raw.get("dept_budget") or {}).get("items") or [])
                 if not TOTAL_ROW.match(i.get("name", ""))]
        check(len(items) == len(store["deptBudget"]),
              f"{store['id']}: {len(store['deptBudget'])} budget rows, feed has {len(items)}")
        by_name = {i["name"]: i for i in items}
        for row in store["deptBudget"]:
            src = by_name.get(row["name"])
            check(src is not None, f"{store['id']}: {row['name']} is not in the feed")
            if src is None:
                continue
            check(close(row["spent"], src.get("purchases_mtd") or 0),
                  f"{store['id']} {row['name']}: spent {row['spent']} vs {src.get('purchases_mtd')}")
            check(close(row["budget"], src.get("month_budget")),
                  f"{store['id']} {row['name']}: budget {row['budget']} vs {src.get('month_budget')}")
            if num(src.get("month_budget")) is not None:
                check(close(row["left"], src["month_budget"] - (src.get("purchases_mtd") or 0)),
                      f"{store['id']} {row['name']}: headroom does not subtract")

        # Weekly ceilings.
        weeks = raw.get("weekly_budget") or []
        check(len(weeks) == len(store["weeks"]),
              f"{store['id']}: {len(store['weeks'])} weeks, feed has {len(weeks)}")
        for i, week in enumerate(weeks):
            if i >= len(store["weeks"]):
                break
            got = store["weeks"][i]
            check(close(got["maximum"], week.get("maximum")),
                  f"{store['id']} week {i + 1}: ceiling {got['maximum']} vs {week.get('maximum')}")
            check(close(got["actual"], week.get("actual")),
                  f"{store['id']} week {i + 1}: spend {got['actual']} vs {week.get('actual')}")
            if num(week.get("maximum")) is not None and num(week.get("actual")) is not None:
                check(close(got["over"], week["actual"] - week["maximum"]),
                      f"{store['id']} week {i + 1}: standing does not subtract")

        # Straight-line pace.
        if store.get("projection"):
            days = mtd.get("days") or 0
            month_days = monthrange(int(mtd["through"][:4]), int(mtd["through"][5:7]))[1]
            check(store["projection"]["daysInMonth"] == month_days,
                  f"{store['id']}: month length {store['projection']['daysInMonth']} vs {month_days}")
            for key in ("sales", "purchases", "store_profit"):
                if num(mtd.get(key)) is not None:
                    check(close(store["projection"][key], mtd[key] * month_days / days, 0.05),
                          f"{store['id']} pace {key}: does not scale by {month_days}/{days}")

    print(f"  ok    {len(console['stores'])} stores reconciled line by line\n")

    # ---- roll-ups --------------------------------------------------------
    print("Roll-ups")
    totals = defaultdict(float)
    for raw in feed["stations"]:
        for key in SUMMABLE:
            if num((raw.get("mtd") or {}).get(key)) is not None:
                totals[key] += raw["mtd"][key]

    for key in SUMMABLE:
        check(close(console["rollup"]["mtd"].get(key), totals[key], 0.05),
              f"rollup mtd {key}: {console['rollup']['mtd'].get(key)} vs {totals[key]}")

    check(close(console["rollup"]["mtd"]["buy_ratio"],
                totals["purchases"] / totals["sales"], 1e-6),
          "rollup: buy ratio was averaged rather than recomputed")

    # Days must be a span, not a sum.
    longest = max((s.get("mtd") or {}).get("days") or 0 for s in feed["stations"])
    check(console["rollup"]["mtd"]["days"] == longest,
          f"rollup: {console['rollup']['mtd']['days']} days, longest run is {longest}")

    budget = defaultdict(lambda: [0.0, 0.0])
    for raw in feed["stations"]:
        for item in ((raw.get("dept_budget") or {}).get("items") or []):
            if TOTAL_ROW.match(item.get("name", "")):
                continue
            budget[item["name"]][0] += item.get("purchases_mtd") or 0
            budget[item["name"]][1] += item.get("month_budget") or 0

    check(len(budget) == len(console["rollup"]["deptBudget"]),
          f"rollup: {len(console['rollup']['deptBudget'])} departments, feed has {len(budget)}")
    for row in console["rollup"]["deptBudget"]:
        spent, allowed = budget.get(row["name"], (None, None))
        check(close(row["spent"], spent), f"rollup {row['name']}: spend {row['spent']} vs {spent}")
        check(close(row["budget"], allowed), f"rollup {row['name']}: budget {row['budget']} vs {allowed}")

    weeks = defaultdict(lambda: [0.0, 0.0])
    for raw in feed["stations"]:
        for i, week in enumerate(raw.get("weekly_budget") or []):
            weeks[i][0] += week.get("maximum") or 0
            weeks[i][1] += week.get("actual") or 0
    check(len(weeks) == len(console["rollup"]["weeks"]),
          f"rollup: {len(console['rollup']['weeks'])} weeks, feed has {len(weeks)}")
    for row in console["rollup"]["weeks"]:
        allowed, actual = weeks.get(row["index"], (None, None))
        check(close(row["maximum"], allowed), f"rollup week {row['index'] + 1}: ceiling mismatch")
        check(close(row["actual"], actual), f"rollup week {row['index'] + 1}: spend mismatch")

    # Blended department targets are weighted by sales, not averaged flat.
    weighted = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for raw in feed["stations"]:
        for dept in (raw.get("departments") or []):
            slot = weighted[dept["name"]]
            slot[0] += dept.get("sales") or 0
            slot[1] += dept.get("profit") or 0
            if num(dept.get("target_margin")) is not None and num(dept.get("sales")) is not None:
                slot[2] += dept["target_margin"] * dept["sales"]
                slot[3] += dept["sales"]
    for row in console["rollup"]["departments"]:
        sales, profit, tw, ts = weighted[row["name"]]
        check(close(row["sales"], sales), f"rollup dept {row['name']}: sales mismatch")
        check(close(row["profit"], profit), f"rollup dept {row['name']}: profit mismatch")
        if ts:
            check(close(row["target"], tw / ts, 1e-6),
                  f"rollup dept {row['name']}: target was averaged flat, not weighted by sales")

    print(f"  ok    {len(budget)} departments, {len(weeks)} weeks, "
          f"{len(console['rollup']['departments'])} traded departments\n")

    print(f"{checks - failures}/{checks} figures verified")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
