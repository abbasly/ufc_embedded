import { Anchor, AppShell, Badge, Button, Center, Group, Loader, Text, Title } from "@mantine/core";
import { Suspense, lazy, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AboutPage } from "../pages/AboutPage";

// Each product is its own lazily loaded feature, so heavy deps (three.js) only load where used.
const StyleMapPage = lazy(() => import("../features/style-map/StyleMapPage"));
const MmaMathPage = lazy(() => import("../features/mma-math/MmaMathPage"));
const PredictorPage = lazy(() => import("../features/predictor/PredictorPage"));

// `short` labels are used on phones so all tabs fit next to the logo.
const NAV: { to: string; label: string; short?: string; beta?: boolean }[] = [
  { to: "/", label: "Style Map", short: "Map" },
  { to: "/mma-math", label: "MMA Math", short: "Math" },
  { to: "/predictor", label: "Predictor", beta: true },
  { to: "/about", label: "About" },
];

// Browser tab titles; keep in sync with scripts/route-previews.mjs.
const TITLES: Record<string, string> = {
  "/mma-math": "UFC Embedded: MMA math",
  "/predictor": "UFC Embedded: fight predictor",
  "/about": "UFC Embedded: about",
};

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname.replace(/\/$/, "")] ?? "UFC Embedded";
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
                rightSection={
                  item.beta && (
                    <Badge size="xs" variant={pathname === item.to ? "white" : "light"} color="red" px={4}>
                      Beta
                    </Badge>
                  )
                }
              >
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
            <Route path="/" element={<StyleMapPage />} />
            <Route path="/mma-math" element={<MmaMathPage />} />
            <Route path="/predictor" element={<PredictorPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/style-map" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Text>Page not found.</Text>} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
