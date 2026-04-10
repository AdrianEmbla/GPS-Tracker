import "./style.css";
import { Feature, Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import { LineString, Point } from "ol/geom";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

const STORAGE_KEY = "gps-tracking-sessions";

// --- Shared styles ---
const waypointStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "#ef4444" }),
    stroke: new Stroke({ color: "white", width: 2 }),
  }),
});

const positionStyle = new Style({
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: "rgba(59, 130, 246, 0.8)" }),
    stroke: new Stroke({ color: "white", width: 2 }),
  }),
});

const accuracyStyle = new Style({
  fill: new Fill({ color: "rgba(59, 130, 246, 0.1)" }),
  stroke: new Stroke({ color: "rgba(59, 130, 246, 0.4)", width: 1 }),
});

// --- Storage ---
let cachedSessions = null;

function loadSessions() {
  if (cachedSessions !== null) return cachedSessions;
  try {
    cachedSessions = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    cachedSessions = [];
  }
  return cachedSessions;
}

function saveSessions(sessions) {
  cachedSessions = sessions;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    showToast("Storage full — could not save session");
  }
}

// --- Toast notifications ---
function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2500);
}

// --- Map setup ---
const positionSource = new VectorSource();
const trackSource = new VectorSource();
const sessionSource = new VectorSource();

const map = new Map({
  target: "map",
  layers: [
    new TileLayer({ source: new OSM() }),
    new VectorLayer({ source: sessionSource }),
    new VectorLayer({ source: trackSource }),
    new VectorLayer({ source: positionSource }),
  ],
  view: new View({
    center: fromLonLat([10.755, 59.91]),
    zoom: 13,
  }),
});

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map
        .getView()
        .setCenter(fromLonLat([pos.coords.longitude, pos.coords.latitude]));
    },
    () => {},
  );
}

// --- Position indicator ---
const positionFeature = new Feature();
positionFeature.setStyle(positionStyle);

const accuracyFeature = new Feature();
accuracyFeature.setStyle(accuracyStyle);

// --- Tracking state ---
let isTracking = false;
let watchId = null;
let currentCoords = [];
let startTime = null;
let currentSessionPoints = [];
let followMode = true;

// Persistent live track geometry (avoid recreating on every tick)
let liveLineGeometry = null;
let liveLineFeature = null;

const btnTrack = document.getElementById("btn-track");
const btnAddPoint = document.getElementById("btn-add-point");
const btnFollow = document.getElementById("btn-follow");

btnAddPoint.addEventListener("click", () => addPoint());
btnTrack.addEventListener("click", () => {
  isTracking ? stopTracking() : startTracking();
});
btnFollow.addEventListener("click", () => {
  followMode = !followMode;
  btnFollow.classList.toggle("active", followMode);
  btnFollow.textContent = followMode ? "Follow: ON" : "Follow: OFF";
});

function startTracking() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  isTracking = true;
  startTime = Date.now();
  currentCoords = [];
  currentSessionPoints = [];
  btnTrack.textContent = "Stop Tracking";
  btnTrack.classList.add("tracking");
  btnAddPoint.disabled = false;
  btnFollow.style.display = "inline-block";
  followMode = true;
  btnFollow.classList.add("active");
  btnFollow.textContent = "Follow: ON";

  trackSource.clear();
  positionSource.clear();
  positionSource.addFeature(accuracyFeature);
  positionSource.addFeature(positionFeature);

  // Prepare persistent live line
  liveLineGeometry = new LineString([]);
  liveLineFeature = new Feature(liveLineGeometry);
  liveLineFeature.setStyle(
    new Style({
      stroke: new Stroke({ color: "#3b82f6", width: 3 }),
    }),
  );
  trackSource.addFeature(liveLineFeature);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const coord = { lat: latitude, lon: longitude, timestamp: Date.now() };
      currentCoords.push(coord);

      const mapCoord = fromLonLat([longitude, latitude]);
      positionFeature.setGeometry(new Point(mapCoord));

      // Show accuracy circle
      if (accuracy) {
        const metersPerUnit = map.getView().getProjection().getMetersPerUnit();
        const radius = accuracy / metersPerUnit;
        accuracyFeature.setGeometry(
          new Point(mapCoord),
        );
        accuracyFeature.setStyle(
          new Style({
            image: new CircleStyle({
              radius: Math.min(radius, 50),
              fill: new Fill({ color: "rgba(59, 130, 246, 0.08)" }),
              stroke: new Stroke({ color: "rgba(59, 130, 246, 0.3)", width: 1 }),
            }),
          }),
        );
      }

      if (followMode) {
        map.getView().setCenter(mapCoord);
        if (currentCoords.length === 1) {
          map.getView().setZoom(16);
        }
      }

      // Append to persistent line geometry
      liveLineGeometry.appendCoordinate(mapCoord);
    },
    (err) => {
      alert("Failed to get position: " + err.message);
      stopTracking();
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
  );
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  isTracking = false;
  btnTrack.textContent = "Start Tracking";
  btnTrack.classList.remove("tracking");
  btnAddPoint.disabled = false;
  btnFollow.style.display = "none";
  positionSource.clear();

  liveLineGeometry = null;
  liveLineFeature = null;

  if (currentCoords.length === 0) {
    trackSource.clear();
    return;
  }

  const session = {
    id: crypto.randomUUID(),
    startTime,
    endTime: Date.now(),
    coords: currentCoords,
    points: currentSessionPoints.slice(),
  };

  currentSessionPoints = [];

  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);

  trackSource.clear();
  drawSessionOnMap(session, "#3b82f6");
  renderSessionList();

  showToast(`Session saved — ${session.coords.length} positions`);
}

