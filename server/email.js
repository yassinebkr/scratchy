/**
 * @module server/email
 * Email service using Resend API.
 * Sends verification codes for signup flow.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_VoMtaw4k_DED8N7CEeroGdYmzEMnuXcNJ';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Scratchy <no_reply@clawos.fr>';

/**
 * Send a verification code email.
 * @param {string} to - Recipient email
 * @param {string} code - 6-digit verification code
 * @param {string} [username] - Username for personalization
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendVerificationEmail(to, code, username) {
  const name = username || 'there';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f0ead6; font-size: 24px; margin: 0;">🐱 Scratchy</h1>
      </div>
      <div style="background: #1a1610; border: 1px solid rgba(249,166,2,0.2); border-radius: 12px; padding: 32px; text-align: center;">
        <p style="color: #c4b99a; font-size: 16px; margin: 0 0 8px;">Hey ${name},</p>
        <p style="color: #8a7e6a; font-size: 14px; margin: 0 0 24px;">Here's your verification code:</p>
        <div style="background: #0d0b08; border: 2px solid #F9A602; border-radius: 8px; padding: 16px 24px; display: inline-block; margin-bottom: 24px;">
          <span style="color: #F9A602; font-size: 32px; letter-spacing: 8px; font-weight: 700; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #8a7e6a; font-size: 13px; margin: 0;">This code expires in 15 minutes.</p>
      </div>
      <p style="color: #555; font-size: 12px; text-align: center; margin-top: 24px;">
        If you didn't create a Scratchy account, you can ignore this email.
      </p>
    </div>
  `;

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
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}
