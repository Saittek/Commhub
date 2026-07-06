interface SendPasswordResetOptions {
  apiKey?: string;
  from: string;
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(
  options: SendPasswordResetOptions,
): Promise<{ sent: boolean; devLink?: string }> {
  const subject = "Reset your Commhub password";
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2>Reset your password</h2>
      <p>We received a request to reset the password for your Commhub account.</p>
      <p><a href="${options.resetUrl}" style="display:inline-block;padding:12px 18px;background:#2dd4bf;color:#0a0a0f;text-decoration:none;border-radius:8px;font-weight:700">Choose a new password</a></p>
      <p>Or copy this link into your browser:</p>
      <p style="word-break:break-all">${options.resetUrl}</p>
      <p style="color:#666;font-size:14px">This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
    </div>
  `.trim();

  if (!options.apiKey) {
    console.log(`[commhub] Password reset link for ${options.to}: ${options.resetUrl}`);
    return { sent: false, devLink: options.resetUrl };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email delivery failed (${response.status}). ${detail.slice(0, 200)}`);
  }

  return { sent: true };
}
