#!/usr/bin/env bash
# site-publish-bridge.sh — copy Jayden site-publish/<path> changes into ss-unified-proto <path>,
# gate them with ss-unified-proto's own checks, and push ONE commit to its main (never forced).
# Run by .github/workflows/publish-to-site.yml, which always loads this file from Jayden main.
#
# Env (set by the workflow):
#   SS_PROTO_PUSH_TOKEN  token with Contents: write on distassy-art/ss-unified-proto (never printed)
#   JAYDEN_DIR           Jayden checkout at the pushed commit (full history)
#   PROTO_DIR            where to clone ss-unified-proto
#   EVENT_NAME           push | workflow_dispatch
#   BEFORE_SHA AFTER_SHA the push range (push events)
#   REF_NAME             Jayden branch
#   DISPATCH_FILES       workflow_dispatch: optional space-separated site-publish/ paths
#   RUN_URL              this Actions run (for the commit body)
# Local testing only: BRIDGE_DRY_RUN=1 runs every step except the push; BRIDGE_NO_LIVE_WAIT=1 skips
# the live check; PROTO_URL overrides the clone URL.
set -euo pipefail
umask 022
export GIT_TERMINAL_PROMPT=0 LC_ALL=C

PROTO_URL="${PROTO_URL:-https://github.com/distassy-art/ss-unified-proto.git}"
PROTO_WEB="https://github.com/distassy-art/ss-unified-proto"
PREFIX="site-publish/"
MAX_BYTES=$((25 * 1024 * 1024))
LIVE_WAIT_SECS="${LIVE_WAIT_SECS:-720}"
: "${JAYDEN_DIR:?}" "${PROTO_DIR:?}" "${EVENT_NAME:?}" "${AFTER_SHA:?}"

# Destinations the bridge may write, as extended regexes on the ss-unified-proto path. To allow a
# new data path, add it here in a commit to Jayden main (branches cannot change this file's effect).
ALLOW_RE=(
  '^public/data/.+'
  '^api/cf-dist/data/.+'
  '^public/inventory/.+'
  '^public/reports/.+'
  '^public/order-comparisons/.+'
  '^public/orders\.json$'
  '^public/billing-live\.json$'
  '^public/command-category-yoy\.json$'
)
# Always refused, even inside an allowed directory.
DENY_RE=(
  '(^|/)\.'                     # dotfiles / hidden dirs (.github, .well-known, .env ...)
  '^api/src/'
  '(^|/)new1?(/|$)'             # /new and /new1 (retired sites)
  'app\.html'                   # any app shell copy
  '_locked-(shell|marketing)'
  '(^|/)(worker\.js|wrangler\.[a-z]+|package(-lock)?\.json|MANIFEST\.sha256|update-manifest\.sh|_headers|_redirects|_routes\.json)$'
  '42642'                       # La Mesa is not a client
)
EXT_OK='^(json|pdf|txt|csv|xlsx|xls|png|jpg|jpeg|webp)$'

err()  { echo "::error::$*" >&2; }
die()  { err "$*"; echo "bridge: NOTHING was published." >&2; exit 1; }
note() { echo "bridge: $*"; }

# git with the token supplied by an inline credential helper (never in argv, config or output).
git_auth() {
  git -c credential.helper= \
      -c credential.helper='!f(){ test "$1" = get || exit 0; echo username=x-access-token; echo "password=${SS_PROTO_PUSH_TOKEN}"; }; f' \
      "$@"
}

# ------------------------------------------------------------------ 1. what did this push change?
cd "$JAYDEN_DIR"
AFTER="$(git rev-parse --verify "${AFTER_SHA}^{commit}")"
ZERO='0000000000000000000000000000000000000000'
declare -a CH_STATUS=() CH_PATH=()

add_change() { CH_STATUS+=("$1"); CH_PATH+=("$2"); }

diff_range() {   # $1 = base commit
  local st p
  while IFS=$'\t' read -r st p; do
    [[ -n "$p" ]] || continue
    case "$st" in A|M|T) add_change U "$p" ;; D) add_change D "$p" ;; *) die "unexpected git status '$st' for $p" ;; esac
  done < <(git -c core.quotePath=false diff --no-renames --name-status "$1" "$AFTER" -- "$PREFIX")
}

