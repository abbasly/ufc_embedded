// The site's data (style_map.json, predictor.json, mma_math.json) isn't kept in git: the data
// refresh workflow builds it and uploads it to a GitHub Release, and this downloads it into
// web/public/data. The site still serves it from its own domain, so nothing changes for visitors.
//
//   node scripts/fetch-data.mjs                  all three, replacing what's there
//   node scripts/fetch-data.mjs --if-missing     only if a file is missing (npm run build does this)
//   node scripts/fetch-data.mjs predictor.json   just one
//
// Which release: "data" (the live site's), or on the beta branch "data-beta" when it exists
// (a refresh run for beta), else "data". DATA_TAG overrides. The branch comes from Cloudflare's
// or GitHub's build environment.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["style_map.json", "predictor.json", "mma_math.json"];
const REPO = process.env.GITHUB_REPOSITORY || "abbasly/ufc_embedded";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");

const args = process.argv.slice(2);
const ifMissing = args.includes("--if-missing");
const files = args.filter((a) => !a.startsWith("--"));
const wanted = (files.length ? files : FILES).filter((f) => !(ifMissing && existsSync(join(DIR, f))));
if (!wanted.length) process.exit(0);

const branch = process.env.WORKERS_CI_BRANCH || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";
const tags = process.env.DATA_TAG ? [process.env.DATA_TAG] : branch === "beta" ? ["data-beta", "data"] : ["data"];

mkdirSync(DIR, { recursive: true });
for (const file of wanted) {
  let done = false;
  for (const tag of tags) {
    const url = `https://github.com/${REPO}/releases/download/${tag}/${file}`;
    const res = await fetch(url);
    if (!res.ok) continue; // e.g. no beta data: fall back to the live site's
    writeFileSync(join(DIR, file), Buffer.from(await res.arrayBuffer()));
    console.log(`data: ${file} from the "${tag}" release`);
    done = true;
    break;
  }
  if (!done) {
    console.error(`data: couldn't download ${file} (releases tried: ${tags.join(", ")})`);
    process.exit(1);
  }
}
