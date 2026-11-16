// ================================================================
// MyDeck — Marketplace · base (mk_core.js) — 15/10/2026
//
// Estado compartilhado, rótulos, formatação, carga de dados e envio de fotos da Loja Toybox (primeira loja do
// marketplace). Banco: mk_base_15out2026.sql (tabelas mk_*, estoque só por funções, fotos no bucket mk-products).
// Telas: mk_store.js (vitrine pública) e mk_panel.js (painel do lojista). Carregue nesta ordem, depois de app.js
// (sbClient, uid, hasPerm).
// ================================================================

const MK_SLUG = 'toybox';           // por enquanto só uma loja; o resto já aceita várias (ver slug em mk_sellers)
const MK_BUCKET = 'mk-products';
const MK_IMG_MAX_SIDE = 1400;       // lado maior da foto enviada (px) — o resto do peso vem da conversão pra WebP
const MK_IMG_MAX_INPUT = 25 * 1024 * 1024;
const MK_MAX_PHOTOS = 6;

const mk = {
  seller: null,        // linha de mk_sellers
  products: [],        // produtos (com .images e .stock embutidos)
  isMember: false,     // dono/gerente/estoque ou admin
  isOwner: false,      // dono ou admin (equipe)
  isAdmin: false,
  view: 'store',       // 'store' | 'panel'
  panelTab: 'produtos',
  loading: false,
  loaded: false,
  loadedFor: null,     // uid com que carregou (recarrega se trocar de conta)
  error: null,
  filters: { q: '', kind: 'todos', sort: 'recentes', onlyStock: false, setId: null },
  panelFilters: { q: '', status: 'todos' },
};

const MK_KIND_LBL = { carta: 'Carta avulsa', selado: 'Produto selado', acessorio: 'Acessório', outro: 'Outro' };
const MK_KIND_ICON = { carta: '🃏', selado: '📦', acessorio: '🛡️', outro: '🧸' };
const MK_STATUS_LBL = { rascunho: 'Rascunho', ativo: 'Ativo', pausado: 'Pausado', arquivado: 'Arquivado' };
const MK_COND_LBL = { M: 'Mint', NM: 'Quase nova (NM)', MP: 'Levemente jogada (MP)', HP: 'Jogada (HP)', D: 'Danificada (D)' };
const MK_LANG_LBL = { 'pt-BR': '🇧🇷 Português', en: '🇺🇸 Inglês', ja: '🇯🇵 Japonês', zh: '🇨🇳 Chinês' };
const MK_VER_LBL = { N: 'Normal', F: 'Holo/Foil', RH: 'Reverse Holo', SP: 'Especial/Secreta' };

// ── helpers ─────────────────────────────────────────────────────────
function mkEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function mkMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// só http(s) entra em href/src vindos do banco
function mkSafeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}
function mkDigits(s) { return String(s == null ? '' : s).replace(/\D+/g, ''); }
function mkParseMoney(s) {
  const t = String(s == null ? '' : s).trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function mkMoneyInput(v) { return v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','); }

