// Per-page HTML for link previews and search engines. Crawlers (WhatsApp, Slack, LinkedIn,
// and search engines that don't run JavaScript) would see the same index.html for every route
// of this single-page app. After `vite build`, write each page's own copy: the same app, with
// that page's title, description, preview image, canonical URL and a plain-text summary
// (<noscript>). Also writes sitemap.xml and robots.txt for search engines.
// GitHub Pages then also serves these routes with 200 instead of the 404.html fallback.
// Keep titles in sync with TITLES in src/app/App.tsx.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// path "" is the home page (About).
const ROUTES = [
  {
    path: "",
    title: "UFC Embedded by Anar Abbasli: UFC fight predictor, style map and Elo rankings",
    description:
      "A machine learning project by Anar Abbasli: three decades of UFC fights turned into a fighting style map, a fight predictor, Elo rankings and MMA math. Free, no sign-up.",
    image: "og.png",
    text: "A personal machine learning project by Anar Abbasli, built on every UFC fight since 1994: a 3D map of fighting styles, a fight predictor, an Elo ladder and MMA math.",
  },
  {
    path: "style-map",
    title: "UFC fighter style map: who fights like who | UFC Embedded",
    description:
      "Every active UFC fighter mapped by how they fight: striking, leg kicks, clinch, takedowns and control. See each fighter's 5 most similar fighters.",
    image: "og.png",
    text: "Every active UFC fighter placed in 3D by fighting style, from 14 stats per fighter. Pick a fighter to see their 5 most similar fighters with a similarity score out of 100.",
  },
  {
    path: "predictor",
    title: "UFC fight predictor: who wins and how | UFC Embedded",
    description:
      "Pick any two UFC fighters for a win probability and the most likely ending: KO, submission or decision. Includes upcoming UFC cards.",
    image: "og-predictor.png",
    text: "A machine learning UFC fight predictor: win chance and method of victory for any matchup, trained only on fights before each fight it predicts, with upcoming UFC cards.",
  },
  {
    path: "ladder",
    title: "UFC Elo rankings: every fighter rated since 1994 | UFC Embedded",
    description:
      "Chess-style Elo ratings for every UFC fighter from every fight since UFC 1, next to the official rankings, with the year's biggest climbers and drops.",
    image: "og.png",
    text: "Elo ratings for every UFC fighter, replaying every UFC fight since 1994 in order, compared with the official UFC rankings.",
  },
  {
    path: "mma-math",
    title: "MMA math calculator: prove any UFC fighter beats any other | UFC Embedded",
    description: "A beat B, B beat C, C beat A. Find loops of UFC fighters who beat each other, and prove anyone beats anyone with a chain of wins.",
    image: "og-mma-math.png",
    text: "MMA math: loops of UFC fighters who beat each other in a circle, and a calculator that finds a chain of wins from any fighter to any other.",
  },
  {
    path: "about",
    title: "About UFC Embedded: a machine learning project by Anar Abbasli",
    description:
      "How UFC Embedded is built: three decades of UFC fights, a Python pipeline (point-in-time features, style embeddings, Elo, fight models) and the pages that come out.",
    image: "og.png",
    text: "UFC Embedded is a personal machine learning project by Anar Abbasli, built on every UFC fight since 1994: the data, the Python pipeline and the pages.",
  },
  {
    path: "pickem",
    title: "Pick'em: pick the winners of the next UFC card | UFC Embedded",
    description: "Pick the winner and the method of every fight on the next UFC card, then compete with friends in your own league. Free.",
    image: "og-predictor.png",
    text: "UFC Pick'em: pick who wins every fight on the next card, and how, before it locks. Points for every right call, leaderboards and private leagues with friends.",
  },
];

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const html = readFileSync("dist/index.html", "utf8");
const siteUrl = html.match(/<meta property="og:url" content="([^"]*)"/)[1]; // ends with "/"
// GitHub Pages serves each page as a folder and redirects /predictor to /predictor/, so the
// addresses given to search engines end with "/" (no redirect on the way).
const pageUrl = (r) => (r.path ? `${siteUrl}${r.path}/` : siteUrl);
const meta = (attr, key, value) => (page) =>
  page.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${escape(value)}$2`);

// Who made the site, for searches of the author's name: Google reads this schema.org data to
// connect the name (and its spellings) with the site and the GitHub profile.
const AUTHOR = {
  "@type": "Person",
  name: "Anar Abbasli",
  alternateName: ["Anar Abbas", "Anar Abbasly"],
  description: "Student and fight fan; machine learning projects.",
  url: siteUrl,
  sameAs: ["https://github.com/abbasly"],
};
const structuredData = () =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "UFC Embedded",
    url: siteUrl,
    description: ROUTES[0].description,
    author: AUTHOR,
    creator: AUTHOR,
  })}</script>`;

