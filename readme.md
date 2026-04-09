# GPS Traking

A web application for tracking your geographic position using GPS, visualizing movement on an OpenStreetMap map, adding waypoints, and managing tracking sessions - all stored locally in the browser.

## Features

- **Live GPS tracking** with a blue indicator on the map
- **Start/Stop** tracking with a single button
- **Live path drawing** as you move
- **Add waypoints** (points of interest) during or outside of tracking session
- **Session management** - view, display, and delete saved sessions
- **Local storage** - all data persists in `localStorage`, no server needed
- **Auto-center** on your position when tracking starts

## Tech Stack

- [OpenLayers](Https://openlayers.org/) - map rendering
- [Vite](https://vitejs.dev/) - dev server and build tool
- [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) - GPS position
- `localStorage` - persistent session storage

## Getting Started

```bash
npm install
npm start
```

Open https://localhost:5173 in your browser.

Note: GPS tracking requires a secure context (HTTPS or localhost) and location permission in the browser.

## Production Build

```bash
npm run build
```

Serve the `dist` directory with any static file server, or preview locally:

```bash
npm run serve
```
