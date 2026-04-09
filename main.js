import "./style.css";
import { Feature, Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat, toLonLat } from "ol/proj";
import { LineString, Point } from "ol/geom";
import { Circle as CircleStyle, Fill, Stroke, Style, Icon } from "ol/style";

const STORAGE_KEY = "gps-tracking-sessions";

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

const positionSource = new VectorSource();
const trackSource = new VectorSource();
const sessionSource = new VectorSource();

const map = new Map({
  target: "map",
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
    new VectorLayer({ source: sessionSource }),
    new VectorLayer({ source: trackSource }),
    new VectorLayer({ source: positionSource }),
  ],
  view: new View({
    center: fromLonLat([10.755, 59.91]),
    zoom: 14,
  }),
});

navigator.geolocation.getCurrentPosition(
  (pos) => {
    map
      .getView()
      .setCenter(fromLonLat([pos.coords.longitude, pos.coords.latitude]));
  },
  () => {},
);

const positionFeature = new Feature();
positionFeature.setStyle(
  new Style({
    image: new CircleStyle({
      fill: new Fill({ color: "rgba(59, 130, 246, 0.8)" }),
      radius: 8,
    }),
  }),
);

let isTracking = false;
let watchId = null;
let currentCoords = [];
let startTime = null;

const btnTrack = document.getElementById("btn-track");
const btnAddPoint = document.getElementById("btn-add-point");

btnAddPoint.addEventListener("click", () => {
  addPoint();
});

btnTrack.addEventListener("click", () => { isTracking ? stopTracking() : startTracking(); });

function startTracking() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  isTracking = true;
  startTime = Date.now();
  currentCoords = [];
  btnTrack.textContent = "Stop Tracking";
  btnTrack.classList.add("tracking");
  btnAddPoint.disabled = false;

  trackSource.clear();
  positionSource.clear();
  positionSource.addFeature(positionFeature);

  let centeredOnFirst = false;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const coords = { lat: latitude, lon: longitude, timestamp: Date.now() };
      currentCoords.push(coords);

      const mapCoord = fromLonLat([longitude, latitude]);
      positionFeature.setGeometry(new Point(mapCoord));

      if (!centeredOnFirst) {
        map.getView().setCenter(mapCoord);
        map.getView().setZoom(16);
        centeredOnFirst = true;
      }

      if (currentCoords.length >= 2) {
        trackSource.clear();
        const linecoords = currentCoords.map((c) => fromLonLat([c.lon, c.lat]));
        const linefeature = new Feature(new LineString(linecoords));
        linefeature.setStyle(
          new Style({
            stroke: new Stroke({ color: "#3b82f6", width: 3 }),
          }),
        );
        trackSource.addFeature(linefeature);
      }
    },
    (err) => {
      alert("Failed to get position:" + err.message);
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
  btnAddPoint.disabled = true;
  positionSource.removeFeature(positionFeature);

  if (currentCoords.length === 0) return;

  // Save session
  const session = {
    id: crypto.randomUUID(),
    startTime,
    endTime: Date.now(),
    coords: currentCoords,
    points: [],
  };

  // Collect points added during the session
  session.points = currentSessionPoints.slice();
  currentSessionPoints = [];

  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);

  // Draw session on map
  trackSource.clear();
  drawSessionOnMap(session, "#3b82f6");

  renderSessionList();
}

// Add point
let currentSessionPoints = [];

function addPoint() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const point = { lat: latitude, lon: longitude, timestamp: Date.now() };

      if (isTracking) {
        currentSessionPoints.push(point);
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
      }

      // Show marker on map
      const mapCoord = fromLonLat([longitude, latitude]);
      const marker = new Feature(new Point(mapCoord));
      marker.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: "#ef4444" }),
            stroke: new Stroke({ color: "white", width: 2 }),
          }),
        }),
      );
      trackSource.addFeature(marker);
    },
    (err) => {
      alert("Failed to get position:" + err.message);
    },
    { enableHighAccuracy: true },
  );
}

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

  // Draw points
  if (session.points) {
    session.points.forEach((point) => {
      const marker = new Feature(new Point(fromLonLat([point.lon, point.lat])));
      marker.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: "#ef4444" }),
            stroke: new Stroke({ color: "white", width: 2 }),
          }),
        }),
      );
      sessionSource.addFeature(marker);
    });
  }

  // Fit view
  if (sessionSource.getFeatures().length > 0) {
    map.getView().fit(sessionSource.getExtent(), {
      padding: [50, 50, 50, 50],
      maxZoom: 18,
    });
  }
}

// Session list UI
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

    const info = document.createElement("span");
    info.className = "session-info";
    const start = new Date(s.startTime).toLocaleString("nb-NO");
    const pointCount = s.coords.length;
    const waypointCount = s.points ? s.points.length : 0;
    info.textContent = `${start} (${pointCount} pos, ${waypointCount} pkt)`;
    info.addEventListener("click", () => {
      activeSessionId = s.id;
      trackSource.clear();
      drawSessionOnMap(s, "#8b5cf6");
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
}

renderSessionList();
