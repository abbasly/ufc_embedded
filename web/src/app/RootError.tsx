// The last line of defence: if the app crashes while drawing, show a way out instead of a blank
// page. A crash from code that couldn't be loaded (an older deploy's page) reloads by itself.

import { Button, Paper, Stack, Text, Title } from "@mantine/core";
import type { FallbackProps } from "react-error-boundary";

import { reloadForNewCode } from "./lazyPage";

const MISSING_CODE = /dynamically imported module|module script failed|Loading chunk|Failed to fetch/i;

export function RootError({ error }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  if (MISSING_CODE.test(message) && reloadForNewCode()) return null; // reloading
  return (
    <Paper maw={420} mx="auto" mt={80} p="xl" radius="md">
      <Stack gap="sm" align="flex-start">
        <Title order={3}>Something went wrong</Title>
        <Text size="sm" c="dimmed">
          The page couldn't be drawn. Reloading usually fixes it; if it keeps happening, please tell us.
        </Text>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </Stack>
    </Paper>
  );
}
