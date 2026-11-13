import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Google AdSense, switched by one env var (the ADSENSE_CLIENT repo variable in CI): when it's
 * set, every page gets the AdSense script in <head> and the site gets an ads.txt; when it's
 * empty, there's no Google code at all. The script goes into the HTML itself (not added from
 * JS) because AdSense's site check reads the page source.
 */
function adsense(client: string | undefined): Plugin {
  return {
    name: "adsense",
    transformIndexHtml() {
      if (!client) return [];
      return [
        {
          tag: "script",
          attrs: {
            async: true,
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`,
            crossorigin: "anonymous",
          },
          injectTo: "head",
        },
      ];
    },
    generateBundle() {
      if (!client) return;
      // ads.txt: Google's public certification id, the same for every AdSense publisher.
      const publisher = client.replace(/^ca-/, "");
      this.emitFile({
        type: "asset",
        fileName: "ads.txt",
        source: `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`,
      });
    },
  };
}

/**
 * Cloudflare Web Analytics, switched by one env var (the CF_ANALYTICS_TOKEN repo variable in CI):
 * a cookie-free visitor counter (page views, countries, referrers). It follows the app's route
 * changes on its own. Empty: no beacon at all.
 */
function cloudflareAnalytics(token: string | undefined): Plugin {
  return {
    name: "cloudflare-analytics",
    transformIndexHtml() {
      if (!token) return [];
      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://static.cloudflareinsights.com/beacon.min.js",
            "data-cf-beacon": JSON.stringify({ token }),
          },
          injectTo: "body",
        },
      ];
    },
  };
}

/**
 * GoatCounter, switched by one env var (the GOATCOUNTER_CODE repo variable in CI: the "code"
 * part of https://<code>.goatcounter.com): a cookie-free visit counter, for the GoatCounter
 * dashboard (the site's own visit count comes from Cloudflare, see src/app/visits.ts).
 * The script counts the first page; the app counts the rest (App.tsx).
 */
function goatcounter(code: string | undefined): Plugin {
  return {
    name: "goatcounter",
    transformIndexHtml() {
      if (!code) return [];
      return [
        {
          // Record "/predictor/" (how GitHub Pages serves a page on reload) as "/predictor", like
          // the app does, so each page has one count. Must be set before count.js loads.
          tag: "script",
          // The beta site (beta.*) counts under /beta/..., so one dashboard keeps the two apart.
          children: `window.goatcounter = { path: function (p) { return (location.hostname.indexOf("beta.") === 0 ? "/beta" : "") + p.replace(/(.)\\/$/, "$1"); } };`,
          injectTo: "body",
        },
        {
          tag: "script",
          attrs: { "data-goatcounter": `https://${code}.goatcounter.com/count`, async: true, src: "https://gc.zgo.at/count.js" },
          injectTo: "body",
        },
      ];
    },
  };
}

/**
 * Fighter Lab is the landing page, and its code (three.js above all) is loaded lazily, so it
 * would only start downloading once the main script has arrived and run. For a visit that lands
 * on it, a few lines at the top of <head> start those downloads straight away, in parallel with
 * the main script. Other pages (and Pick'em invite links to "/") don't download them.
 */
function preloadLanding(base: string): Plugin {
  return {
    name: "preload-landing",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === "chunk");
        const page = chunks.find((c) => c.facadeModuleId?.endsWith("/features/style-map/StyleMapPage.tsx"));
        if (!page) return [];
        // The page's chunk and everything it imports, except what the entry loads anyway.
        const entry = new Set(chunks.filter((c) => c.isEntry).flatMap((c) => [c.fileName, ...c.imports]));
        const files = new Set<string>();
        const visit = (file: string) => {
          if (files.has(file) || entry.has(file)) return;
          files.add(file);
          chunks.find((c) => c.fileName === file)?.imports.forEach(visit);
        };
        visit(page.fileName);
        const landing = `^${base.replace(/[/.]/g, "\\$&")}(fighter-lab|style-map)?/?$`;
        return [
          {
            tag: "script",
            children:
              `if (new RegExp(${JSON.stringify(landing)}).test(location.pathname) && !/[?&](event|join|league)=/.test(location.search))` +
              ` ${JSON.stringify([...files].map((f) => base + f))}.forEach(function (href) {` +
              ` var l = document.createElement("link"); l.rel = "modulepreload"; l.href = href; document.head.appendChild(l); });`,
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

const base = process.env.BASE_PATH ?? "/";

// BASE_PATH lets the same build live at "/" locally and at "/<repo>/" on GitHub Pages.
export default defineConfig({
  base,
  plugins: [
    react(),
    adsense(process.env.VITE_ADSENSE_CLIENT),
    cloudflareAnalytics(process.env.VITE_CF_ANALYTICS_TOKEN),
    goatcounter(process.env.VITE_GOATCOUNTER),
    preloadLanding(base),
  ],
  build: { chunkSizeWarningLimit: 6000 }, // three.js is big but lazy-loaded with Fighter Lab
});
