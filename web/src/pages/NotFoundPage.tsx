// A page that doesn't exist (or isn't yours to see): say so, and offer the ways back in.

import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { accountsEnabled } from "../backend";

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found | UFC Embedded";
  }, []);
  return (
    <Stack align="center" gap="sm" py={80} px="md" ta="center">
      <Text fz={64} fw={900} c="red.5" lh={1}>
        404
      </Text>
      <Title order={2}>That page isn't here</Title>
      <Text c="dimmed" maw={420}>
        Maybe the link is old, or the page moved. One of these is probably what you were after:
      </Text>
      <Group gap="sm" justify="center" mt="xs">
        {accountsEnabled && (
          <Button component={Link} to="/">
            Pick'em
          </Button>
        )}
        <Button component={Link} to="/predictor" variant={accountsEnabled ? "default" : "filled"}>
          Fight predictor
        </Button>
        <Button component={Link} to="/mma-math" variant="default">
          MMA math
        </Button>
        <Button component={Link} to={accountsEnabled ? "/about" : "/"} variant="subtle" color="gray">
          About
        </Button>
      </Group>
    </Stack>
  );
}
