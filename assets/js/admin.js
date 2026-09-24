/* =====================================================================
   admin.js — Panel de administración
   - Login (token = credencial, guardado en localStorage)
   - Dashboard (lista CRUD de posts)
   - Editor (markdown + toolbar + preview en vivo + subir imágenes)
   ===================================================================== */

const Admin = (() => {
  /* --------------------------- Estado / vistas --------------------------- */
  const views = ['login', 'dashboard', 'editor'];
  let currentPost = null; // post en edición

  function show(view) {
    views.forEach((v) => {
      const el = document.getElementById('view-' + v);
      if (el) el.style.display = v === view ? 'block' : 'none';
    });
  }

  /* --------------------------- Login --------------------------- */
  function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    // pre-llenar owner/repo de la config
    document.getElementById('loginOwner').value = BLOG_CONFIG.owner || '';
    document.getElementById('loginRepo').value = BLOG_CONFIG.repo || '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const owner = document.getElementById('loginOwner').value.trim();
      const repo = document.getElementById('loginRepo').value.trim();
      const token = document.getElementById('loginToken').value.trim();
      const errEl = document.getElementById('loginError');
      const btn = document.getElementById('loginBtn');
      errEl.textContent = '';

      if (!owner || !repo || !token) { errEl.textContent = 'Completá los 3 campos.'; return; }

      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Validando…';
      try {
        // guardar sesión temporal para que Api use estos owner/repo al validar
        Api.saveSession({ token, owner, repo });
        const user = await Api.getCurrentUser(token);
        Api.saveSession({ token, owner, repo, login: user.login, name: user.name, avatar: user.avatar });
        Api.applyConfig(); // aplica owner/repo al BLOG_CONFIG en runtime
        openDashboard();
      } catch (err) {
        Api.clearSession();
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  /* --------------------------- Dashboard --------------------------- */
  let dashPosts = [];

  async function openDashboard() {
    show('dashboard');
    const userInfo = document.getElementById('userInfo');
    const s = Api.getSession();
    if (userInfo) userInfo.textContent = `Conectado como ${s.name || s.login}`;
    await loadPosts();
  }

  async function loadPosts() {
    const list = document.getElementById('postList');
    list.innerHTML = rowSkeleton(3);
    try {
      // leer índice EN VIVO del repo (no la versión deployada de Pages)
      dashPosts = await Api.apiReadJSON(`${BLOG_CONFIG.postsDir}/index.json`) || [];
    } catch (e) {
      list.innerHTML = `<div class="state"><h3>No se pudo cargar</h3><p>${escapeHtml(e.message)}</p></div>`;
      return;
    }
    if (dashPosts.length === 0) {
      list.innerHTML = `<div class="state"><h3>Todavía no hay posts</h3><p>Hacé clic en "Nuevo post" para crear el primero.</p></div>`;
      return;
    }
    list.innerHTML = dashPosts.map(rowHtml).join('');
    bindRowActions();
  }

  function bindRowActions() {
    document.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEditor(b.dataset.edit)));
    document.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => confirmDelete(b.dataset.del, b.dataset.title)));
  }

  function rowHtml(p) {
    const thumb = p.cover
      ? `<img class="thumb" src="${p.cover}" alt="">`
      : `<div class="thumb-empty">📝</div>`;
    const badge = p.published === false
      ? `<span class="badge badge-draft">Borrador</span>`
      : `<span class="badge badge-pub">Publicado</span>`;
    return `
      <div class="post-row">
        ${thumb}
        <div class="info">
          <div class="t">${escapeHtml(p.title)}</div>
          <div class="m">${fmtDate(p.createdAt)} · ${(p.tags||[]).join(', ') || 'sin tags'}</div>
        </div>
        <div class="row-actions">
          ${badge}
          <button class="btn btn-secondary btn-sm" data-edit="${escapeAttr(p.slug)}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${escapeAttr(p.slug)}" data-title="${escapeAttr(p.title)}">Borrar</button>
        </div>
      </div>`;
  }

  function rowSkeleton(n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += `<div class="post-row"><div class="thumb-empty skeleton"></div><div class="info"><div class="card-skeleton-line skeleton" style="width:50%;height:16px"></div><div class="card-skeleton-line skeleton" style="width:30%;height:12px"></div></div><div></div></div>`;
    }
    return out;
  }

  async function confirmDelete(slug, title) {
    if (!confirm(`¿Borrar el post "${title}"? Esta acción no se puede deshacer.`)) return;
    const row = document.querySelector(`[data-del="${cssEscape(slug)}"]`).closest('.post-row');
    row.style.opacity = '0.5';
    try {
      await Api.deletePost(slug);
      toast('Post borrado', 'ok');
      await loadPosts();
    } catch (e) {
      toast(e.message, 'err');
      row.style.opacity = '1';
    }
  }

  /* --------------------------- Editor --------------------------- */
  async function openEditor(slug) {
    show('editor');
    currentPost = null;
    resetEditor();

    if (slug) {
      // editar existente: cargar contenido completo (en vivo)
      try {
        currentPost = await Api.apiReadJSON(`${BLOG_CONFIG.postsDir}/${slug}.json`);
        if (!currentPost) { toast('No se encontró el post', 'err'); backToDash(); return; }
        fillEditor(currentPost);
      } catch (e) {
        toast('Error al cargar: ' + e.message, 'err');
        backToDash();
        return;
      }
    }
    bindEditor();
    renderPreview();
  }

  function resetEditor() {
    document.getElementById('edTitle').value = '';
    document.getElementById('edSlug').value = '';
    document.getElementById('edTags').value = '';
    document.getElementById('edCover').value = '';
    document.getElementById('edContent').value = '';
    document.getElementById('edCoverPreview').style.display = 'none';
    document.getElementById('edPublished').checked = true;
    document.getElementById('editorTitle').textContent = 'Nuevo post';
    document.getElementById('btnDelete').style.display = 'none';
  }

  function fillEditor(p) {
    document.getElementById('edTitle').value = p.title || '';
    document.getElementById('edSlug').value = p.slug || '';
    document.getElementById('edTags').value = (p.tags || []).join(', ');
    document.getElementById('edCover').value = p.cover || '';
    document.getElementById('edContent').value = p.content || '';
    document.getElementById('edPublished').checked = p.published !== false;
    document.getElementById('editorTitle').textContent = 'Editar: ' + p.title;
    document.getElementById('btnDelete').style.display = 'inline-flex';
    showCoverPreview(p.cover);
  }

  function showCoverPreview(url) {
    const img = document.getElementById('edCoverPreview');
    if (url) { img.src = url; img.style.display = 'block'; }
    else { img.style.display = 'none'; }
  }

  function bindEditor() {
    const title = document.getElementById('edTitle');
    const slug = document.getElementById('edSlug');
    let slugTouched = !!currentPost;
    if (currentPost && currentPost.slug) slugTouched = true;

    title.addEventListener('input', () => {
      if (!slugTouched) slug.value = Api.slugify(title.value);
      renderPreview();
    });
    slug.addEventListener('input', () => { slugTouched = true; });
    ['edTags','edContent'].forEach((id) =>
      document.getElementById(id).addEventListener('input', renderPreview));

    document.getElementById('edCover').addEventListener('input', (e) => {
      showCoverPreview(e.target.value.trim());
    });

    // toolbar
    document.querySelectorAll('[data-md]').forEach((b) =>
      b.addEventListener('click', () => applyMarkdown(b.dataset.md)));

    // subir imagen (portada)
    document.getElementById('btnUploadCover').addEventListener('click', () =>
      document.getElementById('coverFile').click());
    document.getElementById('coverFile').addEventListener('change', (e) => uploadCover(e.target.files[0]));

    // subir imagen (dentro del contenido)
    document.getElementById('btnUploadImage').addEventListener('click', () =>
      document.getElementById('contentFile').click());
    document.getElementById('contentFile').addEventListener('change', (e) => uploadContentImage(e.target.files[0]));

    // botones
    document.getElementById('btnSave').addEventListener('click', () => savePost(true));
    document.getElementById('btnDraft').addEventListener('click', () => savePost(false));
    document.getElementById('btnDelete').addEventListener('click', () => {
      if (currentPost) confirmDeleteEditor(currentPost.slug, currentPost.title);
    });
    document.getElementById('btnCancel').addEventListener('click', backToDash);
  }

  function applyMarkdown(action) {
    const ta = document.getElementById('edContent');
    const wrap = (before, after = '', placeholder = 'texto') => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || placeholder;
      ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
      renderPreview();
    };
    const linePrefix = (prefix) => {
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
      ta.focus();
      renderPreview();
    };
    switch (action) {
      case 'bold': wrap('**','**','negrita'); break;
      case 'italic': wrap('*','*','cursiva'); break;
      case 'h1': linePrefix('# '); break;
      case 'h2': linePrefix('## '); break;
      case 'link': wrap('[','](https://)','enlace'); break;
      case 'image': wrap('![','](https://...)','descripción'); break;
      case 'video': insertYoutube(ta); break;
      case 'code': wrap('\n```\n','\n```\n','código'); break;
      case 'list': linePrefix('- '); break;
      case 'quote': linePrefix('> '); break;
    }
  }

  function insertYoutube(ta) {
    const url = prompt('Pegá la URL de YouTube (https://youtu.be/... o watch?v=...)');
    if (!url) return;
    let id = '';
    const m1 = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{6,15})/);
    if (m1) id = m1[1];
    if (!id) { toast('URL de YouTube no válida', 'err'); return; }
    const embed = `\nhttps://www.youtube.com/watch?v=${id}\n`;
    const s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + embed + ta.value.slice(s);
    ta.focus();
    renderPreview();
  }

  async function uploadCover(file) {
    if (!file) return;
    const btn = document.getElementById('btnUploadCover');
    btn.disabled = true; btn.textContent = 'Subiendo…';
    try {
      const res = await Api.uploadImage(file);
      document.getElementById('edCover').value = res.rawUrl;
      showCoverPreview(res.rawUrl);
      toast('Imagen de portada subida', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Subir portada'; }
  }

  async function uploadContentImage(file) {
    if (!file) return;
    const btn = document.getElementById('btnUploadImage');
    btn.disabled = true; btn.textContent = 'Subiendo…';
    try {
      const res = await Api.uploadImage(file);
      const ta = document.getElementById('edContent');
      const insert = `\n![imagen](${res.rawUrl})\n`;
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + insert + ta.value.slice(s);
      renderPreview();
      toast('Imagen insertada', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '📷 Insertar'; }
  }

  let previewTimer = null;
  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const md = document.getElementById('edContent').value;
      const pane = document.getElementById('previewPane');
      if (!md.trim()) { pane.innerHTML = '<div class="preview-empty">El preview aparecerá acá</div>'; return; }
      pane.innerHTML = `<div class="preview-content">${Markdown.render(md)}</div>`;
    }, 200);
  }

  async function savePost(published) {
    const title = document.getElementById('edTitle').value.trim();
    if (!title) { toast('Falta el título', 'err'); return; }
    const slug = (document.getElementById('edSlug').value || Api.slugify(title)).trim();
    const tags = document.getElementById('edTags').value.split(',').map((t) => t.trim()).filter(Boolean);
    const cover = document.getElementById('edCover').value.trim();
    const content = document.getElementById('edContent').value;

    const post = {
      slug,
      title,
      tags,
      cover,
      content,
      published,
      createdAt: currentPost?.createdAt,
    };

    const btn = document.getElementById(published ? 'btnSave' : 'btnDraft');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando…';
    try {
      await Api.savePost(post);
      toast(published ? 'Post publicado' : 'Borrador guardado', 'ok');
      currentPost = post;
      setTimeout(backToDash, 600);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = published ? 'Publicar' : 'Guardar borrador';
    }
  }

  async function confirmDeleteEditor(slug, title) {
    if (!confirm(`¿Borrar el post "${title}"?`)) return;
    try {
      await Api.deletePost(slug);
      toast('Post borrado', 'ok');
      setTimeout(backToDash, 500);
    } catch (e) { toast(e.message, 'err'); }
  }

  function backToDash() { openDashboard(); }

  /* --------------------------- Logout --------------------------- */
  function logout() {
    Api.clearSession();
    show('login');
  }

  /* --------------------------- Boot --------------------------- */
  function init() {
    initLogin();
    document.getElementById('btnLogout')?.addEventListener('click', logout);
    document.getElementById('btnNew')?.addEventListener('click', () => openEditor(null));
    document.getElementById('btnBack')?.addEventListener('click', backToDash);

    // si ya hay sesión, ir al dashboard
    const s = Api.getSession();
    if (s && s.token) {
      Api.applyConfig(); // reaplica owner/repo al BLOG_CONFIG tras recargar
      // validar rápido
      Api.getCurrentUser(s.token).then(() => openDashboard()).catch(() => { Api.clearSession(); show('login'); });
    } else {
      show('login');
    }
  }

  return { init };
})();

/* helpers compartidos (también usados en blog.js, replicados acá por si se carga solo) */
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}
function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function cssEscape(s) { return (window.CSS?.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); }
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

document.addEventListener('DOMContentLoaded', () => Admin.init());
