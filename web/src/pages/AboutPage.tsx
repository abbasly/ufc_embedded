import { Anchor, Badge, Button, Card, Container, Group, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

interface Product {
  title: string;
  status: string;
  to?: string; // live features link to their page
  text: string;
}

const PRODUCTS: Product[] = [
  {
    title: "Style Map",
    status: "Live",
    to: "/",
    text: "Every active UFC fighter placed in 3D by how they fight. Similar styles sit close together; click a fighter for their record, stats and closest look-alikes.",
  },
  {
    title: "MMA Math",
    status: "Live",
    to: "/mma-math",
    text: 'Loops of fighters who beat each other in a circle, plus a calculator that "proves" anyone beats anyone.',
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

function ProductCard({ p }: { p: Product }) {
  const body = (
    <>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{p.title}</Text>
        <Badge variant={p.to ? "filled" : "light"} color={p.to ? "red" : "gray"}>
          {p.status}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        {p.text}
      </Text>
    </>
  );
  // Live features: the whole card is a link to the page.
  return p.to ? (
    <Card withBorder padding="lg" component={Link} to={p.to}>
      {body}
      <Text size="sm" c="red" mt="sm" fw={500}>
        Open {p.title} →
      </Text>
    </Card>
  ) : (
    <Card withBorder padding="lg" style={{ opacity: 0.75 }}>
      {body}
    </Card>
  );
}

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
            <Button component={Link} to="/mma-math" size="md" variant="light">
              Try MMA math
            </Button>
          </Group>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {PRODUCTS.map((p) => (
            <ProductCard key={p.title} p={p} />
          ))}
        </SimpleGrid>

        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={3}>How the style map works</Title>
            <Anchor component={Link} to="/" size="sm">
              Open the style map →
            </Anchor>
          </Group>
          <List spacing="xs">
            <List.Item>
              Take the ~700 fighters active in the last 3 years with at least 3 UFC fights.
            </List.Item>
            <List.Item>
              Use 8 UFCStats career rates: strikes landed/absorbed, accuracy and defence, takedowns,
              takedown accuracy and defence, submission attempts.
            </List.Item>
            <List.Item>
              Shrink noisy stats toward the average for fighters with little cage time (a 100%
              takedown accuracy from one attempt shouldn't count), then standardise.
            </List.Item>
            <List.Item>
              Two layouts: readable Grappling / Striking / Defence axes, and a t-SNE similarity view
              that keeps look-alikes together (about half of each fighter's 10 closest matches stay
              nearby in 3D).
            </List.Item>
            <List.Item>
              K-means for style groups; "most similar fighters" are nearest neighbours in the full
              8-stat space, not on the map.
            </List.Item>
          </List>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={3}>How MMA math works</Title>
            <Anchor component={Link} to="/mma-math" size="sm">
              Open MMA math →
            </Anchor>
          </Group>
          <List spacing="xs">
            <List.Item>Every decisive UFC fight since 1994 becomes an arrow from winner to loser.</List.Item>
            <List.Item>
              Loops of 3 to 5 fighters are ranked by how well known the least known fighter is.
            </List.Item>
            <List.Item>
              The calculator finds the shortest chain of wins between any two fighters, in both
              directions. Over 1,200 fighters sit in one giant loop, so within it anyone "beats"
              anyone.
            </List.Item>
          </List>
        </Stack>

        <Stack gap="xs">
          <Title order={3}>Data and caveats</Title>
          <Text size="sm" c="dimmed">
            Fights, pro records (W-L-D) and career stats from UFCStats, plus official rankings and
            betting odds, via regularly updated Kaggle datasets. Career averages hide style changes
            over time, and fighters with few fights are noisy. Next up: per-round stats (strike
            targets and positions) for a richer map.
          </Text>
          <Text size="xs" c="dimmed">
            Fighter photos from Wikimedia Commons / Wikipedia under free licences (credited on each
            fighter). Unofficial fan project, not affiliated with the UFC.
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
