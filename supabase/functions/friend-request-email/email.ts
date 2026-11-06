// The friend-request email: same look as the sign-in emails (supabase/email-templates).

const SITE = "https://ufc.anarli.com";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function friendRequestEmail(requester: string): { subject: string; html: string; text: string } {
  const name = escape(requester);
  const page = `${SITE}/u/${encodeURIComponent(requester)}`;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f2f2f4;">
<span style="display:none;max-height:0;overflow:hidden;">${name} wants to be friends on UFC Embedded.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;font-family:${font};color:#1b1c20;">
      <tr><td style="padding:28px 32px 0;">
        <div style="font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#e03131;">UFC Embedded</div>
      </td></tr>
      <tr><td style="padding:14px 32px 0;">
        <h1 style="margin:0;font-size:22px;line-height:1.3;">${name} wants to be friends</h1>
      </td></tr>
      <tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.55;color:#3a3b40;">
        Accept and you'll get your own friends leaderboard on Pick'em, and see each other's picks once a card locks.
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <a href="${page}" style="display:inline-block;background:#e03131;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">See ${name}'s profile</a>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.5;color:#6b6c72;">
        The button opens ufc.anarli.com, where you can accept or decline. Don't want these emails?
        Turn them off on <a href="${SITE}/me" style="color:#6b6c72;">your profile</a>.
      </td></tr>
    </table>
    <div style="max-width:480px;padding:14px 8px 0;font-family:${font};font-size:12px;line-height:1.5;color:#8a8b90;">
      UFC Embedded is a free fan project at <a href="${SITE}" style="color:#8a8b90;">ufc.anarli.com</a>, not affiliated with the UFC.
    </div>
  </td></tr>
</table>
</body>
</html>`;
  const text = `${requester} wants to be friends on UFC Embedded.\n\nAccept or decline on their profile: ${page}\n\nDon't want these emails? Turn them off on your profile: ${SITE}/me`;
  return { subject: `${requester} wants to be friends on UFC Embedded`, html, text };
}
