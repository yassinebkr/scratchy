/**
 * @module server/email
 * Email service using Resend API.
 * Sends verification codes for signup flow.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_VoMtaw4k_DED8N7CEeroGdYmzEMnuXcNJ';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Scratchy <no_reply@clawos.fr>';

/**
 * Build the verification email HTML.
 * Table-based layout, inline styles, dark mode safe.
 */
function buildVerificationHtml(code, name) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>Scratchy Verification</title>
    <style>
        body, table, td, div, p, a {
            margin: 0; padding: 0; border: none; border-spacing: 0; border-collapse: collapse;
            font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;
        }
        a { text-decoration: none; color: #F9A602; }
        :root { color-scheme: dark; supported-color-schemes: dark; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #0d0b08 !important; }
            .main-bg { background-color: #0d0b08 !important; }
            .card-bg { background-color: #1a1610 !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#0d0b08;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" class="main-bg">
    <center>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-spacing:0;border-collapse:collapse;margin:0 auto;">
            <tr>
                <td align="center" style="padding:20px 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-spacing:0;border-collapse:collapse;max-width:480px;background-color:#1a1610;border-radius:12px;" class="card-bg">
                        <tr>
                            <td style="padding:24px 24px 16px;text-align:left;">
                                <p style="margin:0;font-size:24px;line-height:28px;font-weight:700;color:#F9A602;">
                                    🐱 Scratchy
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 24px 8px;text-align:left;">
                                <p style="margin:0;font-size:18px;line-height:24px;color:#f0ead6;">
                                    Hey ${name},
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 24px 16px;text-align:center;">
                                <p style="margin:0;font-size:16px;line-height:24px;color:#f0ead6;">
                                    Your verification code is:
                                </p>
                                <p style="margin:16px 0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;font-size:48px;line-height:56px;font-weight:700;color:#F9A602;letter-spacing:4px;">
                                    ${code}
                                </p>
                                <p style="margin:0;font-size:14px;line-height:20px;color:#8a7e6a;">
                                    This code expires in 15 minutes.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:16px 24px 24px;text-align:center;">
                                <p style="margin:0;font-size:12px;line-height:18px;color:#8a7e6a;">
                                    If you didn't create a Scratchy account, please ignore this email.
                                </p>
                                <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#8a7e6a;">
                                    Scratchy — Your AI agents remember yesterday.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>`;
}

/**
 * Send a verification code email.
 * @param {string} to - Recipient email
 * @param {string} code - 6-digit verification code
 * @param {string} [username] - Username for personalization
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendVerificationEmail(to, code, username) {
  const name = username || 'there';
  const html = buildVerificationHtml(code, name);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `${code} is your Scratchy verification code`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }));
      console.error(`[email] Resend API error ${res.status}:`, err);
      return { ok: false, error: err.message || `Resend API ${res.status}` };
    }

    const data = await res.json();
    console.log(`[email] Verification sent to ${to} (id: ${data.id})`);
    return { ok: true };
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Generate a 6-digit verification code.
 * @returns {string}
 */
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
