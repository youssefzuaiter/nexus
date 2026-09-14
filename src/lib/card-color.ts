const HUES = ["green", "purple", "gold", "rose", "peach", "blue"] as const;
export type Hue = (typeof HUES)[number];

export function tintClass(hue: Hue): string {
  return `tint-${hue}`;
}

export function dotClass(hue: Hue): string {
  return `dot-${hue}`;
}

// Stable per-id color so a given note keeps its card color across renders
// and pagination, without storing a color field anywhere.
export function hueForId(id: string): Hue {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return HUES[Math.abs(hash) % HUES.length];
}

const CATEGORY_HUE: Record<string, Hue> = {
  University: "blue",
  Career: "gold",
  Personal: "rose",
};

export function hueForCategory(category: string): Hue {
  return CATEGORY_HUE[category] ?? hueForId(category);
}
