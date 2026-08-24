// ================================================================
// MyDeck — Cadastro Positivo de Empresas (positivo.js)
// Vitrine de lojas que, até onde conseguimos verificar, vendem
// produtos de Pokémon TCG a preço tabelado ou abaixo. Qualquer
// usuário logado pode indicar uma loja — fica pendente até
// aprovação manual (admin). Reaproveita sbClient, currentUser,
// uid(), setStatus(), isAdmin() já definidos em app.js/lojas.js.
//
// Carregado depois de marketplace.js — reutiliza os mesmos estilos
// .mkt-* (painel de Lojas Confiáveis) pra não precisar de CSS novo.
// ================================================================

let positiveCompanies = [];
let companyReviews = {};      // companyId -> [review, ...]
let myReviewByCompany = {};   // companyId -> minha própria avaliação (se já avaliei)

// ── CARREGAR ────────────────────────────────────────────────────
async function loadPositiveCompanies() {
  if (!sbClient) return;
  const { data, error } = await sbClient.from('positive_companies')
    .select('*').order('created_at', { ascending: false });
  if (error) { console.error('[positive_companies load]', error); positiveCompanies = []; return; }
  positiveCompanies = Array.isArray(data) ? data : [];
}

async function loadCompanyReviews() {
  companyReviews = {}; myReviewByCompany = {};
  const ids = positiveCompanies.map(c => c.id);
  if (!sbClient || !ids.length) return;
  const { data, error } = await sbClient.from('company_reviews').select('*').in('company_id', ids);
  if (error) { console.error('[company_reviews load]', error); return; }
  const me = uid();
  (data || []).forEach(r => {
    (companyReviews[r.company_id] = companyReviews[r.company_id] || []).push(r);
    if (me && r.user_id === me) myReviewByCompany[r.company_id] = r;
  });
}

