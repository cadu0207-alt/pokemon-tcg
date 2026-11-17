/**
 * Multijogador por temporadas (etapa 1) usando o Supabase e o login do MyDeck.
 * Como o jogo roda no mesmo domínio do site (mydecktcg.com.br/ilhas), a sessão do site já vale aqui.
 * Tabelas e regras de segurança: sql/ilhas_multijogador_17nov2026.sql (na raiz do repositório).
 */
import type { Construcao } from '../sim/construcao';

// Mesmo projeto Supabase do MyDeck (chave publicável: só funciona com as regras de RLS do banco).
const SUPABASE_URL = 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';

export interface Temporada { id: number; nome: string; seed: number; participantes: number; fim: string; }
export interface PerfilPublico {
  user_id: string; slot: number; nome: string; personagem: string;
  nivel: number; pontos: number; construcoes: Construcao[]; updated_at: string;
}

// cliente mínimo tipado do supabase-js (carregado por <script> do CDN, como no resto do site)
interface Resposta<T> { data: T; error: { message: string } | null }
interface Consulta<T> extends PromiseLike<Resposta<T>> {
  select(c: string): Consulta<T>; eq(c: string, v: unknown): Consulta<T>; gt(c: string, v: unknown): Consulta<T>;
  order(c: string, o?: object): Consulta<T>; limit(n: number): Consulta<T>; maybeSingle(): Consulta<T>;
  upsert(v: object): Consulta<T>; update(v: object): Consulta<T>;
}
interface Cliente {
  auth: { getSession(): Promise<{ data: { session: { user: { id: string; email?: string } } | null } }> };
  from<T = unknown>(t: string): Consulta<T>;
  rpc<T = unknown>(f: string, a: object): PromiseLike<Resposta<T>>;
}

export class Nuvem {
  private constructor(private c: Cliente, readonly userId: string, readonly email: string, readonly temporada: Temporada) {}
  slot = -1;

  /** Liga a nuvem se houver sessão do MyDeck e temporada ativa; senão devolve o motivo. */
  static async conectar(): Promise<Nuvem | { motivo: 'sem-supabase' | 'sem-login' | 'sem-temporada' | 'erro'; detalhe?: string }> {
    try {
      const sb = (window as unknown as { supabase?: { createClient(u: string, k: string): Cliente } }).supabase;
      if (!sb) return { motivo: 'sem-supabase' };
      const c = sb.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: { session } } = await c.auth.getSession();
      if (!session) return { motivo: 'sem-login' };
      const { data, error } = await c.from<Temporada>('ilhas_temporadas').select('id,nome,seed,participantes,fim')
        .eq('ativa', true).gt('fim', new Date().toISOString()).order('id', { ascending: false }).limit(1).maybeSingle();
      if (error) return { motivo: 'erro', detalhe: error.message };
      if (!data) return { motivo: 'sem-temporada' };
      return new Nuvem(c, session.user.id, session.user.email ?? '', data);
    } catch (e) {
      return { motivo: 'erro', detalhe: String(e) };
    }
  }

  /** Meu perfil na temporada, se já entrei. */
  async meuPerfil(): Promise<PerfilPublico | null> {
    const { data } = await this.c.from<PerfilPublico | null>('ilhas_jogadores').select('*')
      .eq('temporada_id', this.temporada.id).eq('user_id', this.userId).maybeSingle();
    if (data) this.slot = data.slot;
    return data;
  }

  /** Entra na temporada (ou devolve a ilha que já é sua). */
  async entrar(nome: string, personagem: string): Promise<number> {
    const { data, error } = await this.c.rpc<number>('ilhas_entrar', { p_temporada: this.temporada.id, p_nome: nome, p_personagem: personagem });
    if (error) throw new Error(error.message);
    this.slot = data;
    return data;
  }

  async carregarSave(): Promise<string | null> {
    const { data } = await this.c.from<{ data: unknown } | null>('ilhas_saves').select('data')
      .eq('temporada_id', this.temporada.id).eq('user_id', this.userId).maybeSingle();
    return data ? JSON.stringify(data.data) : null;
  }

  /** Todos os jogadores da temporada (inclui eu). */
  async jogadores(): Promise<PerfilPublico[]> {
    const { data, error } = await this.c.from<PerfilPublico[]>('ilhas_jogadores').select('*').eq('temporada_id', this.temporada.id);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private salvando = false;
  /** Salva o progresso privado e atualiza o perfil público. Ignora chamadas enquanto outra está em andamento. */
  async salvar(saveTexto: string, perfil: { nome: string; personagem: string; nivel: number; pontos: number; construcoes: Construcao[] }) {
    if (this.salvando) return;
    this.salvando = true;
    try {
      const agora = new Date().toISOString();
      const r1 = await this.c.from('ilhas_saves').upsert({ temporada_id: this.temporada.id, user_id: this.userId, data: JSON.parse(saveTexto), updated_at: agora });
      if (r1.error) console.warn('Ilhas: falha ao salvar na nuvem', r1.error.message);
      const r2 = await this.c.from('ilhas_jogadores').update({
        nome: perfil.nome.slice(0, 16), personagem: perfil.personagem, nivel: perfil.nivel, pontos: perfil.pontos,
        construcoes: perfil.construcoes.map(({ tipo, x, y }) => ({ tipo, x, y })), updated_at: agora,
      }).eq('temporada_id', this.temporada.id).eq('user_id', this.userId);
      if (r2.error) console.warn('Ilhas: falha ao atualizar o perfil', r2.error.message);
    } finally { this.salvando = false; }
  }
}
