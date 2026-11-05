# Guía: conectar el catálogo completo con Supabase

Esta guía explica cambios que **tú aplicarás después**. Actualizar este documento no modifica automáticamente la aplicación.

Actualmente solo está conectada la lectura de `category`. La URL y clave se configuran en `supabase-config.js`; `admin-auth.js` crea el cliente compartido `window.dirtytaskSupabase`. No crees otro cliente.

“Automático” significa que los datos se consultarán al iniciar sesión y al recargar la página, sin ejecutar consultas a mano. No significa sincronización en tiempo real: si otro socio cambia un producto, deberás actualizar el catálogo o recargar.

## 1. Qué va en cada archivo

| Archivo | Responsabilidad | Ejemplo |
|---|---|---|
| `catalog-api.js` | Consultar Supabase y devolver datos | Traer productos con tallas e imágenes |
| `admin.js` | Convertir los datos, guardarlos en memoria y actualizar la pantalla | Llenar `state.products` y ejecutar `renderProducts()` |
| `admin.html` | Elementos visibles | Mensaje de carga y botón Actualizar |
| SQL / Supabase | Relaciones, permisos y operaciones atómicas | Comprobar que finanzas no modifique productos |

Recorrido: **inicio de sesión → función de carga en admin.js → catalog-api.js → Supabase → estado del administrador → pantalla**.

## 2. Qué tablas pertenecen al catálogo

| Tabla | Qué guarda | Cómo la leeremos |
|---|---|---|
| `category` | Categorías | `listCategories()`; ya existe |
| `product` | Nombre, precio, stock y estado | `listProducts()` |
| `product_variant` | Tallas / variantes por producto | Incluida dentro de `listProducts()` |
| `product_media` | Ruta de imagen principal y look | Incluida dentro de `listProducts()` |
| `launch` | Lanzamientos | `listLaunches()` |
| `launch_product` | Relación lanzamiento–producto | Incluida dentro de `listLaunches()` |

No necesitas una función por tabla. Las claves foráneas permiten consultar productos y sus relaciones juntas.

Configuración, contenido, pedidos y contabilidad deben tener archivos propios cuando los conectes. No agregues todas las tablas del proyecto a `catalog-api.js`.

## 3. Antes de empezar

- Guarda una copia de tu trabajo y exporta los datos locales que quieras conservar. Esta guía no los migra.
- Comprueba que el login real funciona y `dtshop` está expuesto en Data API.
- En Supabase, confirma que existen las seis tablas anteriores y sus relaciones del script SQL.
- Empieza en desarrollo. No habilites guardado hasta terminar su integración.

Trabaja por recorridos completos: consulta de productos → pantalla → prueba; luego lanzamientos → pantalla → prueba. El archivo completo del siguiente apartado te permite evitar errores de comas, pero no saltes las comprobaciones de cada recorrido.

## 4. Primer archivo: catalog-api.js

Reemplaza **todo el contenido de `catalog-api.js`** por este bloque. Conserva la consulta de categorías y agrega las consultas relacionadas. No lo pegues después del cierre `});` del objeto existente.

```js
window.catalogApi = (() => {
  function client() {
    if (!window.dirtytaskSupabase) {
      throw new Error('Supabase no está configurado.');
    }
    return window.dirtytaskSupabase;
  }

  // Lee por páginas para evitar perder filas por el límite de respuesta.
  // Mantén el límite de Data API en 1000 o más para este tamaño de página.
  async function readPages(buildQuery) {
    const size = 1000;
    const rows = [];
    for (let start = 0; ; start += size) {
      const { data, error } = await buildQuery().range(start, start + size - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < size) return rows;
    }
  }

  return Object.freeze({
    async listCategories() {
      return readPages(() => client().schema('dtshop')
        .from('category').select('code,label,sort_order')
        .order('sort_order').order('code'));
    },

    async listProducts() {
      return readPages(() => client().schema('dtshop')
        .from('product')
        .select(`
          id,name,category_code,description,price_cents,stock,
          status,published,preorder,variant_label,
          product_variant(id,label,sort_order),
          product_media(id,kind,storage_key)
        `)
        .order('name').order('id'));
    },

    async listLaunches() {
      return readPages(() => client().schema('dtshop')
        .from('launch')
        .select(`
          id,name,launch_on,arrival_label,image_key,status,
          launch_product(product_id,sort_order)
        `)
        .order('launch_on', { ascending: false }).order('id'));
    },

    publicImageUrl(key) {
      if (!key) return '';
      return client().storage.from('dtshop-products')
        .getPublicUrl(key).data.publicUrl;
    }
  });
})();
```

