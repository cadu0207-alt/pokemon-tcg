// ================================================================
// MyDeck — Admin · Conteúdo da aba Início (home_content_admin.js)
// Criado 23/08/2026: painel dentro da aba Admin pra publicar Notícias,
// Vídeos da Comunidade, Links Úteis e artigos da Revista MyDeck — só
// pra quem tem hasPerm('inicio') (staff_access.js — hoje: Eduardo,
// e quem for marcado com essa área depois que o SQL rodar).
//
// REVISADO 24/08/2026 (pedido do Eduardo):
// - Notícia agora tem título (obrigatório) e subtítulo (opcional) além
//   do texto — vira "matéria" de verdade em vez de um textarea solto.
//   Ver home_content_news_title_24ago2026.sql (colunas novas em
//   pokemon_news) e a tela de leitura em inicio.js (openInicioArticle).
// - Escape de HTML (hcEsc) em todo texto exibido nas listas deste painel
//   — mesmo problema de XSS corrigido em inicio.js, aplicado aqui também
//   por consistência (o painel é só-admin, mas o texto pode ter vindo de
//   um valor colado com HTML).
//
// Depende de sbClient/currentUser (app.js) e hasPerm() (staff_access.js)
// — carrega depois dos dois. Back-end: home_content_setup.sql +
// home_content_news_title_24ago2026.sql.
// ================================================================

