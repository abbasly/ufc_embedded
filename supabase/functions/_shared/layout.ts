// The look shared by all our emails (and the sign-in templates in supabase/email-templates):
// "UFC Embedded" in red, a heading, a short body, one red button, a small note, the footer.

export const SITE = "https://ufc.anarli.com";

export const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function layout(o: { preheader: string; heading: string; body: string; button: { label: string; href: string }; small: string; image?: { src: string; alt: string; href: string } }): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f2f2f4;">
<span style="display:none;max-height:0;overflow:hidden;">${o.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;font-family:${FONT};color:#1b1c20;">
      <tr><td style="padding:28px 32px 0;">
        <div style="font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#e03131;">UFC Embedded</div>
      </td></tr>${o.image ? `
      <tr><td style="padding:16px 32px 0;">
        <a href="${o.image.href}"><img src="${o.image.src}" alt="${o.image.alt}" width="416" style="display:block;width:100%;max-width:416px;height:auto;border:0;border-radius:8px;"></a>
      </td></tr>` : ""}
      <tr><td style="padding:14px 32px 0;">
        <h1 style="margin:0;font-size:22px;line-height:1.3;">${o.heading}</h1>
      </td></tr>
      <tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.55;color:#3a3b40;">
        ${o.body}
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <a href="${o.button.href}" style="display:inline-block;background:#e03131;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">${o.button.label}</a>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.5;color:#6b6c72;">
        ${o.small}
      </td></tr>
    </table>
    <div style="max-width:480px;padding:14px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#8a8b90;">
      UFC Embedded is a free fan project at <a href="${SITE}" style="color:#8a8b90;">ufc.anarli.com</a>, not affiliated with the UFC.
    </div>
  </td></tr>
</table>
</body>
</html>`;
}
