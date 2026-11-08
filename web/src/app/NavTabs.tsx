// The site's tabs: across the header on wider screens, as a bottom tab bar on phones. In both,
// a pill slides to the selected tab (measured from the tabs themselves, so it fits any label).

import "./NavTabs.css";

import { UnstyledButton } from "@mantine/core";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export interface NavItem {
  to: string;
  label: string;
  short?: string; // the bottom bar's label, if shorter
  icon: ReactNode;
  fresh?: boolean; // gets a tag ("NEW", or `tag`)
  tag?: string;
  topOnly?: boolean; // not in the phones' bottom bar, which has no room left
}

interface Props {
  items: NavItem[];
  active: string; // the current path
  placement: "top" | "bottom";
}

export function NavTabs({ items, active, placement }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<string, HTMLElement>());
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // No slide on the first placement, only when moving between tabs.
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = tabs.current.get(active);
    setPill(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
  }, [active]);

  useLayoutEffect(() => {
    measure();
    const id = requestAnimationFrame(() => setReady(true));
    // Labels can change width (fonts loading, the window resizing).
    const observer = new ResizeObserver(measure);
    if (bar.current) observer.observe(bar.current);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <nav ref={bar} className="nav-tabs" data-placement={placement} aria-label="Pages">
      <span
        className="nav-pill"
        data-ready={ready || undefined}
        aria-hidden
        style={pill ? { transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h, opacity: 1 } : { opacity: 0 }}
      />
      {items.filter((item) => placement === "top" || !item.topOnly).map((item) => (
        <UnstyledButton
          key={item.to}
          component={Link}
          to={item.to}
          className="nav-tab"
          data-top-only={item.topOnly || undefined}
          data-active={item.to === active || undefined}
          aria-current={item.to === active ? "page" : undefined}
          ref={(el: HTMLElement | null) => {
            if (el) tabs.current.set(item.to, el);
            else tabs.current.delete(item.to);
          }}
        >
          {placement === "bottom" && (
            <span className="nav-icon">
              {item.icon}
              {item.fresh && <span className="nav-new-dot" />}
            </span>
          )}
          <span className="nav-label">{placement === "bottom" ? (item.short ?? item.label) : item.label}</span>
          {placement === "top" && item.fresh && <span className="nav-new">{item.tag ?? "NEW"}</span>}
        </UnstyledButton>
      ))}
    </nav>
  );
}

// Small line icons for the bottom bar (24px grid, drawn with the text colour).
const svg = (children: ReactNode) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const ICONS = {
  // a scatter of points: the style map
  map: svg(
    <>
      <circle cx="6" cy="16" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="18" cy="14" r="2" />
      <circle cx="9" cy="5" r="1" fill="currentColor" />
      <circle cx="17" cy="6" r="1" fill="currentColor" />
      <circle cx="13" cy="18" r="1" fill="currentColor" />
    </>,
  ),
  // two corners facing off: the predictor
  predictor: svg(
    <>
      <path d="M4 18 10 12 4 6" />
      <path d="M20 6 14 12 20 18" />
    </>,
  ),
  // a ticked card: pick'em
  picks: svg(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 9 2 2 4-4" />
      <path d="M8 16h8" />
    </>,
  ),
  // rising bars: the Elo ladder
  ladder: svg(
    <>
      <path d="M5 20v-6" />
      <path d="M12 20V9" />
      <path d="M19 20V4" />
    </>,
  ),
  // a loop of arrows: MMA math
  math: svg(
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M18 3v4h-4" />
      <path d="M6 21v-4h4" />
    </>,
  ),
  // an "i": about
  about: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </>,
  ),
};
