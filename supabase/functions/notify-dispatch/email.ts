// ================================================================
// MyDeck — notify-dispatch: e-mail (Resend)
// Montagem do conteúdo + chamada à API. Separado de dispatch.ts pra ser
// testável com uma Resend de mentira (baseUrl injetável).
// ================================================================

export interface EmailMsg {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  detail?: string;
  retryAfterMs?: number;
}

export type EmailSender = (msg: EmailMsg, apiKey: string, idempotencyKey: string) => Promise<SendResult>;

export const SITE_URL = 'https://mydecktcg.com.br';
const RESEND_URL = 'https://api.resend.com';

// Nome de carta e texto vêm do banco (o leiloeiro digita o nome da carta):
// SEMPRE escapar antes de colocar em HTML.
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface EmailSource {
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

export function buildEmail(n: EmailSource): { subject: string; html: string; text: string } {
  const card = n.data && typeof n.data.card_name === 'string' ? n.data.card_name : '';
  const path = n.data && typeof n.data.url === 'string' && n.data.url.startsWith('/') ? n.data.url : '/';
  const link = SITE_URL + path;
  const prefsLink = SITE_URL + '/?notif=prefs';
  const subject = card ? `${n.title} — ${card}` : n.title;
  const cta = n.type === 'auction_outbid' ? 'Dar um novo lance' : 'Ver o leilão';
  const body = n.body ?? '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f0f1f6;font-family:Arial,Helvetica,sans-serif;color:#1c1f2e">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(body)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f1f6;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#e63946;padding:16px 24px;color:#ffffff;font-size:18px;font-weight:bold">MyDeck &middot; Leilão</td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(n.title)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">${escapeHtml(body)}</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#06a37f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px">${cta}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #dcdfe8;font-size:12px;line-height:1.5;color:#676d84">
      Você recebe este e-mail porque participou de um leilão no MyDeck.
      Para parar de receber, <a href="${escapeHtml(prefsLink)}" style="color:#676d84">desative os avisos por e-mail</a>.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = `${n.title}\n\n${body}\n\n${cta}: ${link}\n\n---\nVocê recebe este e-mail porque participou de um leilão no MyDeck.\nPara parar de receber: ${prefsLink}\n`;
  return { subject, html, text };
}

export async function resendSend(
  msg: EmailMsg,
  apiKey: string,
  idempotencyKey: string,
  baseUrl = RESEND_URL,
): Promise<SendResult> {
  try {
    const res = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // a Resend ignora um segundo envio com a mesma chave (retry seguro)
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: msg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.reply_to ? { reply_to: msg.reply_to } : {}),
      }),
    });
    if (res.ok) return { ok: true, status: res.status };
    let detail = '';
    try {
      const j = await res.json();
      detail = `${j.name ?? ''} ${j.message ?? ''}`.trim();
    } catch (_) { /* corpo não é JSON */ }
    const ra = Number(res.headers.get('retry-after'));
    return { ok: false, status: res.status, detail: detail.slice(0, 200), retryAfterMs: ra > 0 ? ra * 1000 : undefined };
  } catch (err) {
    return { ok: false, status: 0, detail: String((err as Error).message ?? err).slice(0, 200) };
  }
}
