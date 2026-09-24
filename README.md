# Mi Blog — Blog en GitHub Pages con panel de admin

Web de blog **estática** alojada en GitHub Pages. Los posts se guardan como archivos JSON en el propio repo (GitHub funciona como "base de datos"). El panel de administración se autentica con un **token de GitHub** (guardado en el navegador) y crea/edita/borra posts vía la API de GitHub.

```
index.html   →  Blog: lista de posts (home)
post.html    →  Blog: post individual
admin.html   →  Panel de administración (login + dashboard + editor)
assets/      →  CSS y JS
posts/       →  "Base de datos": index.json + posts individuales + imágenes
```

---

## 🚀 Puesta en marcha (paso a paso)

### 1. Subir el proyecto a un repo público de GitHub
Opciones:

**A) Crear y subir desde consola** (necesitás `git` configurado):
```bash
cd /workspace
git init
git add .
git commit -m "Mi blog"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mi-blog.git
git push -u origin main
```

**B) Subir archivos manualmente**: en github.com creás un repo nuevo `mi-blog`, y arrastrás los archivos de `/workspace`.

### 2. Activar GitHub Pages
1. Abrí el repo en GitHub → pestaña **Settings** → **Pages**.
2. **Source**: `Deploy from a branch`.
3. **Branch**: `main` / carpeta `/root` → **Save**.
4. En 1–2 minutos queda online en `https://TU-USUARIO.github.io/mi-blog/`.

### 3. Configurar `assets/js/config.js`
Editá el archivo con tu usuario y repo:
```js
const BLOG_CONFIG = {
  owner: 'TU-USUARIO',     // tu usuario real
  repo: 'mi-blog',        // nombre del repo real
  branch: 'main',
  // ...
};
```
Subí el cambio a GitHub (`git push`) y listo.

### 4. Crear el token de acceso (PAT) para el admin
1. GitHub → **Settings** (del perfil) → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. Scope: marcá **`repo`** (full control of private repositories). Si usás fine-grained, marcá tu repo y permiso **Contents: Read and write**.
4. Generá y **copiá el token** (`ghp_...`). No se vuelve a mostrar.

### 5. Usar el blog
- **Blog público**: `https://TU-USUARIO.github.io/mi-blog/` → lista de posts y lectura (sin login).
- **Admin**: `https://TU-USUARIO.github.io/mi-blog/admin.html` → poné tu usuario, repo y token → entrás al panel.
- Creás el primer post con el editor Markdown → **Publicar** → queda visible.

---

## ✍️ Cómo escribir posts

El editor usa **Markdown** con extras:
- **Texto**: títulos (`#`), negrita, cursiva, listas, citas, código.
- **Imágenes**: subí una imagen con el botón "📷 Insertar imagen" o pegá una URL con `![alt](url)`.
- **Videos**: pegá una URL de YouTube en su propia línea (ej. `https://youtu.be/abc123`) y se incrusta como reproductor. Vimeo también funciona.

Cada post genera:
- `posts/{slug}.json` — contenido completo.
- `posts/index.json` — índice de metadatos (se actualiza solo).
- `posts/assets/{imagen}` — imágenes subidas.

---

## 🔒 Seguridad

- El **token vive solo en `localStorage`** del navegador donde iniciás sesión. **No se sube al repo.**
- El blog público lee los posts sin token (repo público vía `raw.githubusercontent.com`).
- Usá un token de **permisos mínimos** (solo `Contents` del repo). Rotá el token si creés que se expuso.
- Si tu repo es **privado**, el lado público no podrá leer sin token → no funciona como blog público. Usá repo **público**.

---

## ❓ Notas

- **Cache de lectura**: el blog público puede tardar ~1–2 minutos en reflejar un post nuevo (cache de `raw.githubusercontent.com`). Refrescá con Ctrl+Shift+R.
- **Borradores**: un post con "publicado" desmarcado (`published: false`) no aparece en el blog público, pero sí en el panel.
- **Edición**: podés editar `config.js` para cambiar el título/descripción del blog.

¡Listo! Tu blog corre 100% gratis sobre GitHub.
