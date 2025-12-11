// Section styling helper for the 14 boiler installation categories
// Maps section names to emojis and color schemes

export const SECTION_STYLES = {
  "Needs": {
    emoji: "🔵",
    color: "#2563eb", // Blue
    bgColor: "#dbeafe",
    description: "Customer requirements"
  },
  "Working at heights": {
    emoji: "🟠",
    color: "#ea580c", // Orange
    bgColor: "#fed7aa",
    description: "Scaffolding, ladders, roof work"
  },
  "System characteristics": {
    emoji: "⚪",
    color: "#6b7280", // Gray/White
    bgColor: "#f3f4f6",
    description: "Current boiler, pipe size, heating system"
  },
  "Future plans": {
    emoji: "📅",
    color: "#8b5cf6", // Purple
    bgColor: "#ede9fe",
    description: "Future work or follow-on visits"
  },
  "Components that require assistance": {
    emoji: "🟡",
    color: "#eab308", // Yellow
    bgColor: "#fef3c7",
    description: "Heavy lifting, specialist tools"
  },
  "Restrictions to work": {
    emoji: "🔴",
    color: "#dc2626", // Red
    bgColor: "#fecaca",
    description: "Time constraints, access issues"
  },
  "External hazards": {
    emoji: "🟢",
    color: "#16a34a", // Green
    bgColor: "#bbf7d0",
    description: "Asbestos, dangerous dogs, access"
  },
  "Delivery notes": {
    emoji: "🟣",
    color: "#9333ea", // Purple
    bgColor: "#e9d5ff",
    description: "Material drop-off instructions"
  },
  "Office notes": {
    emoji: "🗂️",
    color: "#78350f", // Dark Brown
    bgColor: "#fef3c7",
    description: "Internal billing, scheduling"
  },
  "New boiler and controls": {
    emoji: "🛠️",
    color: "#0891b2", // Teal
    bgColor: "#cffafe",
    description: "Make, model, location"
  },
  "Flue": {
    emoji: "🌬️",
    color: "#06b6d4", // Cyan
    bgColor: "#cffafe",
    description: "Type, route, terminal location"
  },
  "Pipe work": {
    emoji: "🔗",
    color: "#ec4899", // Pink
    bgColor: "#fce7f3",
    description: "Relocations, re-runs, modifications"
  },
  "Disruption": {
    emoji: "⚠️",
    color: "#ca8a04", // Gold
    bgColor: "#fef3c7",
    description: "Noise, dust, utility shut-offs"
  },
  "Customer actions": {
    emoji: "🔑",
    color: "#db2777", // Magenta
    bgColor: "#fce7f3",
    description: "What customer needs to do"
  }
};

/**
 * Get the style object for a section
 * @param {string} sectionName - The name of the section
 * @returns {object} Style object with emoji, color, bgColor, and description
 */
export function getSectionStyle(sectionName) {
  return SECTION_STYLES[sectionName] || {
    emoji: "📝",
    color: "#6b7280",
    bgColor: "#f3f4f6",
    description: ""
  };
}

/**
 * Get just the emoji for a section
 * @param {string} sectionName - The name of the section
 * @returns {string} The emoji character
 */
export function getSectionEmoji(sectionName) {
  return SECTION_STYLES[sectionName]?.emoji || "📝";
}

/**
 * Get the color for a section
 * @param {string} sectionName - The name of the section
 * @returns {string} The hex color code
 */
export function getSectionColor(sectionName) {
  return SECTION_STYLES[sectionName]?.color || "#6b7280";
}

/**
 * Get all section names in order
 * @returns {string[]} Array of section names
 */
export function getAllSectionNames() {
  return Object.keys(SECTION_STYLES);
}

/**
 * Apply section styling to a DOM element
 * @param {HTMLElement} element - The element to style
 * @param {string} sectionName - The name of the section
 */
export function applySectionStyle(element, sectionName) {
  const style = getSectionStyle(sectionName);
  element.style.borderLeftColor = style.color;
  element.style.borderLeftWidth = "4px";
  element.style.borderLeftStyle = "solid";
  element.style.backgroundColor = style.bgColor;
}
