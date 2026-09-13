#!/usr/bin/env python3
"""Add the scan-ingest route to the live `smartsolutions-site` Worker.

The site Worker is deployed from a source tree that is not in this repo, so its
bundle cannot be rebuilt here. This script instead downloads the bundle that is
running right now, keeps it byte-for-byte, and uploads a new version in which
`worker-entry.js` is the entry point: it answers `/api/scan-ingest` and passes
everything else to the site bundle unchanged.

The upload and the deployment are separate steps. An uploaded version is inert
until it is deployed, so the default run publishes nothing and prints a preview
URL to test against; `--promote` is what moves production onto it.

  python3 cloudflare/scan-ingest/deploy-into-live-worker.py            # upload + preview URL
  python3 cloudflare/scan-ingest/deploy-into-live-worker.py --promote  # upload, then 100% live
  python3 cloudflare/scan-ingest/deploy-into-live-worker.py --rollback VERSION_ID

Needs CLOUDFLARE_API_TOKEN (Workers Scripts:Edit) and CLOUDFLARE_ACCOUNT_ID.
"""
from __future__ import annotations

import argparse
import email
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://api.cloudflare.com/client/v4"
HERE = Path(__file__).resolve().parent
WORKER_NAME = os.environ.get("WORKER_NAME", "smartsolutions-site")

# Uploaded beside the site bundle. Keys are the module names the Worker runtime
# resolves imports against, so `worker-entry.js` importing "./scan-ingest.js"
# needs that exact name here.
ADDED_MODULES = {
    "entry.js": HERE / "worker-entry.js",
    "scan-ingest.js": HERE / "scan-ingest.js",
    "stations.js": HERE / "stations.js",
}
SITE_MODULE = "worker.js"


def env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        sys.exit(f"Missing {name}")
    return value


