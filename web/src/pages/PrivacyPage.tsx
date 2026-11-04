import { Anchor, Container, List, Stack, Text, Title } from "@mantine/core";

const REPO = "https://github.com/abbasly/ufc_embedded";

/** Privacy policy: what this static site and the services it uses can see. */
export function PrivacyPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Privacy</Title>
        <Text c="dimmed" size="sm">
          Last updated November 2026.
        </Text>

        <Title order={3}>This site</Title>
        <Text>
          UFC Embedded is a static website with no accounts, no forms and no database. It doesn't set its own
          cookies or collect anything about you. Your browser keeps a few settings locally (for example whether the
          punch sound is muted); they never leave your device.
        </Text>

        <Title order={3}>Services the site uses</Title>
        <List spacing="xs">
          <List.Item>
            <b>GitHub Pages</b> hosts the site. Like any web server it processes your IP address to deliver pages and
            may keep short-lived logs (
            <Anchor href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
              GitHub privacy statement
            </Anchor>
            ).
          </List.Item>
          <List.Item>
            <b>Cloudflare</b> provides the domain's DNS and counts visits with Cloudflare Web Analytics: no
            cookies and no tracking across sites, just page views, countries and where visitors came from (
            <Anchor href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</Anchor>).
          </List.Item>
          <List.Item>
            <b>GoatCounter</b> counts visits without cookies or personal data: page, referrer, browser
            and country, not who you are. The total visit count shown on the About page comes from it (
            <Anchor href="https://www.goatcounter.com/help/privacy">GoatCounter privacy policy</Anchor>).
          </List.Item>
          <List.Item>
            <b>Wikimedia</b> serves the fighter photos directly to your browser (
            <Anchor href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">Wikimedia privacy policy</Anchor>
            ).
          </List.Item>
          <List.Item>
            <b>Google AdSense</b> shows ads. Google and its partners use cookies to serve ads, measure them and, if you
            agree, personalise them based on your visits to this and other sites. Visitors from the EEA, the UK and
            Switzerland are asked for consent first, and can change their choice at any time from the privacy link
            Google shows on the page. See{" "}
            <Anchor href="https://policies.google.com/technologies/partner-sites">
              how Google uses information from sites that use its services
            </Anchor>{" "}
            and turn personalised ads off in <Anchor href="https://adssettings.google.com">Google's ad settings</Anchor>.
          </List.Item>
        </List>

        <Title order={3}>Contact</Title>
        <Text>
          Questions about this policy: open an issue on <Anchor href={`${REPO}/issues`}>GitHub</Anchor>.
        </Text>
      </Stack>
    </Container>
  );
}