// --- Add point ---
function addPoint() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const point = { lat: latitude, lon: longitude, timestamp: Date.now() };

      if (isTracking) {
        currentSessionPoints.push(point);
        showToast("Point added to current session");
      } else {
        const session = {
          id: crypto.randomUUID(),
          startTime: Date.now(),
          endTime: Date.now(),
          coords: [],
          points: [point],
        };
        const sessions = loadSessions();
        sessions.push(session);
        saveSessions(sessions);
        renderSessionList();
        showToast("Standalone point saved");
      }

      const mapCoord = fromLonLat([longitude, latitude]);
      const marker = new Feature(new Point(mapCoord));
      marker.setStyle(waypointStyle);
      trackSource.addFeature(marker);
    },
    (err) => {
      alert("Failed to get position: " + err.message);
    },
    { enableHighAccuracy: true },
  );
}

// --- Draw session on map ---
function drawSessionOnMap(session, color) {
  sessionSource.clear();

  if (session.coords.length >= 2) {
    const lineCoords = session.coords.map((c) => fromLonLat([c.lon, c.lat]));
    const lineFeature = new Feature(new LineString(lineCoords));
    lineFeature.setStyle(
      new Style({
        stroke: new Stroke({ color, width: 4 }),
      }),
    );
    sessionSource.addFeature(lineFeature);
  }

  if (session.coords.length === 1) {
    const c = session.coords[0];
    const marker = new Feature(new Point(fromLonLat([c.lon, c.lat])));
    marker.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "white", width: 2 }),
        }),
      }),
    );
    sessionSource.addFeature(marker);
  }

  if (session.points) {
    session.points.forEach((point) => {
      const marker = new Feature(new Point(fromLonLat([point.lon, point.lat])));
      marker.setStyle(waypointStyle);
      sessionSource.addFeature(marker);
    });
  }

  if (sessionSource.getFeatures().length > 0) {
    map.getView().fit(sessionSource.getExtent(), {
      padding: [50, 50, 50, 50],
      maxZoom: 18,
    });
  }
}

// --- Helpers ---
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function calcDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const R = 6371000;
    const dLat = ((coords[i].lat - coords[i - 1].lat) * Math.PI) / 180;
    const dLon = ((coords[i].lon - coords[i - 1].lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((coords[i - 1].lat * Math.PI) / 180) *
        Math.cos((coords[i].lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

// --- Session list UI ---
let activeSessionId = null;

function renderSessionList() {
  const list = document.getElementById("sessions-list");
  const sessions = loadSessions();
  list.innerHTML = "";

  if (sessions.length === 0) {
    list.innerHTML = '<li style="color: #94a3b8">No sessions recorded</li>';
    return;
  }

  sessions.forEach((s) => {
    const li = document.createElement("li");
    if (s.id === activeSessionId) li.classList.add("active");

    const info = document.createElement("span");
    info.className = "session-info";
    const start = new Date(s.startTime).toLocaleString("nb-NO");
    const duration = formatDuration(s.endTime - s.startTime);
    const dist = s.coords.length >= 2 ? formatDistance(calcDistance(s.coords)) : "—";
    const waypointCount = s.points ? s.points.length : 0;
    info.innerHTML = `<strong>${start}</strong><br>${s.coords.length} pos · ${waypointCount} pkt · ${dist} · ${duration}`;
    info.addEventListener("click", () => {
      activeSessionId = s.id;
      trackSource.clear();
      drawSessionOnMap(s, "#8b5cf6");
      renderSessionList();
    });

    const btnDel = document.createElement("button");
    btnDel.className = "delete-btn";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });

    li.appendChild(info);
    li.appendChild(btnDel);
    list.appendChild(li);
  });
}

function deleteSession(id) {
  let sessions = loadSessions();
  sessions = sessions.filter((s) => s.id !== id);
  saveSessions(sessions);

  if (activeSessionId === id) {
    sessionSource.clear();
    activeSessionId = null;
  }

  renderSessionList();
  showToast("Session deleted");
}

renderSessionList();