/** What crawlers without JavaScript read: the page's summary and links to every page. */
const noscript = (route) =>
  `<noscript><h1>${escape(route.title)}</h1><p>${escape(route.text)}</p><ul>` +
  ROUTES.map((r) => `<li><a href="${pageUrl(r)}">${escape(r.title)}</a></li>`).join("") +
  `<li><a href="${siteUrl}fighters/">All UFC fighters</a></li><li><a href="${siteUrl}cards/">Upcoming UFC cards and predictions</a></li></ul></noscript>`;

/** This page's own copy of the app's HTML: its title, description, preview and canonical URL. */
function pageHtml({ url, title, description, image }) {
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`);
  for (const edit of [
    meta("name", "description", description),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("property", "og:image", `${siteUrl}${image}`),
  ]) {
    page = edit(page);
  }
  return page.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${url}"`);
}

for (const route of ROUTES) {
  const url = pageUrl(route);
  let page = pageHtml({ url, title: route.title, description: route.description, image: route.image });
  page = page.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscript(route)}`);
  if (!route.path) page = page.replace("</head>", `  ${structuredData()}\n  </head>`);
  const file = route.path ? `dist/${route.path}/index.html` : "dist/index.html";
  if (route.path) mkdirSync(`dist/${route.path}`, { recursive: true });
  writeFileSync(file, page);
  console.log(`page: ${file}`);
}

// A real page for every fighter, upcoming card and upcoming fight, so a search for one of them
// has something to land on. The content sits in the HTML itself; the app takes over once loaded.
const json = (file) => JSON.parse(readFileSync(`public/data/${file}`, "utf8"));
const vite = await createServer({
  configFile: false,
  base: process.env.BASE_PATH || "/",
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { buildPages } = await vite.ssrLoadModule("/src/features/seo/content.ts");
const { SeoArticle } = await vite.ssrLoadModule("/src/features/seo/Articles.tsx");
const pages = [...buildPages({ predictor: json("predictor.json"), mma: json("mma_math.json"), styles: json("style_map.json") }, siteUrl).values()];
await vite.close();

/** Safe inside a <script>: nothing in the data can close the tag. */
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

for (const seo of pages) {
  const { path, title, description, jsonLd: data } = seo.meta;
  const page = pageHtml({ url: `${siteUrl}${path}/`, title, description, image: "og-predictor.png" })
    .replace('<div id="root"></div>', `<div id="root">${renderToStaticMarkup(createElement(SeoArticle, { page: seo }))}</div>`)
    .replace("</head>", `  ${data.map(jsonLd).join("\n    ")}\n  </head>`);
  mkdirSync(`dist/${path}`, { recursive: true });
  writeFileSync(`dist/${path}/index.html`, page);
}
console.log(`${pages.length} fighter, card and fight pages`);

// 404.html (the fallback for every other address) stays a plain copy of the home page.
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...ROUTES.map(pageUrl), ...pages.map((p) => `${siteUrl}${p.meta.path}/`)].map((url) => `  <url><loc>${url}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`,
);
writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`);
console.log("sitemap.xml and robots.txt");
