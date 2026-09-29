#!/usr/bin/env python3
"""Extract daily rows from standard store Daily.xlsx month sheets.

books-parse often misses the current month when date cells are DATE()
formulas with empty cached values. San Diego keeps values on
"<Month> Calculations" sheets; Brookhurst keeps them on
"<Month> YYYY Source" sheets.

Usage:
  python3 scripts/extract-daily-month-sheets.py <Daily.xlsx> [--min-month 2026-09]
Prints a JSON array of day objects to stdout.
"""
from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
DATE_F = re.compile(r"DATE\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", re.I)
MONTH_SHEET = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"(?:\s+(\d{4}))?(?:\s+Calculations|\s+Source)?$",
    re.I,
)
MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def resolve(target: str) -> str:
    target = target.replace("\\", "/")
    if target.startswith("/"):
        target = target[1:]
    return target if target.startswith("xl/") else "xl/" + target


def col_idx(ref: str) -> int:
    col = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in col:
        n = n * 26 + ord(ch.upper()) - 64
    return n - 1


def cell_val(c, strings):
    f = c.find(f"{NS}f")
    if f is not None and f.text:
        m = DATE_F.search(f.text.replace(" ", ""))
        if m:
            y, mo, d = map(int, m.groups())
            try:
                return (datetime(y, mo, d) - datetime(1899, 12, 30)).days
            except ValueError:
                pass
    t = c.get("t")
    v = c.find(f"{NS}v")
    isel = c.find(f"{NS}is")
    if t == "s" and v is not None and v.text and strings:
        try:
            return strings[int(v.text)]
        except Exception:
            return v.text
    if t == "inlineStr" and isel is not None:
        return "".join((x.text or "") for x in isel.iter(f"{NS}t"))
    if v is not None and v.text not in (None, ""):
        try:
            return float(v.text)
        except Exception:
            return v.text
    return None


def load_strings(z):
    try:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall(f"{NS}si"):
        out.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    return out


def grid(z, target, strings):
    root = ET.fromstring(z.read(target))
    cells = {}
    maxr = maxc = 0
    for c in root.iter(f"{NS}c"):
        ref = c.get("r")
        r = int("".join(ch for ch in ref if ch.isdigit()))
        ci = col_idx(ref)
        cells[(r, ci)] = cell_val(c, strings)
        maxr = max(maxr, r)
        maxc = max(maxc, ci)
    return [[cells.get((r, c)) for c in range(maxc + 1)] for r in range(1, maxr + 1)]


def r2(x):
    return None if x is None else round(float(x), 2)


def r4(x):
    return None if x is None else round(float(x), 4)


def excel_date(n):
    if not isinstance(n, (int, float)) or n < 40000:
        return None
    return datetime(1899, 12, 30) + timedelta(days=int(n))


def header_map(row):
    labels = [str(x or "").strip().lower() for x in row]

    def find(*needles, exclude=()):
        for i, h in enumerate(labels):
            if any(ex in h for ex in exclude):
                continue
            if all(n in h for n in needles):
                return i
        return None

    return {
        "vol": find("gas volume") or find("gas vol") or find("volume (gal)"),
        "gp": find("gas profit"),
        # Prefer C-Store Sales; never match "c-store total" via bare "sales".
        "sales": find("c-store sales")
        or find("store sales")
        or find("sales", exclude=("total", "gas", "fuel")),
        "cstore_total": find("c-store total") or find("cstore total"),
        "tax1": find("tax 1") or find("tax1"),
        "tax4": find("tax 4") or find("tax4"),
        "scratch": find("scratch"),
        "lotto": find("lotto"),
        "card": find("card"),
        "purch": find("purchase"),
        "sp": find("store profit"),
        "tp": find("total profit"),
        "sm": find("store margin") or find("margin", exclude=("gas",)),
    }


def day_obj(dt, sales, purch, vol, gp, sp, tp):
    if sp is None and sales is not None and purch is not None:
        sp = sales - purch
    if tp is None and sp is not None and gp is not None:
        tp = sp + gp
    sm = (sp / sales) if (sales and sp is not None) else None
    return {
        "date": dt.strftime("%Y-%m-%d"),
        "gas_vol": r2(vol),
        "gas_profit": r2(gp),
        "sales": r2(sales),
        "purch": r2(purch),
        "store_profit": r2(sp),
        "margin": r4(sm),
        "total_profit": r2(tp),
    }


