// Per-page HTML for link previews and search engines. Crawlers (WhatsApp, Slack, LinkedIn,
// and search engines that don't run JavaScript) would see the same index.html for every route
// of this single-page app. After `vite build`, write each page's own copy: the same app, with
// that page's title, description, preview image, canonical URL and a plain-text summary
// (<noscript>). Also writes sitemap.xml and robots.txt for search engines.
// GitHub Pages then also serves these routes with 200 instead of the 404.html fallback.
// Keep titles in sync with TITLES in src/app/App.tsx.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
  `</ul></noscript>`;

for (const route of ROUTES) {
  const url = pageUrl(route);
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(route.title)}</title>`);
  for (const edit of [
    meta("name", "description", route.description),
    meta("property", "og:title", route.title),
    meta("property", "og:description", route.description),
    meta("property", "og:url", url),
    meta("property", "og:image", `${siteUrl}${route.image}`),
  ]) {
    page = edit(page);
  }
  page = page.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${url}"`);
  page = page.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscript(route)}`);
  if (!route.path) page = page.replace("</head>", `  ${structuredData()}\n  </head>`);
  const file = route.path ? `dist/${route.path}/index.html` : "dist/index.html";
  if (route.path) mkdirSync(`dist/${route.path}`, { recursive: true });
  writeFileSync(file, page);
  console.log(`page: ${file}`);
}

// 404.html (the fallback for every other address) stays a plain copy of the home page.
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ROUTES.map((r) => `  <url><loc>${pageUrl(r)}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`,
);
writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`);
console.log("sitemap.xml and robots.txt");
