import assert from "node:assert/strict";
import test from "node:test";

import {
  UI_SCALE_PRESETS,
  DEFAULT_SCALE_ID,
  UI_SCALE_STORAGE_KEY,
  getPresetById,
  getSavedUiScale,
  applyUiScale,
  saveUiScale,
  getRecommendedScale,
} from "./uiScaleService.js";

test("getPresetById returns matching preset or fallback to medium", () => {
  assert.equal(getPresetById("small")?.fontSize, "85%");
  assert.equal(getPresetById("medium")?.fontSize, "100%");
  assert.equal(getPresetById("large")?.fontSize, "115%");
  assert.equal(getPresetById("xlarge")?.fontSize, "125%");
  assert.equal(getPresetById("unknown_scale")?.id, DEFAULT_SCALE_ID);
});

test("getSavedUiScale reads from storage and falls back cleanly", () => {
  const originalStorage = globalThis.localStorage;
  let mockStore = {};
  globalThis.localStorage = {
    getItem: (key) => mockStore[key] || null,
    setItem: (key, val) => {
      mockStore[key] = String(val);
    },
  };

  try {
    assert.equal(getSavedUiScale(), DEFAULT_SCALE_ID);

    mockStore[UI_SCALE_STORAGE_KEY] = "large";
    assert.equal(getSavedUiScale(), "large");

    mockStore[UI_SCALE_STORAGE_KEY] = "invalid_value";
    assert.equal(getSavedUiScale(), DEFAULT_SCALE_ID);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("applyUiScale and saveUiScale set styles and persist state", () => {
  const originalDoc = globalThis.document;
  const originalWin = globalThis.window;
  const originalStorage = globalThis.localStorage;

  let mockStore = {};
  const mockElement = {
    style: {
      fontSize: "",
      setProperty: (prop, val) => {
        mockElement.style[prop] = val;
      },
    },
    setAttribute: (name, val) => {
      mockElement[name] = val;
    },
  };

  let eventsFired = [];
  globalThis.document = { documentElement: mockElement };
  globalThis.window = {
    dispatchEvent: (evt) => eventsFired.push(evt),
  };
  globalThis.localStorage = {
    getItem: (key) => mockStore[key] || null,
    setItem: (key, val) => {
      mockStore[key] = String(val);
    },
  };

  try {
    const applied = applyUiScale("xlarge");
    assert.equal(applied.id, "xlarge");
    assert.equal(mockElement.style.fontSize, "125%");
    assert.equal(mockElement.style["--prds-ui-scale"], "1.25");
    assert.equal(mockElement["data-ui-scale"], "xlarge");

    const saved = saveUiScale("small");
    assert.equal(saved.id, "small");
    assert.equal(mockStore[UI_SCALE_STORAGE_KEY], "small");
    assert.equal(mockElement.style.fontSize, "85%");
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
    globalThis.localStorage = originalStorage;
  }
});

test("getRecommendedScale detects screen size correctly", () => {
  const originalWin = globalThis.window;
  try {
    globalThis.window = { innerWidth: 1280, innerHeight: 720 };
    assert.equal(getRecommendedScale(), "small");

    globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
    assert.equal(getRecommendedScale(), "medium");

    globalThis.window = { innerWidth: 2560, innerHeight: 1440 };
    assert.equal(getRecommendedScale(), "large");
  } finally {
    globalThis.window = originalWin;
  }
});

