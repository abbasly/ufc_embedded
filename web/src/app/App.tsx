import { Anchor, AppShell, Button, Center, Group, Loader, Text, Title } from "@mantine/core";
import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AboutPage } from "../pages/AboutPage";

// Each product is its own lazily loaded feature, so heavy deps (three.js) only load where used.
const StyleMapPage = lazy(() => import("../features/style-map/StyleMapPage"));
const MmaMathPage = lazy(() => import("../features/mma-math/MmaMathPage"));

const NAV = [
  { to: "/", label: "Style Map" },
  { to: "/mma-math", label: "MMA Math" },
  { to: "/about", label: "About" },
];

export function App() {
  const { pathname } = useLocation();

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
              >
                {item.label}
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
            <Route path="/about" element={<AboutPage />} />
            <Route path="/style-map" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Text>Page not found.</Text>} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
