/**
 * UI Scale Service
 * Manages interface display sizing and responsive scale preferences.
 * Uses root font-size rem scaling to preserve Leaflet map coordinate systems
 * while scaling all typography, padding, and UI components smoothly.
 */

export const UI_SCALE_STORAGE_KEY = "prds_ui_scale";

export const UI_SCALE_PRESETS = [
  {
    id: "small",
    label: "Small",
    sublabel: "Compact",
    percent: "85%",
    fontSize: "85%",
    scaleValue: 0.85,
    description: "Best for 13\"–14\" laptops & 720p screens",
  },
  {
    id: "medium",
    label: "Medium",
    sublabel: "Standard",
    percent: "100%",
    fontSize: "100%",
    scaleValue: 1.0,
    isDefault: true,
    description: "Default balanced size for all screens",
  },
  {
    id: "large",
    label: "Large",
    sublabel: "Comfortable",
    percent: "115%",
    fontSize: "115%",
    scaleValue: 1.15,
    description: "Crisp for 1080p desktop monitors",
  },
  {
    id: "xlarge",
    label: "Extra Large",
    sublabel: "Expanded",
    percent: "125%",
    fontSize: "125%",
    scaleValue: 1.25,
    description: "2K/4K monitors & visual accessibility",
  },
];

export const DEFAULT_SCALE_ID = "medium";

/**
 * Finds preset object by ID, falling back to medium/default.
 */
export function getPresetById(scaleId) {
  return (
    UI_SCALE_PRESETS.find((preset) => preset.id === scaleId) ||
    UI_SCALE_PRESETS.find((preset) => preset.id === DEFAULT_SCALE_ID)
  );
}

/**
 * Retrieves the currently saved UI scale preference from localStorage.
 */
export function getSavedUiScale() {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_SCALE_ID;
    const saved = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (saved && UI_SCALE_PRESETS.some((p) => p.id === saved)) {
      return saved;
    }
  } catch (err) {
    console.warn("Failed to read UI scale preference:", err);
  }
  return DEFAULT_SCALE_ID;
}

/**
 * Applies the given scale ID to the document root immediately.
 * This triggers live visual scaling and dispatches a window resize event
 * so charts, tables, and maps recalculate their viewport sizes.
 */
export function applyUiScale(scaleId) {
  const preset = getPresetById(scaleId);
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.style.fontSize = preset.fontSize;
    document.documentElement.style.setProperty("--prds-ui-scale", String(preset.scaleValue));
    document.documentElement.setAttribute("data-ui-scale", preset.id);
  }

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("prds:ui-scale-changed", { detail: preset }));
      window.dispatchEvent(new Event("resize"));
    } catch {
      // In minimal test environments where CustomEvent might be missing
    }
  }

  return preset;
}

/**
 * Persists the scale preference in localStorage and applies it.
 */
export function saveUiScale(scaleId) {
  const preset = getPresetById(scaleId);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, preset.id);
    }
  } catch (err) {
    console.warn("Failed to save UI scale preference:", err);
  }
  applyUiScale(preset.id);
  return preset;
}

/**
 * Recommends an optimal scale preset based on the current window/screen dimensions.
 */
export function getRecommendedScale() {
  if (typeof window === "undefined") return DEFAULT_SCALE_ID;

  const width = window.innerWidth || (window.screen && window.screen.width) || 1280;
  const height = window.innerHeight || (window.screen && window.screen.height) || 800;

  if (width <= 1366 || height <= 768) {
    return "small";
  }
  if (width >= 2560 || height >= 1440) {
    return "large";
  }
  return "medium";
}