if [[ "$EVENT_NAME" == "workflow_dispatch" && -n "${DISPATCH_FILES// /}" ]]; then
  note "manual run: publishing the listed files from $REF_NAME@${AFTER:0:12}"
  for p in $DISPATCH_FILES; do
    [[ "$p" == "$PREFIX"* ]] || die "dispatch file '$p' is not under $PREFIX"
    if git cat-file -e "$AFTER:$p" 2>/dev/null; then add_change U "$p"; else add_change D "$p"; fi
  done
elif [[ "$EVENT_NAME" == "push" && -n "${BEFORE_SHA:-}" && "$BEFORE_SHA" != "$ZERO" ]] \
     && git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null \
     && git merge-base --is-ancestor "$BEFORE_SHA" "$AFTER"; then
  note "push to $REF_NAME: ${BEFORE_SHA:0:12}..${AFTER:0:12}"
  diff_range "$BEFORE_SHA"
elif [[ "$EVENT_NAME" == "push" ]]; then
  # New branch, or a force-push (BEFORE is not an ancestor): compare with where the branch left main.
  git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main 2>/dev/null || true
  base="$(git merge-base origin/main "$AFTER" 2>/dev/null || true)"
  [[ -n "$base" ]] || die "cannot find where $REF_NAME left main; re-run with workflow_dispatch and list the files"
  note "new or rewritten branch $REF_NAME: comparing with its merge-base on main ${base:0:12}"
  diff_range "$base"
else
  parent="$(git rev-parse --verify --quiet "${AFTER}^1" || true)"
  [[ -n "$parent" ]] || die "no parent commit to compare with; list the files in the 'files' input"
  note "manual run without a file list: publishing what $REF_NAME@${AFTER:0:12} changed vs its parent"
  diff_range "$parent"
fi