`product_variant(...)` y `product_media(...)` no son columnas del producto: son tablas relacionadas por `product_id`. Supabase devuelve esos registros como arreglos dentro de cada producto.

El mismo patrón funciona con `launch_product`. Si la API indica que no encuentra una relación, revisa las claves foráneas y que el esquema instalado coincida con `sql/supabase.sql`.

`publicImageUrl()` genera la dirección de un archivo que **ya existe**. No sube archivos ni verifica que existan. Guarda rutas como `usuario/uuid/foto.webp`, no URLs completas, en `storage_key`.

## 5. Segundo archivo: convertir los datos en admin.js

Dentro del bloque principal de `admin.js`, antes del cierre final `})();`, agrega estas funciones. No reemplaces `renderProducts()` ni las funciones existentes de dibujo.

```js
function productFromDatabase(row) {
  const variants = [...(row.product_variant || [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  const media = row.product_media || [];
  const imageKey = kind => media.find(image => image.kind === kind)?.storage_key;

  return {
    id: row.id,
    name: row.name,
    category: row.category_code,
    description: row.description || '',
    price: Number(row.price_cents) / 100,
    stock: row.stock,
    status: row.status,
    published: row.published,
    preorder: row.preorder,
    variantName: row.variant_label,
    variants: variants.map(variant => variant.label),
    variantRecords: variants, // Conserva UUID para el futuro guardado.
    image: window.catalogApi.publicImageUrl(imageKey('product')),
    lookImage: window.catalogApi.publicImageUrl(imageKey('look'))
  };
}

function launchFromDatabase(row) {
  return {
    id: row.id,
    name: row.name,
    launchDate: row.launch_on || '',
    arrivalDate: row.arrival_label || '',
    image: window.catalogApi.publicImageUrl(row.image_key),
    status: row.status,
    productIds: [...(row.launch_product || [])]
      .sort((a, b) => a.sort_order - b.sort_order || a.product_id.localeCompare(b.product_id))
      .map(link => link.product_id)
  };
}
```

¿Por qué convertir? Porque Supabase usa `price_cents`, pero tu pantalla usa `price`; Supabase devuelve variantes como filas, pero tu pantalla espera una lista de nombres. Un precio de `29900` centavos se muestra como Q299.

## 6. Agrega un mensaje y un botón en admin.html

Dentro de `<main class="admin-main">`, después del encabezado `admin-topbar`, agrega:

```html
<div class="auth-data-notice">
  <p id="catalogLoadStatus" role="status">Catálogo pendiente de carga.</p>
  <button id="refreshCatalog" type="button"
          class="admin-button admin-button-quiet">
    Actualizar catálogo
  </button>
</div>
```

No cambies el orden de scripts: `catalog-api.js` debe seguir antes de `admin.js`, y `admin-auth.js` debe inicializar la sesión después de instalar sus listeners.

## 7. Carga automática en admin.js

Primero agrega estas variables **junto a las variables iniciales del archivo**, inmediatamente después de `const STORAGE_KEY = ...`. Deben existir antes de cualquier llamada a `renderAll()`:

```js
const CATALOG_READ_ONLY = true;
let catalogRequest = 0;
```

Ahora agrega esta función dentro del bloque principal, antes de `})();`:

