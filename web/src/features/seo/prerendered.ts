// The static copy of this page that came with the HTML (fighter, card and fight pages), read
// before React empties the root, so it can stay on screen until the data has loaded.

const root = document.getElementById("root");

export const prerendered = root?.querySelector(".seo-article") ? root.innerHTML : "";
export const prerenderedPath = window.location.pathname.slice(1).replace(/\/$/, "").replace(import.meta.env.BASE_URL.slice(1), "");
