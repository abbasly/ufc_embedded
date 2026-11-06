// "Install app": the site as an app on the phone's home screen (or the computer's dock), from the
// manifest in public/. Chrome and Edge (Android, desktop) offer an install prompt the page can
// open; iPhones and iPads can't be prompted, nor can other Android browsers, so they get the two
// steps to do it by hand. Hidden
// once installed (the app runs "standalone") and where installing isn't possible.

import { Button, CloseButton, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser announces it can install once per page load, maybe before React has mounted:
// keep the event here so any component can use it.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // our own button, not the browser's mini-bar
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const installed = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/** Whether this browser can install the site, and the action that does it (or explains how). */
export function useInstall() {
  const [, rerender] = useState(0);
  const [howTo, setHowTo] = useState(false);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  // Android without the prompt (Firefox, Samsung Internet, or Chrome before it offers one): the
  // browser menu does it by hand, so the guide covers that too.
  const can = !installed() && (!!deferred || isIos() || isAndroid());
  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    } else if (isIos() || isAndroid()) {
      setHowTo(true);
    }
  };
  const guide = (
    <Modal opened={howTo} onClose={() => setHowTo(false)} title="Add UFC Embedded to your home screen" centered size="sm">
      <Stack gap="sm">
        {isAndroid() ? (
          <>
            <Text size="sm">
              1. Tap the browser's menu: <b>⋮</b> at the top right (Chrome), or <b>≡</b> at the bottom (Samsung Internet,
              Firefox).
            </Text>
            <Text size="sm">
              2. Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b> / <b>Add</b>.
            </Text>
          </>
        ) : (
          <>
            <Text size="sm">
              1. Tap the <b>share</b> icon <ShareGlyph /> (in Safari's bar at the bottom, or under <b>⋯</b>).
            </Text>
            <Text size="sm">
              2. Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </Text>
          </>
        )}
        <Text size="xs" c="dimmed">
          It opens full screen, like an app, straight to Pick'em.
        </Text>
        <Text size="xs" c="dimmed">
          Psst: App Store and Google Play versions are on the way. 👀
        </Text>
        <Button onClick={() => setHowTo(false)}>Got it</Button>
      </Stack>
    </Modal>
  );
  return { can, install, guide };
}

function ShareGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2 }} aria-label="share">
      <path d="M12 3v12" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

const DISMISSED = "install-bar-dismissed";

/** A small bar on phones offering the app, until it's installed or waved away. */
export function InstallBar() {
  const { can, install, guide } = useInstall();
  const [gone, setGone] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  if (!can || gone) return guide;
  const dismiss = () => {
    setGone(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // private window: it just comes back next time
    }
  };
  return (
    <>
      <Paper p="sm" radius="md" className="pickem-board" hiddenFrom="md">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">
            <b>Get the app:</b> Pick'em one tap from your home screen.
          </Text>
          <Group gap={4} wrap="nowrap">
            <Button size="xs" onClick={install}>
              Install
            </Button>
            <CloseButton size="sm" onClick={dismiss} aria-label="Not now" />
          </Group>
        </Group>
      </Paper>
      {guide}
    </>
  );
}
