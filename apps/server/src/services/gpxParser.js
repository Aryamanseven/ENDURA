import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function parseGpxStats(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });
  const parsed = parser.parse(xml);

  const track = parsed?.gpx?.trk;
  const segments = toArray(track?.trkseg);
  const points = segments.flatMap((segment) => toArray(segment?.trkpt));

  if (points.length < 2) {
    throw new Error("Not enough GPX points to compute stats.");
  }

  let distanceKm = 0;
  let elevationGain = 0;

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];

    distanceKm += haversineKm(
      Number(prev.lat),
      Number(prev.lon),
      Number(curr.lat),
      Number(curr.lon)
    );

    const prevEle = Number(prev.ele ?? 0);
    const currEle = Number(curr.ele ?? 0);
    const delta = currEle - prevEle;
    if (delta > 0) elevationGain += delta;
  }

  const firstTime = new Date(points[0].time).getTime();
  const lastTime = new Date(points[points.length - 1].time).getTime();
  const durationSeconds = Number.isFinite(firstTime) && Number.isFinite(lastTime)
    ? Math.max(1, Math.round((lastTime - firstTime) / 1000))
    : Math.max(1, Math.round(distanceKm * 360));

  const avgPaceMinPerKm = durationSeconds / 60 / Math.max(distanceKm, 0.01);

  const routeCoordinates = points.map((pt) => ({
    lat: Number(pt.lat),
    lon: Number(pt.lon),
    ele: Number(pt.ele ?? 0),
    time: pt.time || null
  }));

  return {
    title: track?.name || "Untitled Run",
    date: points[0].time ? new Date(points[0].time) : new Date(),
    distance_km: Number(distanceKm.toFixed(3)),
    duration_seconds: durationSeconds,
    avg_pace: Number(avgPaceMinPerKm.toFixed(2)),
    elevation_gain: Number(elevationGain.toFixed(1)),
    route_coordinates: routeCoordinates
  };
}
