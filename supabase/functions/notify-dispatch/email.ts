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
  headers?: Record<string, string>;
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
  const cta = n.type === 'auction_outbid' ? 'Dar um novo lance'
    : n.type === 'auction_won' ? 'Ver meu pedido e pagar'
    : 'Ver o leilão';
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
        ...(msg.headers ? { headers: msg.headers } : {}),
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

// ================================================================
// E-MAIL DE "NOVO LOTE DISPONÍVEL" (em massa, 1 por rodada)
// ================================================================
export interface LotCard {
  id: number;
  name: string;
  price: number | string | null;
  buy_now?: number | string | null;
  version?: string | null;
  condition?: string | null;
  image?: string | null;
}

export interface LotRound {
  title: string;
  end_at: string | null;
  total: number;
  first_auction_id: number;
  first_start_at: string | null;
  cards: LotCard[]; // os destaques (as mais caras), já ordenados do mais caro pro mais barato
}

export interface LotEmail extends Omit<EmailMsg, 'from' | 'to'> {
  unsubscribeUrl: string;
}

export function brl(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "03/10 às 14:30" no horário de Brasília
export function dateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')} às ${g('hour')}:${g('minute')}`;
}

// só https entra no e-mail (nada de javascript:, data:, http misto)
function safeImg(u: unknown): string {
  return typeof u === 'string' && /^https:\/\//i.test(u) && u.length < 600 ? u : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildLotEmail(round: LotRound, token: string): LotEmail {
  const cards = (round.cards ?? []).slice(0, 5);
  const top = cards[0];
  const total = Math.max(Number(round.total) || cards.length, cards.length);
  const more = total - cards.length;
  const link = SITE_URL + '/?leilao=' + encodeURIComponent(String(round.first_auction_id));
  const unsubUrl = UUID_RE.test(token) ? `${SITE_URL}/?emails=sair&t=${token}` : SITE_URL + '/?notif=prefs';
  const prefsUrl = SITE_URL + '/?notif=prefs';

  const startsLater = round.first_start_at && new Date(round.first_start_at).getTime() > Date.now() + 5 * 60000;
  const when = startsLater ? `Começa em ${dateBR(round.first_start_at)}` : 'Já dá pra dar lances';
  const ends = round.end_at ? `Encerra em ${dateBR(round.end_at)}` : '';
  const sub = [`${total} carta${total === 1 ? '' : 's'}`, when, ends].filter(Boolean).join(' · ');

  const subject = top
    ? `🔨 Novo leilão: ${round.title} — ${top.name}${total > 1 ? ` e mais ${total - 1}` : ''}`
    : `🔨 Novo leilão: ${round.title}`;
  const preheader = cards.map((c) => c.name).join(', ') + (more > 0 ? ` e mais ${more}` : '');

  const tags = (c: LotCard) => [c.version && c.version !== 'N' ? c.version : '', c.condition ?? ''].filter(Boolean).join(' · ');
  const priceLine = (c: LotCard, big: boolean) => {
    const p = Number(c.price), b = Number(c.buy_now);
    const main = Number.isFinite(p) && p > 0
      ? `<div style="font-size:${big ? 13 : 11}px;color:#6b7089;margin-top:${big ? 10 : 6}px">Lance inicial</div><div style="font-size:${big ? 24 : 16}px;font-weight:bold;color:#06a37f">${escapeHtml(brl(p))}</div>`
      : '';
    const bn = Number.isFinite(b) && b > 0
      ? `<div style="font-size:${big ? 12.5 : 11}px;color:#b8860b;margin-top:4px">⚡ Compre já: <b>${escapeHtml(brl(b))}</b></div>`
      : '';
    return main + bn;
  };
  const img = (c: LotCard, w: number) => {
    const u = safeImg(c.image);
    return u
      ? `<img src="${escapeHtml(u)}" width="${w}" alt="${escapeHtml(c.name)}" style="display:block;width:${w}px;max-width:100%;height:auto;border-radius:8px;border:0">`
      : `<div style="width:${w}px;max-width:100%;height:${Math.round(w * 1.4)}px;background:#e8eaf2;border-radius:8px;text-align:center;line-height:${Math.round(w * 1.4)}px;font-size:34px">🃏</div>`;
  };

  const hero = top ? `
    <tr><td style="padding:6px 28px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #f1dfae;border-radius:14px">
        <tr>
          <td width="190" valign="top" style="padding:16px 8px 16px 16px">${img(top, 170)}</td>
          <td valign="top" style="padding:16px 16px 16px 8px">
            <div style="display:inline-block;background:#ffd166;color:#5a3b00;font-size:10.5px;font-weight:bold;letter-spacing:.6px;padding:3px 9px;border-radius:99px">⭐ CARTA MAIS VALIOSA</div>
            <div style="font-size:21px;font-weight:bold;line-height:1.25;margin-top:10px;color:#1c1f2e">${escapeHtml(top.name)}</div>
            ${tags(top) ? `<div style="font-size:12px;color:#6b7089;margin-top:4px">${escapeHtml(tags(top))}</div>` : ''}
            ${priceLine(top, true)}
          </td>
        </tr>
      </table>
    </td></tr>` : '';

  const rest = cards.slice(1);
  const cell = (c: LotCard | undefined) => c ? `
        <td width="50%" valign="top" style="padding:6px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e3e6f0;border-radius:12px">
            <tr><td align="center" style="padding:12px 10px 4px">${img(c, 120)}</td></tr>
            <tr><td align="center" style="padding:6px 10px 14px">
              <div style="font-size:14px;font-weight:bold;line-height:1.3;color:#1c1f2e">${escapeHtml(c.name)}</div>
              ${tags(c) ? `<div style="font-size:11px;color:#6b7089;margin-top:2px">${escapeHtml(tags(c))}</div>` : ''}
              ${priceLine(c, false)}
            </td></tr>
          </table>
        </td>` : '<td width="50%"></td>';
  let grid = '';
  for (let i = 0; i < rest.length; i += 2) grid += `<tr>${cell(rest[i])}${cell(rest[i + 1])}</tr>`;
  const gridBlock = rest.length ? `
    <tr><td style="padding:2px 22px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${grid}</table>
    </td></tr>` : '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eceef5;font-family:Arial,Helvetica,sans-serif;color:#1c1f2e">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef5;padding:22px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#e63946;background-image:linear-gradient(135deg,#e63946,#b3202d);padding:18px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:.3px">MyDeck</td>
      <td align="right"><span style="background:rgba(255,255,255,.2);color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1.2px;padding:5px 11px;border-radius:99px">LEILÃO</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#111422;padding:26px 28px 24px">
    <div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#ffd166">🔨 NOVO LEILÃO NO AR</div>
    <div style="font-size:26px;font-weight:bold;line-height:1.2;color:#ffffff;margin-top:8px">${escapeHtml(round.title)}</div>
    <div style="font-size:13.5px;line-height:1.5;color:#aab0cc;margin-top:10px">${escapeHtml(sub)}</div>
  </td></tr>
  <tr><td style="padding:22px 28px 8px"><div style="font-size:15px;font-weight:bold;color:#1c1f2e">⭐ Destaques da rodada</div></td></tr>
  ${hero}
  ${gridBlock}
  <tr><td align="center" style="padding:22px 28px 6px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#06a37f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:15px 30px;border-radius:10px">Ver ${total > 1 ? `as ${total} cartas` : 'a carta'} e dar lances →</a>
    ${more > 0 ? `<div style="font-size:13px;color:#6b7089;margin-top:12px">+ ${more} outra${more === 1 ? '' : 's'} carta${more === 1 ? '' : 's'} esperando por você na rodada</div>` : ''}
  </td></tr>
  <tr><td style="padding:22px 28px 24px">
    <div style="border-top:1px solid #e3e6f0;padding-top:16px;font-size:12px;line-height:1.6;color:#6b7089">
      Você recebe este e-mail porque tem uma conta no MyDeck e não desativou os avisos de novos leilões.<br>
      <a href="${escapeHtml(unsubUrl)}" style="color:#e63946;font-weight:bold">Não quero mais receber e-mails de novos leilões</a>
      &nbsp;·&nbsp; <a href="${escapeHtml(prefsUrl)}" style="color:#6b7089">Gerenciar meus avisos</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const lines = cards.map((c) => {
    const p = Number(c.price);
    return `• ${c.name}${tags(c) ? ` (${tags(c)})` : ''}${Number.isFinite(p) && p > 0 ? ` — lance inicial ${brl(p)}` : ''}`;
  });
  const text = `NOVO LEILÃO NO AR: ${round.title}\n${sub}\n\nDestaques da rodada:\n${lines.join('\n')}${more > 0 ? `\n+ ${more} outras cartas na rodada` : ''}\n\nVer e dar lances: ${link}\n\n---\nVocê recebe este e-mail porque tem uma conta no MyDeck.\nPara não receber mais e-mails de novos leilões: ${unsubUrl}\n`;

  return {
    subject, html, text, unsubscribeUrl: unsubUrl,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
  };
}

// Envio em lote da Resend: até 100 e-mails por chamada (conta como 1 requisição).
// Falha de validação (400/422) derruba o lote inteiro — quem chama cai pro envio
// individual pra isolar o endereço ruim.
export async function resendSendBatch(
  msgs: EmailMsg[],
  apiKey: string,
  idempotencyKey: string,
  baseUrl = RESEND_URL,
): Promise<SendResult> {
  try {
    const res = await fetch(`${baseUrl}/emails/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(msgs.map((m) => ({
        from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(m.reply_to ? { reply_to: m.reply_to } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
      }))),
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

export type BatchSender = (msgs: EmailMsg[], apiKey: string, idempotencyKey: string) => Promise<SendResult>;