```js
async function loadRemoteCatalog() {
  if (!window.adminIdentity) return;
  const request = ++catalogRequest;
  const userId = window.adminIdentity.id;
  const status = document.querySelector('#catalogLoadStatus');
  const refresh = document.querySelector('#refreshCatalog');
  refresh.disabled = true;
  status.textContent = 'Cargando productos y lanzamientos…';

  try {
    const [products, launches] = await Promise.all([
      window.catalogApi.listProducts(),
      window.catalogApi.listLaunches()
    ]);

    // No aplicar respuestas de una sesión que ya terminó o fue reemplazada.
    if (request !== catalogRequest || window.adminIdentity?.id !== userId) return;

    const nextProducts = products.map(productFromDatabase);
    const nextLaunches = launches.map(launchFromDatabase);
    state.products = nextProducts;
    state.launches = nextLaunches;

    renderProducts();
    renderDrops();
    renderOverview();
    renderStatistics();
    applyRoleControls();

    status.textContent = `Catálogo consultado: ${products.length} productos y ${launches.length} lanzamientos. Solo lectura.`;
    document.dispatchEvent(new CustomEvent('dirtytask:admin-data-updated'));
  } catch (error) {
    if (request !== catalogRequest || window.adminIdentity?.id !== userId) return;
    console.error('Error al consultar catálogo:', error);
    status.textContent = 'No se pudo actualizar. Lo visible puede corresponder a la carga anterior. Reintenta.';
  } finally {
    if (request === catalogRequest) refresh.disabled = false;
  }
}

// Registra este listener una sola vez, dentro del bloque principal.
document.querySelector('#refreshCatalog')
  .addEventListener('click', loadRemoteCatalog);
```

Las dos consultas se ejecutan juntas; el estado se reemplaza cuando ambas terminan correctamente. Si una falla, no se mezcla un catálogo nuevo con lanzamientos antiguos.

Para probar productos primero, temporalmente usa `Promise.resolve([])` en lugar de `window.catalogApi.listLaunches()`. Cuando los productos aparezcan correctamente, restaura la llamada a lanzamientos.

### El punto exacto que inicia la carga

En el listener existente de `dirtytask:auth`, busca:

```js
if (event.detail) loadCategories();
else { categoriesRequest++; categoriesReady = false; categoryLabels = Object.create(null); }
```

Reemplaza **ese bloque**, no todo el listener, por:

```js
if (event.detail) {
  loadCategories();
  loadRemoteCatalog();
} else {
  categoriesRequest++;
  categoriesReady = false;
  categoryLabels = Object.create(null);
  catalogRequest++; // Ignora consultas que terminen después de cerrar sesión.
  state.products = [];
  state.launches = [];
}
```

Conserva las llamadas existentes a `setLoggedIn()` y `applyRoleControls()`. No registres un segundo listener de autenticación para hacer lo mismo.

## 8. Evita mezclar lectura remota con guardado local

Todavía no existe el guardado remoto del producto completo. Deja el catálogo solo de consulta hasta implementarlo.

Al final de la función existente `applyRoleControls()`, antes de su llave de cierre, agrega:

```js
if (CATALOG_READ_ONLY) {
  document.querySelectorAll(
    '#addProductButton, #addDropButton, [data-edit-product], [data-edit-drop]'
  ).forEach(button => {
    button.disabled = true;
    button.title = 'Catálogo remoto de consulta. Guardado pendiente de integrar.';
  });
}
```

Al principio de `openEditor(type, item = null)`, agrega:

```js
if (CATALOG_READ_ONLY) return;
```

Dentro del listener `submit` de `editorForm`, inmediatamente después de `event.preventDefault()`, agrega:

```js
if (CATALOG_READ_ONLY) return;
```

Dentro del listener de `#deleteEntryButton`, como primera instrucción, agrega la misma comprobación. Esto bloquea las rutas existentes de edición, creación y archivado; no basta con deshabilitar visualmente los botones.

La búsqueda de productos vuelve a dibujar la tabla. Al final de `renderProducts()` y `renderDrops()`, agrega `applyRoleControls();` para que los botones nuevos mantengan el bloqueo. `applyRoleControls()` no debe llamar a esas funciones, para evitar un ciclo.

### No persistir el catálogo remoto por accidente

`persist()` también se utiliza al guardar configuración local. Actualmente serializa todo `state`, incluidos productos y lanzamientos. Antes de modificar la carga, añade junto a las variables iniciales:

```js
const localCatalogBeforeRemote = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { products: saved?.products || [], launches: saved?.launches || [] };
  } catch {
    return { products: [], launches: [] };
  }
})();
```

Dentro de `persist()`, reemplaza solamente:

```js
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
```

por:

```js
const localState = CATALOG_READ_ONLY
  ? { ...state, ...localCatalogBeforeRemote }
  : state;
localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
```

