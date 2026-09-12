/*
 * Live photo capture for task proof.
 *
 * The house rule is a *current* photo, not one pulled from the camera roll, so
 * this opens the camera with getUserMedia and snapshots a frame — there is no
 * gallery picker in the way. Where the live camera cannot be opened (an older
 * browser, or permission denied), it falls back to a capture-only file input,
 * which on a phone still launches the camera rather than the photo library.
 *
 * Returns a downscaled JPEG data URL, or null if the person backs out. The
 * image is shrunk hard on purpose: it is proof a job was done, and it lives in
 * on-device storage for now, so a few hundred KB is plenty.
 */

const MAX_EDGE = 900;
const QUALITY = 0.6;

function toJpeg(source, width, height) {
  let w = width;
  let h = height;
  if (Math.max(width, height) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    w = Math.round(width * scale);
    h = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export function cameraSupported() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Open the camera (or the capture fallback) and resolve a photo data URL. */
export function capturePhoto() {
  if (cameraSupported()) return captureLive();
  return captureFallback();
}

function captureLive() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "cam-backdrop";
    backdrop.innerHTML = `
      <div class="cam" role="dialog" aria-modal="true" aria-label="Take a photo">
        <div class="cam-stage"><video class="cam-view" autoplay playsinline muted></video></div>
        <p class="cam-hint">Take a photo now — old photos can't be attached.</p>
        <div class="cam-bar">
          <button class="app-btn ghost" type="button" data-cam-cancel>Cancel</button>
          <button class="app-btn primary" type="button" data-cam-shot>Capture</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const video = backdrop.querySelector("video");
    let stream = null;
    let done = false;

    const cleanup = () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      backdrop.remove();
    };
    const finish = (value) => { if (done) return; done = true; cleanup(); resolve(value); };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((granted) => { stream = granted; video.srcObject = granted; })
      .catch(() => { if (done) return; done = true; backdrop.remove(); captureFallback().then(resolve); });

    backdrop.querySelector("[data-cam-cancel]").addEventListener("click", () => finish(null));
    backdrop.querySelector("[data-cam-shot]").addEventListener("click", () => {
      if (!video.videoWidth) return;
      finish(toJpeg(video, video.videoWidth, video.videoHeight));
    });
  });
}

function captureFallback() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    let settled = false;
    const settle = (value) => { if (settled) return; settled = true; input.remove(); resolve(value); };

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) { settle(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => settle(toJpeg(img, img.naturalWidth, img.naturalHeight));
        img.onerror = () => settle(null);
        img.src = reader.result;
      };
      reader.onerror = () => settle(null);
      reader.readAsDataURL(file);
    });
    // If the picker is dismissed without a selection there is no reliable
    // event; a focus return with no file leaves the promise pending, which is
    // fine — the next open replaces it. Keep it simple for the fallback path.
    input.click();
  });
}