# --- Net Purchases fallback --------------------------------------------------
# Rule: no purchases for a day = purch 0; unknown purchases are NOT 0.
# A purchases cell that is truly empty (or whose saved result is blank) means no
# purchases -> 0. A formula saved without a cached result (workbook written by a
# script, not recalculated in Excel) is worked out here from the same cells the
# workbook formula uses (Deduct / Purchase Log / Base Daily Purchases ...). If
# that is not possible, purch stays null and a WARNING line is printed to stderr.


class _Unknown(Exception):
    pass


class _XlError(Exception):
    pass


_TOK = re.compile(
    r"""\s*(?:
    (?P<str>"(?:[^"]|"")*")
    |(?P<sref>(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!\$?[A-Z]{1,3}\$?\d*(?::\$?[A-Z]{1,3}\$?\d*)?)
    |(?P<func>[A-Za-z_][\w.]*)\(
    |(?P<tref>[A-Za-z_][\w.]*\[[^\[\]]*\])
    |(?P<ref>\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3})
    |(?P<num>\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)
    |(?P<op><=|>=|<>|[-+*/^&=<>(),])
    |(?P<name>[A-Za-z_][\w.]*)
    )""",
    re.X,
)
_REF = re.compile(r"\$?([A-Z]{1,3})\$?(\d*)")


