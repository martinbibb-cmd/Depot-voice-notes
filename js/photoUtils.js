// js/photoUtils.js
// Photo handling and EXIF extraction utilities for Depot Voice Notes

import { validateCoordinates } from './gpsUtils.js';

/**
 * Extract EXIF data from image file
 * @param {File|Blob} file - Image file
 * @returns {Promise<object>} EXIF data including GPS if available
 */
export async function extractEXIF(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        const exif = parseEXIF(view);
        resolve(exif);
      } catch (err) {
        console.warn("Failed to parse EXIF:", err);
        resolve({});
      }
    };

    reader.onerror = () => {
      console.warn("Failed to read file for EXIF");
      resolve({});
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse EXIF data from DataView
 * @param {DataView} view - DataView of image file
 * @returns {object} Parsed EXIF data
 */
function parseEXIF(view) {
  // Check for JPEG signature
  if (view.getUint16(0, false) !== 0xffd8) {
    return {}; // Not a JPEG
  }

  let offset = 2;
  const length = view.byteLength;

  // Find APP1 marker (0xFFE1) which contains EXIF
  while (offset < length) {
    const marker = view.getUint16(offset, false);

    if (marker === 0xffe1) {
      // Found APP1 marker
      const app1Length = view.getUint16(offset + 2, false);
      const exifHeader = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );

      if (exifHeader === "Exif") {
        // Parse TIFF header
        const tiffOffset = offset + 10;
        return parseTIFF(view, tiffOffset);
      }
    }

    // Move to next marker
    offset += 2 + view.getUint16(offset + 2, false);
  }

  return {};
}

/**
 * Parse TIFF header and IFD entries
 * @param {DataView} view - DataView
 * @param {number} tiffOffset - Offset to TIFF header
 * @returns {object} Parsed EXIF data
 */
function parseTIFF(view, tiffOffset) {
  const byteOrder = view.getUint16(tiffOffset, false);
  const littleEndian = byteOrder === 0x4949;

  const ifd0Offset = view.getUint32(tiffOffset + 4, littleEndian);
  const exif = {};

  // Parse IFD0
  parseIFD(view, tiffOffset + ifd0Offset, tiffOffset, littleEndian, exif);

  // Parse GPS IFD if present
  if (exif._gpsIFDOffset) {
    const gpsData = {};
    parseIFD(view, tiffOffset + exif._gpsIFDOffset, tiffOffset, littleEndian, gpsData);
    delete exif._gpsIFDOffset;

    // Convert GPS data to standard format
    const gps = convertGPSData(gpsData);
    if (gps) {
      exif.gps = gps;
    }
  }

  // Parse EXIF sub-IFD if present
  if (exif._exifIFDOffset) {
    parseIFD(view, tiffOffset + exif._exifIFDOffset, tiffOffset, littleEndian, exif);
    delete exif._exifIFDOffset;
  }

  return exif;
}

/**
 * Parse IFD (Image File Directory)
 * @param {DataView} view - DataView
 * @param {number} offset - IFD offset
 * @param {number} tiffOffset - TIFF header offset
 * @param {boolean} littleEndian - Byte order
 * @param {object} result - Result object to populate
 */
function parseIFD(view, offset, tiffOffset, littleEndian, result) {
  const numEntries = view.getUint16(offset, littleEndian);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = offset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);

    const tagInfo = EXIF_TAGS[tag];
    if (!tagInfo) continue;

    let value;

    // Handle different data types
    if (type === 2) {
      // ASCII string
      value = readString(view, tiffOffset + valueOffset, count);
    } else if (type === 3) {
      // Short (16-bit)
      value = view.getUint16(entryOffset + 8, littleEndian);
    } else if (type === 4) {
      // Long (32-bit)
      value = valueOffset;
    } else if (type === 5) {
      // Rational (or array of rationals)
      if (count === 1) {
        value = readRational(view, tiffOffset + valueOffset, littleEndian);
      } else {
        // Read array of rationals (e.g., GPS coordinates: degrees, minutes, seconds)
        value = [];
        for (let j = 0; j < count; j++) {
          value.push(readRational(view, tiffOffset + valueOffset + j * 8, littleEndian));
        }
      }
    } else if (type === 10) {
      // Signed rational (or array of signed rationals)
      if (count === 1) {
        value = readSignedRational(view, tiffOffset + valueOffset, littleEndian);
      } else {
        value = [];
        for (let j = 0; j < count; j++) {
          value.push(readSignedRational(view, tiffOffset + valueOffset + j * 8, littleEndian));
        }
      }
    } else {
      continue;
    }

    result[tagInfo.name] = value;
  }
}

/**
 * Read ASCII string from DataView
 * @param {DataView} view - DataView
 * @param {number} offset - Offset
 * @param {number} length - Length
 * @returns {string} String value
 */