// Duplicado de inicioEsc() (inicio.js) de propósito — este arquivo não deve
// depender da ordem de carregamento de inicio.js pra funcionar sozinho.
function hcEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Corta no espaço mais próximo, não no meio da palavra (mesmo ajuste de
// inicioTruncate em inicio.js, 24/08/2026).
function hcTruncate(s, max) {
  const str = String(s == null ? '' : s);
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

function renderHomeContentAdmin() {
  const holder = document.getElementById('home-content-admin-wrap');
  if (!holder) return;
  if (typeof hasPerm !== 'function' || !hasPerm('inicio')) { holder.innerHTML = ''; return; }

  holder.innerHTML =
    '<div class="hc-block">' +
      '<div class="hc-block-title">Notícia do mundo Pokémon</div>' +
      '<div class="hc-block-hint">Título obrigatório, subtítulo opcional — vira a matéria que abre no feed. Imagem ou vídeo (YouTube/TikTok tocam embutidos) são opcionais. Dica: com "Imagem" escolhida você pode enviar o arquivo, arrastar a foto pra cá ou colar uma imagem copiada (Ctrl+V).</div>' +
      '<input id="hc-news-title" placeholder="Título da matéria" maxlength="140">' +
      '<input id="hc-news-subtitle" placeholder="Subtítulo (opcional)" maxlength="200">' +
      '<textarea id="hc-news-body" placeholder="Texto da notícia..." maxlength="4000"></textarea>' +
      '<div class="hc-row">' +
        '<select id="hc-news-media-type" onchange="hcToggleNewsMediaInput()">' +
          '<option value="none">Sem mídia</option>' +
          '<option value="image">Imagem</option>' +
          '<option value="video">Vídeo (URL — YouTube/TikTok tocam embutidos, outros só linkam)</option>' +
        '</select>' +
        '<input id="hc-news-media-url" placeholder="URL do vídeo" style="display:none" oninput="hcNewsUrlChanged()">' +
        '<button class="btn-mini" id="hc-news-publish-btn" onclick="hcPublishNews()">📨 Publicar notícia</button>' +
      '</div>' +
      // Envio de imagem (09/10/2026): só aparece com "Imagem" escolhida
      '<div id="hc-news-img-box" class="hc-img-box" style="display:none">' +
        '<div class="hc-row">' +
          '<button type="button" class="btn-mini" onclick="document.getElementById(\'hc-news-img-file\').click()">📷 Escolher imagem</button>' +
          '<input type="file" id="hc-news-img-file" accept="image/*" style="display:none" onchange="hcNewsImgPicked(this)">' +
          '<span class="hc-img-or">ou arraste/cole (Ctrl+V) a imagem aqui, ou use o link:</span>' +
        '</div>' +
        '<div id="hc-news-img-status" class="hc-img-status"></div>' +
        '<div id="hc-news-img-preview" class="hc-img-preview"></div>' +
      '</div>' +
      '<div id="hc-news-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Vídeo da comunidade</div>' +
      '<div class="hc-row">' +
        '<select id="hc-video-platform"><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select>' +
        '<input id="hc-video-url" placeholder="URL do vídeo">' +
      '</div>' +
      '<div class="hc-row">' +
        '<input id="hc-video-title" placeholder="Título/legenda" maxlength="120">' +
        '<input id="hc-video-handle" placeholder="@handle ou canal (opcional)" maxlength="60">' +
        '<button class="btn-mini" onclick="hcPublishVideo()">📨 Adicionar vídeo</button>' +
      '</div>' +
      '<div id="hc-video-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Link útil</div>' +
      '<div class="hc-row">' +
        '<input id="hc-link-icon" placeholder="Emoji" style="max-width:70px" maxlength="4">' +
        '<input id="hc-link-title" placeholder="Título" maxlength="80">' +
        '<input id="hc-link-url" placeholder="URL">' +
        '<input id="hc-link-category" placeholder="Categoria (ex: Comunidade)" maxlength="40">' +
        '<button class="btn-mini" onclick="hcPublishLink()">📨 Adicionar link</button>' +
      '</div>' +
      '<div id="hc-link-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Artigo da Revista MyDeck</div>' +
      '<div class="hc-row">' +
        '<input id="hc-art-title" placeholder="Título" maxlength="140">' +
        '<input id="hc-art-tag" placeholder="Tag (ex: Mercado, Estratégia)" maxlength="40">' +
      '</div>' +
      '<input id="hc-art-subtitle" placeholder="Subtítulo (opcional)" maxlength="200">' +
      '<textarea id="hc-art-body" placeholder="Texto do artigo..." maxlength="8000"></textarea>' +
      '<div class="hc-row">' +
        '<label class="staff-perm-check"><input type="checkbox" id="hc-art-featured"> Marcar como capa da edição</label>' +
        '<button class="btn-mini" onclick="hcPublishArticle()">📨 Publicar artigo</button>' +
      '</div>' +
      '<div id="hc-article-list" class="hc-list"></div>' +
    '</div>';

  hcNewsInitImageDrop();
  hcLoadNewsList();
  hcLoadVideoList();
  hcLoadLinkList();
  hcLoadArticleList();
}

function hcToggleNewsMediaInput() {
  const sel = document.getElementById('hc-news-media-type');
  const input = document.getElementById('hc-news-media-url');
  if (!sel || !input) return;
  input.style.display = sel.value === 'none' ? 'none' : '';
  input.placeholder = sel.value === 'image' ? 'link da imagem (preenchido sozinho ao enviar)' : 'URL do vídeo';
  const box = document.getElementById('hc-news-img-box');
  if (box) box.style.display = sel.value === 'image' ? '' : 'none';
  if (sel.value !== 'image') hcNewsImgClear(true);
  else hcNewsUrlChanged();
}
window.hcToggleNewsMediaInput = hcToggleNewsMediaInput;

// ── IMAGEM DA NOTÍCIA (09/10/2026) ───────────────────────────────────
// Antes o formulário só aceitava o LINK de uma imagem. Agora dá pra escolher o arquivo, arrastar a foto
// pra cima do bloco ou colar uma imagem copiada (Ctrl+V): a tela reduz (lado maior 1600 px), converte pra
// WebP e envia pro bucket público news-images (noticias_imagens_bucket_09out2026.sql — só quem tem a
// permissão 'inicio' escreve). O link público volta pro campo sozinho e a prévia aparece embaixo.
const HC_NEWS_BUCKET = 'news-images';
const HC_NEWS_IMG_MAX_SIDE = 1600;
const HC_NEWS_IMG_MAX_INPUT = 25 * 1024 * 1024; // arquivo de origem; o enviado fica bem menor
let hcNewsImgBusy = false;
let hcNewsImgPath = null; // arquivo enviado nesta tela e ainda não publicado (apagado se trocar/remover)

function hcNewsImgStatus(msg, isError) {
  const el = document.getElementById('hc-news-img-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? 'var(--accent, #e63946)' : 'var(--muted)';
}

function hcNewsImgPreview(url) {
  const holder = document.getElementById('hc-news-img-preview');
  if (!holder) return;
  if (!url) { holder.innerHTML = ''; return; }
  holder.innerHTML = '<img src="' + hcEsc(url) + '" alt="Prévia da imagem" onerror="this.parentNode.innerHTML=\'<span class=&quot;hc-img-bad&quot;>Não consegui abrir essa imagem — confira o link.</span>\'">' +
    '<button type="button" class="btn-mini" onclick="hcNewsImgClear()">🗑️ Remover imagem</button>';
}

// Link colado/digitado à mão: mostra a prévia (se o endereço parece válido).
function hcNewsUrlChanged() {
  const sel = document.getElementById('hc-news-media-type');
  const input = document.getElementById('hc-news-media-url');
  if (!sel || !input || sel.value !== 'image') return;
  const v = input.value.trim();
  hcNewsImgPreview(/^https?:\/\/\S+$/i.test(v) ? v : '');
}
window.hcNewsUrlChanged = hcNewsUrlChanged;

// Remove a imagem da matéria; se ela foi enviada por esta tela (e ainda não publicada), apaga o arquivo do bucket.
async function hcNewsImgClear(silent) {
  const input = document.getElementById('hc-news-media-url');
  if (input) input.value = '';
  hcNewsImgPreview('');
  if (!silent) hcNewsImgStatus('');
  const old = hcNewsImgPath;
  hcNewsImgPath = null;
  if (old) { try { await sbClient.storage.from(HC_NEWS_BUCKET).remove([old]); } catch (e) { /* sobra um arquivo órfão, sem impacto */ } }
}
window.hcNewsImgClear = hcNewsImgClear;

// Lê o arquivo, reduz e converte. GIF animado vai como está (reduzir perderia a animação).
async function hcPrepareNewsImage(file) {
  if (file.type === 'image/gif') {
    if (file.size > 5 * 1024 * 1024) throw new Error('GIF acima de 5 MB. Use um menor ou um print.');
    return { blob: file, type: 'image/gif', ext: 'gif' };
  }
  let bmp;
  if (window.createImageBitmap) {
    try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; }
  }
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
  const scale = Math.min(1, HC_NEWS_IMG_MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) { try { bmp.close(); } catch (e) {} }
  const toBlob = function (type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); };
  let blob = await toBlob('image/webp', 0.86);
  let type = 'image/webp', ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { // navegador que não codifica WebP
    blob = await toBlob('image/jpeg', 0.88); type = 'image/jpeg'; ext = 'jpg';
  }
  if (!blob) throw new Error('Não consegui converter a imagem.');
  return { blob: blob, type: type, ext: ext };
}

async function hcNewsUploadImage(file) {
  if (!hasPerm('inicio')) return;
  if (!file || !/^image\//.test(file.type || '')) { hcNewsImgStatus('Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).', true); return; }
  if (file.size > HC_NEWS_IMG_MAX_INPUT) { hcNewsImgStatus('Imagem grande demais (máx. 25 MB).', true); return; }
  if (hcNewsImgBusy) return;
  hcNewsImgBusy = true;
  const btn = document.getElementById('hc-news-publish-btn');
  if (btn) btn.disabled = true;
  hcNewsImgStatus('Preparando e enviando a imagem…');
  try {
    const prep = await hcPrepareNewsImage(file);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = uid() + '/' + Date.now() + '-' + rand + '.' + prep.ext;
    const { error } = await sbClient.storage.from(HC_NEWS_BUCKET).upload(path, prep.blob, {
      contentType: prep.type, cacheControl: '31536000', upsert: false
    });
    if (error) throw new Error(error.message || 'Falha no envio.');
    const url = sbClient.storage.from(HC_NEWS_BUCKET).getPublicUrl(path).data.publicUrl;
    // troca a imagem anterior enviada por esta tela (se houver)
    const old = hcNewsImgPath;
    hcNewsImgPath = path;
    if (old && old !== path) { try { await sbClient.storage.from(HC_NEWS_BUCKET).remove([old]); } catch (e) {} }
    const sel = document.getElementById('hc-news-media-type');
    if (sel && sel.value !== 'image') { sel.value = 'image'; hcToggleNewsMediaInput(); }
    const input = document.getElementById('hc-news-media-url');
    if (input) input.value = url;
    hcNewsImgPreview(url);
    hcNewsImgStatus('Imagem enviada (' + Math.max(1, Math.round(prep.blob.size / 1024)) + ' KB). Pode publicar.');
  } catch (e) {
    hcNewsImgStatus('Não deu pra enviar: ' + (e && e.message ? e.message : e), true);
  } finally {
    hcNewsImgBusy = false;
    if (btn) btn.disabled = false;
  }
}

function hcNewsImgPicked(inputEl) {
  const f = inputEl && inputEl.files && inputEl.files[0];
  if (f) hcNewsUploadImage(f);
  if (inputEl) inputEl.value = ''; // permite escolher o mesmo arquivo de novo
}
window.hcNewsImgPicked = hcNewsImgPicked;

// Colar (Ctrl+V) e arrastar valem em todo o bloco da notícia. Colar TEXTO continua normal (só intercepta imagem).
function hcNewsInitImageDrop() {
  const title = document.getElementById('hc-news-title');
  const block = title && title.closest('.hc-block');
  if (!block || block.dataset.hcImgInit) return;
  block.dataset.hcImgInit = '1';
  const firstImage = function (dt) {
    const files = dt && dt.files ? Array.prototype.slice.call(dt.files) : [];
    return files.find(function (f) { return /^image\//.test(f.type || ''); }) || null;
  };
  block.addEventListener('paste', function (ev) {
    const f = firstImage(ev.clipboardData);
    if (!f) return;
    ev.preventDefault();
    hcNewsUploadImage(f);
  });
  block.addEventListener('dragover', function (ev) {
    if (ev.dataTransfer && Array.prototype.some.call(ev.dataTransfer.items || [], function (i) { return i.kind === 'file'; })) {
      ev.preventDefault();
      block.classList.add('hc-drop');
    }
  });
  block.addEventListener('dragleave', function () { block.classList.remove('hc-drop'); });
  block.addEventListener('drop', function (ev) {
    block.classList.remove('hc-drop');
    const f = firstImage(ev.dataTransfer);
    if (!f) return;
    ev.preventDefault();
    hcNewsUploadImage(f);
  });
}

// ── NOTÍCIAS ─────────────────────────────────────────────────────────
async function hcPublishNews() {
  if (!hasPerm('inicio')) return;
  const titleEl = document.getElementById('hc-news-title');
  const subEl = document.getElementById('hc-news-subtitle');
  const bodyEl = document.getElementById('hc-news-body');
  const typeEl = document.getElementById('hc-news-media-type');
  const urlEl = document.getElementById('hc-news-media-url');
  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title) { alert('Escreva o título da matéria.'); return; }
  if (!body) { alert('Escreva o texto da notícia.'); return; }
  if (hcNewsImgBusy) { alert('Aguarde: a imagem ainda está sendo enviada.'); return; }

  const mediaType = typeEl.value;
  const mediaUrl = mediaType === 'none' ? null : urlEl.value.trim() || null;
  if (mediaType === 'image' && !mediaUrl) { alert('Você escolheu "Imagem", mas ainda não enviou nenhuma. Envie a imagem ou mude para "Sem mídia".'); return; }

  const { error } = await sbClient.from('pokemon_news').insert({
    title: title, subtitle: subEl.value.trim() || null, body: body,
    media_type: mediaType, media_url: mediaUrl, author_uid: uid()
  });
  if (error) { alert('Erro ao publicar: ' + error.message); return; }

  hcNewsImgPath = null; // a imagem enviada agora pertence à notícia publicada: não apagar mais
  titleEl.value = ''; subEl.value = ''; bodyEl.value = ''; urlEl.value = ''; typeEl.value = 'none'; hcToggleNewsMediaInput();
  hcNewsImgStatus('');
  hcLoadNewsList();
}
window.hcPublishNews = hcPublishNews;

async function hcLoadNewsList() {
  const holder = document.getElementById('hc-news-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('pokemon_news')
    .select('id,title,body,media_type,published_at')
    .order('published_at', { ascending: false })
    .limit(30);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + hcEsc(error.message) + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhuma notícia publicada.</div>'; return; }

  let views = {};
  try {
    const { data: vdata } = await sbClient.rpc('fn_news_view_counts');
    (vdata || []).forEach(function (v) { views[v.news_id] = v.views; });
  } catch (e) {}

  let comments = {};
  try {
    const ids = rows.map(function (r) { return r.id; });
    const { data: cdata } = await sbClient.from('pokemon_news_comments').select('news_id').in('news_id', ids);
    (cdata || []).forEach(function (c) { comments[c.news_id] = (comments[c.news_id] || 0) + 1; });
  } catch (e) {}

  holder.innerHTML = rows.map(function (n) {
    const dt = n.published_at ? new Date(n.published_at).toLocaleDateString('pt-BR') : '';
    const snippet = n.title ? hcEsc(n.title) : hcEsc(hcTruncate(n.body, 90));
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main">' +
          '<div class="hc-list-snippet">' + snippet + '</div>' +
          '<div class="hc-list-meta">' + dt + ' · 👁 ' + (views[n.id] || 0) + ' visualizações · 💬 ' + (comments[n.id] || 0) + ' comentários</div>' +
        '</div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteNews(\'' + n.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteNews(id) {
  if (!confirm('Apagar essa notícia? Os comentários dela também somem.')) return;
  const { error } = await sbClient.from('pokemon_news').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadNewsList();
}
window.hcDeleteNews = hcDeleteNews;

// ── VÍDEOS ───────────────────────────────────────────────────────────
async function hcPublishVideo() {
  if (!hasPerm('inicio')) return;
  const platform = document.getElementById('hc-video-platform').value;
  const urlEl = document.getElementById('hc-video-url');
  const titleEl = document.getElementById('hc-video-title');
  const handleEl = document.getElementById('hc-video-handle');
  const video_url = urlEl.value.trim();
  const title = titleEl.value.trim();
  if (!video_url || !title) { alert('Preencha a URL e o título do vídeo.'); return; }

  const { error } = await sbClient.from('community_videos').insert({
    platform: platform, video_url: video_url, title: title,
    handle: handleEl.value.trim() || null, added_by: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  urlEl.value = ''; titleEl.value = ''; handleEl.value = '';
  hcLoadVideoList();
}
window.hcPublishVideo = hcPublishVideo;

async function hcLoadVideoList() {
  const holder = document.getElementById('hc-video-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('community_videos').select('id,platform,title,handle').order('created_at', { ascending: false }).limit(30);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + hcEsc(error.message) + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum vídeo linkado.</div>'; return; }

  holder.innerHTML = rows.map(function (v) {
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + (v.platform === 'tiktok' ? 'TikTok' : 'YouTube') + ' — ' + hcEsc(v.title) + '</div>' +
        '<div class="hc-list-meta">' + hcEsc(v.handle || '') + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteVideo(\'' + v.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteVideo(id) {
  if (!confirm('Remover esse vídeo?')) return;
  const { error } = await sbClient.from('community_videos').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadVideoList();
}
window.hcDeleteVideo = hcDeleteVideo;

// ── LINKS ────────────────────────────────────────────────────────────
async function hcPublishLink() {
  if (!hasPerm('inicio')) return;
  const iconEl = document.getElementById('hc-link-icon');
  const titleEl = document.getElementById('hc-link-title');
  const urlEl = document.getElementById('hc-link-url');
  const catEl = document.getElementById('hc-link-category');
  const title = titleEl.value.trim();
  const url = urlEl.value.trim();
  if (!title || !url) { alert('Preencha título e URL do link.'); return; }

  const { error } = await sbClient.from('community_links').insert({
    title: title, url: url, category: catEl.value.trim() || null,
    icon: iconEl.value.trim() || null, added_by: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  iconEl.value = ''; titleEl.value = ''; urlEl.value = ''; catEl.value = '';
  hcLoadLinkList();
}
window.hcPublishLink = hcPublishLink;

async function hcLoadLinkList() {
  const holder = document.getElementById('hc-link-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('community_links').select('id,title,category,icon').order('created_at', { ascending: false }).limit(50);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + hcEsc(error.message) + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum link ainda.</div>'; return; }

  holder.innerHTML = rows.map(function (l) {
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + hcEsc(l.icon || '🔗') + ' ' + hcEsc(l.title) + '</div>' +
        '<div class="hc-list-meta">' + hcEsc(l.category || '') + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteLink(\'' + l.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteLink(id) {
  if (!confirm('Remover esse link?')) return;
  const { error } = await sbClient.from('community_links').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadLinkList();
}
window.hcDeleteLink = hcDeleteLink;

// ── REVISTA ──────────────────────────────────────────────────────────
async function hcPublishArticle() {
  if (!hasPerm('inicio')) return;
  const titleEl = document.getElementById('hc-art-title');
  const tagEl = document.getElementById('hc-art-tag');
  const subEl = document.getElementById('hc-art-subtitle');
  const bodyEl = document.getElementById('hc-art-body');
  const featEl = document.getElementById('hc-art-featured');

  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title || !body) { alert('Preencha título e texto do artigo.'); return; }

  // Só um artigo é capa por vez — desmarca o anterior antes de marcar o novo.
  if (featEl.checked) {
    await sbClient.from('magazine_articles').update({ is_featured: false }).eq('is_featured', true);
  }

  const { error } = await sbClient.from('magazine_articles').insert({
    title: title, subtitle: subEl.value.trim() || null, tag: tagEl.value.trim() || null,
    body: body, is_featured: !!featEl.checked, author_uid: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  titleEl.value = ''; tagEl.value = ''; subEl.value = ''; bodyEl.value = ''; featEl.checked = false;
  hcLoadArticleList();
}
window.hcPublishArticle = hcPublishArticle;

async function hcLoadArticleList() {
  const holder = document.getElementById('hc-article-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('magazine_articles').select('id,title,tag,is_featured,published_at').order('published_at', { ascending: false }).limit(30);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + hcEsc(error.message) + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum artigo publicado.</div>'; return; }

  holder.innerHTML = rows.map(function (a) {
    const dt = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : '';
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + (a.is_featured ? '⭐ ' : '') + hcEsc(a.title) + '</div>' +
        '<div class="hc-list-meta">' + hcEsc(a.tag || '') + ' · ' + dt + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteArticle(\'' + a.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteArticle(id) {
  if (!confirm('Apagar esse artigo?')) return;
  const { error } = await sbClient.from('magazine_articles').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadArticleList();
}
window.hcDeleteArticle = hcDeleteArticle;
