import { Anchor, AppShell, Center, Group, Loader, NavLink, Text, Title } from "@mantine/core";
import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AboutPage } from "../pages/AboutPage";

// Each product is its own lazily loaded feature, so heavy deps (Plotly) only load where used.
const StyleMapPage = lazy(() => import("../features/style-map/StyleMapPage"));

const NAV = [
  { to: "/", label: "Style Map" },
  { to: "/about", label: "About" },
];

export function App() {
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Anchor component={Link} to="/" c="inherit" underline="never">
            <Title order={4}>UFC Embedded</Title>
          </Anchor>
          <Group gap={4}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={item.label}
                active={pathname === item.to}
                w="auto"
              />
            ))}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Suspense fallback={<Center h="60vh"><Loader /></Center>}>
          <Routes>
            <Route path="/" element={<StyleMapPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/style-map" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Text>Page not found.</Text>} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
