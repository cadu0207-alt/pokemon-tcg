// ================================================================
// MyDeck — Supabase Edge Function: notify-dispatch
//
// Envia o Web Push de uma notificação (tabela `notifications`). Quem
// chama é o gatilho trg_notify_dispatch (notificacoes_push_setup_
// 02out2026.sql) via pg_net, logo depois do INSERT — ninguém no navegador.
//
// SEGURANÇA — verify_jwt desligado (o chamador é o próprio banco, não um
// usuário), então a função só aceita quem mandar o header
// `x-notify-secret` igual ao segredo guardado em app_private_config
// (gerado e lido só dentro do banco; não é a anon key, que é pública).
//
// Deploy:
//   supabase functions deploy notify-dispatch --no-verify-jwt
// Não precisa de `supabase secrets set`: chaves VAPID e segredo moram em
// app_private_config e a função gera o par VAPID sozinha na 1ª chamada
// com {"action":"init"}.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type Deps, handle } from './dispatch.ts';

const sb = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const deps: Deps = {
  async getPrivate(key) {
    const { data, error } = await sb.from('app_private_config').select('value').eq('key', key).maybeSingle();
    if (error) throw new Error('app_private_config: ' + error.message);
    return data?.value ?? null;
  },

  async saveVapid(publicKey, privateKey) {
    // ignoreDuplicates: se outra chamada já gravou o par, não sobrescreve
    const priv = await sb.from('app_private_config').upsert(
      [{ key: 'vapid_public_key', value: publicKey }, { key: 'vapid_private_key', value: privateKey }],
      { onConflict: 'key', ignoreDuplicates: true },
    );
    if (priv.error) throw new Error('saveVapid(private): ' + priv.error.message);
    const pub = await sb.from('app_public_config').upsert(
      [{ key: 'vapid_public_key', value: publicKey }],
      { onConflict: 'key', ignoreDuplicates: true },
    );
    if (pub.error) throw new Error('saveVapid(public): ' + pub.error.message);
  },

  async getNotifications(ids) {
    const { data, error } = await sb.from('notifications')
      .select('id,user_id,type,auction_id,title,body,data').in('id', ids);
    if (error) throw new Error('notifications: ' + error.message);
    return data ?? [];
  },

  async getSubscriptions(userIds) {
    const { data, error } = await sb.from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh_key,auth_key').in('user_id', userIds);
    if (error) throw new Error('push_subscriptions: ' + error.message);
    return data ?? [];
  },

  async deleteSubscriptions(ids) {
    const { error } = await sb.from('push_subscriptions').delete().in('id', ids);
    if (error) console.error('[notify-dispatch] limpando inscrições mortas:', error.message);
  },

  // ── e-mail ──
  async getEmailPrefs(userIds) {
    const { data, error } = await sb.from('notification_prefs')
      .select('user_id,email_enabled').in('user_id', userIds);
    if (error) throw new Error('notification_prefs: ' + error.message);
    return new Map((data ?? []).map((r: { user_id: string; email_enabled: boolean }) => [r.user_id, r.email_enabled]));
  },

  async getUserEmail(userId) {
    const { data, error } = await sb.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    // só e-mail confirmado: evita mandar aviso pra endereço digitado errado
    return data.user.email && data.user.email_confirmed_at ? data.user.email : null;
  },

  async claimEmails(rows) {
    // ON CONFLICT DO NOTHING + RETURNING devolve só o que foi inserido AGORA:
    // uma chamada repetida (retry do pg_net) não reserva de novo => não reenvia
    const { data, error } = await sb.from('notification_emails')
      .upsert(rows, { onConflict: 'notification_id', ignoreDuplicates: true })
      .select('notification_id');
    if (error) throw new Error('notification_emails(claim): ' + error.message);
    return new Set<number>((data ?? []).map((r: { notification_id: number }) => r.notification_id));
  },

  async countRecentEmails(userId, auctionId, type, sinceIso, excludeId) {
    const { count, error } = await sb.from('notification_emails')
      .select('notification_id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('auction_id', auctionId).eq('type', type)
      .neq('notification_id', excludeId).gte('created_at', sinceIso)
      .in('status', ['sent', 'pending']);
    if (error) throw new Error('notification_emails(count): ' + error.message);
    return count ?? 0;
  },

  async finishEmail(notificationId, status, detail) {
    const { error } = await sb.from('notification_emails')
      .update({ status, detail: detail ?? null }).eq('notification_id', notificationId);
    if (error) console.error('[notify-dispatch] registrando e-mail:', error.message);
  },
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (err) {
    console.error('[notify-dispatch]', err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
