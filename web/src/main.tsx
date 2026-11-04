import "@mantine/core/styles.css";

import { MantineProvider, createTheme } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { reloadForNewCode } from "./app/lazyPage";
import { prefetchFor } from "./data/client";

// Vite's signal that a code file from an older deploy couldn't be loaded: reload to get the
// new version (preventDefault stops Vite from throwing the error).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewCode()) event.preventDefault();
});

const theme = createTheme({ primaryColor: "red", defaultRadius: "md" });
const queryClient = new QueryClient();
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
prefetchFor(queryClient, window.location.pathname.slice(base.length) || "/", window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
