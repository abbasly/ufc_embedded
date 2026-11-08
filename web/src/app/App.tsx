import { Anchor, AppShell, Center, Group, Loader, Title } from "@mantine/core";
import { Suspense, useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { accountsEnabled } from "../backend";
import { ArenaBackdrop } from "../components/ArenaBackdrop";
import { AboutPage } from "../pages/AboutPage";
import { ImpressumPage } from "../pages/ImpressumPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { countPage } from "./goatcounter";
import { lazyPage } from "./lazyPage";
import { ICONS, type NavItem, NavTabs } from "./NavTabs";
import "./NewBadge.css";
// With the app's first styles: the fighter and card pages are readable before any code has run.
import "../features/seo/seo.css";

// The account corner (sign-in window, user menu) loads only when accounts are on, so a build
// without them carries none of its code.
const UserMenu = accountsEnabled ? lazyPage(() => import("../auth/UserMenu").then((m) => ({ default: m.UserMenu }))) : null;

// Each product is its own lazily loaded feature, so heavy deps (three.js) only load where used.
const StyleMapPage = lazyPage(() => import("../features/style-map/StyleMapPage"));
const MmaMathPage = lazyPage(() => import("../features/mma-math/MmaMathPage"));
const PredictorPage = lazyPage(() => import("../features/predictor/PredictorPage"));
const LadderPage = lazyPage(() => import("../features/ladder/LadderPage"));
const PickemPage = lazyPage(() => import("../features/pickem/PickemPage"));
const ProfilePage = lazyPage(() => import("../features/profile/ProfilePage"));
const PlayerPage = lazyPage(() => import("../features/profile/PlayerPage"));
const AdminPage = lazyPage(() => import("../features/admin/AdminPage"));
const SeoPage = lazyPage(() => import("../features/seo/SeoPage"));

// The landing page: Pick'em where accounts are on, else About (also at /about either way).
const HOME = accountsEnabled ? "pickem" : "about";

// The tabs: across the header on wider screens, a bottom tab bar on phones (with the `short`
// labels). `fresh` tabs get a tag ("NEW", or `tag`). Pick'em (first: it's the landing page)
// only where accounts are on.
const NAV: NavItem[] = [
  ...(accountsEnabled ? [{ to: "/", label: "Pick'em", short: "Picks", icon: ICONS.picks }] : []),
  { to: "/predictor", label: "Predictor", short: "Predict", icon: ICONS.predictor },
  { to: "/mma-math", label: "MMA Math", short: "Math", icon: ICONS.math, fresh: !accountsEnabled },
  { to: "/style-map", label: "Style Map", short: "Map", icon: ICONS.map },
  { to: "/ladder", label: "Ladder", icon: ICONS.ladder },
  { to: HOME === "about" ? "/" : "/about", label: "About", icon: ICONS.about },
];

const GLASS = {
  background: "rgba(14, 15, 18, 0.72)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

// Browser tab titles (also what search results show); keep in sync with scripts/route-previews.mjs.
const TITLES: Record<string, string> = {
  "/": "UFC Embedded by Anar Abbasli: UFC fight predictor, style map and Elo rankings",
  "/style-map": "UFC fighter style map: who fights like who | UFC Embedded",
  "/predictor": "UFC fight predictor: who wins and how | UFC Embedded",
  "/ladder": "UFC Elo rankings: every fighter rated since 1994 | UFC Embedded",
  "/mma-math": "MMA math calculator: prove any UFC fighter beats any other | UFC Embedded",
  "/about": "About UFC Embedded: a machine learning project by Anar Abbasli",
  "/privacy": "Privacy | UFC Embedded",
  "/impressum": "Impressum | UFC Embedded",
  "/pickem": "Pick'em: pick the winners of the next UFC card | UFC Embedded",
  "/me": "Your profile | UFC Embedded",
};

/** The landing page (Pick'em, or About without accounts). Style-map links from when the map
 * was the home page (/?fighter=islam-makhachev) still open the map on that fighter. */
function Home() {
  const [params] = useSearchParams();
  if (params.has("fighter")) return <Navigate to={`/style-map?${params}`} replace />;
  return HOME === "pickem" ? <PickemPage /> : <AboutPage />;
}

/** /pickem (invite links: /pickem?join=CODE) is the home page now; keep the query. */
function ToHome() {
  return <Navigate to={{ pathname: "/", search: useLocation().search }} replace />;
}

export function App() {
  // GitHub Pages serves the pages that have their own link-preview file as a folder, so a
  // refresh lands on "/predictor/": compare without the trailing slash.
  const pathname = useLocation().pathname.replace(/(.)\/$/, "$1");
  useEffect(() => {
    // Pages not listed (player pages, admin, not found) set their own title.
    if (TITLES[pathname]) document.title = TITLES[pathname];
  }, [pathname]);
  // Count each page moved to within the app; GoatCounter's script counted the first one.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) firstPage.current = false;
    else countPage(pathname);
  }, [pathname]);

  return (
    // The bottom tab bar only on phones (below "sm"): its height is 0 from there up.
    <AppShell header={{ height: 56 }} footer={{ height: { base: "calc(62px + env(safe-area-inset-bottom, 0px))", sm: 0 } }} padding={{ base: "xs", sm: "md" }}>
      {/* The spotlit arena behind every page; the predictor also gets the cage fence. */}
      <ArenaBackdrop fence={pathname === "/predictor"} />
      {/* Dark glass rather than flat grey, so the arena's colours show through the menu. */}
      <AppShell.Header style={{ ...GLASS, borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
        <Group h="100%" px={{ base: "sm", sm: "md" }} justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/" c="inherit" underline="never">
            <Group gap={8} wrap="nowrap">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={26} height={26} />
              <Title order={4} fz={{ base: "md", sm: "lg" }} style={{ whiteSpace: "nowrap" }}>
                UFC Embedded
              </Title>
            </Group>
          </Anchor>
          <Group gap="xs" wrap="nowrap">
            <Group visibleFrom="sm" gap={0}>
              <NavTabs items={NAV} active={pathname} placement="top" />
            </Group>
            {/* Sign in / account menu: only when accounts are on (src/backend). */}
            {UserMenu && (
              <Group gap={0}>
                <Suspense fallback={null}>
                  <UserMenu />
                </Suspense>
              </Group>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Footer hiddenFrom="sm" style={{ ...GLASS, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <NavTabs items={NAV} active={pathname} placement="bottom" />
      </AppShell.Footer>

      <AppShell.Main>
        <Suspense fallback={<Center h="60vh"><Loader /></Center>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/style-map" element={<StyleMapPage />} />
            <Route path="/mma-math" element={<MmaMathPage />} />
            <Route path="/predictor" element={<PredictorPage />} />
            <Route path="/ladder" element={<LadderPage />} />
            {accountsEnabled && <Route path="/pickem" element={<ToHome />} />}
            {accountsEnabled && <Route path="/me" element={<ProfilePage />} />}
            {accountsEnabled && <Route path="/u/:name" element={<PlayerPage />} />}
            {accountsEnabled && <Route path="/admin" element={<AdminPage />} />}
            <Route path="/fighters/*" element={<SeoPage />} />
            <Route path="/cards/*" element={<SeoPage />} />
            <Route path="/fights/*" element={<SeoPage />} />
            <Route path="/about" element={HOME === "about" ? <Navigate to="/" replace /> : <AboutPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/impressum" element={<ImpressumPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
