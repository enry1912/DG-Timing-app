export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY || !env.SENDER_EMAIL) throw new Error('Email is not configured yet.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.SENDER_EMAIL, to: [to], subject, html })
  });
  if (!response.ok) throw new Error('Email could not be sent.');
}

export const appUrl = (env, path) => new URL(path, env.APP_ORIGIN).toString();
