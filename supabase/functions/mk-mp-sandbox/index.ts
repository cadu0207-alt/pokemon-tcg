// MyDeck — mk-mp-sandbox (Fase 0 do marketplace). Ver handler.ts.
// Deploy: verify_jwt DESLIGADO (o retorno do OAuth vem do navegador; as ações exigem x-notify-secret).
//   supabase functions deploy mk-mp-sandbox --no-verify-jwt
// Apague a função e as chaves mp_sandbox_* de app_private_config quando a Fase 0 terminar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type Deps, handle } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

const deps: Deps = {
  async getPrivate(key) {
    const { data, error } = await sb.from('app_private_config').select('value').eq('key', key).maybeSingle();
    if (error) throw new Error('app_private_config: ' + error.message);
    return data?.value ?? null;
  },
  async setPrivate(key, value) {
    const { error } = await sb.from('app_private_config').upsert([{ key, value }], { onConflict: 'key' });
    if (error) throw new Error('app_private_config(set): ' + error.message);
  },
  async deletePrivate(key) {
    await sb.from('app_private_config').delete().eq('key', key);
  },
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
  siteUrl: 'https://mydecktcg.com.br',
  functionUrl: `${SUPABASE_URL}/functions/v1/mk-mp-sandbox`,
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (err) {
    console.error('[mk-mp-sandbox]', err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
