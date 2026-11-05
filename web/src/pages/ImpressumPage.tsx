import { Anchor, Container, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

import { OPERATOR } from "./legal";

/** Impressum (legal notice, § 5 DDG): who runs the site and how to reach them. */
export function ImpressumPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Impressum</Title>
        {OPERATOR ? (
          <>
            <div>
              <Text fw={600}>{OPERATOR.name}</Text>
              {OPERATOR.address.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </div>
            <Text>
              Email: <Anchor href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</Anchor>
            </Text>
            <Text size="sm" c="dimmed">
              Responsible for the content under § 18 (2) MStV: {OPERATOR.name}, address as above.
            </Text>
          </>
        ) : (
          <Text c="dimmed">The legal notice is being set up.</Text>
        )}
        <Text size="sm" c="dimmed">
          UFC Embedded is a personal, non-commercial fan project, not affiliated with, endorsed or sponsored by the UFC,
          Zuffa or TKO Group. See also the <Anchor component={Link} to="/privacy">privacy policy</Anchor>.
        </Text>
      </Stack>
    </Container>
  );
}
