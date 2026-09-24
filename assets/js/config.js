/* =====================================================================
   CONFIGURACIÓN DEL BLOG
   ---------------------------------------------------------------------
   Editá estos valores con TU usuario de GitHub y el nombre del repo.
   Esto es lo único que necesitás tocar para que el blog ande.
   ===================================================================== */

const BLOG_CONFIG = {
  // Tu usuario de GitHub (sin arroba). Ej: 'octocat'
  owner: 'xiaomaomiii',

  // Nombre del repo donde vivirá el blog. Ej: 'mi-blog'
  repo: 'blog-gg',

  // Branch que se publica en GitHub Pages (casi siempre 'main')
  branch: 'main',

  // Carpeta donde se guardan los posts (relativa a la raíz del repo)
  postsDir: 'posts',
  assetsDir: 'posts/assets',

  // Textos del blog
  blog: {
    title: 'Mi Blog',
    description: 'Pensamientos, historias e ideas.',
    author: 'Autor',
    // URL base pública: dejá '' para calcularla automáticamente
    baseUrl: '',
  },

  // Cuántos posts mostrar en la home antes de "ver más"
  postsPerPage: 9,

  // Redes (opcional, dejá '' para ocultar)
  social: {
    twitter: '',
    github: '',
    email: '',
  },
};

/* ------- Helpers derivados (no tocar salo que sepas lo que hacés) ------- */

// Base para leer archivos públicos (sin token, repo público)
function rawUrl(path) {
  const base = `https://raw.githubusercontent.com/${BLOG_CONFIG.owner}/${BLOG_CONFIG.branch}`;
  return `${base}/${path}`;
}

// Base para la API de GitHub (escritura, con token)
function apiBase() {
  return `https://api.github.com/repos/${BLOG_CONFIG.owner}/${BLOG_CONFIG.repo}`;
}

// Ruta pública de un asset dentro del repo
function publicAsset(filename) {
  return rawUrl(`${BLOG_CONFIG.assetsDir}/${filename}`);
}

// Exportá la config al window para que la usen los otros scripts
window.BLOG_CONFIG = BLOG_CONFIG;
