// Link previews per page. Crawlers (WhatsApp, Slack, LinkedIn...) don't run JavaScript, so
// every route of this single-page app would share index.html's preview. After `vite build`,
// write dist/<route>/index.html: the same app, with that page's title, description and image.
// GitHub Pages then also serves these routes with 200 instead of the 404.html fallback.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROUTES = [
  {
    path: "style-map",
    title: "UFC Embedded: the fighter style map",
    description: "Every active UFC fighter, mapped by how they fight. Find who fights most like your favourite.",
    image: "og.png",
  },
  {
    path: "predictor",
    title: "UFC Embedded: fight predictor",
    description: "Pick any two UFC fighters: who wins, how it ends, and what drives the call.",
    image: "og-predictor.png",
  },
  {
    path: "mma-math",
    title: "UFC Embedded: MMA math",
    description: "A beat B, B beat C, C beat A. Prove any UFC fighter beats any other with a chain of wins.",
    image: "og-mma-math.png",
  },
];

const html = readFileSync("dist/index.html", "utf8");
const meta = (attr, key, value) => (page) =>
  page.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${value}$2`);

for (const route of ROUTES) {
  const siteUrl = html.match(/<meta property="og:url" content="([^"]*)"/)[1]; // ends with "/"
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`);
  for (const edit of [
    meta("name", "description", route.description),
    meta("property", "og:title", route.title),
    meta("property", "og:description", route.description),
    meta("property", "og:url", `${siteUrl}${route.path}`),
    meta("property", "og:image", `${siteUrl}${route.image}`),
  ]) {
    page = edit(page);
  }
  mkdirSync(`dist/${route.path}`, { recursive: true });
  writeFileSync(`dist/${route.path}/index.html`, page);
  console.log(`preview page: dist/${route.path}/index.html`);
}
