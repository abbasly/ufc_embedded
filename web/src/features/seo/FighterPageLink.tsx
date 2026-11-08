// A link from anywhere on the site to a fighter's own page. Only recently active fighters have
// one, so it asks the predictor's data first and shows nothing for the rest.

import { Anchor, type AnchorProps, Button, type ButtonProps } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { usePredictor } from "../../data/client";

function useFighterPage(id: string): string | null {
  const { data } = usePredictor();
  return data?.fighters.some((f) => f.id === id) ? `/fighters/${id}/` : null;
}

export function FighterPageButton({ id, children, ...props }: ButtonProps & { id: string; children: ReactNode }) {
  const to = useFighterPage(id);
  return to ? (
    <Button component={Link} to={to} variant="default" {...props}>
      {children}
    </Button>
  ) : null;
}

export function FighterPageLink({ id, children, ...props }: AnchorProps & { id: string; children: ReactNode }) {
  const to = useFighterPage(id);
  return to ? (
    <Anchor component={Link} to={to} {...props}>
      {children}
    </Anchor>
  ) : null;
}
