import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import {
  NAGA_BOUNDS,
  NAGA_BOUNDS_NORTH_EAST,
  NAGA_BOUNDS_SOUTH_WEST,
  NAGA_CENTER,
  clampToNagaBounds,
  isWithinNagaBounds,
} from "../../utils/nagaMap";

const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

const createPinIcon = () => {
  return L.divIcon({
    className: "",
    html: `
      <span style="display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#00a36c;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(13,17,23,0.45);">
        <span style="width:10px;height:10px;border-radius:9999px;background:#ffffff;"></span>
      </span>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
};

const formatPlaceAddress = (place) => {
  const parts = [place.name, place.locality || place.district, place.city, place.postcode]
    .filter(Boolean);

  return parts.join(", ");
};

const SEARCH_URL = "https://photon.komoot.io/api/";
const REVERSE_URL = "https://photon.komoot.io/reverse";

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export default function LocationPicker({ value = null, onChange, label = null }) {
  const hasPin = Boolean(value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)));

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [pinLabel, setPinLabel] = useState(() => label || null);
  const [dragPosition, setDragPosition] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState("");
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const requestIdRef = useRef(0);
  const reverseRequestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = query.trim();

    const requestId = ++requestIdRef.current;

    const timerId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${SEARCH_URL}?q=${encodeURIComponent(trimmedQuery)}&limit=6&bbox=${NAGA_BOUNDS.minLon},${NAGA_BOUNDS.minLat},${NAGA_BOUNDS.maxLon},${NAGA_BOUNDS.maxLat}`
        );
        const data = await response.json();
        const places = (data.features || [])
          .map((feature) => ({
            id: `${feature.properties.osm_type}-${feature.properties.osm_id}`,
            name: feature.properties.name || "Place",
            address: formatPlaceAddress(feature.properties),
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
          }))
          .filter((place) => isWithinNagaBounds(place.latitude, place.longitude));

        if (requestId === requestIdRef.current) {
          setResults(places);
          setIsDropdownOpen(true);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setResults([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(timerId);
  }, [query]);

  const reverseGeocode = async (latitude, longitude) => {
    const requestId = ++reverseRequestIdRef.current;

    try {
      const response = await fetch(`${REVERSE_URL}?lon=${longitude}&lat=${latitude}&lang=en`);
      const data = await response.json();
      const feature = data.features?.[0];
      if (!feature || requestId !== reverseRequestIdRef.current) return;

      const place = {
        name: feature.properties.name || "",
        address: formatPlaceAddress(feature.properties),
      };

      setPinLabel(place.name || null);
      onChange({
        latitude,
        longitude,
        address: place.address,
      });
    } catch {
      // keep the current address when reverse geocoding fails
    }
  };

  const applyPinPosition = (latitude, longitude, { flyTo = true } = {}) => {
    const position = clampToNagaBounds(latitude, longitude);

    onChange({
      latitude: position.latitude,
      longitude: position.longitude,
    });

    if (flyTo) {
      mapRef.current?.flyTo([position.latitude, position.longitude], 16);
    }

    void reverseGeocode(position.latitude, position.longitude);
  };

  const selectPlace = (place) => {
    const position = clampToNagaBounds(place.latitude, place.longitude);

    setQuery(place.name);
    setPinLabel(place.name);
    setIsDropdownOpen(false);
    setResults([]);

    onChange({
      latitude: position.latitude,
      longitude: position.longitude,
      address: place.address,
    });

    mapRef.current?.flyTo([position.latitude, position.longitude], 16);
  };

  const handleMapClick = (event) => {
    setDragPosition(null);
    applyPinPosition(event.latlng.lat, event.latlng.lng, { flyTo: false });
  };

  const handleDrag = () => {
    const currentPosition = markerRef.current?.getLatLng();
    if (currentPosition) {
      setDragPosition({ latitude: currentPosition.lat, longitude: currentPosition.lng });
    }
  };

  const handleDragEnd = () => {
    const currentPosition = markerRef.current?.getLatLng();
    setDragPosition(null);
    if (currentPosition) {
      applyPinPosition(currentPosition.lat, currentPosition.lng, { flyTo: false });
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocateMessage("Geolocation is not supported by this browser.");
      return;
    }

    setIsLocating(true);
    setLocateMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        applyPinPosition(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setIsLocating(false);
        setLocateMessage("Unable to get your location. Search for a place instead.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const clearPin = () => {
    setQuery("");
    setResults([]);
    setIsDropdownOpen(false);
    setPinLabel(null);
    setDragPosition(null);
    setLocateMessage("");
    onChange(null);
  };

  const pinnedPosition =
    hasPin && isWithinNagaBounds(Number(value.latitude), Number(value.longitude))
      ? [Number(value.latitude), Number(value.longitude)]
      : NAGA_CENTER;

  const displayPosition =
    dragPosition ||
    (hasPin && isWithinNagaBounds(Number(value.latitude), Number(value.longitude))
      ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
      : null);

  return (
    <div className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      <span>Facility Location</span>

      <div className="relative">
        <label className="relative block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (nextQuery.trim().length < 3) {
                setResults([]);
                setIsSearching(false);
                setIsDropdownOpen(false);
              } else {
                setIsSearching(true);
              }
            }}
            onFocus={() => setIsDropdownOpen(results.length > 0)}
            placeholder="Search a place, e.g. Tuyan, Naga, Cebu..."
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-9 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          )}
        </label>

        {isDropdownOpen && results.length > 0 && (
          <ul className="absolute inset-x-0 z-20 mt-1.5 max-h-64 overflow-auto rounded-lg border border-[#d8dadc] bg-white py-1 shadow-xl">
            {results.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => selectPlace(place)}
                  className="w-full px-3.5 py-2.5 text-left transition hover:bg-[#eff4ff]"
                >
                  <span className="block truncate text-sm font-black normal-case tracking-normal text-[#0d1117]">
                    {place.name}
                  </span>
                  <span className="block truncate text-xs font-medium normal-case tracking-normal text-neutral-500">
                    {place.address}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative">
        <MapContainer
          ref={mapRef}
          center={pinnedPosition}
          zoom={hasPin ? 15 : MIN_ZOOM}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST)}
          maxBoundsViscosity={1}
          scrollWheelZoom={false}
          onClick={handleMapClick}
          className="z-0 h-52 w-full rounded-lg border border-[#d8dadc]"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
          />
          {hasPin && (
            <Marker
              ref={markerRef}
              position={[Number(value.latitude), Number(value.longitude)]}
              icon={createPinIcon()}
              draggable
              eventHandlers={{ drag: handleDrag, dragend: handleDragEnd }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <p className="text-xs font-black text-[#0d1117]">{pinLabel || "Pinned location"}</p>
              </Tooltip>
            </Marker>
          )}
        </MapContainer>

        <button
          type="button"
          onClick={locateMe}
          aria-label="Use my location"
          title="Use my location"
          disabled={isLocating}
          className="absolute right-2 top-2 z-[1000] flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-md transition hover:text-emerald-600 disabled:opacity-50"
        >
          {isLocating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          ) : (
            <CrosshairIcon />
          )}
        </button>
      </div>

      <div className="rounded-lg bg-[#f8f9ff] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          {displayPosition ? (
            <p className="min-w-0 truncate text-xs font-semibold normal-case tracking-normal text-[#42474e]">
              {dragPosition ? "Dragging — " : ""}
              {displayPosition.latitude.toFixed(6)}, {displayPosition.longitude.toFixed(6)}
            </p>
          ) : (
            <p className="min-w-0 truncate text-xs font-semibold normal-case tracking-normal text-neutral-500">
              Search for a place or click the map to set the location.
            </p>
          )}
          {hasPin && (
            <button
              type="button"
              onClick={clearPin}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Clear facility location"
            >
              <XIcon />
            </button>
          )}
        </div>
        {locateMessage && (
          <p className="mt-1 text-[11px] font-semibold normal-case tracking-normal text-red-500">
            {locateMessage}
          </p>
        )}
      </div>
    </div>
  );
}
