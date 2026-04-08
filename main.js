import "./style.css";
import { Feature, Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat, toLonLat } from "ol/proj";
import { LineString, Point } from "ol/geom";
import { Circle as CircleStyle, Fill, Stroke, Style, Icon } from "ol/style";
import { Vector } from "ol/source";

const STORAGE_KEY = "gps-tracking-sessions";

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    console.error("Failed to load sessions:", e);
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

navigation.geolocation.getCurrentPosition(
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

  let centeredOnFrirst = false;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const coords = { lat: latitude, lon: longitude, timestamp: Date.now() };
      currentCoords.push(coords);

      const mapCoord = fromLonLat([longitude, latitude]);
      positionFeature.setGeometry(new Point(mapCoord));

      if (!centeredOnFrirst) {
        map.getView().setCenter(mapCoord);
        map.getView().setZoom(16);
        centeredOnFrirst = true;
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
}