function readString(view, offset, length) {
  let str = "";
  for (let i = 0; i < length - 1; i++) {
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}

/**
 * Read rational number (unsigned)
 * @param {DataView} view - DataView
 * @param {number} offset - Offset
 * @param {boolean} littleEndian - Byte order
 * @returns {number} Rational value
 */
function readRational(view, offset, littleEndian) {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Read signed rational number
 * @param {DataView} view - DataView
 * @param {number} offset - Offset
 * @param {boolean} littleEndian - Byte order
 * @returns {number} Signed rational value
 */
function readSignedRational(view, offset, littleEndian) {
  const numerator = view.getInt32(offset, littleEndian);
  const denominator = view.getInt32(offset + 4, littleEndian);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Convert GPS IFD data to standard lat/lng format
 * @param {object} gpsData - Raw GPS IFD data
 * @returns {object|null} GPS coordinates
 */
function convertGPSData(gpsData) {
  if (!gpsData.GPSLatitude || !gpsData.GPSLongitude) {
    return null;
  }

  const lat = convertDMSToDD(
    gpsData.GPSLatitude,
    gpsData.GPSLatitudeRef || "N"
  );
  const lng = convertDMSToDD(
    gpsData.GPSLongitude,
    gpsData.GPSLongitudeRef || "E"
  );

  if (!validateCoordinates(lat, lng)) {
    return null;
  }

  const gps = { lat, lng };

  // Add altitude if present
  if (gpsData.GPSAltitude !== undefined) {
    gps.alt = gpsData.GPSAltitude;
    if (gpsData.GPSAltitudeRef === 1) {
      gps.alt = -gps.alt; // Below sea level
    }
  }

  // Add accuracy/precision if present
  if (gpsData.GPSHPositioningError !== undefined) {
    gps.accuracy = gpsData.GPSHPositioningError;
  }

  return gps;
}

/**
 * Convert DMS (Degrees, Minutes, Seconds) to Decimal Degrees
 * @param {Array|number} dms - DMS array [degrees, minutes, seconds] or single value
 * @param {string} ref - Reference (N/S/E/W)
 * @returns {number} Decimal degrees
 */
function convertDMSToDD(dms, ref) {
  let dd;

  if (Array.isArray(dms) && dms.length === 3) {
    dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
  } else if (typeof dms === "number") {
    dd = dms;
  } else {
    return 0;
  }

  if (ref === "S" || ref === "W") {
    dd = -dd;
  }

  return dd;
}

/**
 * EXIF tag definitions
 */
const EXIF_TAGS = {
  // GPS IFD Pointer
  0x8825: { name: "_gpsIFDOffset" },
  // EXIF IFD Pointer
  0x8769: { name: "_exifIFDOffset" },

  // Standard EXIF tags
  0x0132: { name: "DateTime" },
  0x010f: { name: "Make" },
  0x0110: { name: "Model" },
  0x0112: { name: "Orientation" },

  // EXIF sub-IFD tags
  0x9003: { name: "DateTimeOriginal" },
  0x9004: { name: "DateTimeDigitized" },

  // GPS tags
  0x0001: { name: "GPSLatitudeRef" },
  0x0002: { name: "GPSLatitude" },
  0x0003: { name: "GPSLongitudeRef" },
  0x0004: { name: "GPSLongitude" },
  0x0005: { name: "GPSAltitudeRef" },
  0x0006: { name: "GPSAltitude" },
  0x001f: { name: "GPSHPositioningError" }
};

/**
 * Generate unique photo ID
 * @returns {string} Unique photo ID
 */
export function generatePhotoId() {
  return `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert image file to base64
 * @param {File|Blob} file - Image file
 * @returns {Promise<string>} Base64 encoded image
 */
export async function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get image dimensions
 * @param {File|Blob} file - Image file
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Process photo file and extract all metadata
 * @param {File} file - Image file
 * @param {string} section - Section name this photo belongs to
 * @param {string} description - Optional description
 * @returns {Promise<object>} Photo object with metadata
 */
export async function processPhoto(file, section, description = "") {
  const id = generatePhotoId();
  const capturedAt = new Date().toISOString();

  // Extract EXIF data
  const exif = await extractEXIF(file);

  // Convert to base64
  const base64 = await imageToBase64(file);

  // Get dimensions
  const dimensions = await getImageDimensions(file);

  // Build photo object
  const photo = {
    id,
    section,
    description,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    base64,
    width: dimensions.width,
    height: dimensions.height,
    capturedAt,
    markers: [],
    annotations: []
  };

  // Add GPS if available
  if (exif.gps) {
    photo.gps = exif.gps;
  }

  // Add EXIF timestamp if available
  if (exif.DateTimeOriginal) {
    try {
      // Parse EXIF date format: "YYYY:MM:DD HH:MM:SS"
      const exifDate = exif.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      photo.capturedAt = new Date(exifDate).toISOString();
    } catch (err) {
      console.warn("Failed to parse EXIF date:", err);
    }
  }

  // Add camera info if available
  if (exif.Make || exif.Model) {
    photo.camera = {
      make: exif.Make || "",
      model: exif.Model || ""
    };
  }

  return photo;
}

/**
 * Validate photo object structure
 * @param {object} photo - Photo object
 * @returns {boolean} True if valid
 */
export function validatePhoto(photo) {
  return (
    photo &&
    typeof photo === "object" &&
    typeof photo.id === "string" &&
    typeof photo.section === "string" &&
    typeof photo.base64 === "string" &&
    typeof photo.capturedAt === "string"
  );
}

/**
 * Create thumbnail from base64 image
 * @param {string} base64 - Base64 encoded image
 * @param {number} maxSize - Maximum width/height
 * @returns {Promise<string>} Base64 encoded thumbnail
 */
export async function createThumbnail(base64, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };

    img.onerror = reject;
    img.src = base64;
  });
}
