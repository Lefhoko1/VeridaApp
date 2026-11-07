// Sends queued emails through Resend and records each outcome (FR-H09). Run on a schedule.
// It takes no input and only drains the queue, so an unexpected caller can do no more than
// send queued mail sooner, which is why it needs no JWT.
import { json } from '../_shared/http.ts';
import { reportEvent, serviceClient } from '../_shared/supabase.ts';

const BATCH_SIZE = 20;
const DEFAULT_FROM = 'Verida <onboarding@resend.dev>';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function renderHtml(subject: string, body: string): string {
  return `<div style="font-family: Arial, sans-serif; background: #F7F6F0; padding: 32px; color: #153C46;">
  <h1 style="margin: 0 0 16px; font-size: 28px;">verida<span style="color: #E69A7A;">.</span></h1>
  <h2 style="font-size: 18px;">${escapeHtml(subject)}</h2>
  <p>${escapeHtml(body)}</p>
</div>`;
}

Deno.serve(async () => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  const service = serviceClient();
  const claimed = await service.schema('notifications').rpc('claim_outbox', { p_limit: BATCH_SIZE });
  if (claimed.error) {
    await reportEvent(service, 'dispatch-email', claimed.error.message);
    return json({ error: 'claim_failed' }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const email of (claimed.data ?? []) as { id: string; to_email: string; subject: string; body: string }[]) {
    let problem: string | null = null;
    try {
      const response = await fetch(Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('EMAIL_FROM') ?? DEFAULT_FROM,
          to: email.to_email,
          subject: email.subject,
          text: email.body,
          html: renderHtml(email.subject, email.body),
        }),
      });
      if (!response.ok) problem = `Resend ${response.status}: ${(await response.text()).slice(0, 300)}`;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    await service.schema('notifications').rpc('complete_outbox', { p_id: email.id, p_sent: problem === null, p_error: problem });
    if (problem) failed += 1;
    else sent += 1;
  }

  if (failed > 0) await reportEvent(service, 'dispatch-email', `${failed} of ${sent + failed} emails failed in the last batch.`);
  return json({ sent, failed });
});
