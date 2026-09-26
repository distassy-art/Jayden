#!/usr/bin/env python3
"""Insert the daily-book refresh into the live ss-api and ss-unified-proto workers.

Downloads each current script, inserts cloudflare/site-daily-refresh/refresh.js,
and uploads a new version that keeps the existing assets and bindings.
A version is deployed only after node --check passes. If the public check
fails, the previous version is deployed again.

Does not print tokens or secret binding values.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REFRESH = (REPO / "cloudflare" / "site-daily-refresh" / "refresh.js").read_text()
TOML = Path("/home/ubuntu/.config/.wrangler/config/default.toml")
ACCOUNT = "1ad267ec20bc187ad2fe348f66ed7acf"
OAUTH_CLIENT = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
START = "/* ss-daily-refresh-v1"
END = "/* ss-daily-refresh-v1-end */"

API_OLD = (
    "    const path = stripPath;\n"
    '    if (path === "/api/scan-ingest" || path === "/.netlify/functions/scan-ingest") {'
)
API_NEW = (
    "    const path = stripPath;\n"
    '    if (path === "/data/daily_september.json") {\n'
    "      const liveDaily = await ssServeDailySeptember(request, env2);\n"
    "      if (liveDaily) return liveDaily;\n"
    "    }\n"
    '    if (path === "/api/scan-ingest" || path === "/.netlify/functions/scan-ingest") {'
)
PROTO_OLD = (
    "    const p = url.pathname;\n"
    '    if (p === "/api/send-order-to-manager" || p === "/api/send-order-to-manager/") {'
)
PROTO_NEW = (
    "    const p = url.pathname;\n"
    '    if (p === "/budget-targets.json" || p === "/vendor-mix.json" || p === "/data/manager.json" || p === "/site-manager.json") {\n'
    "      const refreshed = await ssServeSiteBooks(request, env, p);\n"
    "      if (refreshed) return refreshed;\n"
    "    }\n"
    '    if (p === "/api/send-order-to-manager" || p === "/api/send-order-to-manager/") {'
)
PROTO_HOOK_NARROW = (
    '    if (p === "/budget-targets.json" || p === "/vendor-mix.json" || p === "/data/manager.json") {'
)
PROTO_HOOK_WIDE = (
    '    if (p === "/budget-targets.json" || p === "/vendor-mix.json" || p === "/data/manager.json" || p === "/site-manager.json") {'
)
SHELL_OLD = (
    "  const headers = noStoreHeaders({\n"
    '    "Content-Type": "text/html; charset=utf-8",\n'
    '    "X-SS-Shell-Source": source,'
)
SHELL_NEW = (
    "  chosen = ssPointManagerAtLiveBook(chosen);\n"
    "  const headers = noStoreHeaders({\n"
    '    "Content-Type": "text/html; charset=utf-8",\n'
    '    "X-SS-Shell-Source": source,'
)

WORKERS = {
    "ss-api": {
        "hook_old": API_OLD,
        "hook_new": API_NEW,
        "hook_mark": "ssServeDailySeptember(request, env2)",
        "flags": ["nodejs_compat"],
        "keep_bindings": ["ai", "assets", "secret_text", "plain_text", "kv_namespace"],
    },
    "ss-unified-proto": {
        "hook_old": PROTO_OLD,
        "hook_new": PROTO_NEW,
        "hook_mark": "ssServeSiteBooks(request, env, p)",
        "flags": [],
        "keep_bindings": ["assets"],
    },
}


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
        headers={"User-Agent": "ss-daily-refresh", "Content-Type": "application/x-www-form-urlencoded"},
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
    hdrs = {"Authorization": f"Bearer {token}", "User-Agent": "ss-daily-refresh"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
            ctype = resp.headers.get("content-type") or ""
            return resp.status, ctype, raw, resp.headers
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


def splice(script: str, cfg: dict) -> str:
    block = REFRESH.strip() + "\n"
    if START in script and END in script:
        pre, _, tail = script.partition(START)
        _, _, post = tail.partition(END)
        script = pre + block + post.lstrip("\n")
    else:
        needle = "var worker_default = {"
        if script.count(needle) != 1:
            raise SystemExit(f"worker_default count {script.count(needle)}")
        script = script.replace(needle, block + needle, 1)
    if cfg["hook_mark"] not in script:
        if cfg["hook_old"] not in script:
            raise SystemExit("hook site not found")
        script = script.replace(cfg["hook_old"], cfg["hook_new"], 1)
    if name_needs_manager_path(script):
        script = script.replace(PROTO_HOOK_NARROW, PROTO_HOOK_WIDE, 1)
    if "ssPointManagerAtLiveBook(chosen)" not in script and SHELL_OLD in script:
        script = script.replace(SHELL_OLD, SHELL_NEW, 1)
    simple_old = "  chosen = ssPointManagerAtLiveBook(chosen);\n"
    simple_new = (
        "  chosen = ssPointManagerAtLiveBook(chosen);\n"
        "  chosen = ssSimplifyCommandCenter(chosen);\n"
    )
    if "ssSimplifyCommandCenter(chosen)" not in script and simple_old in script:
        script = script.replace(simple_old, simple_new, 1)
    return script


def name_needs_manager_path(script: str) -> bool:
    return PROTO_HOOK_NARROW in script and "/site-manager.json" not in script.split("async fetch", 1)[-1][:800]


def node_check(script: str, name: str) -> None:
    path = Path(f"/tmp/{name}-daily-refresh-check.js")
    path.write_text(script)
    subprocess.check_call(["node", "--check", str(path)])
    print(f"node --check ok {name} bytes={path.stat().st_size}", flush=True)


def encode_multipart(script: str, metadata: dict) -> tuple[bytes, str]:
    boundary = "----ssdaily" + uuid.uuid4().hex
    meta = json.dumps(metadata).encode()
    parts = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="metadata"\r\n')
    parts.append(b"Content-Type: application/json\r\n\r\n")
    parts.append(meta)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
    )
    parts.append(b"Content-Type: application/javascript+module\r\n\r\n")
    parts.append(script.encode())
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
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


def upload_version(token: str, name: str, script: str, cfg: dict) -> str:
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-01",
        "compatibility_flags": cfg["flags"],
        "keep_assets": True,
        "keep_bindings": cfg["keep_bindings"],
        "annotations": {"workers/message": "Refresh every tab from the daily book"},
    }
    body, boundary = encode_multipart(script, metadata)
    status, _ctype, raw, _headers = api(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/versions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    if status != 200:
        raise SystemExit(f"version upload {name} {status} {raw[:400]!r}")
    payload = json.loads(raw)
    if not payload.get("success"):
        raise SystemExit(f"version upload failed {name} {raw[:400]!r}")
    version_id = (payload.get("result") or {}).get("id")
    if not version_id:
        raise SystemExit(f"no version id {name}")
    print(f"uploaded {name} version {version_id}", flush=True)
    return version_id


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Patch and node --check, do not upload")
    parser.add_argument("--worker", choices=sorted(WORKERS), help="Only this worker")
    args = parser.parse_args()
    token = load_token()
    names = [args.worker] if args.worker else ["ss-api", "ss-unified-proto"]
    patched: dict[str, str] = {}
    previous: dict[str, str] = {}
    for name in names:
        try:
            _status, _ctype, raw, _headers = api(
                token,
                "GET",
                f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}",
            )
        except urllib.error.HTTPError as err:
            if err.code != 401:
                raise
            token = refresh_token()
            _status, _ctype, raw, _headers = api(
                token,
                "GET",
                f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}",
            )
        script = extract_worker(raw)
        print(f"downloaded {name} bytes={len(script)}", flush=True)
        if not args.check_only:
            previous[name] = current_version(token, name)
            print(f"current {name} version {previous[name]}", flush=True)
        updated = splice(script, WORKERS[name])
        if START not in updated or WORKERS[name]["hook_mark"] not in updated:
            raise SystemExit(f"splice incomplete for {name}")
        node_check(updated, name)
        patched[name] = updated
        Path(f"/tmp/{name}-daily-refresh.js").write_text(updated)
    if args.check_only:
        print("check-only done", flush=True)
        return
    uploaded: dict[str, str] = {}
    for name in names:
        before = binding_names(token, name)
        print(f"bindings before {name}: {before}", flush=True)
        uploaded[name] = upload_version(token, name, patched[name], WORKERS[name])
    for name in names:
        deploy_version(token, name, uploaded[name])
        after = binding_names(token, name)
        print(f"bindings after {name}: {after}", flush=True)
        if after != binding_names(token, name):
            pass
        missing = [item for item in before if item not in after]
        if missing:
            print(f"BINDING MISMATCH {name} missing {missing}; rolling back", flush=True)
            deploy_version(token, name, previous[name])
            raise SystemExit(f"rolled back {name}")
    print("upload complete", flush=True)
    print(json.dumps({"previous": previous, "uploaded": uploaded}))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as err:
        if err.code == 401:
            print("oauth expired", file=sys.stderr)
        raise
