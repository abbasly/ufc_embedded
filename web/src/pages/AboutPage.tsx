import "./About.css";

import { Anchor, Container, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { Fragment } from "react";
import { Link } from "react-router-dom";

const REPO = "https://github.com/abbasly/ufc_embedded";

interface FlowItem {
  title: string;
  text: string;
  to?: string;
}

// How the site fits together: where the data comes from, what the Python side does with it,
// and the pages that come out.
const FLOW: { label: string; core?: boolean; items: FlowItem[] }[] = [
  {
    label: "Data",
    items: [
      { title: "UFCStats", text: "Every UFC fight since 1994, round by round" },
      { title: "Betting odds", text: "Bookmakers' lines, past fights and upcoming cards" },
      { title: "Official rankings", text: "Champions and the top 15 per division" },
      { title: "Wikipedia", text: "Fighter photos and scheduled events" },
    ],
  },
  {
    label: "Python pipeline",
    core: true,
    items: [
      { title: "Point-in-time features", text: "Built only from fights before the one in question" },
      { title: "Style embedding", text: "14 stats per fighter, shrunk and stability-weighted" },
      { title: "Ratings", text: "Elo and Glicko, replayed fight by fight" },
      { title: "Fight models", text: "Logistic regressions for the winner and the method" },
      { title: "Win graph", text: "Who beat whom, for loops and chains" },
    ],
  },
  {
    label: "On the site",
    // Same order as the navigation bar.
    items: [
      { title: "Style Map", text: "Fighters in 3D by how they fight, with look-alikes", to: "/" },
      { title: "Fight Predictor", text: "Win chance and how it ends, for any matchup", to: "/predictor" },
      { title: "Elo Ladder", text: "Chess-style ratings next to the official ranks", to: "/ladder" },
      { title: "MMA Math", text: "Proof that anyone beats anyone, in circles", to: "/mma-math" },
    ],
  },
];

const STATS = [
  { value: "~9,000", label: "UFC fights" },
  { value: "2,700+", label: "fighters" },
  { value: "790+", label: "events" },
  { value: "1994", label: "back to UFC 1" },
];

/** Data -> pipeline -> pages, in three columns joined by rails (stacked on phones). */
function HowItFits() {
  return (
    <div className="flow" role="list" aria-label="How the site is built">
      {FLOW.map((col, i) => (
        <Fragment key={col.label}>
          {i > 0 && <div className="flow-rail" aria-hidden />}
          <div className={`flow-col${col.core ? " flow-core" : ""}`} role="listitem">
            <div className="flow-label">{col.label}</div>
            {col.items.map((item) =>
              item.to ? (
                <Link key={item.title} to={item.to} className="flow-item">
                  <b>{item.title}</b>
                  <span>{item.text}</span>
                </Link>
              ) : (
                <div key={item.title} className="flow-item">
                  <b>{item.title}</b>
                  <span>{item.text}</span>
                </div>
              ),
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** GitHub's mark (Octicons "mark-github"). */
function GitHubMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function AboutPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={1}>Every UFC fighter, mapped by how they fight.</Title>
          <Text size="lg" c="dimmed">
            A personal machine learning project: two decades of fight statistics turned into
            interactive, explorable models. Fun on the surface, careful modelling underneath.
          </Text>
        </Stack>

        <Stack gap="lg">
          <HowItFits />
          <div className="about-stats">
            {STATS.map((s) => (
              <div key={s.label}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </Stack>


        <Divider />

        <Stack gap="sm">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.12em" }}>
            Made by
          </Text>
          <Title order={2}>Anar Abbasli</Title>
          <Text>
            Full-time student, part-time fight fan. I built this to take machine learning all the
            way from raw data to something people can actually use, on a sport I'd be watching
            anyway.
          </Text>
          <Text size="sm" c="dimmed">
            Python, pandas, scikit-learn and Weights &amp; Biases on the modelling side; React,
            three.js and Rapier physics in the browser. All the code, and how each model works, is
            on GitHub:
          </Text>
          <Group>
            <a className="github-button" href={REPO} target="_blank" rel="noreferrer">
              <GitHubMark />
              abbasly/ufc_embedded <small>on GitHub</small>
            </a>
          </Group>
        </Stack>

        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Not an official UFC product.
          </Text>
          <Text size="xs" c="dimmed">
            UFC Embedded is an independent fan project. It is not affiliated with, endorsed or
            sponsored by the UFC, Zuffa or TKO Group; UFC and related marks belong to their owners.
            Predictions are for fun, not betting advice. Fighter photos from Wikimedia Commons /
            Wikipedia under free licences, credited on each fighter.{" "}
            <Anchor component={Link} to="/privacy" size="xs">
              Privacy
            </Anchor>
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
