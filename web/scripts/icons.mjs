// Renders the app icons from the SVGs scripts/logo.py writes (needs Chrome, and puppeteer-core
// installed somewhere on the path). Run after logo.py:  node scripts/icons.mjs
import { readFileSync, unlinkSync } from "node:fs";
import puppeteer from "puppeteer-core";

const pub = new URL("../public/", import.meta.url);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
for (const [source, out, size] of [
  ["icon-source.svg", "apple-touch-icon.png", 180],
  ["icon-source.svg", "icon-192.png", 192],
  ["icon-source.svg", "icon-512.png", 512],
  ["icon-maskable-source.svg", "icon-maskable-512.png", 512],
]) {
  await page.setViewport({ width: size, height: size });
  const svg = readFileSync(new URL(source, pub), "utf8");
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(out, pub).pathname, omitBackground: false });
  console.log(out);
}
await browser.close();
for (const s of ["icon-source.svg", "icon-maskable-source.svg"]) unlinkSync(new URL(s, pub));
