/* =====================================================================
   blog.js — Lado público (home + post individual + búsqueda + tags)
   ===================================================================== */

// Renderer de Markdown con sanitización y soporte de video
const Markdown = (() => {
  let markedReady = typeof marked !== 'undefined';
  let dompurifyReady = typeof DOMPurify !== 'undefined';

  // Permite iframes de YouTube/Vimeo y video nativo, además de lo estándar
  const PURIFY_CONFIG = {
    ALLOWED_TAGS: [
      'p','br','strong','em','del','ins','sub','sup','code','pre','blockquote','hr',
      'h1','h2','h3','h4','h5','h6','ul','ol','li','a','img','figure','figcaption',
      'iframe','video','source','span','div','table','thead','tbody','tr','th','td'
    ],
    ALLOWED_ATTR: [
      'href','src','alt','title','width','height','class','target','rel',
      'allowfullscreen','frameborder','allow','controls','autoplay','loop','muted','playsinline','type',
      'colspan','rowspan'
    ],
    ALLOW_DATA_ATTR: false,
  };

  function render(md) {
    if (!md) return '';
    // extender YouTube: convertir links sueltos a iframes
    const processed = preprocessMedia(md);
    if (markedReady) {
      const raw = marked.parse(processed);
      return dompurifyReady ? DOMPurify.sanitize(raw, PURIFY_CONFIG) : raw;
    }
    // fallback plano si no hay librerías
    return '<p>' + escapeHtml(processed).replace(/\n\n/g, '</p><p>') + '</p>';
  }

  // Convierte URLs de YouTube/Vimeo sueltas (en su propia línea) en embeds
  function preprocessMedia(md) {
    return md
      // YouTube: https://www.youtube.com/watch?v=ID  o  https://youtu.be/ID
      .replace(/(?:^|\n)(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,15})([^\n]*)/g, (m, p1, p2, p3, id) => {
        return `\n<iframe src="https://www.youtube.com/embed/${id}" allowfullscreen frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>\n`;
      })
      // Vimeo: https://vimeo.com/ID
      .replace(/(?:^|\n)(https?:\/\/)?(www\.)?vimeo\.com\/(\d{6,12})/g, (m, p1, p2, id) => {
        return `\n<iframe src="https://player.vimeo.com/video/${id}" allowfullscreen frameborder="0" allow="autoplay; fullscreen; picture-in-picture"></iframe>\n`;
      });
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };
})();

/* ----------------------------- Helpers UI ----------------------------- */

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/</g,'&lt;');
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ----------------------------- Página HOME ----------------------------- */

