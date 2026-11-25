import "@mantine/core/styles.css";
// The paper the pages are printed on, and the site's type (bundled, not loaded from Google).
import "./app/paper.css";
import "./app/console.css";

import { MantineProvider, createTheme } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { AuthProvider } from "./auth/AuthProvider";
import { reloadForNewCode } from "./app/lazyPage";
import { RootError } from "./app/RootError";
import { prefetchFor } from "./data/client";
// Listen for "this site can be installed" from the first moment (see app/install.tsx).
import "./app/install";
// Reads a page's static HTML before React replaces it (see features/seo/SeoPage.tsx).
import "./features/seo/prerendered";

// Vite's signal that a code file from an older deploy couldn't be loaded: reload to get the
// new version (preventDefault stops Vite from throwing the error).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewCode()) event.preventDefault();
});

const FONT = '"Libre Franklin Variable", "Libre Franklin", system-ui, -apple-system, "Segoe UI", sans-serif';
const theme = createTheme({
  primaryColor: "red",
  defaultRadius: "sm",
  // Small corners on boxes (round things like avatars ask for "xl" and stay round).
  radius: { xs: "2px", sm: "3px", md: "5px", lg: "6px", xl: "32px" },
  fontFamily: FONT,
  headings: { fontFamily: FONT, fontWeight: "800" },
});
const queryClient = new QueryClient();
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
prefetchFor(queryClient, window.location.pathname.slice(base.length) || "/", window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <ErrorBoundary FallbackComponent={RootError}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
