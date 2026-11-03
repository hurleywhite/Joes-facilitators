"use client";

import { useEffect, useRef } from "react";
import { Facilitator } from "@/types/facilitator";
import { isApproximateLocation } from "@/lib/geocode";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function focusColor(focus: string | undefined): string {
  switch (focus) {
    case "Facilitation":
      return "#2480c1"; // arctic-500
    case "Tech":
      return "#87c4ea"; // arctic-300
    case "Both":
      return "#1a476d"; // arctic-800
    default:
      return "#99a2ae"; // ink-400, focus not set
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

    // One marker per LOCATION, not per person.
    //
    // Six people written as "NY, NY" share a single coordinate, six more
    // share "US", three share "London" — roughly 25 of the 84 were
    // stacked under 6 pins, and only the last one drawn was clickable.
    // Everyone else was invisible and unreachable. Grouping makes the
    // count legible and puts every name in the popup.
    const esc = (x: string | undefined) =>
      (x || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    const groups = new Map<string, Facilitator[]>();
    for (const f of facilitators) {
      if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue;
      if (f.lat === 0 && f.lng === 0) continue; // no location on file
      const key = `${f.lat.toFixed(3)},${f.lng.toFixed(3)}`;
      const arr = groups.get(key);
      if (arr) arr.push(f);
      else groups.set(key, [f]);
    }

    for (const people of groups.values()) {
      const [head] = people;
      const n = people.length;
      // A pin only means one hue when everyone under it shares a focus.
      const focuses = new Set(people.map((f) => f.focus));
      const color = focuses.size === 1 ? focusColor(head.focus) : "#4e5863";
      // Country-level coordinates are a centroid, not a place. Drawn
      // hollow so a dot in the middle of the Netherlands isn't read as
      // "they are in Amsterdam".
      const approx = isApproximateLocation(head.location);
      const radius =
        n > 1 ? Math.min(9 + Math.sqrt(n) * 2.6, 20) : experienceSize(head.experienceLevel);

      const marker = L.circleMarker([head.lat, head.lng], {
        radius,
        fillColor: approx ? "#ffffff" : color,
        color: approx ? color : "#fff",
        weight: approx ? 2.5 : 2,
        dashArray: approx ? "3 2" : undefined,
        opacity: 1,
        fillOpacity: approx ? 0.75 : 0.85,
      }).addTo(map);

      if (n > 1) {
        marker.bindTooltip(String(n), {
          permanent: true,
          direction: "center",
          className: "fp-count",
        });
      }

      const rows = people
        .map((f) => {
          const done = f.engagements.filter((e) => e.status === "Completed").length;
          const bits = [f.focus || "Focus not set", `${f.experienceLevel} tier`];
          if (done) bits.push(`${done} delivered`);
          return `<div style="padding:5px 0;border-top:1px solid #eef0f3;">
            <div style="font-weight:600;font-size:13px;color:#171b21;">${esc(f.name)}</div>
            <div style="font-size:11px;color:#6c7684;">${esc(bits.join(" · "))}</div>
          </div>`;
        })
        .join("");

      marker.bindPopup(
        `<div style="min-width:210px;max-height:260px;overflow-y:auto;">
          <div style="font-weight:600;font-size:13px;color:#171b21;">${esc(head.location) || "Location not set"}</div>
          <div style="font-size:11px;color:#99a2ae;margin-bottom:2px;">
            ${n} ${n === 1 ? "person" : "people"}${approx ? " · approximate, country-level only" : ""}
          </div>
          ${rows}
        </div>`,
        { maxWidth: 280 }
      );

      if (onSelectFacilitator && n === 1) {
        marker.on("click", () => onSelectFacilitator(head));
      }
    }
  }, [facilitators, onSelectFacilitator]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-xl overflow-hidden border border-ink-200"
      style={{ minHeight: "500px" }}
    />
  );
}
