"use client";

import { useEffect, useRef } from "react";
import { Facilitator } from "@/types/facilitator";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function focusColor(focus: string | undefined): string {
  switch (focus) {
    case "Facilitation":
      return "#3b82f6"; // blue
    case "Tech":
      return "#10b981"; // emerald
    case "Both":
      return "#8b5cf6"; // purple
    default:
      return "#9ca3af"; // gray for unspecified
  }
}

function experienceSize(level: string): number {
  switch (level) {
    case "High":
      return 12;
    case "Medium":
      return 9;
    case "Low":
      return 7;
    default:
      return 8;
  }
}

export default function MapView({
  facilitators,
  onSelectFacilitator,
}: {
  facilitators: Facilitator[];
  onSelectFacilitator?: (f: Facilitator) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add markers — skip facilitators without real coordinates so they don't
    // pile up on Null Island (0, 0) in the Atlantic. Treats blank/NaN/zero
    // coords as "unknown location" and just hides them from the map (they
    // still appear in the grid view).
    facilitators.forEach((f) => {
      if (
        !Number.isFinite(f.lat) ||
        !Number.isFinite(f.lng) ||
        (f.lat === 0 && f.lng === 0)
      ) {
        return;
      }
      const color = focusColor(f.focus);
      const radius = experienceSize(f.experienceLevel);

      const marker = L.circleMarker([f.lat, f.lng], {
        radius,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      const completedCount = f.engagements.filter(
        (e) => e.status === "Completed"
      ).length;

      // Map popup — minimal HTML escaping. The fields originate from the
      // sheet so we trust them, but we still strip quotes to keep the
      // attribute injection from breaking on names like O'Brien.
      const esc = (s: string | undefined) =>
        (s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const links: string[] = [];
      if (f.linkedinUrl) {
        links.push(
          `<a href="${esc(f.linkedinUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;text-decoration:none;">LinkedIn →</a>`
        );
      }
      if (f.demoVideoUrl) {
        links.push(
          `<a href="${esc(f.demoVideoUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:#dc2626;text-decoration:none;">▶ Watch demo</a>`
        );
      }

      marker.bindPopup(`
        <div style="min-width:200px;font-family:system-ui,sans-serif;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${esc(f.name)}</div>
          <div style="color:#666;font-size:12px;margin-bottom:6px;">${esc(f.location)}</div>
          <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="background:${color}20;color:${color};padding:2px 6px;border-radius:10px;font-size:11px;font-weight:500;">${esc(f.focus) || "Focus TBD"}</span>
            <span style="background:#f3f4f6;color:#374151;padding:2px 6px;border-radius:10px;font-size:11px;font-weight:500;">${f.experienceLevel}</span>
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:6px;">${completedCount} engagement${completedCount !== 1 ? "s" : ""} completed</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${links.join("")}</div>
        </div>
      `);

      if (onSelectFacilitator) {
        marker.on("click", () => onSelectFacilitator(f));
      }
    });
  }, [facilitators, onSelectFacilitator]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-xl overflow-hidden border border-gray-200"
      style={{ minHeight: "500px" }}
    />
  );
}
