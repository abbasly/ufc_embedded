import { Anchor, Card, Container, Group, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

interface Product {
  title: string;
  to: string;
  text: string;
}

// Same order as the navigation bar.
const PRODUCTS: Product[] = [
  {
    title: "Style Map",
    to: "/",
    text: "Every active UFC fighter placed in 3D by how they fight. Similar styles sit close together; click a fighter for their card, stats and closest look-alikes.",
  },
  {
    title: "Fight Predictor",
    to: "/predictor",
    text: "Pick any two fighters: win probability, how it ends (KO, submission, decision), a tale of the tape and their shared history.",
  },
  {
    title: "Elo Ladder",
    to: "/ladder",
    text: "Every fighter rated chess-style from every UFC fight since 1994, next to their official rank, with the year's biggest climbers and drops.",
  },
  {
    title: "MMA Math",
    to: "/mma-math",
    text: 'Loops of fighters who beat each other in a circle, plus a calculator that "proves" anyone beats anyone.',
  },
];

/** The whole card links to the feature's page. */
function ProductCard({ p }: { p: Product }) {
  return (
    <Card withBorder padding="lg" component={Link} to={p.to}>
      <Text fw={600} mb="xs">
        {p.title}
      </Text>
      <Text size="sm" c="dimmed">
        {p.text}
      </Text>
      <Text size="sm" c="red" mt="sm" fw={500}>
        Open {p.title} →
      </Text>
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
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
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
            <Title order={3}>How the predictor works</Title>
            <Anchor component={Link} to="/predictor" size="sm">
              Open the predictor →
            </Anchor>
          </Group>
          <List spacing="xs">
            <List.Item>
              Every feature is rebuilt from fights <i>before</i> the one being predicted, so the model
              never sees the result it's predicting (a test checks this).
            </List.Item>
            <List.Item>
              Per fighter: career stats, recent form (the last few fights count most), age, reach,
              experience, a Glicko rating that knows how sure it is, and the strength of past
              opponents.
            </List.Item>
            <List.Item>
              A logistic regression on the differences between the two fighters gives the win
              chance; a second model gives KO / submission / decision given who wins. Gradient
              boosting was tried and did worse.
            </List.Item>
            <List.Item>
              Trained on fights up to 2023 and checked year by year: it picks about 62–65% of
              winners, against about 66–69% for the betting market, which knows about injuries,
              camps and short notice.
            </List.Item>
          </List>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={3}>How the Elo ladder works</Title>
            <Anchor component={Link} to="/ladder" size="sm">
              Open the ladder →
            </Anchor>
          </Group>
          <List spacing="xs">
            <List.Item>Everyone starts at 1500 and every UFC fight since 1994 is replayed in order.</List.Item>
            <List.Item>
              The winner takes points from the loser; beating someone rated higher moves more points
              than an expected win. How fast ratings move is tuned on past results.
            </List.Item>
            <List.Item>
              One ladder across all divisions, next to the official UFC ranking, with the biggest
              climbers and drops over the last 12 months.
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
              The calculator finds the shortest chain of wins from one fighter to another and draws it
              as a circle (swap them to prove the opposite). Over 1,200 fighters sit in one giant loop, so within it anyone "beats"
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
            fighter). Unofficial fan project, not affiliated with the UFC.{" "}
            <Anchor component={Link} to="/privacy" size="xs">
              Privacy
            </Anchor>
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