((${#CH_PATH[@]})) || { note "no files under $PREFIX changed — nothing to publish"; exit 0; }

# ------------------------------------------------------------------ 2. path policy (all-or-nothing)
declare -a DEST=() SRC_BLOB=()
bad=0
for i in "${!CH_PATH[@]}"; do
  p="${CH_PATH[$i]}"; d="${p#"$PREFIX"}"; why=""
  if [[ -z "$d" || "$d" == */ || "/$d/" == */../* || "/$d/" == */./* || "$d" == *//* || "$d" == *$'\n'* ]]; then
    why="not a normal file path"
  else
    ok=0; for re in "${ALLOW_RE[@]}"; do [[ "$d" =~ $re ]] && ok=1; done
    (( ok )) || why="not an allowed destination (allowed: public/data/, api/cf-dist/data/, public/inventory/, public/reports/, public/order-comparisons/, public/orders.json, public/billing-live.json)"
    for re in "${DENY_RE[@]}"; do [[ -z "$why" && "$d" =~ $re ]] && why="blocked path (matches $re)"; done
    base="${d##*/}"; ext="${base##*.}"; ext="${ext,,}"
    [[ -z "$why" && "$base" != *.* ]] && why="file has no extension"
    [[ -z "$why" && ! "$ext" =~ $EXT_OK ]] && why="extension .$ext not allowed (data files only: json pdf txt csv xlsx xls png jpg jpeg webp)"
  fi
  if [[ -z "$why" && "${CH_STATUS[$i]}" == U ]]; then
    mode="$(git ls-tree "$AFTER" -- "$p" | awk '{print $1}')"
    [[ "$mode" == 100644 || "$mode" == 100755 ]] || why="not a regular file in git (mode ${mode:-none}; symlinks and submodules are refused)"
    if [[ -z "$why" ]]; then
      sz="$(git cat-file -s "$AFTER:$p")"
      (( sz > 0 )) || why="empty file"
      (( sz <= MAX_BYTES )) || why="$sz bytes exceeds the 25 MiB Cloudflare asset limit"
    fi
  fi
  if [[ -n "$why" ]]; then err "refused $p -> $d: $why"; bad=1; fi
  DEST+=("$d")
done
(( bad == 0 )) || die "one or more paths were refused by the bridge policy"
for i in "${!DEST[@]}"; do for j in "${!DEST[@]}"; do
  (( i < j )) && [[ "${DEST[$i]}" == "${DEST[$j]}" ]] && die "destination ${DEST[$i]} listed twice"
done; done

STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
for i in "${!DEST[@]}"; do
  [[ "${CH_STATUS[$i]}" == U ]] && git cat-file blob "$AFTER:${CH_PATH[$i]}" > "$STAGE/$i"
  printf '  %s %s\n' "$([[ ${CH_STATUS[$i]} == U ]] && echo write || echo delete)" "${DEST[$i]}"
done

SUBJ="$(git log -1 --format=%s "$AFTER")"
SHORT="$(git rev-parse --short=12 "$AFTER")"
MSG="bridge: $SHORT $SUBJ"

# ------------------------------------------------------------------ 3. clone ss-unified-proto
rm -rf "$PROTO_DIR"
git_auth clone --quiet --depth 50 --branch main "$PROTO_URL" "$PROTO_DIR" \
  || die "could not clone ss-unified-proto (is SS_PROTO_PUSH_TOKEN valid with Contents access to distassy-art/ss-unified-proto?)"
cd "$PROTO_DIR"
git config user.name  "Jayden site bridge"
git config user.email "jayden-site-bridge@users.noreply.github.com"
git remote set-url origin "$PROTO_URL"

API_TOUCHED=0; BILL_TOUCHED=0
# Copy the staged files over the current checkout (main, or main after a rebase).
apply_files() {
  local i d
  API_TOUCHED=0; BILL_TOUCHED=0
  for i in "${!DEST[@]}"; do
    d="${DEST[$i]}"
    if git check-ignore -q --no-index -- "$d"; then die "$d matches ss-unified-proto .gitignore — it would never be committed"; fi
    if [[ "${CH_STATUS[$i]}" == U ]]; then
      mkdir -p "$(dirname "$d")"; cp -f -- "$STAGE/$i" "$d"
    elif [[ -e "$d" ]]; then
      git rm -q -- "$d"
    else
      note "delete $d: not on main, nothing to do"
    fi
    [[ "$d" == api/* ]] && API_TOUCHED=1
    [[ "$d" == public/data/billing.json || "$d" == public/billing-live.json || "$d" == api/cf-dist/data/billing.json ]] && BILL_TOUCHED=1
  done
  # deploy-api requires the ss-api billing copy to equal public/data/billing.json (same as ss-publish.sh).
  if (( BILL_TOUCHED )) && [[ -f public/data/billing.json ]] && ! cmp -s public/data/billing.json api/cf-dist/data/billing.json; then
    note "mirroring public/data/billing.json -> api/cf-dist/data/billing.json (deploy-api gate requires them identical)"
    cp -f public/data/billing.json api/cf-dist/data/billing.json; API_TOUCHED=1
  fi
  if (( API_TOUCHED )); then bash api/update-manifest.sh >/dev/null || die "api/update-manifest.sh failed"; fi
  for i in "${!DEST[@]}"; do [[ "${CH_STATUS[$i]}" == U ]] && git add -- "${DEST[$i]}"; done
  if (( API_TOUCHED )); then git add -- api/MANIFEST.sha256 api/cf-dist/data/billing.json; fi
  return 0
}

# Every gate must pass or nothing is pushed.
run_gates() {
  local stray staged c ok d
  stray="$(git -c core.quotePath=false status --porcelain --untracked-files=all | grep -vE '^[AMD]  ' || true)"
  [[ -z "$stray" ]] || die "unexpected working-tree changes outside the publish set:
$stray"
  staged="$(git -c core.quotePath=false diff --cached --name-only)"
  while IFS= read -r c; do
    [[ -n "$c" ]] || continue
    ok=0; for d in "${DEST[@]}" api/MANIFEST.sha256 api/cf-dist/data/billing.json; do [[ "$c" == "$d" ]] && ok=1; done
    (( ok )) || die "staged path '$c' is outside the publish set"
  done <<<"$staged"

  note "gate: content checks (JSON, credentials, La Mesa 42642, daily days never restated)"
  python3 - "${DEST[@]}" <<'PY' || die "content checks refused this publish"
import json, pathlib, re, subprocess, sys
errs, warns = [], []
STRICT = [("Cloudflare API token", rb"cfut_[A-Za-z0-9_-]{10,}"), ("GitHub token", rb"gh[pousr]_[A-Za-z0-9]{20,}"),
          ("GitHub PAT", rb"github_pat_[A-Za-z0-9_]{20,}"), ("AWS access key id", rb"AKIA[0-9A-Z]{16}"),
          ("Google API key", rb"AIza[0-9A-Za-z_-]{35}"), ("Slack token", rb"xox[baprs]-[A-Za-z0-9-]{10,}"),
          ("private key block", rb"-----BEGIN [A-Z ]*PRIVATE KEY"), ("OpenAI key", rb"sk-[A-Za-z0-9]{20,}")]
TOK = re.compile(rb"(?<![0-9])42642(?![0-9])")
def main_copy(rel):
    r = subprocess.run(["git", "show", f"origin/main:{rel}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None
for d in sys.argv[1:]:
    p = pathlib.Path(d)
    if not p.exists():
        continue                      # a delete; check-app-data refuses deleting data JSON
    b = p.read_bytes(); ext = p.suffix.lower()
    if ext == ".json":
        try: new = json.loads(b.decode("utf-8"))
        except Exception as e: errs.append(f"{d}: invalid JSON ({e})"); continue
    if ext in (".json", ".txt", ".csv") and TOK.search(b): errs.append(f"{d}: contains 42642 (La Mesa is not a client)")
    for label, rx in STRICT:
        if re.search(rx, b): errs.append(f"{d}: contains what looks like a {label}")
    # Daily files: the bridge only ADDS days, plus the explicit Excel restatements below.
    # Any other change to a day already on main is refused, so a stale copy cannot silently undo a
    # correction. Each allowlisted pair is the live day object and the Excel day object. Once main
    # has the new object, the pair no longer matches and a second change is refused.
    # Parsed through json.loads so float values match the daily file exactly.
    EXCEL_DAY_RESTATEMENTS = {
        ("42279", "2026-09-21"): (
            json.loads('{"date":"2026-09-21","gas_vol":3597.1,"gas_profit":1532.75,"sales":3839.37,"purch":5395.28,"store_profit":-1555.91,"margin":-0.4053,"total_profit":-23.16}'),
            json.loads('{"date":"2026-09-21","gas_vol":3597.1,"gas_profit":1532.75,"sales":3789.37,"purch":5395.28,"store_profit":-1605.91,"margin":-0.4238,"total_profit":-73.16}'),
        ),
        ("42281", "2026-09-20"): (
            json.loads('{"date":"2026-09-20","gas_vol":2080.69,"gas_profit":1521.25,"sales":2675.59,"purch":172.09,"store_profit":2503.5,"margin":0.9357,"total_profit":4024.75}'),
            json.loads('{"date":"2026-09-20","gas_vol":3364.89,"gas_profit":1408.52,"sales":2409.91,"purch":0,"store_profit":null,"margin":null,"total_profit":1408.52}'),
        ),
    }
    if re.search(r"/daily_[a-z]+\.json$", d):
        old_b = main_copy(d)
        def index(doc):   # same shape as scripts/lib/data-no-regression.mjs indexDaily()
            out = {}
            for st in (doc.get("stations") if isinstance(doc, dict) and isinstance(doc.get("stations"), list) else []):
                if isinstance(st, dict):
                    out[str(st.get("id"))] = {str(x["date"]): x for x in (st.get("days") if isinstance(st.get("days"), list) else []) if isinstance(x, dict) and x.get("date")}
            return out
        if old_b:
            ost, nst = index(json.loads(old_b)), index(new)
            added, bad_here, restated = 0, False, []
            for sid, od in ost.items():
                nd = nst.get(sid, {})
                changed = sorted(k for k in od if k in nd and nd[k] != od[k])
                refused = []
                for k in changed:
                    pair = EXCEL_DAY_RESTATEMENTS.get((sid, k))
                    if pair and od[k] == pair[0] and nd[k] == pair[1]:
                        restated.append(f"{sid} {k}")
                    else:
                        refused.append(k)
                if refused:
                    bad_here = True
                    errs.append(f"{d}: station {sid} changes {len(refused)} day(s) already on main: {', '.join(refused[:8])} - "
                                "the bridge only ADDS days; start from the live file https://smartsolutionsai.us/data/" + d.rsplit('/', 1)[1])
            for sid, nd in nst.items():
                added += sum(1 for k in nd if k not in ost.get(sid, {}))
            if not bad_here:
                extra = f"; restates {len(restated)} Excel day(s): {', '.join(restated)}" if restated else ""
                print(f"  {d}: adds {added} station-day(s); no existing day changed{extra}")
        twin = ("api/cf-dist/data/" + d[len("public/data/"):]) if d.startswith("public/data/") else ("public/data/" + d[len("api/cf-dist/data/"):]) if d.startswith("api/cf-dist/data/") else None
        if twin and twin not in sys.argv[1:] and main_copy(twin) is not None and main_copy(twin) == old_b:
            warns.append(f"{d}: its twin {twin} is identical on main but is not in this publish — publish both copies")
for w in warns: print(f"::warning::{w}")
for e in errs: print(f"::error::{e}", file=sys.stderr)
sys.exit(1 if errs else 0)
PY

  note "gate: deploy-main / deploy-api invariants (billing pair, floor, api manifest)"
  cmp -s public/billing-live.json public/data/billing.json || die "public/billing-live.json and public/data/billing.json must be byte-identical — publish both (same bytes)"
  cmp -s api/cf-dist/data/billing.json public/data/billing.json || die "api/cf-dist/data/billing.json must equal public/data/billing.json"
  python3 scripts/billing-floor-gate.py check public/billing-live.json public/data/billing.json >/dev/null \
    || die "billing floor gate refused (incomeTotal below the floor)"
  if (( API_TOUCHED )); then
    ( cd api && sha256sum -c MANIFEST.sha256 --quiet >/dev/null 2>&1 ) || die "api/MANIFEST.sha256 does not verify"
  fi

  note "gate: node scripts/check-app-data.mjs pre (baseline = ss-unified-proto origin/main)"
  # Unset the Jayden push event so the check cannot mistake Jayden's "before" sha for a baseline.
  env -u GITHUB_EVENT_PATH -u GITHUB_EVENT_NAME -u GITHUB_BASE_REF SS_BASELINE_REF=origin/main \
    node scripts/check-app-data.mjs pre || die "check-app-data pre FAILED — not publishing"

  note "gate: npm test"
  env -u GITHUB_EVENT_PATH -u GITHUB_EVENT_NAME npm test --silent || die "ss-unified-proto tests FAILED — not publishing"
  if (( API_TOUCHED )); then
    note "gate: api tests (api/ changed)"
    ( cd api && npm ci --no-audit --no-fund --silent && npm test --silent ) || die "api tests FAILED — not publishing"
  fi
}

apply_files
if git diff --cached --quiet; then note "no change — ss-unified-proto main already has these bytes"; exit 0; fi
note "changing: $(git diff --cached --name-only | tr '\n' ' ')"
run_gates

BODY="From distassy-art/Jayden $REF_NAME@$AFTER via .github/workflows/publish-to-site.yml
Run: ${RUN_URL:-local}
Files:
$(printf '  %s\n' "${DEST[@]}")"
git commit --quiet -m "$MSG" -m "$BODY" || die "git commit failed"

if [[ "${BRIDGE_DRY_RUN:-0}" == 1 ]]; then
  git show --stat --format='%s%n%n%b' HEAD
  note "BRIDGE_DRY_RUN=1: every gate passed; not pushing"; exit 0
fi

# ------------------------------------------------------------------ 4. push (pull --rebase retry, never forced)
pushed=0
for attempt in 1 2 3 4; do
  if out="$(git_auth push origin HEAD:refs/heads/main 2>&1)"; then pushed=1; break; fi
  echo "$out" | sed -E 's#https://[^@/ ]+@#https://***@#g' >&2
  grep -qiE 'non-fast-forward|fetch first|rejected|stale info' <<<"$out" || die "git push failed"
  (( attempt < 4 )) || break
  note "main moved — git pull --rebase and re-check (retry $attempt/3)"
  if git_auth pull --quiet --rebase origin main; then
    if (( API_TOUCHED )); then   # someone else changed api/ too: the manifest must cover both
      bash api/update-manifest.sh >/dev/null
      if ! git diff --quiet -- api/MANIFEST.sha256; then git add api/MANIFEST.sha256; git commit --quiet --amend --no-edit; fi
    fi
  else
    # Usually api/MANIFEST.sha256: re-apply the same files on top of the new main instead.
    git rebase --abort 2>/dev/null || true
    git_auth fetch --quiet --depth 50 origin main
    git reset --quiet --hard origin/main
    apply_files
    if git diff --cached --quiet; then note "no change after rebase — main already has these bytes"; exit 0; fi
    git commit --quiet -m "$MSG" -m "$BODY"
  fi
  git reset --quiet --soft HEAD~1
  run_gates
  git commit --quiet -m "$MSG" -m "$BODY"
done
(( pushed )) || die "push to ss-unified-proto main did not succeed after 3 retries"
SHA="$(git rev-parse HEAD)"
note "pushed $SHA to ss-unified-proto main: $PROTO_WEB/commit/$SHA"
{
  echo "### publish-to-site"
  echo "- Jayden: \`$REF_NAME@$SHORT\` — $SUBJ"
  echo "- ss-unified-proto commit: [\`${SHA:0:12}\`]($PROTO_WEB/commit/$SHA)"
  printf -- '- `%s`\n' "${DEST[@]}"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# ------------------------------------------------------------------ 5. wait until it is live
[[ "${BRIDGE_NO_LIVE_WAIT:-0}" == 1 ]] && { note "live wait skipped"; exit 0; }
declare -A WANT=() URL=()
for i in "${!DEST[@]}"; do
  d="${DEST[$i]}"; [[ "${CH_STATUS[$i]}" == U ]] || continue
  u="$(python3 - "$d" <<'PY'
import sys, urllib.parse
d = sys.argv[1]; q = urllib.parse.quote
D, API, PROTO = "https://smartsolutionsai.us", "https://ss-api.smartsolutionsai.workers.dev", "https://ss-unified-proto.smartsolutionsai.workers.dev"
if d.startswith("api/cf-dist/data/"):
    r = d[len("api/cf-dist/data/"):]
    print(f"{API if r in ('billing.json', 'manager.json') else D}/data/{q(r)}")
elif d in ("public/data/billing.json", "public/data/manager.json"):
    print(f"{D}/data/{q(d[len('public/data/'):])}")
elif d.startswith("public/data/"):
    print(f"{PROTO}/data/{q(d[len('public/data/'):])}")
elif d.startswith("public/"):
    print(f"{D}/{q(d[len('public/'):])}")
PY
)"
  [[ -n "$u" ]] || continue
  WANT["$d"]="$(sha256sum -- "$d" | cut -d' ' -f1)"; URL["$d"]="$u"
done
((${#WANT[@]})) || { note "nothing served to wait for"; exit 0; }
note "waiting up to $((LIVE_WAIT_SECS / 60)) min for ${#WANT[@]} file(s) to go live (ss-unified-proto deploy-main / deploy-api)"
deadline=$(( $(date +%s) + LIVE_WAIT_SECS )); declare -A DONE=()
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
while :; do
  pending=0
  for d in "${!WANT[@]}"; do
    [[ -n "${DONE[$d]:-}" ]] && continue
    code="$(curl -sS -L -A "$UA" -H 'Cache-Control: no-cache' --max-time 45 -o "$STAGE/live" -w '%{http_code}' "${URL[$d]}?v=$(date +%s%N)" 2>/dev/null || echo 000)"
    if [[ "$code" == 200 && "$(sha256sum "$STAGE/live" | cut -d' ' -f1)" == "${WANT[$d]}" ]]; then
      DONE["$d"]=1; note "LIVE ✓ $d -> ${URL[$d]}"
    else pending=$((pending + 1)); fi
  done
  (( pending == 0 )) && break
  if (( $(date +%s) >= deadline )); then
    for d in "${!WANT[@]}"; do [[ -n "${DONE[$d]:-}" ]] || err "NOT LIVE: $d (${URL[$d]})"; done
    err "commit $SHA IS on ss-unified-proto main but not live after $((LIVE_WAIT_SECS / 60)) min — check $PROTO_WEB/actions (deploy-main / deploy-api). Do NOT deploy by hand."
    exit 1
  fi
  sleep 15
done
note "all ${#WANT[@]} file(s) live. ss-unified-proto commit $SHA"