let mkToastTimer = null;
function mkToast(msg, isError) {
  let el = document.getElementById('mk-toast');
  if (!el) { el = document.createElement('div'); el.id = 'mk-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'mk-toast show' + (isError ? ' mk-toast-err' : '');
  clearTimeout(mkToastTimer);
  mkToastTimer = setTimeout(function () { el.classList.remove('show'); }, isError ? 5000 : 2600);
}

function mkCover(p) {
  const imgs = (p.images || []).slice().sort(function (a, b) { return a.position - b.position; });
  return imgs.length ? imgs[0].url : '';
}
// "novidade" = publicado há menos de 7 dias (published_at é carimbado pelo banco na 1ª publicação)
function mkIsNew(p) {
  const t = Date.parse(p.published_at || '');
  return Number.isFinite(t) && Date.now() - t < 7 * 86400000;
}
function mkQty(p) { return p.stock ? Number(p.stock.qty_available) || 0 : 0; }
function mkReserved(p) { return p.stock ? Number(p.stock.qty_reserved) || 0 : 0; }

// ── dados ───────────────────────────────────────────────────────────
// quem chamar enquanto já está carregando espera a MESMA carga (a vitrine e os banners podem pedir juntos)
let mkLoadPromise = null;
function mkLoadAll(force) {
  if (mkLoadPromise) return mkLoadPromise;
  mkLoadPromise = mkLoadAllImpl(force).finally(function () { mkLoadPromise = null; });
  return mkLoadPromise;
}
async function mkLoadAllImpl(force) {
  if (mk.loading) return;
  const me = (typeof uid === 'function' && uid()) || null;
  if (mk.loaded && !force && mk.loadedFor === me) return;
  mk.loading = true; mk.error = null;
  try {
    const { data: seller, error: e1 } = await sbClient.from('mk_sellers').select('*').eq('slug', MK_SLUG).maybeSingle();
    if (e1) throw e1;
    mk.seller = seller || null;
    mk.isMember = mk.isOwner = mk.isAdmin = false;
    mk.products = [];
    if (seller) {
      if (me) {
        const [m, o, a] = await Promise.all([
          sbClient.rpc('mk_is_member', { p_seller: seller.id }),
          sbClient.rpc('mk_is_owner', { p_seller: seller.id }),
          sbClient.rpc('mk_is_admin'),
        ]);
        mk.isMember = m.data === true; mk.isOwner = o.data === true; mk.isAdmin = a.data === true;
      }
      const { data: prods, error: e2 } = await sbClient.from('mk_products')
        .select('*, images:mk_product_images(id,url,path,position), stock:mk_stock(qty_available,qty_reserved)')
        .eq('seller_id', seller.id).order('created_at', { ascending: false }).limit(500);
      if (e2) throw e2;
      mk.products = (prods || []).map(function (p) {
        // mk_stock é 1-pra-1: o PostgREST devolve objeto (ou lista de 1, conforme a versão)
        if (Array.isArray(p.stock)) p.stock = p.stock[0] || null;
        p.images = (p.images || []).sort(function (a, b) { return a.position - b.position; });
        return p;
      });
    }
    mk.loaded = true; mk.loadedFor = me;
  } catch (err) {
    console.error('[mk] carga', err);
    mk.error = (err && err.message) || 'Erro ao carregar a loja.';
  } finally {
    mk.loading = false;
  }
}

// ── foto: reduz e converte pra WebP no navegador antes de enviar ────────────────────
async function mkPrepareImage(file) {
  let bmp = null;
  if (window.createImageBitmap) { try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; } }
  if (!bmp) {
    bmp = await new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não consegui ler essa imagem.')); };
      img.src = url;
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  if (!w0 || !h0) throw new Error('Imagem inválida.');
  const scale = Math.min(1, MK_IMG_MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) { try { bmp.close(); } catch (e) { /* ok */ } }
  const toBlob = function (type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); };
  let blob = await toBlob('image/webp', 0.86);
  let type = 'image/webp', ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg', 0.88); type = 'image/jpeg'; ext = 'jpg'; }
  if (!blob) throw new Error('Não consegui converter a imagem.');
  return { blob: blob, type: type, ext: ext };
}

// envia pra <id da loja>/<arquivo> e devolve { path, url }
async function mkUploadImage(file, prefix) {
  if (!file || !/^image\/(jpeg|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.type || '')) {
    throw new Error('Escolha uma imagem (JPG, PNG ou WebP).');
  }
  if (file.size > MK_IMG_MAX_INPUT) throw new Error('Imagem grande demais (máx. 25 MB).');
  const prep = await mkPrepareImage(file);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = mk.seller.id + '/' + (prefix || 'p') + '-' + Date.now() + '-' + rand + '.' + prep.ext;
  const { error } = await sbClient.storage.from(MK_BUCKET).upload(path, prep.blob, {
    contentType: prep.type, cacheControl: '31536000', upsert: false,
  });
  if (error) throw new Error(error.message || 'Falha no envio da foto.');
  const url = sbClient.storage.from(MK_BUCKET).getPublicUrl(path).data.publicUrl;
  return { path: path, url: url, size: prep.blob.size };
}
async function mkRemoveStorage(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try { await sbClient.storage.from(MK_BUCKET).remove(list); } catch (e) { /* sobra arquivo órfão, sem impacto */ }
}

// ── modal simples (usado pela vitrine e pelo painel) ────────────────────────────────
function mkOpenModal(html, opts) {
  mkCloseModal();
  const wrap = document.createElement('div');
  wrap.id = 'mk-modal';
  wrap.className = 'mk-modal';
  wrap.innerHTML = '<div class="mk-modal-box' + (opts && opts.wide ? ' mk-modal-wide' : '') + '" role="dialog" aria-modal="true">' +
    '<button type="button" class="mk-modal-x" aria-label="Fechar" onclick="mkCloseModal()">✕</button>' + html + '</div>';
  wrap.addEventListener('mousedown', function (e) { if (e.target === wrap && !(opts && opts.sticky)) mkCloseModal(); });
  document.body.appendChild(wrap);
  document.body.classList.add('mk-modal-open');
  return wrap;
}
function mkCloseModal() {
  const m = document.getElementById('mk-modal');
  if (m) m.remove();
  document.body.classList.remove('mk-modal-open');
  if (typeof mkOnModalClosed === 'function') mkOnModalClosed();
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.getElementById('mk-modal')) mkCloseModal();
});

window.mkCloseModal = mkCloseModal;
