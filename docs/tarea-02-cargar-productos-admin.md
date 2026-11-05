# Tarea 2: llamar la consulta desde admin.js automáticamente

## Revisión de tu código: corrección antes de avanzar

**Última revisión:** en los archivos guardados todavía aparece `Window` en dos lugares. Puede que falte guardar tus cambios. Corrige ambos y guarda con **Ctrl + S**:

En `catalog-api.js`, dentro de `listProducts()`:

```js
const client = window.dirtytaskSupabase;
```

En `admin.js`, dentro del `catch` de `loadProducts()`:

```js
if (window.adminIdentity?.id !== userId) return;
```

En ambos casos escribe **window con w minúscula**. No cambies solamente uno: el primero obtiene el cliente y el segundo permite manejar correctamente los errores. Después recarga el administrador y revisa la consola.

Ya agregaste `loadProducts()` y la llamas al iniciar sesión. También agregaste `description` al `select` de productos: ese campo existe y está bien incluirlo.

Ahora corrige este detalle dentro del `catch` de `loadProducts()`:

```js
// Actualmente escribiste:
if (Window.adminIdentity?.id !== userId) return;

// Debe ser:
if (window.adminIdentity?.id !== userId) return;
```

JavaScript distingue mayúsculas y minúsculas. `window` es el objeto global del navegador donde guardamos `adminIdentity`. `Window` es una referencia diferente: no contiene la identidad que guardamos. Por eso, esa condición puede salir del `catch` antes de mostrar el error real.

También escribiste:

```js
if (event.detail){ loadCategories(), loadProducts(); }
```

Es válido: la coma evalúa ambas llamadas. Para que cada instrucción sea más clara al aprender, escríbelo así, conservando el `else` de debajo:

```js
if (event.detail) {
  loadCategories();
  loadProducts();
}
```

### Prueba del manejo de errores, sin cambiar Supabase

Después de guardar y recargar, inicia sesión y abre la consola. Ejecuta:

```js
// Simulamos un fallo del método solo en esta página para probar el catch.
// catalogApi está congelado, así que sustituimos temporalmente la referencia.
const apiOriginal = window.catalogApi;
window.catalogApi = {
  ...apiOriginal,
  async listProducts() {
    throw new Error("Error de práctica: consulta interrumpida");
  }
};

// El listener existente llamará de nuevo a loadProducts().
document.dispatchEvent(new CustomEvent("dirtytask:auth", {
  detail: window.adminIdentity
}));
```

Debes ver `Error al cargar productos desde Supabase:` y el error de práctica. Hazlo sin formularios abiertos: el evento vuelve a dibujar el panel. No se cambia la base de datos ni se concede ningún permiso.

**Recarga la página al terminar** para restaurar la API real. Comprueba que vuelve a consultar productos normalmente. No pegues este código de simulación en tus archivos.

Cuando termines esta corrección, el siguiente ejercicio será ampliar las columnas de productos y entender las relaciones con variantes e imágenes. Aún no vamos a modificar la tabla visual.

## Lo que ya hiciste

Tu función `listProducts()` está escrita en `catalog-api.js`: consulta `id`, `name` y `price_cents`, comprueba errores y devuelve los datos. Su sintaxis pasó la revisión.

Eso confirma la estructura del código, no la conexión real. Si todavía no has ejecutado la prueba en consola de la tarea 1, hazla primero. Si devuelve un error, compártelo antes de continuar. Una lista vacía puede ser un resultado válido.

## Objetivo de esta tarea

Hacer que **admin.js llame a listProducts() cuando inicias sesión**, para no escribir la llamada manualmente en la consola.

Por ahora verás los resultados en la consola, no en la tabla visual. No vamos a reemplazar `state.products` ni tocar el guardado: la consulta actual solo trae tres columnas y la pantalla necesita más información.

Recorrido de esta tarea:

**Inicio de sesión → admin.js → listProducts() → Supabase → consola.**

## 1. Agrega una función en admin.js

Abre [`admin.js`](../admin.js) y busca:

```js
async function loadCategories() {
```

Justo **antes de esa línea**, agrega esta función completa. Así queda dentro del mismo bloque principal del archivo y fuera de `loadCategories()`:

