// ================================================================
// MyDeck — notify-dispatch: lógica de envio (testável sem Supabase)
//
// index.ts liga isto ao banco e ao Deno.serve; os testes trocam as
// dependências (Deps) por versões falsas, um servidor de push de mentira
// e uma Resend de mentira.
//
// Ordem: push primeiro (instantâneo), e-mail depois. Cada canal é isolado:
// falha de um nunca derruba o outro.
// ================================================================

import webpush from 'npm:web-push@3.6.7';
import { buildEmail, type EmailSender, resendSend } from './email.ts';

export interface Notif {
  id: number;
  user_id: string;
  type: string;
  auction_id: number | null;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

export interface Sub {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

export interface EmailClaim {
  notification_id: number;
  user_id: string;
  auction_id: number | null;
  type: string;
}

export interface Deps {
  getPrivate(key: string): Promise<string | null>;
  // grava o par VAPID: privada em app_private_config, pública também em
  // app_public_config (o navegador precisa dela pra se inscrever)
  saveVapid(publicKey: string, privateKey: string): Promise<void>;
  getNotifications(ids: number[]): Promise<Notif[]>;
  getSubscriptions(userIds: string[]): Promise<Sub[]>;
  deleteSubscriptions(ids: number[]): Promise<void>;

  // ── e-mail ──
  // user_id → email_enabled (quem não tem linha = ligado, não aparece no mapa)
  getEmailPrefs(userIds: string[]): Promise<Map<string, boolean>>;
  // e-mail CONFIRMADO do usuário (null se não tem/não confirmou)
  getUserEmail(userId: string): Promise<string | null>;
  // reserva as notificações antes de enviar; devolve só as que foram
  // reservadas AGORA (as já reservadas por uma chamada anterior ficam de fora)
  claimEmails(rows: EmailClaim[]): Promise<Set<number>>;
  countRecentEmails(userId: string, auctionId: number, type: string, sinceIso: string, excludeId: number): Promise<number>;
  finishEmail(notificationId: number, status: 'sent' | 'skipped' | 'failed', detail?: string): Promise<void>;
}

// https:// ou mailto: — o push service usa só como contato, nunca é e-mail pessoal
const VAPID_SUBJECT = 'https://mydecktcg.com.br';
const SEND_CONCURRENCY = 10;
// aviso de lance perde a utilidade rápido: se o aparelho ficar offline mais
// de 1h, é melhor nem entregar
const TTL_SECONDS = 3600;

// Em disputa acirrada o lance muda a cada poucos minutos: no máximo 1 e-mail
// de "lance coberto" por leilão por pessoa nesta janela (o sino e o push
// continuam avisando cada vez).
const OUTBID_EMAIL_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_FROM = 'MyDeck Leilão <leilao@mydecktcg.com.br>';
// plano gratuito da Resend: 2 requisições/segundo
const EMAIL_SPACING_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ensureVapid(deps: Deps): Promise<{ publicKey: string; privateKey: string }> {
  let pub = await deps.getPrivate('vapid_public_key');
  let priv = await deps.getPrivate('vapid_private_key');
  if (pub && priv) return { publicKey: pub, privateKey: priv };

  const keys = webpush.generateVAPIDKeys();
  await deps.saveVapid(keys.publicKey, keys.privateKey);
  // se duas chamadas simultâneas geraram pares diferentes, vale o que ficou gravado
  pub = await deps.getPrivate('vapid_public_key');
  priv = await deps.getPrivate('vapid_private_key');
  return { publicKey: pub ?? keys.publicKey, privateKey: priv ?? keys.privateKey };
}

export function buildPayload(n: Notif): string {
  const url = (n.data && typeof n.data.url === 'string') ? n.data.url : '/';
  return JSON.stringify({
    id: n.id,
    title: n.title,
    body: n.body ?? '',
    url,
    auctionId: n.auction_id,
    // mesmo tag por leilão: "coberto" e depois "encerrado" substituem o aviso
    // anterior na bandeja em vez de empilhar
    tag: n.auction_id ? `auction-${n.auction_id}` : `n-${n.id}`,
  });
}

type SendFn = typeof webpush.sendNotification;

interface PushSummary { subscriptions: number; sent: number; failed: number; removed: number }
interface EmailSummary { enabled: boolean; sent: number; skipped: number; failed: number }

async function dispatchPush(notifs: Notif[], deps: Deps, send: SendFn): Promise<PushSummary> {
  const subs = await deps.getSubscriptions([...new Set(notifs.map((n) => n.user_id))]);
  const subsByUser = new Map<string, Sub[]>();
  for (const s of subs) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  const jobs: Array<{ n: Notif; s: Sub }> = [];
  for (const n of notifs) for (const s of subsByUser.get(n.user_id) ?? []) jobs.push({ n, s });
  if (!jobs.length) return { subscriptions: 0, sent: 0, failed: 0, removed: 0 };

  const vapid = await ensureVapid(deps);
  let sent = 0;
  let failed = 0;
  const dead = new Set<number>();

  async function run(job: { n: Notif; s: Sub }) {
    try {
      await send(
        { endpoint: job.s.endpoint, keys: { p256dh: job.s.p256dh_key, auth: job.s.auth_key } },
        buildPayload(job.n),
        {
          vapidDetails: { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: TTL_SECONDS,
          urgency: 'high',
          ...(job.n.auction_id ? { topic: `a${job.n.auction_id}` } : {}),
        },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: inscrição morreu (app desinstalado, permissão revogada) — limpa
      if (status === 404 || status === 410) dead.add(job.s.id);
      else console.error('[notify-dispatch] falha no envio', status ?? '', (err as Error).message);
      failed++;
    }
  }

  for (let i = 0; i < jobs.length; i += SEND_CONCURRENCY) {
    await Promise.all(jobs.slice(i, i + SEND_CONCURRENCY).map(run));
  }
  if (dead.size) await deps.deleteSubscriptions([...dead]);

  return { subscriptions: jobs.length, sent, failed, removed: dead.size };
}

async function dispatchEmail(notifs: Notif[], deps: Deps, sendEmail: EmailSender): Promise<EmailSummary> {
  const summary: EmailSummary = { enabled: false, sent: 0, skipped: 0, failed: 0 };

  // sem chave da Resend no banco = e-mail desligado (push segue normal)
  const apiKey = await deps.getPrivate('resend_api_key');
  if (!apiKey) return summary;
  // chave geral de "valendo": só envia pra usuário real depois do OK do dono
  // (app_private_config.email_live = '1'), pra dar tempo de ver o e-mail de
  // teste e de o domínio ficar verificado na Resend. Desligar de novo = '0'.
  if ((await deps.getPrivate('email_live')) !== '1') return summary;
  summary.enabled = true;

  const from = (await deps.getPrivate('email_from')) || DEFAULT_FROM;
  const replyTo = (await deps.getPrivate('email_reply_to')) || undefined;

  const claimed = await deps.claimEmails(notifs.map((n) => ({
    notification_id: n.id, user_id: n.user_id, auction_id: n.auction_id, type: n.type,
  })));
  const todo = notifs.filter((n) => claimed.has(n.id));
  if (!todo.length) return summary;

  const prefs = await deps.getEmailPrefs([...new Set(todo.map((n) => n.user_id))]);
  let first = true;

  for (const n of todo) {
    try {
      if (prefs.get(n.user_id) === false) {
        await deps.finishEmail(n.id, 'skipped', 'opt_out'); summary.skipped++; continue;
      }
      if (n.type === 'auction_outbid' && n.auction_id) {
        const since = new Date(Date.now() - OUTBID_EMAIL_WINDOW_MS).toISOString();
        if (await deps.countRecentEmails(n.user_id, n.auction_id, n.type, since, n.id) > 0) {
          await deps.finishEmail(n.id, 'skipped', 'throttle'); summary.skipped++; continue;
        }
      }
      const to = await deps.getUserEmail(n.user_id);
      if (!to) {
        await deps.finishEmail(n.id, 'skipped', 'no_email'); summary.skipped++; continue;
      }

      const { subject, html, text } = buildEmail(n);
      const msg = { from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) };

      if (!first) await sleep(EMAIL_SPACING_MS);
      first = false;
      let res = await sendEmail(msg, apiKey, `notif-${n.id}`);
      if (!res.ok && res.status === 429) {
        await sleep(Math.min(res.retryAfterMs ?? 1200, 5000));
        res = await sendEmail(msg, apiKey, `notif-${n.id}`);
      }
      if (res.ok) {
        await deps.finishEmail(n.id, 'sent'); summary.sent++;
      } else {
        console.error('[notify-dispatch] e-mail falhou', res.status, res.detail ?? '');
        await deps.finishEmail(n.id, 'failed', `${res.status} ${res.detail ?? ''}`.trim()); summary.failed++;
      }
    } catch (err) {
      console.error('[notify-dispatch] e-mail erro', (err as Error).message);
      try { await deps.finishEmail(n.id, 'failed', String((err as Error).message).slice(0, 200)); } catch (_) { /* segue */ }
      summary.failed++;
    }
  }
  return summary;
}

export async function handle(
  req: Request,
  deps: Deps,
  send: SendFn = webpush.sendNotification.bind(webpush),
  sendEmail: EmailSender = resendSend,
): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const secret = await deps.getPrivate('notify_secret');
  const given = req.headers.get('x-notify-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) return jsonResponse({ error: 'unauthorized' }, 401);

  let body: { action?: string; ids?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  if (body.action === 'init') {
    const { publicKey } = await ensureVapid(deps);
    return jsonResponse({ ok: true, vapid_public_key: publicKey });
  }

  // E-mail de TESTE pra um endereço escolhido (ver o resultado antes de
  // qualquer usuário real receber): mesmo modelo, mesma Resend, mesmo
  // remetente. Não grava nada em notification_emails.
  if (body.action === 'test_email') {
    const to = typeof (body as { to?: unknown }).to === 'string' ? (body as { to: string }).to.trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return jsonResponse({ error: 'invalid "to"' }, 400);
    const apiKey = await deps.getPrivate('resend_api_key');
    if (!apiKey) return jsonResponse({ error: 'resend_api_key ausente' }, 400);
    const from = (await deps.getPrivate('email_from')) || DEFAULT_FROM;
    const replyTo = (await deps.getPrivate('email_reply_to')) || undefined;
    const { subject, html, text } = buildEmail({
      type: 'auction_outbid',
      title: 'Seu lance foi coberto',
      body: 'Mega Charizard Y ex: novo lance de R$ 36,00. Para recobrir, o mínimo agora é R$ 36,72. (E-mail de TESTE — nenhum leilão real.)',
      data: { card_name: 'Mega Charizard Y ex', url: '/' },
    });
    const res = await sendEmail(
      { from, to, subject: `[TESTE] ${subject}`, html, text, ...(replyTo ? { reply_to: replyTo } : {}) },
      apiKey, `test-${crypto.randomUUID()}`,
    );
    return jsonResponse({ ok: res.ok, status: res.status, detail: res.detail ?? null, from }, res.ok ? 200 : 502);
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => Number.isInteger(x)) as number[] : [];
  if (!ids.length) return jsonResponse({ error: 'ids required' }, 400);

  const notifs = await deps.getNotifications(ids);
  if (!notifs.length) {
    return jsonResponse({ ok: true, notifications: 0, sent: 0, failed: 0, removed: 0, email: { enabled: false, sent: 0, skipped: 0, failed: 0 } });
  }

  // cada canal isolado: erro em um não impede o outro
  let push: PushSummary = { subscriptions: 0, sent: 0, failed: 0, removed: 0 };
  try {
    push = await dispatchPush(notifs, deps, send);
  } catch (err) {
    console.error('[notify-dispatch] push', (err as Error).message);
  }
  let email: EmailSummary = { enabled: false, sent: 0, skipped: 0, failed: 0 };
  try {
    email = await dispatchEmail(notifs, deps, sendEmail);
  } catch (err) {
    console.error('[notify-dispatch] email', (err as Error).message);
  }

  return jsonResponse({ ok: true, notifications: notifs.length, ...push, email });
}
