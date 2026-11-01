// The only module that knows where data comes from. Today that's static JSON
// produced by the Python pipeline; swapping to an HTTP API only changes this file.

import { useQuery } from "@tanstack/react-query";

import { STYLE_MAP_SCHEMA_VERSION, type StyleMapData } from "./types";

const DATA_URL = `${import.meta.env.BASE_URL}data`;

async function fetchStyleMap(): Promise<StyleMapData> {
  // Revalidate every time so a fresh deploy never pairs new code with stale cached data.
  const res = await fetch(`${DATA_URL}/style_map.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load style map: ${res.status}`);
  const data = (await res.json()) as StyleMapData;
  if (data.schema_version !== STYLE_MAP_SCHEMA_VERSION) {
    throw new Error(
      `style_map.json is schema v${data.schema_version}, UI expects v${STYLE_MAP_SCHEMA_VERSION}. Re-run the export.`,
    );
  }
  return data;
}

export function useStyleMap() {
  return useQuery({ queryKey: ["style-map"], queryFn: fetchStyleMap, staleTime: Infinity });
}
