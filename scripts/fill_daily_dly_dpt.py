#!/usr/bin/env python3
"""Fill S2K Daily Book Summary / DLY / DPT into OneDrive client folders.

Reports (S2K):
  - Daily  = DailyTotal+Summary with ShowCost=1  (one PDF per business day)
  - DLY    = None Fuel Invoice Total             (month-to-date; keep latest only)
  - DPT    = DailyAPInvoice                      (collapsed vendor summary MTD; keep latest only)

Policy:
  - Daily files accumulate (MMDDYYYY.pdf).
  - DLY/DPT are month-to-date: after uploading the latest
    MMDDYYYYdly.pdf / MMDDYYYYdpt.pdf, delete older dly/dpt files in that month folder.

Schedule (America/Los_Angeles) — see scripts/s2k_report_schedule.md:
  - DLY + DPT: Wed 8:00 AM, Sun 4:00 AM
  - Daily Book Summary: every day 2:00 PM
  - Daily Excel update (from Daily PDFs): Mon/Wed/Fri/Sun 8:00 AM

Requires:
  - S2K logins (gmail / hotmail / placentia)
  - SharePoint cookies at /tmp/od_cookies.json (FedAuth) for upload + recycle

This script encodes the store map and report parameters used by the cloud agent.
"""

from __future__ import annotations

# Store map used for Sep 2026 fill (through day-behind):
STORES = [
    # key, login_group, account_id, site_id, onedrive Daily Summary folder (under Clients/)
    ("42179_HB", "gmail", -218, "208", "42179 (Arco HB)/2026-09 September/Daily Summary"),
    ("42352_Db", "gmail", -325, "387", "42352 (Arco Db)/2026-09 September/Daily Summary"),
    ("42004_Pl", "placentia", -631, "933", "42004 (Arco Placentia)/2026-09 September/Daily Summary"),
    ("42674_Tu", "hotmail", -243, "247", "BIG DADDY/42674 (Tustin)/2026-09 September/Daily Summary"),
]

# Big Daddy multi-station (all sites from hotmail account -121) lands in central PDF folders:
BD_CENTRAL = {
    "daily": "BIG DADDY/PDF/daily/2026-09 September",
    "dly": "BIG DADDY/PDF/dly/2026-09 September",
    "dpt": "BIG DADDY/PDF/dpt/2026-09 September",
}

REPORTS = {
    "daily": {"rpt": "DailyTotal+Summary", "extra": {"ShowCost": "1"}},
    "dly": {"rpt": "None Fuel Invoice Total", "extra": {}},
    "dpt": {"rpt": "DailyAPInvoice", "extra": {}},  # baseline = collapse-all vendor summary
}

if __name__ == "__main__":
    print("Store map:")
    for row in STORES:
        print(" ", row)
    print("BD central:", BD_CENTRAL)
    print("Reports:", REPORTS)
    print("Run via cloud agent with live S2K + OneDrive cookies.")
