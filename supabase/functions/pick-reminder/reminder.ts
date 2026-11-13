// The reminder email itself (index.ts sends it).

import { escape, layout, SITE } from "../_shared/layout.ts";

const IMAGE = `${SITE}/email/ufc-334.jpg`;

export interface Bout {
  id: string;
  position: number;
  a_name: string;
  b_name: string;
  segment: string;
  title: boolean;
}

export function reminder(name: string, eventId: string, locksAt: string, main: Bout[], picked: number) {
  const card = `${SITE}/pickem?event=${encodeURIComponent(eventId)}`;
  const lock = new Date(locksAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin", timeZoneName: "short" });
  const [headline, ...rest] = [...main].sort((a, b) => a.position - b.position);
  const short = name.split(":")[0]!;
  const status = picked > 0 ? `You've picked ${picked} of ${main.length} main-card fights so far.` : "You haven't picked any fights yet.";
  const surname = (n: string) => escape(n.split(" ").at(-1)!);
  const others = rest.map((b) => `${surname(b.a_name)} vs ${surname(b.b_name)}${b.title ? " for a title" : ""}`).join(", ");
  const html = layout({
    preheader: `Picks lock ${lock}. ${status}`,
    heading: `${escape(headline!.a_name.split(" ").at(-1)!)} vs ${escape(headline!.b_name.split(" ").at(-1)!)} for the belt`,
    image: { src: IMAGE, alt: `${short}: ${headline!.a_name} vs ${headline!.b_name}, heavyweight title`, href: card },
    body: `<p style="margin:0 0 12px;">${escape(short)} is this weekend, and picks lock <b>${escape(lock)}</b>. ${status}</p>
<p style="margin:0;">Also on the main card: ${others}. Main-card winners are worth 10, prelims 1.</p>`,
    button: { label: "Pick your fights", href: card },
    small: "A one-off reminder for a big card. You get it because you have a UFC Embedded account.",
  });
  const text = `${short} is this weekend: ${headline!.a_name} vs ${headline!.b_name} for the heavyweight title.\n\nPicks lock ${lock}. ${status}\n\nPick your fights: ${card}\n\nA one-off reminder for a big card. You get it because you have a UFC Embedded account.`;
  return { subject: `${short}: heavyweight title, picks lock Saturday`, html, text };
}