def request(method: str, path: str, body=None, raw=False):
    token = env("CLOUDFLARE_API_TOKEN")
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if isinstance(body, tuple):
        content_type, data = body
        headers["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(f"{API}/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read()
            res_type = res.headers.get("Content-Type", "")
    except urllib.error.HTTPError as err:
        sys.exit(f"{method} {path} failed: {err.code}\n{err.read().decode(errors='replace')}")

    if raw:
        return payload, res_type
    parsed = json.loads(payload)
    if not parsed.get("success"):
        sys.exit(f"{method} {path} returned errors: {parsed.get('errors')}")
    return parsed["result"]


def account_path(suffix: str) -> str:
    return f"accounts/{env('CLOUDFLARE_ACCOUNT_ID')}/{suffix}"


def download_modules() -> dict[str, bytes]:
    """The modules of the version currently serving traffic."""
    payload, content_type = request(
        "GET",
        account_path(f"workers/services/{WORKER_NAME}/environments/production/content"),
        raw=True,
    )
    boundary = re.search(r"boundary=([^\s;]+)", content_type)
    if not boundary:
        sys.exit(f"Unexpected content type from Cloudflare: {content_type}")
    message = email.message_from_bytes(
        b'Content-Type: multipart/form-data; boundary="%s"\r\n\r\n' % boundary.group(1).strip().encode()
        + payload
    )
    modules = {}
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        name = part.get_param("name", header="content-disposition")
        if name:
            modules[os.path.basename(name)] = part.get_payload(decode=True)
    return modules


def multipart(metadata: dict, modules: dict[str, bytes]) -> tuple[str, bytes]:
    boundary = f"----scan-ingest-{uuid.uuid4().hex}"
    chunks = []

    def part(name: str, body: bytes, content_type: str, filename: str | None = None):
        disposition = f'form-data; name="{name}"'
        if filename:
            disposition += f'; filename="{filename}"'
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: {disposition}\r\n"
            f"Content-Type: {content_type}\r\n\r\n".encode()
            + body
            + b"\r\n"
        )

    part("metadata", json.dumps(metadata).encode(), "application/json")
    for name, body in modules.items():
        part(name, body, "application/javascript+module", name)
    chunks.append(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", b"".join(chunks)


def assets_config(runtime: dict) -> dict:
    """Re-state the live asset settings so keeping the assets keeps their behaviour."""
    live = runtime.get("assets") or {}
    config = {
        "html_handling": live.get("html_handling", "none"),
        "not_found_handling": live.get("not_found_handling", "404-page"),
        "run_worker_first": bool(live.get("raw_run_worker_first", False)),
    }
    # `_redirects` drives /tickets, /billing, /admin and friends; dropping it
    # would 404 those paths even though every asset is still in place.
    for key, source in (("_redirects", "raw_redirects"), ("_headers", "raw_headers")):
        if live.get(source):
            config[key] = live[source]
    return config


def bindings_for_upload(live_bindings: list[dict]) -> list[dict]:
    """Secret values cannot be read back, so carry secrets over by inheritance."""
    out = []
    for binding in live_bindings:
        if binding.get("type") == "secret_text":
            out.append({"type": "inherit", "name": binding["name"]})
        else:
            out.append(dict(binding))
    return out


def upload_version(message: str) -> dict:
    settings = request("GET", account_path(f"workers/scripts/{WORKER_NAME}/settings"))
    latest_id = request("GET", account_path(f"workers/scripts/{WORKER_NAME}/versions?per_page=1"))[
        "items"
    ][0]["id"]
    latest = request("GET", account_path(f"workers/scripts/{WORKER_NAME}/versions/{latest_id}"))
    runtime = latest["resources"].get("script_runtime") or {}

    live_modules = download_modules()
    if SITE_MODULE not in live_modules:
        sys.exit(f"Live Worker has no {SITE_MODULE} module; found {sorted(live_modules)}")

    modules = {SITE_MODULE: live_modules[SITE_MODULE]}
    for name, path in ADDED_MODULES.items():
        modules[name] = path.read_bytes()

    metadata = {
        "main_module": "entry.js",
        "compatibility_date": settings["compatibility_date"],
        "compatibility_flags": settings.get("compatibility_flags") or [],
        "bindings": bindings_for_upload(settings.get("bindings") or []),
        "keep_assets": True,
        "assets": {"config": assets_config(runtime)},
        "annotations": {"workers/message": message},
    }

    print(f"Site bundle carried over unchanged: {len(modules[SITE_MODULE])} bytes")
    print(f"Modules uploaded: {', '.join(sorted(modules))}")
    version = request(
        "POST",
        account_path(f"workers/scripts/{WORKER_NAME}/versions"),
        body=multipart(metadata, modules),
    )
    print(f"Uploaded version {version['id']} (number {version.get('number')}) — not live yet")

    subdomain = (request("GET", account_path("workers/subdomain")) or {}).get("subdomain")
    if subdomain:
        print(
            "Preview: "
            f"https://{version['id'].split('-')[0]}-{WORKER_NAME}.{subdomain}.workers.dev"
        )
    return version


def deploy(version_id: str, message: str) -> dict:
    result = request(
        "POST",
        account_path(f"workers/scripts/{WORKER_NAME}/deployments?force=true"),
        body={
            "strategy": "percentage",
            "versions": [{"version_id": version_id, "percentage": 100}],
            "annotations": {"workers/message": message},
        },
    )
    print(f"Deployed {version_id} to 100% (deployment {result.get('id')})")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--promote", action="store_true", help="Send 100% of traffic to the new version")
    parser.add_argument("--rollback", metavar="VERSION_ID", help="Deploy an existing version instead")
    parser.add_argument("-m", "--message", default="scan-ingest wired into live site worker")
    args = parser.parse_args()

    if args.rollback:
        deploy(args.rollback, f"rollback to {args.rollback}")
        return

    version = upload_version(args.message)
    if args.promote:
        deploy(version["id"], args.message)
    else:
        print("Re-run with --promote (or deploy the version from the dashboard) to go live.")


if __name__ == "__main__":
    main()
