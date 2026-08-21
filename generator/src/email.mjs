import { AuthError } from "./auth.mjs";

const appOrigin = () => String(process.env.SPRITEFORGE_APP_ORIGIN || "https://spriteforge.xyz").replace(/\/$/, "");

export function createEmailer() {
  const apiKey = String(process.env.RESEND_API_KEY || "");
  const from = String(process.env.SPRITEFORGE_EMAIL_FROM || "");
  const configured = () => Boolean(apiKey && from && appOrigin().startsWith("https://"));
  const assertConfigured = () => {
    if (!configured()) throw new AuthError(503, "email_verification_unavailable", "Email verification is temporarily unavailable. Please try again later.");
  };
  return {
    configured,
    async sendVerification({ email, token }) {
      assertConfigured();
      const verificationUrl = `${appOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
      const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="margin:0;padding:0;background:#110f0d;color:#f8f2ee;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#110f0d;padding:36px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#211913;border:1px solid #5a4535;border-radius:18px;overflow:hidden"><tr><td style="padding:32px 34px 24px;background:#2d2119"><div style="color:#efa472;font-size:11px;font-weight:700;letter-spacing:1.5px">SPRITEFORGE ACCOUNT</div><h1 style="margin:14px 0 10px;color:#fff8f3;font-size:30px;line-height:1.15;letter-spacing:-.6px">Verify your email</h1><p style="margin:0;color:#d1bfb0;font-size:15px;line-height:1.6">One click unlocks your SpriteForge workspace and your 40 free Forge credits.</p></td></tr><tr><td style="padding:30px 34px 34px"><p style="margin:0 0 23px;color:#eee4dd;font-size:15px;line-height:1.6">Thanks for joining SpriteForge. Confirm that you own this email address to activate your account.</p><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:9px;background:#e6813b"><a href="${verificationUrl}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">Verify email address &rarr;</a></td></tr></table><p style="margin:25px 0 0;color:#bca897;font-size:12px;line-height:1.55">This secure link expires in 24 hours. If you did not create a SpriteForge account, you can safely ignore this email.</p><div style="margin-top:26px;padding-top:16px;border-top:1px solid #4c3b2f;color:#927866;font-size:11px;line-height:1.5">SpriteForge · Game art, forged for play<br />${appOrigin()}</div></td></tr></table></td></tr></table></body></html>`;
      let response;
      try { response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Verify your SpriteForge account",
          text: `Welcome to SpriteForge. Verify your email address to activate your account and 40 free Forge credits:\n\n${verificationUrl}\n\nThis secure link expires in 24 hours. If you did not create this account, you can safely ignore this email.`,
          html,
        }),
        signal: AbortSignal.timeout(30_000),
      }); } catch { throw new AuthError(503, "email_delivery_failed", "We could not send the verification email. Please try again shortly."); }
      if (!response.ok) throw new AuthError(503, "email_delivery_failed", "We could not send the verification email. Please try again shortly.");
    },
    async sendPasswordReset({ email, token }) {
      assertConfigured();
      const resetUrl = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
      const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="margin:0;padding:0;background:#110f0d;color:#f8f2ee;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#110f0d;padding:36px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#211913;border:1px solid #5a4535;border-radius:18px;overflow:hidden"><tr><td style="padding:32px 34px 24px;background:#2d2119"><div style="color:#efa472;font-size:11px;font-weight:700;letter-spacing:1.5px">SPRITEFORGE ACCOUNT</div><h1 style="margin:14px 0 10px;color:#fff8f3;font-size:30px;line-height:1.15;letter-spacing:-.6px">Reset your password</h1><p style="margin:0;color:#d1bfb0;font-size:15px;line-height:1.6">Use the secure link below to choose a new password.</p></td></tr><tr><td style="padding:30px 34px 34px"><p style="margin:0 0 23px;color:#eee4dd;font-size:15px;line-height:1.6">This link expires in one hour and can only be used once.</p><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:9px;background:#e6813b"><a href="${resetUrl}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">Choose a new password &rarr;</a></td></tr></table><p style="margin:25px 0 0;color:#bca897;font-size:12px;line-height:1.55">If you did not request this, you can safely ignore this email. Your password will not change.</p><div style="margin-top:26px;padding-top:16px;border-top:1px solid #4c3b2f;color:#927866;font-size:11px;line-height:1.5">SpriteForge · Game art, forged for play<br />${appOrigin()}</div></td></tr></table></td></tr></table></body></html>`;
      let response;
      try { response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [email], subject: "Reset your SpriteForge password", text: `Reset your SpriteForge password here (this link expires in one hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this message.`, html, }), signal: AbortSignal.timeout(30_000) }); }
      catch { throw new AuthError(503, "email_delivery_failed", "We could not send the password reset email. Please try again shortly."); }
      if (!response.ok) throw new AuthError(503, "email_delivery_failed", "We could not send the password reset email. Please try again shortly.");
    },
  };
}
