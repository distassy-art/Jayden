/*
 * Location and notifications for the time clock.
 *
 * The clock is location-based: an employee may only clock in while they are at
 * the store, and if they leave they are clocked out for them. This module is
 * the thin, testable layer over the browser's Geolocation and Notification
 * APIs that makes that possible — distance maths, a live geofence watch, and a
 * phone notification when the fence is crossed. It holds no state and knows
 * nothing about employees or shifts; the caller wires it to the store.
 */

const EARTH_RADIUS_FT = 20902231; // mean Earth radius in feet

/** Great-circle distance between two {lat,lng} points, in feet. */
export function distanceFt(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_FT * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geoSupported() {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/* A single reading. Rejects with a plain, user-facing reason so the view can
   show it rather than a raw GeolocationPositionError code. */
export function getPosition({ timeout = 15000, maximumAge = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) {
      reject(new Error("This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: pos.timestamp,
      }),
      (err) => reject(new Error(reason(err))),
      { enableHighAccuracy: true, timeout, maximumAge },
    );
  });
}

function reason(err) {
  if (err && err.code === 1) return "Location permission was denied. Turn it on to clock in.";
  if (err && err.code === 2) return "Your location is unavailable right now.";
  if (err && err.code === 3) return "Getting your location timed out. Try again.";
  return "Could not read your location.";
}

/*
 * Watch a fence around `center` of `radiusFt`. `onUpdate` fires on every fresh
 * reading with { inside, distanceFt, coords, accuracy }; `onExit` fires once
 * each time the fence is crossed from in to out. Returns a stop() function.
 *
 * Accuracy is honoured so a jittery fix does not eject someone standing still:
 * a reading only counts as "outside" when the point is beyond the fence by more
 * than its own margin of error.
 */
export function watchGeofence(center, radiusFt, { onUpdate, onExit } = {}) {
  if (!geoSupported()) return () => {};
  let wasInside = true;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: pos.timestamp,
      };
      const d = distanceFt(center, coords);
      const margin = Math.min(coords.accuracy * 3.28084, radiusFt); // metres -> ft, capped
      const inside = d <= radiusFt + margin;
      onUpdate?.({ inside, distanceFt: d, coords, accuracy: coords.accuracy });
      if (wasInside && !inside) onExit?.({ distanceFt: d, coords });
      wasInside = inside;
    },
    () => { /* transient errors are ignored; the last known state stands */ },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/* -------------------------------------------------------------------------
   Notifications
   ------------------------------------------------------------------------- */

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission() {
  return notifySupported() ? Notification.permission : "denied";
}

export async function requestNotify() {
  if (!notifySupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function notify(title, body) {
  if (!notifySupported() || Notification.permission !== "granted") return false;
  try {
    // eslint-disable-next-line no-new
    new Notification(title, {
      body,
      icon: "assets/apple-touch-icon.png",
      badge: "assets/favicon-32.png",
      tag: "ss-clock",
    });
    return true;
  } catch {
    return false;
  }
}

/** A rough "123 ft" / "0.3 mi" for the fence readout. */
export function distanceLabel(ft) {
  if (!isFinite(ft)) return "—";
  if (ft < 1000) return `${Math.round(ft)} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}
