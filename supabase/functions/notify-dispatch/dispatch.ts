// ================================================================
// MyDeck — notify-dispatch: lógica de envio (testável sem Supabase)
//
// index.ts liga isto ao banco e ao Deno.serve; os testes trocam as
// dependências (Deps) por versões falsas e um servidor de push de mentira.
// ================================================================

import webpush from 'npm:web-push@3.6.7';

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

export interface Deps {
  getPrivate(key: string): Promise<string | null>;
  // grava o par VAPID: privada em app_private_config, pública também em
  // app_public_config (o navegador precisa dela pra se inscrever)
  saveVapid(publicKey: string, privateKey: string): Promise<void>;
  getNotifications(ids: number[]): Promise<Notif[]>;
  getSubscriptions(userIds: string[]): Promise<Sub[]>;
  deleteSubscriptions(ids: number[]): Promise<void>;
}

// https:// ou mailto: — o push service usa só como contato, nunca é e-mail pessoal
const VAPID_SUBJECT = 'https://mydecktcg.com.br';
const SEND_CONCURRENCY = 10;
// aviso de lance perde a utilidade rápido: se o aparelho ficar offline mais
// de 1h, é melhor nem entregar
const TTL_SECONDS = 3600;

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

export async function handle(
  req: Request,
  deps: Deps,
  send: SendFn = webpush.sendNotification.bind(webpush),
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

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => Number.isInteger(x)) as number[] : [];
  if (!ids.length) return jsonResponse({ error: 'ids required' }, 400);

  const notifs = await deps.getNotifications(ids);
  if (!notifs.length) return jsonResponse({ ok: true, notifications: 0, sent: 0, failed: 0, removed: 0 });

  const subs = await deps.getSubscriptions([...new Set(notifs.map((n) => n.user_id))]);
  const subsByUser = new Map<string, Sub[]>();
  for (const s of subs) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  const jobs: Array<{ n: Notif; s: Sub }> = [];
  for (const n of notifs) for (const s of subsByUser.get(n.user_id) ?? []) jobs.push({ n, s });
  if (!jobs.length) {
    return jsonResponse({ ok: true, notifications: notifs.length, sent: 0, failed: 0, removed: 0 });
  }

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

  return jsonResponse({
    ok: true,
    notifications: notifs.length,
    subscriptions: jobs.length,
    sent,
    failed,
    removed: dead.size,
  });
}