function renderPositivo() {
  const wrap = document.getElementById('positivo-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="sec-title" style="margin-bottom:16px">✅ Cadastro Positivo de Empresas</div>

    <!-- BANNER — bem visível, primeiro que tudo -->
    <div style="margin-bottom:22px;padding:20px 24px;border-radius:16px;position:relative;overflow:hidden;
      background:linear-gradient(135deg, rgba(255,209,102,.14), rgba(6,214,160,.10) 60%, rgba(230,57,70,.08));
      border:1px solid var(--gold);box-shadow:0 6px 28px rgba(255,209,102,.12);
      display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="font-size:38px;line-height:1;filter:drop-shadow(0 2px 6px rgba(255,209,102,.4))">🏆</div>
      <div style="flex:1;min-width:220px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1.5px;color:var(--gold);text-transform:uppercase">
          Lojas com Preços Recomendados
        </div>
        <div style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:4px;line-height:1.5">
          Preço tabelado ou abaixo — <b style="color:var(--teal)">avaliações e preços informados pelos próprios usuários</b>
          da comunidade, não por nós. Ninguém aqui garante preço eterno; é um retrato do que a galera já viu e comprou.
        </div>
      </div>
    </div>

    <div class="sec-title" style="margin-top:4px">🏪 Lojas Verificadas</div>
    <div id="pc-active-list" class="mkt-store-list"></div>

    <!-- ADMIN 11/08/2026: aprovações pendentes saíram daqui e viraram parte
         da aba Admin (pc-pending-wrap/pc-pending-list ficam lá agora) —
         renderPositiveLists() continua achando os elementos por id. -->

    <div class="sec-title" style="margin-top:28px">📋 Indicar uma Loja</div>
    <div class="mkt-grid" style="grid-template-columns:1fr;max-width:520px">
      <div class="panel">
        <div class="panel-t">📋 Indicar uma Loja</div>
        <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:12px">
          Nome + pelo menos um contato (Instagram, TikTok ou site) são obrigatórios.
          Fica pendente até aprovação.
        </div>
        <div class="ff"><label>Nome da loja</label><input id="pc-nome"></div>
        <div class="ff"><label>Instagram</label><input id="pc-instagram" placeholder="@usuario ou link"></div>
        <div class="ff"><label>TikTok</label><input id="pc-tiktok" placeholder="@usuario ou link"></div>
        <div class="ff"><label>Site</label><input id="pc-site" placeholder="https://..."></div>
        <div class="ff"><label>Cidade</label><input id="pc-cidade"></div>
        <div class="ff"><label>UF</label><input id="pc-uf" placeholder="SP" maxlength="2" style="text-transform:uppercase"></div>
        <div class="ff"><label>Contato do dono (opcional)</label><input id="pc-contato" placeholder="Nome / WhatsApp — visível só pro admin"></div>
        <div class="ff"><label>Observações (opcional)</label><input id="pc-obs" placeholder="Ex: onde viu o preço, produto específico..."></div>
        <button class="btn-add" onclick="submitPositiveCompany()">✓ Enviar Indicação</button>
        <div id="pc-status" style="font-size:10px;color:var(--teal);font-family:'Space Mono',monospace;margin-top:8px"></div>
      </div>
    </div>
  `;
  loadPositiveCompanies()
    .then(loadCompanyReviews)
    .then(renderPositiveLists)
    .catch(e => console.error('[positivo] erro ao carregar', e));
}

// ── HELPERS ─────────────────────────────────────────────────────
function pcNormalizeLink(v, kind) {
  v = (v || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '');
  if (kind === 'instagram') return 'https://www.instagram.com/' + handle;
  if (kind === 'tiktok') return 'https://www.tiktok.com/@' + handle;
  return 'https://' + v;
}

function pcLinkPill(url, label) {
  if (!url) return '';
  return `<a href="${url}" target="_blank" rel="noopener"
    style="font-size:10px;font-family:'Space Mono',monospace;padding:4px 10px;border-radius:20px;
    border:1px solid var(--teal);color:var(--teal);text-decoration:none;white-space:nowrap">${label}</a>`;
}

function pcStars(avg) {
  const full = Math.max(0, Math.min(5, Math.round(avg || 0)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function pcReviewStats(companyId) {
  const list = companyReviews[companyId] || [];
  if (!list.length) return null;
  const avg = list.reduce((s, r) => s + r.nota, 0) / list.length;
  const comPreco = list.filter(r => r.preco_sugerido != null && r.preco_sugerido > 0);
  const avgPreco = comPreco.length ? comPreco.reduce((s, r) => s + Number(r.preco_sugerido), 0) / comPreco.length : null;
  return {
    avg, count: list.length,
    elogios: list.filter(r => r.tipo === 'elogio').length,
    reclamacoes: list.filter(r => r.tipo === 'reclamacao').length,
    avgPreco, precoCount: comPreco.length
  };
}

function pcFmtBRL(v) {
  return 'R$ ' + (+v || 0).toFixed(2).replace('.', ',');
}

// Bloco de nota + elogio/reclamação — só aparece nas lojas já ativas
// (não faz sentido avaliar uma indicação ainda pendente de checagem).
function pcReviewsBlock(c) {
  const stats = pcReviewStats(c.id);
  const mine = myReviewByCompany[c.id];
  const statsLine = stats
    ? `<div class="mkt-store-meta">${pcStars(stats.avg)} ${stats.avg.toFixed(1)} · ${stats.count} avaliaç${stats.count > 1 ? 'ões' : 'ão'} (👍 ${stats.elogios} · 👎 ${stats.reclamacoes})</div>`
    : `<div class="mkt-store-meta">Ainda sem avaliações.</div>`;
  const precoLine = stats && stats.avgPreco
    ? `<div class="mkt-store-meta" style="color:var(--gold)">💰 Preço médio sugerido: ${pcFmtBRL(stats.avgPreco)} (${stats.precoCount} avaliaç${stats.precoCount > 1 ? 'ões' : 'ão'})</div>`
    : '';

  return `
    ${statsLine}
    ${precoLine}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${stats ? `<button class="cv-item-remove" style="color:var(--muted);border-color:var(--muted)" onclick="pcToggleReviewsList('${c.id}')">💬 Ver avaliações</button>` : ''}
      <button class="cv-item-remove" style="color:var(--gold);border-color:var(--gold)" onclick="pcToggleReviewForm('${c.id}')">⭐ ${mine ? 'Editar minha avaliação' : 'Avaliar'}</button>
    </div>
    <div id="pc-reviews-list-${c.id}" style="display:none;margin-top:8px"></div>
    <div id="pc-review-form-${c.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div class="ff"><label>Nota</label>
        <select id="pc-nota-${c.id}">
          <option value="5" ${mine && mine.nota === 5 ? 'selected' : ''}>★★★★★ (5)</option>
          <option value="4" ${mine && mine.nota === 4 ? 'selected' : ''}>★★★★☆ (4)</option>
          <option value="3" ${mine && mine.nota === 3 ? 'selected' : ''}>★★★☆☆ (3)</option>
          <option value="2" ${mine && mine.nota === 2 ? 'selected' : ''}>★★☆☆☆ (2)</option>
          <option value="1" ${mine && mine.nota === 1 ? 'selected' : ''}>★☆☆☆☆ (1)</option>
        </select>
      </div>
      <div class="ff"><label>Tipo</label>
        <select id="pc-tipo-${c.id}">
          <option value="elogio" ${!mine || mine.tipo === 'elogio' ? 'selected' : ''}>👍 Elogio</option>
          <option value="reclamacao" ${mine && mine.tipo === 'reclamacao' ? 'selected' : ''}>👎 Reclamação</option>
        </select>
      </div>
      <div class="ff"><label>Preço sugerido (opcional) — o que você pagou ou viu de bom lá</label>
        <input type="number" id="pc-preco-${c.id}" step="0.01" min="0" placeholder="Ex: 24.90"
          value="${mine && mine.preco_sugerido != null ? mine.preco_sugerido : ''}">
      </div>
      <div class="ff"><label>Comentário (opcional)</label>
        <textarea id="pc-comentario-${c.id}" rows="3" style="width:100%;resize:vertical">${mine && mine.comentario ? mine.comentario : ''}</textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-add" style="padding:5px 10px;font-size:10px" onclick="submitCompanyReview('${c.id}')">✓ Enviar</button>
        <button class="cv-item-remove" onclick="pcToggleReviewForm('${c.id}')">Cancelar</button>
      </div>
      <div id="pc-review-status-${c.id}" style="font-size:10px;color:var(--teal);font-family:'Space Mono',monospace;margin-top:6px"></div>
    </div>
  `;
}

function pcToggleReviewForm(id) {
  if (!uid()) { alert('Faça login para avaliar uma loja.'); return; }
  const el = document.getElementById('pc-review-form-' + id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function pcToggleReviewsList(id) {
  const el = document.getElementById('pc-reviews-list-' + id);
  if (!el) return;
  if (el.style.display === 'none') {
    const list = (companyReviews[id] || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    el.innerHTML = list.map(r => `
      <div style="padding:8px 0;border-top:1px solid var(--border);font-size:10.5px;font-family:'Space Mono',monospace">
        <div>${pcStars(r.nota)} <span style="color:${r.tipo === 'elogio' ? 'var(--teal)' : 'var(--accent)'}">${r.tipo === 'elogio' ? '👍 Elogio' : '👎 Reclamação'}</span>
          ${r.preco_sugerido != null ? ` · <span style="color:var(--gold)">💰 ${pcFmtBRL(r.preco_sugerido)}</span>` : ''}</div>
        ${r.comentario ? `<div style="color:var(--muted);margin-top:4px">${r.comentario}</div>` : ''}
      </div>
    `).join('') || '<div class="cv-item-empty" style="padding:12px">Nenhum comentário ainda.</div>';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function submitCompanyReview(id) {
  if (!uid()) { alert('Faça login para avaliar uma loja.'); return; }
  const statusEl = document.getElementById('pc-review-status-' + id);
  const nota = parseInt(document.getElementById('pc-nota-' + id).value, 10);
  const tipo = document.getElementById('pc-tipo-' + id).value;
  const comentario = document.getElementById('pc-comentario-' + id).value.trim();
  const precoRaw = document.getElementById('pc-preco-' + id).value.trim();
  const preco = precoRaw ? parseFloat(precoRaw) : null;
  const payload = {
    company_id: id, user_id: uid(), nota, tipo,
    preco_sugerido: (preco != null && !isNaN(preco) && preco > 0) ? preco : null,
    comentario: comentario || null, updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from('company_reviews').upsert(payload, { onConflict: 'company_id,user_id' });
  if (error) {
    console.error('[company_reviews upsert]', error);
    if (statusEl) statusEl.textContent = 'Erro ao enviar. Verifique se rodou positivo_reviews_setup.sql no Supabase.';
    return;
  }
  if (statusEl) statusEl.textContent = '✓ Avaliação enviada!';
  setStatus('Avaliação enviada', 'ok');
  await loadCompanyReviews();
  renderPositiveLists();
}

function positiveCompanyCard(c, { pending } = {}) {
  const links = [
    pcLinkPill(c.instagram, '📷 Instagram'),
    pcLinkPill(c.tiktok, '🎵 TikTok'),
    pcLinkPill(c.site, '🌐 Site')
  ].filter(Boolean).join(' ');
  return `<div class="mkt-store-card">
    <div class="mkt-store-top">
      <div class="mkt-store-name">${c.nome}</div>
      <span class="mkt-store-badge mkt-badge-${c.status}">${c.status}</span>
    </div>
    ${(c.cidade || c.uf) ? `<div class="mkt-store-meta">${[c.cidade, c.uf].filter(Boolean).join(' — ')}</div>` : ''}
    ${c.observacoes ? `<div class="mkt-store-meta">${c.observacoes}</div>` : ''}
    ${pending && c.contato_dono ? `<div class="mkt-store-meta">Contato do dono: ${c.contato_dono}</div>` : ''}
    ${links ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${links}</div>` : ''}
    ${!pending ? pcReviewsBlock(c) : ''}
    ${pending && typeof hasPerm === 'function' && hasPerm('positivo') ? `<div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-add" style="padding:5px 10px;font-size:10px" onclick="approvePositiveCompany('${c.id}')">✓ Aprovar</button>
      <button class="cv-item-remove" onclick="rejectPositiveCompany('${c.id}')">Rejeitar</button>
    </div>` : ''}
  </div>`;
}

function renderPositiveLists() {
  const activeWrap = document.getElementById('pc-active-list');
  const pendingWrap = document.getElementById('pc-pending-wrap');
  const pendingList = document.getElementById('pc-pending-list');
  if (!activeWrap) return;

  const active = positiveCompanies.filter(c => c.status === 'ativa');
  activeWrap.innerHTML = active.length
    ? active.map(c => positiveCompanyCard(c)).join('')
    : `<div class="cv-item-empty">Nenhuma loja verificada ainda.</div>`;

  const admin = typeof isAdmin === 'function' && isAdmin();
  const pending = positiveCompanies.filter(c => c.status === 'pendente');
  // Badge de pendência na seção da aba Admin (admin_panel.js/applyAdminSectionStates)
  window.__adminPositivoPending = pending.length;
  if (admin && pending.length) {
    pendingWrap.style.display = 'block';
    pendingList.innerHTML = pending.map(c => positiveCompanyCard(c, { pending: true })).join('');
  } else if (pendingWrap) {
    pendingWrap.style.display = 'none';
  }
}

// ── ENVIAR INDICAÇÃO ────────────────────────────────────────────
async function submitPositiveCompany() {
  if (!uid()) { alert('Faça login para indicar uma loja.'); return; }
  const statusEl = document.getElementById('pc-status');
  const nome = document.getElementById('pc-nome').value.trim();
  const instagram = pcNormalizeLink(document.getElementById('pc-instagram').value, 'instagram');
  const tiktok = pcNormalizeLink(document.getElementById('pc-tiktok').value, 'tiktok');
  const site = pcNormalizeLink(document.getElementById('pc-site').value, 'site');
  const cidade = document.getElementById('pc-cidade').value.trim();
  const uf = document.getElementById('pc-uf').value.trim().toUpperCase();
  const contato = document.getElementById('pc-contato').value.trim();
  const obs = document.getElementById('pc-obs').value.trim();

  if (!nome || (!instagram && !tiktok && !site)) {
    if (statusEl) statusEl.textContent = 'Preencha o nome e pelo menos um contato (Instagram, TikTok ou site).';
    return;
  }

  const payload = {
    submitted_by: uid(), nome,
    instagram: instagram || null, tiktok: tiktok || null, site: site || null,
    cidade: cidade || null, uf: uf || null,
    contato_dono: contato || null, observacoes: obs || null,
    status: 'pendente'
  };
  const { error } = await sbClient.from('positive_companies').insert(payload);
  if (error) {
    console.error('[positive_companies insert]', error);
    if (statusEl) statusEl.textContent = 'Erro ao enviar. Verifique se rodou positivo_setup.sql no Supabase.';
    return;
  }
  if (statusEl) statusEl.textContent = '✓ Indicação enviada! Fica pendente até aprovação.';
  setStatus('Loja indicada — aguardando aprovação', 'ok');
  ['pc-nome', 'pc-instagram', 'pc-tiktok', 'pc-site', 'pc-cidade', 'pc-uf', 'pc-contato', 'pc-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  await loadPositiveCompanies();
  renderPositiveLists();
}

// ── APROVAÇÃO (admin) ───────────────────────────────────────────
async function approvePositiveCompany(id) {
  if (typeof hasPerm !== 'function' || !hasPerm('positivo')) return;
  const { error } = await sbClient.from('positive_companies')
    .update({ status: 'ativa', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('[positive_companies approve]', error); alert('Não foi possível aprovar.'); return; }
  await loadPositiveCompanies(); renderPositiveLists();
}

async function rejectPositiveCompany(id) {
  if (typeof hasPerm !== 'function' || !hasPerm('positivo')) return;
  const { error } = await sbClient.from('positive_companies')
    .update({ status: 'rejeitada', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('[positive_companies reject]', error); alert('Não foi possível rejeitar.'); return; }
  await loadPositiveCompanies(); renderPositiveLists();
}
