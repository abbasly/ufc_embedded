import { Badge, Button, Card, Container, Group, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

const PRODUCTS = [
  {
    title: "Style Map",
    status: "Live",
    to: "/",
    text: "Every active UFC fighter embedded in 3D from their career stats. Similar styles sit close together; click a fighter to see who fights most like them.",
  },
  {
    title: "Fight Predictor",
    status: "Planned",
    text: "Bayesian skill ratings that evolve over time, predicting win probability and method with honest uncertainty, checked against the betting market.",
  },
  {
    title: "Shadowboxing Coach",
    status: "Stretch",
    text: "Webcam pose estimation in the browser that recognises punches and counts combos.",
  },
];

export function AboutPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={1}>Every UFC fighter, mapped by how they fight.</Title>
          <Text size="lg" c="dimmed">
            A personal ML engineering project: fighter statistics turned into interactive, explorable
            models. Fun on the surface, with careful modelling underneath.
          </Text>
          <Group mt="sm">
            <Button component={Link} to="/" size="md">
              Explore the style map
            </Button>
          </Group>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {PRODUCTS.map((p) => (
            <Card key={p.title} withBorder padding="lg">
              <Group justify="space-between" mb="xs">
                <Text fw={600}>{p.title}</Text>
                <Badge variant={p.to ? "filled" : "light"} color={p.to ? "red" : "gray"}>
                  {p.status}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {p.text}
              </Text>
            </Card>
          ))}
        </SimpleGrid>

        <Stack gap="xs">
          <Title order={3}>How the style map works</Title>
          <List spacing="xs">
            <List.Item>Take fighters active in the last 3 years with at least 3 UFC fights.</List.Item>
            <List.Item>
              Use 8 UFCStats career rates: strikes landed/absorbed, accuracy and defence, takedowns,
              takedown accuracy and defence, submission attempts.
            </List.Item>
            <List.Item>Log-transform the skewed rates and standardise everything.</List.Item>
            <List.Item>PCA to 3D for the map, k-means for style groups, nearest neighbours for similar fighters.</List.Item>
          </List>
        </Stack>

        <Stack gap="xs">
          <Title order={3}>Data and caveats</Title>
          <Text size="sm" c="dimmed">
            Fight results from the Ultimate UFC Dataset (Kaggle), fighter stats from a UFCStats snapshot
            (Feb 2024). Career averages hide style changes over time, and fighters with few fights are
            noisy. Next up: my own UFCStats scraper with strike targets and positions.
          </Text>
          <Text size="xs" c="dimmed">
            Champion photos from Wikimedia Commons / Wikipedia under free licences (credited on each
            fighter). Unofficial fan project, not affiliated with the UFC.
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
