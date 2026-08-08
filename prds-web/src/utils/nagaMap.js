export const NAGA_CENTER = [10.211, 123.758];

export const NAGA_BOUNDS = {
  minLat: 10.18,
  maxLat: 10.29,
  minLon: 123.67,
  maxLon: 123.8,
};

export const NAGA_BOUNDS_SOUTH_WEST = [NAGA_BOUNDS.minLat, NAGA_BOUNDS.minLon];
export const NAGA_BOUNDS_NORTH_EAST = [NAGA_BOUNDS.maxLat, NAGA_BOUNDS.maxLon];

export const clampToNagaBounds = (latitude, longitude) => {
  const clampedLat = Math.min(NAGA_BOUNDS.maxLat, Math.max(NAGA_BOUNDS.minLat, latitude));
  const clampedLng = Math.min(NAGA_BOUNDS.maxLon, Math.max(NAGA_BOUNDS.minLon, longitude));

  return { latitude: clampedLat, longitude: clampedLng };
};

export const isWithinNagaBounds = (latitude, longitude) => {
  return (
    latitude >= NAGA_BOUNDS.minLat &&
    latitude <= NAGA_BOUNDS.maxLat &&
    longitude >= NAGA_BOUNDS.minLon &&
    longitude <= NAGA_BOUNDS.maxLon
  );
};
