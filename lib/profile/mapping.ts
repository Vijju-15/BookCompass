// lib/profile/mapping.ts

export const LENGTH_RANGES = {
  short: { min: 0, max: 200 },
  medium: { min: 200, max: 350 },
  long: { min: 350, max: 500 },
  epic: { min: 500, max: 1500 },
  any: null,
} as const;

export type LengthChoice = keyof typeof LENGTH_RANGES;

export const PLOT_TO_COMPLEXITY = {
  simple: [1, 2],
  twisty: [2, 3],
  layered: [4, 5],
  any: null,
} as const;

export type PlotChoice = keyof typeof PLOT_TO_COMPLEXITY;
