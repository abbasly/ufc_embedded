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
 * part of https://<code>.goatcounter.com): a cookie-free visit counter whose total can be shown
 * publicly on the site. The script counts the first page; the app counts the rest (App.tsx).
 */
function goatcounter(code: string | undefined): Plugin {
  return {
    name: "goatcounter",
    transformIndexHtml() {
      if (!code) return [];
      return [
        {
          tag: "script",
          attrs: { "data-goatcounter": `https://${code}.goatcounter.com/count`, async: true, src: "https://gc.zgo.at/count.js" },
          injectTo: "body",
        },
      ];
    },
  };
}

// BASE_PATH lets the same build live at "/" locally and at "/<repo>/" on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    react(),
    adsense(process.env.VITE_ADSENSE_CLIENT),
    cloudflareAnalytics(process.env.VITE_CF_ANALYTICS_TOKEN),
    goatcounter(process.env.VITE_GOATCOUNTER),
  ],
  build: { chunkSizeWarningLimit: 6000 }, // Plotly is big but lazy-loaded on the style map only
});
