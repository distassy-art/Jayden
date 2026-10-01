#!/usr/bin/env python3
"""Thin CLI alias for SoftSP report pulls — see fill_daily_dly_dpt.py.

Examples:
  python3 scripts/pull_s2k_reports.py --show
  python3 scripts/pull_s2k_reports.py --list
  python3 scripts/pull_s2k_reports.py --phase 0 --show
  python3 scripts/pull_s2k_reports.py --kinds bos,recon --through 2026-09-23 --only 42352
  python3 scripts/pull_s2k_reports.py --mode daily
  python3 scripts/pull_s2k_reports.py --kinds dly,dpt
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python3 scripts/pull_s2k_reports.py` without installing a package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fill_daily_dly_dpt import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
