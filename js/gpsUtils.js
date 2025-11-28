// js/gpsUtils.js
// GPS and geolocation utilities for Depot Voice Notes

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * Returns distance in meters
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string
 */
export function formatDistance(meters) {
  if (meters < 1) {
    return `${Math.round(meters * 100)} cm`;
  } else if (meters < 1000) {
    return `${meters.toFixed(1)} m`;
  } else {
    return `${(meters / 1000).toFixed(2)} km`;
  }
}

/**
 * Format distance with "as the crow flies" suffix
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string with suffix
 */
export function formatDistanceAsCrowFlies(meters) {
  return `${formatDistance(meters)} as the crow flies`;
}

/**
 * Validate GPS coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
export function validateCoordinates(lat, lon) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Request geolocation permission and get current position
 * @returns {Promise<GeolocationPosition>}
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Strip GPS data for privacy (customer-facing mode)
 * @param {object} photo - Photo object with GPS data
 * @param {boolean} stripGPS - Whether to strip GPS data
 * @returns {object} Photo object with GPS optionally stripped
 */
export function applyGPSPrivacy(photo, stripGPS = false) {
  if (!stripGPS) return photo;

  const cleaned = { ...photo };
  if (cleaned.gps) {
    // Keep only approximate location (to nearest 0.01 degree ≈ 1km)
    cleaned.gps = {
      approximate: true,
      lat: Math.round(cleaned.gps.lat * 100) / 100,
      lng: Math.round(cleaned.gps.lng * 100) / 100
    };
  }
  return cleaned;
}

/**
 * Calculate distances between key job locations
 * @param {object} locations - Job locations object
 * @returns {object} Distance matrix
 */
export function calculateJobDistances(locations) {
  const distances = {};
  const locationKeys = Object.keys(locations);

  // Key pairs to calculate
  const pairs = [
    ["gas_meter", "boiler_position"],
    ["boiler_position", "flue_terminal"],
    ["flue_terminal", "boundary_point"],
    ["boiler_position", "cylinder_cupboard"],
    ["gas_meter", "existing_boiler"]
  ];

  pairs.forEach(([from, to]) => {
    if (locations[from]?.gps && locations[to]?.gps) {
      const fromGPS = locations[from].gps;
      const toGPS = locations[to].gps;

      if (validateCoordinates(fromGPS.lat, fromGPS.lng) &&
          validateCoordinates(toGPS.lat, toGPS.lng)) {
        const distance = calculateDistance(
          fromGPS.lat,
          fromGPS.lng,
          toGPS.lat,
          toGPS.lng
        );
        distances[`${from}_to_${to}`] = {
          meters: distance,
          formatted: formatDistance(distance),
          formattedLong: formatDistanceAsCrowFlies(distance)
        };
      }
    }
  });

  return distances;
}

/**
 * Extract location name from section name
 * @param {string} sectionName - Section name (e.g., "Gas meter location")
 * @returns {string} Location key (e.g., "gas_meter")
 */
export function sectionToLocationKey(sectionName) {
  const mapping = {
    "gas meter": "gas_meter",
    "boiler location": "boiler_position",
    "boiler position": "boiler_position",
    "new boiler location": "boiler_position",
    "cylinder": "cylinder_cupboard",
    "cylinder cupboard": "cylinder_cupboard",
    "flue": "flue_terminal",
    "flue terminal": "flue_terminal",
    "boundary": "boundary_point",
    "window": "window_reference",
    "existing boiler": "existing_boiler"
  };

  const normalized = sectionName.toLowerCase().trim();

  for (const [key, value] of Object.entries(mapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Default: convert to snake_case
  return normalized.replace(/\s+/g, "_");
}

/**
 * Create a location object from photo GPS data
 * @param {object} photo - Photo object with GPS
 * @param {string} sectionName - Section name
 * @returns {object} Location object
 */
export function createLocationFromPhoto(photo, sectionName) {
  if (!photo.gps) return null;

  const locationKey = sectionToLocationKey(sectionName);

  return {
    key: locationKey,
    name: sectionName,
    photoId: photo.id,
    gps: {
      lat: photo.gps.lat,
      lng: photo.gps.lng,
      alt: photo.gps.alt,
      accuracy: photo.gps.accuracy
    },
    timestamp: photo.capturedAt,
    description: photo.description
  };
}

/**
 * Build locations object from photos array
 * @param {Array} photos - Array of photo objects
 * @returns {object} Locations keyed by location type
 */
export function buildLocationsFromPhotos(photos) {
  const locations = {};

  photos.forEach((photo) => {
    if (!photo.gps || !photo.section) return;

    const location = createLocationFromPhoto(photo, photo.section);
    if (location) {
      // Use the latest photo for each location
      if (!locations[location.key] ||
          new Date(photo.capturedAt) > new Date(locations[location.key].timestamp)) {
        locations[location.key] = location;
      }
    }
  });

  return locations;
}

/**
 * Get GPS accuracy description
 * @param {number} accuracy - Accuracy in meters
 * @returns {string} Human-readable accuracy description
 */
export function getAccuracyDescription(accuracy) {
  if (!accuracy || accuracy < 0) return "Unknown";
  if (accuracy <= 5) return "Excellent (±" + accuracy.toFixed(1) + "m)";
  if (accuracy <= 10) return "Good (±" + accuracy.toFixed(1) + "m)";
  if (accuracy <= 20) return "Fair (±" + accuracy.toFixed(1) + "m)";
  return "Poor (±" + accuracy.toFixed(0) + "m)";
}
