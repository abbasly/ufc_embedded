// The friend-request email.

import { escape, layout, SITE } from "../_shared/layout.ts";

export function friendRequestEmail(requester: string): { subject: string; html: string; text: string } {
  const name = escape(requester);
  const page = `${SITE}/u/${encodeURIComponent(requester)}`;
  const html = layout({
    preheader: `${name} wants to be friends on UFC Embedded.`,
    heading: `${name} wants to be friends`,
    body: "Accept and you'll get your own friends leaderboard on Pick'em, and see each other's picks once a card locks.",
    button: { label: `See ${name}'s profile`, href: page },
    small: `The button opens ufc.anarli.com, where you can accept or decline. Don't want these emails? Turn them off on <a href="${SITE}/me" style="color:#6b6c72;">your profile</a>.`,
  });
  const text = `${requester} wants to be friends on UFC Embedded.\n\nAccept or decline on their profile: ${page}\n\nDon't want these emails? Turn them off on your profile: ${SITE}/me`;
  return { subject: `${requester} wants to be friends on UFC Embedded`, html, text };
}
