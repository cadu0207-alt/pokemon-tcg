// MyDeck — mk-payment-webhook. Lógica em handler.ts.
// Deploy com verify_jwt DESLIGADO (o Mercado Pago não manda JWT):
//   supabase functions deploy mk-payment-webhook --no-verify-jwt
// A defesa é: busca o pagamento no MP com o token da loja, confere external_reference e (opcional)
// assinatura x-signature com app_private_config('mp_webhook_secret').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type WDeps, handle } from './handler.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

async function priv(key: string): Promise<string | null> {
  const { data, error } = await sb.from('app_private_config').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error('app_private_config: ' + error.message);
  return (data as { value: string } | null)?.value ?? null;
}

const deps: WDeps = {
  fetch: (i, init) => fetch(i, init),
  getPrivate: priv,
  async getOrderToken(orderId) {
    const { data: o } = await sb.from('mk_orders').select('seller_id').eq('id', orderId).maybeSingle();
    if (!o) return null;
    const { data: s } = await sb.from('mk_seller_secrets').select('mp_access_token').eq('seller_id', (o as any).seller_id).maybeSingle();
    return (s as any)?.mp_access_token || (await priv('mp_access_token'));
  },
  async applyPayment(args) {
    const { data, error } = await sb.rpc('mk_apply_payment', args);
    if (error) throw new Error(error.message);
    return data;
  },
};

Deno.serve((req) => handle(req, deps));