Así conservas la copia local anterior mientras el estado visible contiene datos remotos. No llames a `persist()` desde `loadRemoteCatalog()`. Este es un puente temporal: cuando integres las escrituras remotas, retira explícitamente los manejadores locales de catálogo; no basta con cambiar `CATALOG_READ_ONLY` a `false`.

Para no mostrar productos locales mientras llega la primera respuesta, inmediatamente después de cargar/normalizar `state` y antes de `window.adminCatalog = ...`, agrega:

```js
if (CATALOG_READ_ONLY) {
  state.products = [];
  state.launches = [];
}
```

Esto vacía solo el estado en memoria, no borra `localStorage`.

## 9. Prueba cada relación

Crea datos de prueba en Supabase, en este orden:

1. **category:** usa una categoría existente, por ejemplo `tshirts`.
2. **product:** identificador `prueba-camiseta`, nombre, `category_code=tshirts`, `price_cents=29900`, stock, estado `active` y `published=true`.
3. **product_variant:** `product_id=prueba-camiseta`, etiqueta `M`, orden 1. El UUID se genera automáticamente.
4. **Storage:** sube una imagen a `dtshop-products`.
5. **product_media:** `product_id=prueba-camiseta`, `kind=product`, `storage_key` igual a la ruta del archivo dentro del bucket.
6. **launch:** crea un lanzamiento con identificador, nombre y estado.
7. **launch_product:** vincula el identificador del lanzamiento con `prueba-camiseta`.

En el panel pulsa Actualizar catálogo. Debes ver el producto a Q299 y el lanzamiento asociado. Comprueba también en las herramientas del navegador que `listProducts()` devuelve la variante M; la tabla actual no necesariamente muestra todas las variantes.

Prueba luego: recargar, iniciar con finanzas, abrir otro navegador, dejar tablas vacías y simular falta de conexión. Comprueba que no aparezcan datos ficticios como reemplazo y que los botones de edición sigan bloqueados incluso después de buscar productos.

## 10. La siguiente etapa: guardar

Los ejemplos anteriores conectan **lectura**, no creación ni edición. Para el guardado completo:

1. Diseña una función SQL/RPC que valide el rol y guarde producto, variantes y metadatos de imágenes en una transacción. Esa función todavía no está creada.
2. Agrega `saveProduct(payload)` a `catalog-api.js` y llama a esa RPC; el nombre y parámetros deben coincidir con la función que crees.
3. En el submit del formulario, convierte quetzales a centavos enteros, sube los archivos nuevos y construye el payload. Espera la respuesta antes de cerrar el formulario.
4. Si falla, conserva el borrador y muestra el error. Si funciona, llama a `loadRemoteCatalog()`.
5. Archiva productos mediante estado `archived`. No elimines variantes referenciadas por pedidos.
6. Implementa de la misma forma el guardado conjunto de `launch` y `launch_product`.
7. Retira las escrituras locales y adapta la validación de imágenes: actualmente acepta assets/Base64; deberá aceptar rutas existentes de Storage y archivos nuevos.

Storage se sube fuera de la transacción SQL: contempla archivos huérfanos si falla el guardado. No agregues permisos amplios para solucionar errores; utiliza los roles y políticas existentes.

No uses una serie de inserts independientes para afirmar que el producto completo se guardó: podría quedar incompleto si falla una variante.

## 11. Qué queda fuera

- `app.js` (tienda pública) necesita su propia integración de lectura. Estos pasos conectan el administrador.
- Pedidos utilizan `place_order` y `set_order_status`.
- Ventas y contabilidad utilizan las solicitudes y aprobaciones de `sql/SUPABASE.md`.
- Las pruebas actuales que simulan Supabase necesitarán soportar las nuevas consultas `.range()` y relaciones antes de ejecutar esta siguiente etapa.

## Lista de comprobación

- [ ] `catalog-api.js` tiene las tres consultas y el helper de imágenes.
- [ ] `admin.js` convierte filas a su formato de pantalla.
- [ ] Inicio de sesión y recarga consultan el catálogo automáticamente.
- [ ] Actualizar catálogo muestra carga, error o resultado.
- [ ] Cerrar sesión descarta respuestas pendientes.
- [ ] Catálogo remoto no se confunde con guardado local.
- [ ] Se verificaron producto, variantes, imágenes y lanzamiento.
- [ ] El guardado sigue bloqueado hasta implementar sus RPC.
