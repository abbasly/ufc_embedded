// The only module that knows where data comes from. Today that's static JSON
// produced by the Python pipeline; swapping to an HTTP API only changes this file.

import { useQuery } from "@tanstack/react-query";

import { MMA_MATH_SCHEMA_VERSION, type MmaMathData, STYLE_MAP_SCHEMA_VERSION, type StyleMapData } from "./types";

const DATA_URL = `${import.meta.env.BASE_URL}data`;

async function fetchJson<T extends { schema_version: number }>(file: string, version: number): Promise<T> {
  // Revalidate every time so a fresh deploy never pairs new code with stale cached data.
  const res = await fetch(`${DATA_URL}/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  const data = (await res.json()) as T;
  if (data.schema_version !== version) {
    throw new Error(`${file} is schema v${data.schema_version}, UI expects v${version}. Re-run the export.`);
  }
  return data;
}

export function useStyleMap() {
  return useQuery({
    queryKey: ["style-map"],
    queryFn: () => fetchJson<StyleMapData>("style_map.json", STYLE_MAP_SCHEMA_VERSION),
    staleTime: Infinity,
  });
}

export function useMmaMath() {
  return useQuery({
    queryKey: ["mma-math"],
    queryFn: () => fetchJson<MmaMathData>("mma_math.json", MMA_MATH_SCHEMA_VERSION),
    staleTime: Infinity,
  });
}
