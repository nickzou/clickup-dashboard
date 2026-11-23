// Shared by the server stats and the route's search-param validation, so it
// must stay free of server-only imports.
export const RANGES = { "30d": 30, "90d": 90, "12m": 365 } as const;
export type RangeKey = keyof typeof RANGES;
