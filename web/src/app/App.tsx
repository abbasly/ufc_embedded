import { Anchor, AppShell, Button, Center, Group, Loader, Text, Title } from "@mantine/core";
import { Suspense, useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { AboutPage } from "../pages/AboutPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { countPage } from "./goatcounter";
import { lazyPage } from "./lazyPage";
import "./NewBadge.css";

// Each product is its own lazily loaded feature, so heavy deps (three.js) only load where used.
const StyleMapPage = lazyPage(() => import("../features/style-map/StyleMapPage"));
const MmaMathPage = lazyPage(() => import("../features/mma-math/MmaMathPage"));
const PredictorPage = lazyPage(() => import("../features/predictor/PredictorPage"));
const LadderPage = lazyPage(() => import("../features/ladder/LadderPage"));

// `short` labels are used on phones so all tabs fit next to the logo; `fresh` tabs get a
// "NEW" tag.
const NAV: { to: string; label: string; short?: string; fresh?: boolean }[] = [
  { to: "/style-map", label: "Style Map", short: "Map" },
  { to: "/predictor", label: "Predictor", short: "Predict" },
  { to: "/ladder", label: "Ladder" },
  { to: "/mma-math", label: "MMA Math", short: "Math", fresh: true },
  { to: "/", label: "About" }, // the landing page
];

// Browser tab titles (also what search results show); keep in sync with scripts/route-previews.mjs.
const TITLES: Record<string, string> = {
  "/": "UFC Embedded by Anar Abbasli: UFC fight predictor, style map and Elo rankings",
  "/style-map": "UFC fighter style map: who fights like who | UFC Embedded",
  "/predictor": "UFC fight predictor: who wins and how | UFC Embedded",
  "/ladder": "UFC Elo rankings: every fighter rated since 1994 | UFC Embedded",
  "/mma-math": "MMA math calculator: prove any UFC fighter beats any other | UFC Embedded",
  "/privacy": "Privacy | UFC Embedded",
};

/** The landing page is About. Style-map links from when the map was the home page
 * (/?fighter=islam-makhachev) still open the map on that fighter. */
function Home() {
  const [params] = useSearchParams();
  return params.has("fighter") ? <Navigate to={`/style-map?${params}`} replace /> : <AboutPage />;
}

export function App() {
  // GitHub Pages serves the pages that have their own link-preview file as a folder, so a
  // refresh lands on "/predictor/": compare without the trailing slash.
  const pathname = useLocation().pathname.replace(/(.)\/$/, "$1");
  useEffect(() => {
    document.title = TITLES[pathname] ?? "UFC Embedded";
  }, [pathname]);
  // Count each page moved to within the app; GoatCounter's script counted the first one.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) firstPage.current = false;
    else countPage(pathname);
  }, [pathname]);

  return (
    <AppShell header={{ height: 56 }} padding={{ base: "xs", sm: "md" }}>
      <AppShell.Header>
        <Group h="100%" px={{ base: "xs", sm: "md" }} justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/" c="inherit" underline="never">
            <Group gap={8} wrap="nowrap">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={26} height={26} />
              {/* On phones the logo alone leaves room for the tabs. */}
              <Title order={4} fz={{ base: "md", sm: "lg" }} visibleFrom="xs" style={{ whiteSpace: "nowrap" }}>
                UFC Embedded
              </Title>
            </Group>
          </Anchor>
          <Group gap={2} wrap="nowrap">
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={Link}
                to={item.to}
                variant={pathname === item.to ? "filled" : "subtle"}
                color={pathname === item.to ? "red" : "gray"}
                size="compact-sm"
                px={{ base: 6, sm: "sm" }}
                style={item.fresh ? { overflow: "visible" } : undefined}
                // Room for the NEW tag, which sticks out past the tab's right edge.
                mr={item.fresh ? { base: 0, xs: 10 } : undefined}
              >
                {item.fresh && (
                  <>
                    <Text span className="nav-new" visibleFrom="xs">
                      NEW
                    </Text>
                    <Text span className="nav-new-dot" hiddenFrom="xs" />
                  </>
                )}
                {item.short ? (
                  <>
                    <Text span inherit visibleFrom="xs">
                      {item.label}
                    </Text>
                    <Text span inherit hiddenFrom="xs">
                      {item.short}
                    </Text>
                  </>
                ) : (
                  item.label
                )}
              </Button>
            ))}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Suspense fallback={<Center h="60vh"><Loader /></Center>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/style-map" element={<StyleMapPage />} />
            <Route path="/mma-math" element={<MmaMathPage />} />
            <Route path="/predictor" element={<PredictorPage />} />
            <Route path="/ladder" element={<LadderPage />} />
            <Route path="/about" element={<Navigate to="/" replace />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Text>Page not found.</Text>} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
