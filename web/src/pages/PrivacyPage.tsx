import { Anchor, Container, List, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

import { accountsEnabled } from "../backend";

const REPO = "https://github.com/abbasly/ufc_embedded";

/** Privacy policy: what the site, its accounts (where switched on) and the services it uses
 * collect, why, for how long, and your rights. The account section shows only on builds with
 * accounts, so the page always describes the site as it is. */
export function PrivacyPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Privacy</Title>
        <Text c="dimmed" size="sm">
          Last updated November 2026.
        </Text>

        <Title order={3}>Who is responsible</Title>
        <Text>
          UFC Embedded is a personal, non-commercial fan project. The person responsible for it, and for the
          processing of personal data described here, is named in the <Anchor component={Link} to="/impressum">Impressum</Anchor>,
          with contact details.
        </Text>

        <Title order={3}>Browsing the site</Title>
        <Text>
          You can use everything except Pick'em without an account. The site sets no cookies of its own. Your browser
          keeps a few settings locally (for example whether the punch sound is muted); they never leave your device.
        </Text>

        {accountsEnabled && (
          <>
            <Title order={3}>Accounts and Pick'em</Title>
            <Text>If you sign in to play Pick'em, we store:</Text>
            <List spacing="xs">
              <List.Item>
                <b>Your email address</b>, to sign you in and to send account emails (confirming your address,
                resetting your password), or, if you sign in with Google, the email address Google shares. It isn't
                shown to anyone and isn't used for anything else: no newsletters, no marketing. The only other emails
                are your results after each card you played and a note when someone sends you a friend request; you can
                turn either off on your profile. If you use a password,
                only a secure hash of it is stored (by Supabase), never the password itself.
              </List.Item>
              <List.Item>
                <b>The display name you choose</b>, and the fighter you pick as your profile picture, both shown on
                leaderboards.
              </List.Item>
              <List.Item>
                <b>Your picks, scores, league memberships and friends.</b> Your picks are private until a card locks;
                before that, your friends and league-mates only see that you've picked, and after it, whom. Nobody else
                ever sees them. Leaderboards and player pages show display names, pictures and totals.
              </List.Item>
            </List>
            <Text>
              We use this only to run the game: signing you in, saving your picks, scoring them and showing the
              leaderboards (Art. 6(1)(b) GDPR: providing the service you signed up for). We keep it until you delete your
              account, which you can do yourself at any time on your profile page: it deletes your account, display
              name, picks, scores, memberships and friendships straight away, for good. Leagues you created are deleted with it.
            </Text>
          </>
        )}

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
          {accountsEnabled && (
            <>
              <List.Item>
                <b>Supabase</b> runs the account database and sign-in, on servers in Frankfurt, Germany, as our
                processor under a data processing agreement (
                <Anchor href="https://supabase.com/privacy">Supabase privacy policy</Anchor>).
              </List.Item>
              <List.Item>
                <b>Resend</b> delivers the sign-in emails, as our processor (
                <Anchor href="https://resend.com/legal/privacy-policy">Resend privacy policy</Anchor>).
              </List.Item>
              <List.Item>
                <b>Google</b>, only if you choose "Continue with Google": Google confirms who you are and shares your
                name and email address with us; we keep only the email address (
                <Anchor href="https://policies.google.com/privacy">Google privacy policy</Anchor>).
              </List.Item>
            </>
          )}
          <List.Item>
            <b>Cloudflare</b> provides the domain's DNS and counts visits with Cloudflare Web Analytics: no
            cookies and no tracking across sites, just page views, countries and where visitors came from (
            <Anchor href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</Anchor>).
          </List.Item>
          <List.Item>
            <b>GoatCounter</b> also counts visits, without cookies or personal data: page, referrer, browser
            and country, not who you are (
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
        <Text size="sm" c="dimmed">
          Visit counting and the analytics above serve our legitimate interest in knowing how the site is used (Art.
          6(1)(f) GDPR); personalised ads need your consent (Art. 6(1)(a) GDPR).
        </Text>

        <Title order={3}>Your rights</Title>
        <Text>
          You can download everything we store about you yourself, from your profile ("Download my data"), or ask
          what data we hold about you and get a copy of it, have it corrected or deleted, restrict or object
          to its processing, and withdraw any consent you've given. Write to the contact in the{" "}
          <Anchor component={Link} to="/impressum">Impressum</Anchor>. You can also complain to a data protection
          authority, for example the Bavarian one (Bayerisches Landesamt für Datenschutzaufsicht).
        </Text>

        <Title order={3}>Questions</Title>
        <Text>
          About the site in general: open an issue on <Anchor href={`${REPO}/issues`}>GitHub</Anchor>. About your
          personal data: please use the contact in the Impressum rather than GitHub.
        </Text>
      </Stack>
    </Container>
  );
}
