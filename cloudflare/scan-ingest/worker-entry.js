/**
 * Entry module for the live `smartsolutions-site` Worker.
 *
 * The site bundle is built from a source tree that is not in this repo, so
 * scan-ingest is added by wrapping the running Worker rather than rebuilding
 * it: `deploy-into-live-worker.py` downloads the deployed `worker.js`, keeps it
 * byte-for-byte, and uploads this file as the entry point beside it. Every
 * request except the scan-ingest route is handed to the site untouched.
 *
 * When the site's own source tree is deployed again this wrapper is replaced,
 * so the handler has to be wired into that tree as well — see WORKER_WIRING.md.
 */
import site from "./worker.js";
import { handleScanIngest } from "./scan-ingest.js";

const SCAN_PATHS = new Set([
  "/api/scan-ingest",
  "/.netlify/functions/scan-ingest",
]);

export default {
  ...site,
  fetch(request, env, ctx) {
    if (SCAN_PATHS.has(new URL(request.url).pathname)) {
      return handleScanIngest(request, env);
    }
    // Called on `site` so the delegate keeps its own `this`.
    return site.fetch(request, env, ctx);
  },
};