async function initHome() {
  const grid = document.getElementById('postGrid');
  const searchInput = document.getElementById('searchInput');
  const tagBar = document.getElementById('tagFilters');
  if (!grid) return;

  let allPosts = [];
  let activeTag = null;

  // skeletons iniciales
  grid.innerHTML = skeletonCards(6);

  try {
    allPosts = await Api.readIndex();
    // solo publicados
    allPosts = allPosts.filter((p) => p.published !== false);
  } catch (e) {
    grid.innerHTML = emptyState('No se pudieron cargar los posts', e.message);
    return;
  }

  // tags
  const tags = collectTags(allPosts);
  renderTagBar(tagBar, tags);

  render();

  if (searchInput) {
    searchInput.addEventListener('input', () => render(searchInput.value));
  }

  function render(query = '') {
    let list = allPosts;
    if (activeTag) list = list.filter((p) => (p.tags || []).includes(activeTag));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (list.length === 0) {
      grid.innerHTML = emptyState('Sin resultados', 'Probá con otra búsqueda o etiqueta.');
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
  }

  function renderTagBar(el, tags) {
    if (!el) return;
    if (tags.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="tag-chip ${activeTag ? '' : 'active'}" data-tag="">Todos</button>` +
      tags.map((t) => `<button class="tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeAttr(t)}">${escapeAttr(t)}</button>`).join('');
    el.querySelectorAll('.tag-chip').forEach((b) => {
      b.addEventListener('click', () => {
        activeTag = b.dataset.tag || null;
        renderTagBar(el, tags);
        render(searchInput ? searchInput.value : '');
      });
    });
  }
}

function collectTags(posts) {
  const set = new Set();
  posts.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

function cardHtml(p) {
  const cover = p.cover
    ? `<img class="post-card-cover" src="${p.cover}" alt="${escapeAttr(p.title)}" loading="lazy">`
    : `<div class="post-card-cover"></div>`;
  const tags = (p.tags || []).slice(0, 3).map((t) => `<span class="tag-pill">${escapeAttr(t)}</span>`).join('');
  return `
    <a class="post-card" href="post.html?id=${encodeURIComponent(p.slug)}">
      ${cover}
      <div class="post-card-body">
        <div class="post-card-meta">${fmtDate(p.createdAt)}</div>
        <div class="post-card-title">${escapeAttr(p.title)}</div>
        <div class="post-card-excerpt">${escapeAttr(p.excerpt || '')}</div>
        <div class="post-card-tags">${tags}</div>
      </div>
    </a>`;
}

function skeletonCards(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `
      <div class="post-card">
        <div class="card-skeleton skeleton"></div>
        <div class="card-skeleton-body">
          <div class="card-skeleton-line skeleton" style="width:30%"></div>
          <div class="card-skeleton-line skeleton" style="width:90%;height:20px"></div>
          <div class="card-skeleton-line skeleton" style="width:60%"></div>
        </div>
      </div>`;
  }
  return out;
}

function emptyState(title, sub) {
  return `<div class="state" style="grid-column:1/-1"><h3>${escapeAttr(title)}</h3><p>${escapeAttr(sub || '')}</p></div>`;
}

/* ----------------------------- Página POST ----------------------------- */

async function initPost() {
  const root = document.getElementById('postRoot');
  if (!root) return;
  const slug = new URLSearchParams(location.search).get('id');
  if (!slug) { root.innerHTML = emptyState('Post no encontrado', 'Falta el identificador del post.'); return; }

  root.innerHTML = skeletonPost();

  try {
    const post = await Api.readPost(slug);
    if (!post) { root.innerHTML = emptyState('Post no encontrado', 'Este post no existe o fue borrado.'); return; }
    document.title = `${post.title} — ${BLOG_CONFIG.blog.title}`;
    renderPost(root, post);
  } catch (e) {
    root.innerHTML = emptyState('Error al cargar el post', e.message);
  }
}

function skeletonPost() {
  return `
    <div class="article-head">
      <div class="card-skeleton skeleton" style="width:40%;height:14px;margin:0 auto 18px"></div>
      <div class="card-skeleton skeleton" style="width:80%;height:36px;margin:0 auto 12px"></div>
      <div class="card-skeleton skeleton" style="width:30%;height:14px;margin:8px auto 0"></div>
    </div>
    <div class="article-body">
      <div class="card-skeleton skeleton" style="height:14px;margin-bottom:14px"></div>
      <div class="card-skeleton skeleton" style="height:14px;margin-bottom:14px;width:90%"></div>
      <div class="card-skeleton skeleton" style="height:14px;margin-bottom:14px;width:60%"></div>
    </div>`;
}

function renderPost(root, post) {
  const tags = (post.tags || []).map((t) => `<span class="tag-pill">${escapeAttr(t)}</span>`).join(' ');
  const cover = post.cover
    ? `<div class="article-cover"><img src="${post.cover}" alt="${escapeAttr(post.title)}"></div>`
    : '';
  const html = Markdown.render(post.content || '');
  root.innerHTML = `
    <div class="article-head">
      <div class="article-tags">${tags}</div>
      <h1 class="article-title">${escapeAttr(post.title)}</h1>
      <div class="article-meta">${BLOG_CONFIG.blog.author} · ${fmtDate(post.createdAt)}</div>
    </div>
    ${cover}
    <article class="article-body" id="articleBody">${html}</article>
    <div class="article-back"><a href="index.html">← Volver al blog</a></div>`;
}

/* ----------------------------- Boot ----------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  // rellenar marca/título dinámicos
  const brand = document.querySelector('[data-brand]');
  if (brand) brand.textContent = BLOG_CONFIG.blog.title;
  const footYear = document.querySelector('[data-year]');
  if (footYear) footYear.textContent = new Date().getFullYear();

  if (document.getElementById('postGrid')) initHome();
  if (document.getElementById('postRoot')) initPost();
});
