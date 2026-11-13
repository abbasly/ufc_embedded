// The only module that knows where data comes from. Today that's static JSON
// produced by the Python pipeline; swapping to an HTTP API only changes this file.

import { type QueryClient, useQuery } from "@tanstack/react-query";

import { accountsEnabled } from "../backend";

import {
  MMA_MATH_SCHEMA_VERSION,
  type MmaMathData,
  PREDICTOR_SCHEMA_VERSION,
  type PredictorData,
  STYLE_MAP_SCHEMA_VERSION,
  type StyleMapData,
  type StyleMapWire,
} from "./types";
import { hydrateStyleMap } from "./styleMap";

const DATA_URL = `${import.meta.env.BASE_URL}data`;

async function fetchJson<T extends { schema_version: number }>(file: string, version: number): Promise<T> {
  // Revalidate every time so a fresh deploy never pairs new code with stale cached data.
  const res = await fetch(`${DATA_URL}/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  const data = (await res.json()) as T;
  if (data.schema_version > version && reloadOnce(file)) {
    // Newer data than this code: the browser cached an old copy of the app. Reload to get the new one.
    return new Promise<T>(() => {});
  }
  if (data.schema_version !== version) {
    throw new Error(`${file} is schema v${data.schema_version}, UI expects v${version}. Re-run the export.`);
  }
  return data;
}

/** Reload the page once per session (per file), so a stale cached app can't loop forever. */
function reloadOnce(file: string): boolean {
  const key = `reloaded-for-${file}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

const styleMapQuery = {
  queryKey: ["style-map"],
  queryFn: async (): Promise<StyleMapData> => hydrateStyleMap(await fetchJson<StyleMapWire>("style_map.json", STYLE_MAP_SCHEMA_VERSION)),
  staleTime: Infinity,
};
const mmaMathQuery = {
  queryKey: ["mma-math"],
  queryFn: () => fetchJson<MmaMathData>("mma_math.json", MMA_MATH_SCHEMA_VERSION),
  staleTime: Infinity,
};
const predictorQuery = {
  queryKey: ["predictor"],
  queryFn: () => fetchJson<PredictorData>("predictor.json", PREDICTOR_SCHEMA_VERSION),
  staleTime: Infinity,
};

export const useStyleMap = () => useQuery(styleMapQuery);
export const useMmaMath = () => useQuery(mmaMathQuery);
export const usePredictor = (enabled = true) => useQuery({ ...predictorQuery, enabled });

/**
 * Start downloading the data the first page needs as soon as the app starts, alongside that
 * page's code, instead of after the code has loaded. ``path`` is relative to the site root.
 * The home page is Fighter Lab, unless the link is a Pick'em invite (App's Home); Pick'em shows
 * the predictor's photos and odds.
 */
export function prefetchFor(client: QueryClient, path: string, search: string) {
  const params = new URLSearchParams(search);
  const pickemLink = accountsEnabled && (params.has("event") || params.has("join") || params.has("league"));
  const query =
    path.startsWith("/fighter-lab") || path.startsWith("/style-map") || params.has("fighter") || (path === "/" && !pickemLink)
      ? styleMapQuery
      : path.startsWith("/predictor") || path.startsWith("/ladder") || path === "/" || (accountsEnabled && path.startsWith("/pickem"))
        ? predictorQuery
        : path.startsWith("/mma-math")
          ? mmaMathQuery
          : null;
  // The page's own useQuery picks the request up (or its result); errors show there too.
  if (query) void client.prefetchQuery(query as Parameters<QueryClient["prefetchQuery"]>[0]);
}