```js
async function loadProducts() {
  // Guardamos quién inició esta consulta.
  const userId = window.adminIdentity?.id;
  if (!userId) return;

  try {
    // Pedimos al archivo de consultas que traiga los productos.
    const products = await window.catalogApi.listProducts();

    // Si cerramos sesión o cambiamos de usuario, ignoramos la respuesta.
    if (window.adminIdentity?.id !== userId) return;

    // En esta práctica solo observamos los resultados.
    console.log("Productos consultados desde admin.js:");
    console.table(products);
  } catch (error) {
    if (window.adminIdentity?.id !== userId) return;
    console.error("No se pudieron cargar los productos:", error);
  }
}
```

### Qué significa

| Parte | Explicación |
|---|---|
| `loadProducts()` | Función de la pantalla que coordina la carga |
| `listProducts()` | Función de catalog-api.js que consulta la base de datos |
| `window.adminIdentity?.id` | Lee el identificador del usuario; `?.` evita un error si no hay identidad |
| `if (!userId) return` | Termina sin consultar si no hay usuario identificado |
| `try` | Agrupa el trabajo que puede fallar |
| `await` | Espera el resultado antes de continuar dentro de esta función |
| `const products` | Guarda el arreglo recibido en una variable local |
| `catch (error)` | Recibe el error que lanzó la consulta |
| `console.table(products)` | Muestra el arreglo como tabla para inspeccionarlo |

La segunda comprobación del usuario es útil porque la consulta tarda: alguien puede cerrar sesión antes de que termine. Esta comprobación es de interfaz; los permisos reales siguen siendo responsabilidad de Supabase y RLS.

## 2. Conecta la función al inicio de sesión

En `admin.js`, busca esta línea exacta dentro del listener de `dirtytask:auth`:

```js
if (event.detail) loadCategories();
```

Reemplaza **solo esa línea** por:

```js
if (event.detail) {
  loadCategories();
  loadProducts();
}
```

Conserva el `else` que ya está debajo. El final de ese listener debe verse así:

```js
    setLoggedIn(Boolean(event.detail));
    applyRoleControls();

    if (event.detail) {
      loadCategories();
      loadProducts();
    }
    else {
      categoriesRequest++;
      categoriesReady = false;
      categoryLabels = Object.create(null);
    }
  });
```

**No agregues otro listener ni reemplaces todo admin.js.** Solo añadiste una función y una llamada dentro del listener existente.

### Por qué esto lo hace automático

El login emite `dirtytask:auth` cuando verifica la identidad. El listener recibe ese evento; si `event.detail` contiene el perfil, llama a las funciones de carga.

Al recargar con una sesión válida, el login vuelve a verificarla y emite el evento. Por eso también se consultan los productos al recargar.

Estas dos llamadas no esperan una a la otra: categorías y productos pueden consultarse de manera independiente. No estamos agregando actualización en tiempo real ni consultas periódicas.

## 3. Guarda y prueba

1. Guarda `admin.js`.
2. Opcionalmente comprueba su sintaxis desde la terminal del proyecto:

```powershell
node --check admin.js
```

3. Abre el administrador y **F12 → Consola**.
4. Recarga la página. Si no hay sesión, inicia sesión.
5. Sin escribir una llamada manual, busca el mensaje:

```text
Productos consultados desde admin.js:
```

Debajo debe aparecer la tabla con los registros recibidos. Si no hay productos visibles, el arreglo estará vacío. Si falla la consulta, aparecerá el mensaje de `console.error` con el error recibido.

La tabla visual del administrador no cambia todavía: eso es lo esperado.

## 4. Comprueba lo aprendido

Antes de continuar, intenta explicar:

1. ¿Cuál función consulta Supabase y cuál coordina la carga en la pantalla?
2. ¿Qué instrucción hace que la consulta se ejecute al iniciar sesión?
3. ¿Dónde llega el error que produce `throw error` en catalog-api.js?

## Termina aquí

- [ ] Agregué `loadProducts()` fuera de otras funciones.
- [ ] La llamé desde el listener existente de autenticación.
- [ ] Conservé `loadCategories()` y el bloque `else`.
- [ ] Vi el resultado automáticamente en la consola.

Dime **«revisa la tarea 2»** cuando termines. Revisaremos tu código antes de ampliar la consulta y mostrar los productos en pantalla.