def _isnum(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


class _Range:
    def __init__(self, book, sheet, r1, c1, r2, c2, depth):
        self.book, self.sheet, self.r1, self.c1, self.r2, self.c2, self.depth = book, sheet, r1, c1, r2, c2, depth

    def cells(self):
        return [(r, c) for r in range(self.r1, self.r2 + 1) for c in range(self.c1, self.c2 + 1)]

    def get(self, rc):
        return self.book.value(self.sheet, rc[0], rc[1], self.depth)

    def values(self):
        return [self.get(rc) for rc in self.cells()]


class _Book:
    def __init__(self, z):
        self.z, self.strings, self.sheets, self.tables = z, load_strings(z), {}, None
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = {rel.get("Id"): rel.get("Target") for rel in rels}
        self.paths = {sh.get("name"): resolve(rid[sh.get(f"{REL}id")]) for sh in wb.findall(f"{NS}sheets/{NS}sheet")}

    def sheet(self, name):
        if name not in self.sheets:
            if name not in self.paths:
                raise _Unknown(f"sheet {name!r} not found")
            cells, maxr = {}, 0
            for c in ET.fromstring(self.z.read(self.paths[name])).iter(f"{NS}c"):
                ref = c.get("r")
                r, ci = int("".join(ch for ch in ref if ch.isdigit())), col_idx(ref)
                f, v, t = c.find(f"{NS}f"), c.find(f"{NS}v"), c.get("t")
                ftext = f.text if f is not None else None
                if f is not None and not ftext and f.get("t") == "shared":
                    ftext = "\0shared"
                if f is not None and t != "str" and (v is None or not v.text):
                    val, cached = None, False  # formula saved without a result (e.g. written by openpyxl)
                elif v is None and t != "inlineStr":
                    val, cached = None, True
                elif t == "s":
                    val, cached = self.strings[int(v.text)], True
                elif t in ("str", "inlineStr"):
                    val = (v.text or "") if v is not None else "".join(x.text or "" for x in c.iter(f"{NS}t"))
                    cached = True
                elif t == "b":
                    val, cached = v.text == "1", True
                elif t == "e":
                    val, cached = _XlError(v.text), True
                else:
                    val, cached = (float(v.text) if v.text not in (None, "") else None), True
                cells[(r, ci)] = (val, ftext, cached)
                maxr = max(maxr, r)
            self.sheets[name] = (cells, maxr)
        return self.sheets[name]

    def raw(self, sheet, r, c):
        return self.sheet(sheet)[0].get((r, c), (None, None, True))

    def value(self, sheet, r, c, depth=0):
        val, ftext, cached = self.raw(sheet, r, c)
        if not cached:
            if depth > 6:
                raise _Unknown("formula chain too deep")
            val = self.evaluate(ftext, sheet, depth + 1)
            if isinstance(val, list):
                val = val[0] if val else None
        if isinstance(val, _XlError):
            raise val
        return val

    def table(self, name):
        if self.tables is None:
            self.tables = {}
            for sname, path in self.paths.items():
                relp = path.rsplit("/", 1)[0] + "/_rels/" + path.rsplit("/", 1)[1] + ".rels"
                try:
                    rels = ET.fromstring(self.z.read(relp))
                except KeyError:
                    continue
                for rel in rels:
                    tgt = rel.get("Target") or ""
                    if "tables/" not in tgt:
                        continue
                    tpath = "xl/tables/" + tgt.rsplit("/", 1)[1]
                    t = ET.fromstring(self.z.read(tpath))
                    a, b = t.get("ref").split(":")
                    names = [tc.get("name") for tc in t.iter(f"{NS}tableColumn")]
                    r1 = int(_REF.match(a).group(2)) + int(t.get("headerRowCount", "1"))
                    r2 = int(_REF.match(b).group(2)) - int(t.get("totalsRowCount", "0"))
                    for key in (t.get("name"), t.get("displayName")):
                        if key:
                            self.tables[key.lower()] = (sname, r1, col_idx(a), r2, names)
        return self.tables.get(name.lower())

    # -- formula evaluation (read-only; only what purchases formulas use) --
    def evaluate(self, ftext, sheet, depth):
        if not ftext or ftext.startswith("\0"):
            raise _Unknown("shared/empty formula")
        toks, pos, s = [], 0, ftext.lstrip("=")
        while pos < len(s):
            m = _TOK.match(s, pos)
            if not m or m.end() == pos:
                if s[pos:].strip() == "":
                    break
                raise _Unknown(f"cannot read formula near {s[pos:pos + 12]!r}")
            pos = m.end()
            toks.append((m.lastgroup, m.group(m.lastgroup)))
        self._t, self._i = toks, 0
        node = self._expr()
        if self._i != len(toks):
            raise _Unknown("unparsed formula tail")
        return self._ev(node, sheet, depth)

    def _peek(self):
        return self._t[self._i] if self._i < len(self._t) else (None, None)

    def _take(self):
        tok = self._peek()
        self._i += 1
        return tok

    def _bin(self, sub, ops):
        node = sub()
        while self._peek()[0] == "op" and self._peek()[1] in ops:
            node = ("bin", self._take()[1], node, sub())
        return node

    def _expr(self):
        return self._bin(self._cat, ("=", "<>", "<", ">", "<=", ">="))

    def _cat(self):
        return self._bin(self._add, ("&",))

    def _add(self):
        return self._bin(self._mul, ("+", "-"))

    def _mul(self):
        return self._bin(self._unary, ("*", "/"))

    def _unary(self):
        if self._peek() == ("op", "-"):
            self._take()
            return ("neg", self._unary())
        if self._peek() == ("op", "+"):
            self._take()
            return self._unary()
        return self._prim()

    def _prim(self):
        kind, text = self._take()
        if kind == "num":
            return ("lit", float(text))
        if kind == "str":
            return ("lit", text[1:-1].replace('""', '"'))
        if kind in ("ref", "sref", "tref"):
            return (kind, text)
        if kind == "name" and text.upper() in ("TRUE", "FALSE"):
            return ("lit", text.upper() == "TRUE")
        if kind == "op" and text == "(":
            node = self._expr()
            if self._take() != ("op", ")"):
                raise _Unknown("missing )")
            return node
        if kind == "func":
            args = []
            if self._peek() == ("op", ")"):
                self._take()
                return ("fn", text.upper().replace("_XLFN.", ""), args)
            while True:
                args.append(("lit", None) if self._peek() in (("op", ","), ("op", ")")) else self._expr())
                sep = self._take()
                if sep == ("op", ")"):
                    return ("fn", text.upper().replace("_XLFN.", ""), args)
                if sep != ("op", ","):
                    raise _Unknown("bad function arguments")
        raise _Unknown(f"unsupported token {text!r}")

    def _range(self, text, sheet, depth):
        if "!" in text:
            sheet, text = text.rsplit("!", 1)
            if sheet.startswith("'"):
                sheet = sheet[1:-1].replace("''", "'")
        parts = text.split(":")
        a = _REF.match(parts[0])
        b = _REF.match(parts[-1])
        maxr = self.sheet(sheet)[1]
        r1 = int(a.group(2)) if a.group(2) else 1
        r2 = int(b.group(2)) if b.group(2) else maxr
        return _Range(self, sheet, r1, col_idx(a.group(1)), min(r2, max(maxr, r1)), col_idx(b.group(1)), depth)

    def _ev(self, node, sheet, depth, want_range=False):
        kind = node[0]
        if kind == "lit":
            return node[1]
        if kind in ("ref", "sref"):
            rng = self._range(node[1], sheet, depth)
            if want_range:
                return rng
            if rng.r1 == rng.r2 and rng.c1 == rng.c2:
                return rng.get((rng.r1, rng.c1))
            return rng.values()
        if kind == "tref":
            tname, col = node[1][:-1].split("[", 1)
            t = self.table(tname)
            if not t or col not in t[4]:
                raise _Unknown(f"table ref {node[1]!r}")
            c = t[2] + t[4].index(col)
            rng = _Range(self, t[0], t[1], c, t[3], c, depth)
            return rng if want_range else rng.values()
        if kind == "neg":
            return self._arith("-", 0.0, self._ev(node[1], sheet, depth))
        if kind == "bin":
            return self._arith(node[1], self._ev(node[2], sheet, depth), self._ev(node[3], sheet, depth))
        if kind == "fn":
            return self._fn(node[1], node[2], sheet, depth)
        raise _Unknown(kind)

    @staticmethod
    def _num(v):
        if isinstance(v, _XlError):
            raise v
        if v is None:
            return 0.0
        if isinstance(v, bool):
            return float(v)
        if _isnum(v):
            return float(v)
        try:
            return float(v)
        except (TypeError, ValueError):
            raise _XlError("#VALUE!")

    @staticmethod
    def _eq(a, b):
        if a in (None, "") and b in (None, "", 0):
            return True
        if b in (None, "") and a in (None, "", 0):
            return True
        if _isnum(a) and _isnum(b):
            return abs(a - b) < 1e-9
        if isinstance(a, str) and isinstance(b, str):
            return a.lower() == b.lower()
        return a == b

    def _arith(self, op, a, b):
        if isinstance(a, list) or isinstance(b, list):
            n = max(len(a) if isinstance(a, list) else 1, len(b) if isinstance(b, list) else 1)
            aa = a if isinstance(a, list) else [a] * n
            bb = b if isinstance(b, list) else [b] * n
            if len(aa) != len(bb):
                raise _XlError("#VALUE!")
            return [self._arith(op, x, y) for x, y in zip(aa, bb)]
        if op == "&":
            fmt = lambda v: "" if v is None else (str(int(v)) if _isnum(v) and float(v).is_integer() else str(v))
            return fmt(a) + fmt(b)
        if op in ("=", "<>"):
            return self._eq(a, b) == (op == "=")
        if op in ("<", ">", "<=", ">="):
            if (a is None or _isnum(a)) and (b is None or _isnum(b)):
                x, y = self._num(a), self._num(b)
            else:
                raise _Unknown("text comparison")
            return {"<": x < y, ">": x > y, "<=": x <= y, ">=": x >= y}[op]
        x, y = self._num(a), self._num(b)
        if op == "+":
            return x + y
        if op == "-":
            return x - y
        if op == "*":
            return x * y
        if op == "/":
            if y == 0:
                raise _XlError("#DIV/0!")
            return x / y
        raise _Unknown(f"operator {op}")

    @staticmethod
    def _crit(c):
        if _isnum(c):
            return lambda v: _isnum(v) and abs(v - c) < 1e-9
        m = re.match(r"(<=|>=|<>|<|>|=)?(.*)$", "" if c is None else str(c), re.S)
        op, rest = m.group(1) or "=", m.group(2)
        if rest == "":
            return (lambda v: v not in (None, "")) if op == "<>" else (lambda v: v in (None, ""))
        try:
            num = float(rest)
        except ValueError:
            if op == "=":
                return lambda v: isinstance(v, str) and v.lower() == rest.lower()
            if op == "<>":
                return lambda v: not (isinstance(v, str) and v.lower() == rest.lower())
            raise _Unknown("text criteria")
        cmp = {"=": lambda v: abs(v - num) < 1e-9, "<>": lambda v: abs(v - num) >= 1e-9, "<": lambda v: v < num,
               ">": lambda v: v > num, "<=": lambda v: v <= num, ">=": lambda v: v >= num}[op]
        return lambda v: cmp(v) if _isnum(v) else op == "<>"

    def _ifs(self, args, sheet, depth, sum_node=None):
        pairs = []
        for i in range(0, len(args), 2):
            rng = self._ev(args[i], sheet, depth, want_range=True)
            if not isinstance(rng, _Range):
                raise _Unknown("criteria range")
            pairs.append((rng, self._crit(self._ev(args[i + 1], sheet, depth))))
        n = len(pairs[0][0].cells())
        hits = [k for k in range(n) if all(p[1](p[0].get(p[0].cells()[k])) for p in pairs)]
        if sum_node is None:
            return float(len(hits))
        srng = self._ev(sum_node, sheet, depth, want_range=True)
        if not isinstance(srng, _Range):
            raise _Unknown("sum range")
        sc = srng.cells()
        total = 0.0
        for k in hits:
            v = srng.get(sc[k])
            if isinstance(v, _XlError):
                raise v
            total += float(v) if _isnum(v) else 0.0
        return total

    def _fn(self, name, args, sheet, depth):
        ev = lambda node: self._ev(node, sheet, depth)
        truthy = lambda v: bool(self._num(v)) if not isinstance(v, str) else (_ for _ in ()).throw(_XlError("#VALUE!"))
        flat = lambda vals: [x for v in vals for x in (v if isinstance(v, list) else [v])]
        if name == "IF":
            cond = ev(args[0])
            return ev(args[1]) if truthy(cond) else (ev(args[2]) if len(args) > 2 else False)
        if name == "IFERROR":
            try:
                return ev(args[0])
            except _XlError:
                return ev(args[1])
        if name in ("AND", "OR"):
            vals = [truthy(v) for v in flat([ev(a) for a in args])]
            return all(vals) if name == "AND" else any(vals)
        if name == "NOT":
            return not truthy(ev(args[0]))
        if name == "ISNUMBER":
            return _isnum(ev(args[0]))
        if name == "N":
            v = ev(args[0])
            return float(v) if _isnum(v) else 0.0
        if name in ("SUM", "MAX", "MIN"):
            nums = []
            for a in args:
                v = ev(a)
                nums += [float(x) for x in v if _isnum(x)] if isinstance(v, list) else [self._num(v)]
            if name == "SUM":
                return sum(nums)
            return (max if name == "MAX" else min)(nums) if nums else 0.0
        if name in ("COUNT", "COUNTA"):
            vals = flat([ev(a) for a in args])
            return float(sum(1 for v in vals if (_isnum(v) if name == "COUNT" else v not in (None, ""))))
        if name in ("COUNTIF", "COUNTIFS"):
            return self._ifs(args, sheet, depth)
        if name == "SUMIFS":
            return self._ifs(args[1:], sheet, depth, sum_node=args[0])
        if name == "SUMIF":
            return self._ifs(args[:2], sheet, depth, sum_node=args[2] if len(args) > 2 else args[0])
        if name == "SUMPRODUCT":
            arrs = [ev(a) for a in args]
            arrs = [a if isinstance(a, list) else [a] for a in arrs]
            total = 0.0
            for row in zip(*arrs):
                p = 1.0
                for v in row:
                    if isinstance(v, _XlError):
                        raise v
                    p *= float(v) if (_isnum(v) or isinstance(v, bool)) else 0.0
                total += p
            return total
        if name == "XLOOKUP":
            key = ev(args[0])
            look = self._ev(args[1], sheet, depth, want_range=True)
            ret = self._ev(args[2], sheet, depth, want_range=True)
            if not isinstance(look, _Range) or not isinstance(ret, _Range):
                raise _Unknown("XLOOKUP ranges")
            lc, rc = look.cells(), ret.cells()
            for k, cell in enumerate(lc):
                if key not in (None, "") and self._eq(look.get(cell), key):
                    return ret.get(rc[k])
            if len(args) > 3:
                return ev(args[3])
            raise _XlError("#N/A")
        if name == "EOMONTH":
            base = excel_date(self._num(ev(args[0])))
            if base is None:
                raise _XlError("#VALUE!")
            mm = base.year * 12 + base.month - 1 + int(self._num(ev(args[1])))
            y, mo = divmod(mm, 12)
            last = datetime(y, mo + 1, calendar.monthrange(y, mo + 1)[1])
            return float((last - datetime(1899, 12, 30)).days)
        if name == "DATE":
            y, mo, d = (int(self._num(ev(a))) for a in args[:3])
            return float((datetime(y, 1, 1) - datetime(1899, 12, 30)).days + (datetime(y + (mo - 1) // 12, (mo - 1) % 12 + 1, 1) - datetime(y, 1, 1)).days + d - 1)
        if name == "ABS":
            return abs(self._num(ev(args[0])))
        raise _Unknown(f"function {name}")


def _purch_fallback(book, sheet, r, c, path, dt):
    """purch for a real day whose Net Purchases cell read as blank: 0 if truly empty, else worked out, else None."""
    where = f"{path.rsplit('/', 1)[-1]} {dt.strftime('%Y-%m-%d')} ({sheet}!R{r}C{(c or 0) + 1})"
    try:
        if c is None:
            raise _Unknown("no Net Purchases column")
        val, ftext, cached = book.raw(sheet, r, c)
        if cached:
            if val is None or (isinstance(val, str) and val.strip() in ("", "-")):
                return 0.0  # truly empty / blank result = no purchases
            raise _Unknown(f"non-numeric value {val!r}")
        res = book.evaluate(ftext, sheet, 1)
        if isinstance(res, list):
            res = res[0] if res else None
        if res is None or res == "":
            return 0.0  # the workbook formula itself says: no purchases
        if _isnum(res):
            return float(res)
        raise _Unknown(f"formula result {res!r}")
    except (_Unknown, _XlError, KeyError, ValueError, IndexError, RecursionError) as exc:
        print(f"WARNING extract-daily-month-sheets: {where}: Net Purchases formula has no saved value and could not be "
              f"worked out ({exc.__class__.__name__}: {exc}) - purch left null, not 0", file=sys.stderr)
        return None


def extract_days(path: str, min_month="2026-09"):
    days = []
    with zipfile.ZipFile(path) as z:
        strings = load_strings(z)
        book = _Book(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = {rel.get("Id"): rel.get("Target") for rel in rels}
        for sh in wb.findall(f"{NS}sheets/{NS}sheet"):
            name = sh.get("name")
            m = MONTH_SHEET.match(name or "")
            if not m:
                continue
            year = int(m.group(2)) if m.group(2) else 2026
            month = MONTHS[m.group(1).lower()]
            if f"{year:04d}-{month:02d}" < min_month:
                continue
            target = resolve(rid[sh.get(f"{REL}id")])
            rows = grid(z, target, strings)
            hi = None
            cols = None
            for i, row in enumerate(rows[:20]):
                labels = [str(x or "").strip().lower() for x in row]
                if labels and "date" in labels[0] and any("gas" in h and "vol" in h for h in labels):
                    hi = i
                    cols = header_map(row)
                    break
            if hi is None:
                continue

            def g(row, k):
                i = cols.get(k)
                if i is None or i >= len(row):
                    return None
                v = row[i]
                return v if isinstance(v, (int, float)) else None

            def sales_from_total(row):
                """C-Store Sales is often =J-SUM(taxes) with no cached value."""
                total = g(row, "cstore_total")
                if total is None:
                    return None
                taxes = 0.0
                for k in ("tax1", "tax4", "scratch", "lotto", "card"):
                    v = g(row, k)
                    if isinstance(v, (int, float)):
                        taxes += float(v)
                return total - taxes

            for offset, row in enumerate(rows[hi + 1 :]):
                if row and isinstance(row[0], str) and str(row[0]).strip():
                    break
                dt = excel_date(row[0] if row else None)
                if not dt:
                    dayn = offset + 1
                    last = calendar.monthrange(year, month)[1]
                    if dayn > last:
                        continue
                    dt = datetime(year, month, dayn)
                if dt.year != year or dt.month != month:
                    continue
                sales, purch, vol, gp, sp, tp = (
                    g(row, "sales"),
                    g(row, "purch"),
                    g(row, "vol"),
                    g(row, "gp"),
                    g(row, "sp"),
                    g(row, "tp"),
                )
                if sales is None:
                    sales = sales_from_total(row)
                if not any(isinstance(v, (int, float)) and v != 0 for v in (sales, purch, vol, gp, sp, tp)):
                    continue
                if purch is None and (sales is not None or vol is not None or gp is not None):
                    purch = _purch_fallback(book, name, hi + 2 + offset, cols.get("purch"), path, dt)
                days.append(day_obj(dt, sales, purch, vol, gp, sp, tp))
    by = {d["date"]: d for d in days}
    return [by[k] for k in sorted(by)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xlsx")
    ap.add_argument("--min-month", default="2026-09", help="YYYY-MM inclusive lower bound")
    args = ap.parse_args()
    extra = extract_days(args.xlsx, min_month=args.min_month)
    json.dump(extra, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
