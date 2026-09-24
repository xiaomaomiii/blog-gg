/* =====================================================================
   api.js — Capa de acceso a datos (GitHub como "base de datos")
   ---------------------------------------------------------------------
   - Lectura pública: raw.githubusercontent.com (sin token, repo público)
   - Escritura admin: Contents API de GitHub (con token, en localStorage)
   ===================================================================== */

const Api = (() => {
  const SESSION_KEY = 'blog_admin_session';

  /* ----------------------- Sesión / autenticación ----------------------- */

  // Guarda la sesión del admin (token + owner/repo confirmados en login)
  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
    } catch { return null; }
  }

  function getToken() {
    return getSession()?.token || null;
  }

  // owner/repo activos: siempre toman BLOG_CONFIG (que el login puede
  // sobrescribir en runtime con applyConfig). Así lecturas y escrituras
  // apuntan al mismo repo, sin importar si config.js todavía tiene placeholders.
  function getCtx() {
    return {
      owner: BLOG_CONFIG.owner,
      repo: BLOG_CONFIG.repo,
      branch: BLOG_CONFIG.branch,
    };
  }

  // Copia owner/repo de la sesión a BLOG_CONFIG (para que rawUrl/getCtx
  // usen el repo que el admin indicó al iniciar sesión). Se llama al hacer
  // login y al recargar la página de admin.
  function applyConfig() {
    const s = getSession();
    if (s && s.owner) BLOG_CONFIG.owner = s.owner;
    if (s && s.repo) BLOG_CONFIG.repo = s.repo;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // Valida el token con GET /user. Devuelve { ok, login, avatar } o lanza.
  async function getCurrentUser(token) {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 401) throw new Error('Token inválido o sin permisos.');
    if (!res.ok) throw new Error('No se pudo validar el token (HTTP ' + res.status + ').');
    const u = await res.json();
    return { login: u.login, avatar: u.avatar_url, name: u.name || u.login };
  }

  /* ----------------------- Lectura pública (sin token) ----------------------- */

  // Lee un JSON por ruta relativa (funciona en local y en GitHub Pages,
  // sin necesitar owner/repo en config ni token). Cache-bust para frescura.
  async function readJSON(repoPath) {
    const sep = repoPath.includes('?') ? '&' : '?';
    const res = await fetch(repoPath + sep + 't=' + Date.now());
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('No se pudo leer ' + repoPath + ' (HTTP ' + res.status + ').');
    return res.json();
  }

  // Lee texto plano (ej. markdown) por ruta relativa
  async function readText(repoPath) {
    const sep = repoPath.includes('?') ? '&' : '?';
    const res = await fetch(repoPath + sep + 't=' + Date.now());
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('No se pudo leer ' + repoPath + ' (HTTP ' + res.status + ').');
    return res.text();
  }

  // Lee un JSON desde el repo en VIVO vía API (para el admin: refleja el último
  // commit, sin esperar el redeploy de Pages). Requiere token.
  async function apiReadJSON(repoPath) {
    const meta = await getFileMeta(repoPath);
    if (!meta) return null;
    return JSON.parse(base64Decode(meta.content));
  }

  /* ----------------------- Escritura (Contents API + token) ----------------------- */

  function authHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  // Obtiene metadatos de un archivo (sha, contenido). Necesario para actualizar/borrar.
  async function getFileMeta(repoPath) {
    const { owner, repo, branch } = getCtx();
    const token = getToken();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${branch}`;
    const res = await fetch(url, { headers: authHeaders(token) });
    if (res.status === 404) return null; // archivo no existe todavía
    if (!res.ok) throw new Error(`No se pudo obtener ${repoPath} (HTTP ${res.status}).`);
    return res.json(); // { sha, content, encoding, ... }
  }

  // Crea o actualiza un archivo de texto/JSON.
  // - content: string (se codifica a base64)
  // - sha: opcional (obligatorio para actualizar un archivo existente)
  // - message: mensaje de commit
  async function writeFile(repoPath, content, message, sha) {
    const { owner, repo, branch } = getCtx();
    const token = getToken();
    const body = {
      message: message || `update ${repoPath}`,
      content: base64Encode(content),
      branch,
    };
    if (sha) body.sha = sha;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // 200 = actualizó, 201 = creó
    if (res.status === 409) throw new Error('Conflicto (sha). Recargá e intentá de nuevo.');
    if (res.status === 401) throw new Error('Token inválido o sin permisos de escritura.');
    if (!res.ok && res.status !== 200 && res.status !== 201) {
      const err = await safeErr(res);
      throw new Error(`No se pudo guardar ${repoPath}: ${err}`);
    }
    return res.json();
  }

  // Borra un archivo (requiere sha)
  async function deleteFile(repoPath, sha, message) {
    const { owner, repo, branch } = getCtx();
    const token = getToken();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message || `delete ${repoPath}`, sha, branch }),
    });
    if (!res.ok) {
      const err = await safeErr(res);
      throw new Error(`No se pudo borrar ${repoPath}: ${err}`);
    }
    return res.json().catch(() => ({}));
  }

  // Sube una imagen (binaria) → devuelve { name, rawUrl, sha }
  async function uploadImage(file, customName) {
    const name = customName || sanitizeImageName(file.name);
    const repoPath = `${BLOG_CONFIG.assetsDir}/${name}`;
    const { owner, repo } = getCtx();

    // si ya existe una imagen con ese nombre, le agregamos timestamp
    const existing = await getFileMeta(repoPath);
    const finalName = existing ? `${Date.now()}-${name}` : name;
    const finalPath = `${BLOG_CONFIG.assetsDir}/${finalName}`;

    const base64 = await fileToBase64(file);
    const meta = await writeFile(finalPath, decodeBase64ToBinary(base64) ?? '', `upload image ${finalName}`, undefined);
    // writeFile espera string; para binarios usamos la ruta base64 directa:
    return {
      name: finalName,
      rawUrl: publicAsset(finalName),
    };
  }

  /* ----------------------- Helpers de posts (alto nivel) ----------------------- */

  // Lee el índice de posts
  async function readIndex() {
    return (await readJSON(`${BLOG_CONFIG.postsDir}/index.json`)) || [];
  }

  // Lee un post completo por slug
  async function readPost(slug) {
    return readJSON(`${BLOG_CONFIG.postsDir}/${slug}.json`);
  }

  // Guarda un post (crear o actualizar) y sincroniza el index.json
  async function savePost(post) {
    const now = new Date().toISOString();
    if (!post.createdAt) post.createdAt = now;
    post.updatedAt = now;

    const path = `${BLOG_CONFIG.postsDir}/${post.slug}.json`;
    const meta = await getFileMeta(path);
    await writeFile(path, JSON.stringify(post, null, 2), `post: ${post.title}`, meta?.sha);

    // sincronizar index.json
    await syncIndex(post, meta ? 'update' : 'create');
    return post;
  }

  // Borra un post y su entrada del índice
  async function deletePost(slug) {
    const path = `${BLOG_CONFIG.postsDir}/${slug}.json`;
    const meta = await getFileMeta(path);
    if (!meta) throw new Error('El post no existe en el repo.');
    await deleteFile(path, meta.sha, `delete post ${slug}`);
    await syncIndex({ slug }, 'delete');
  }

  // Actualiza index.json según la operación sobre un post
  async function syncIndex(post, op) {
    const idxPath = `${BLOG_CONFIG.postsDir}/index.json`;
    const idxMeta = await getFileMeta(idxPath);
    let index = [];
    if (idxMeta) {
      try { index = JSON.parse(base64Decode(idxMeta.content)); } catch { index = []; }
    }

    if (op === 'delete') {
      index = index.filter((p) => p.slug !== post.slug);
    } else {
      const entry = {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt || makeExcerpt(post.content),
        cover: post.cover || '',
        tags: post.tags || [],
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        published: post.published !== false,
      };
      const i = index.findIndex((p) => p.slug === post.slug);
      if (i >= 0) index[i] = entry;
      else { index.unshift(entry); }
    }

    // ordenar por createdAt desc
    index.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    await writeFile(idxPath, JSON.stringify(index, null, 2), 'sync index', idxMeta?.sha);
  }

  /* ----------------------- Utilidades ----------------------- */

  function base64Encode(str) {
    // maneja UTF-8 correctamente
    return btoa(unescape(encodeURIComponent(str)));
  }

  function base64Decode(b64) {
    try { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
    catch { return ''; }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]); // saca el prefijo data:...
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // Para subida de binarios usamos una variante que manda el base64 puro
  async function uploadBinary(file, customName) {
    const name = customName || sanitizeImageName(file.name);
    const finalName = `${Date.now()}-${name}`;
    const repoPath = `${BLOG_CONFIG.assetsDir}/${finalName}`;
    const { owner, repo, branch } = getCtx();
    const token = getToken();

    const base64 = await fileToBase64(file);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `upload image ${finalName}`, content: base64, branch }),
    });
    if (!res.ok && res.status !== 201 && res.status !== 200) {
      const err = await safeErr(res);
      throw new Error(`No se pudo subir la imagen: ${err}`);
    }
    return { name: finalName, rawUrl: publicAsset(finalName) };
  }

  function sanitizeImageName(name) {
    return name.toLowerCase().replace(/[^a-z0-9.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imagen';
  }

  function makeExcerpt(markdown, len = 180) {
    if (!markdown) return '';
    const text = markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imágenes
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1') // links → texto
      .replace(/[#>*`~_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > len ? text.slice(0, len).trim() + '…' : text;
  }

  function slugify(text) {
    const map = { á:'a',é:'e',í:'i',ó:'o',ú:'u',ü:'u',ñ:'n',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N' };
    return text
      .trim()
      .toLowerCase()
      .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'post-' + Date.now();
  }

  async function safeErr(res) {
    try {
      const j = await res.json();
      return j.message || res.statusText;
    } catch { return res.statusText || ('HTTP ' + res.status); }
  }

  function decodeBase64ToBinary(b64) { return null; } // no usada, binarios van por uploadBinary

  /* API pública del módulo */
  return {
    saveSession, getSession, getToken, getCtx, applyConfig, clearSession, getCurrentUser,
    readJSON, readText, apiReadJSON,
    getFileMeta, writeFile, deleteFile, uploadImage: uploadBinary,
    readIndex, readPost, savePost, deletePost,
    syncIndex, makeExcerpt, slugify,
  };
})();
