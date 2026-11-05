# Tarea 1: consultar productos reales de Supabase

Tú escribes el código y yo te guío. Esta tarea consiste en consultar productos reales y verlos en la consola. **Todavía no modificaremos `admin.js` ni guardaremos productos.**

## 1. Abre el archivo

Abre [`catalog-api.js`](../catalog-api.js). Conserva completa la función `listCategories()`.

Si ya escribiste `listProducts()` con datos de práctica, reemplaza únicamente esa función por el siguiente código. Si no existe, agrégala dentro de `Object.freeze({ ... })`, después de `listCategories()`.

Recuerda la coma después de la llave que cierra `listCategories()`: separa los dos métodos.

## 2. Escribe la consulta real

```js
async listProducts() {
  // 1. Reutilizamos el cliente que creó el login.
  const client = window.dirtytaskSupabase;

  // 2. Comprobamos que el cliente esté disponible.
  if (!client) {
    throw new Error("Primero configura Supabase e inicia sesión.");
  }

  // 3. Esperamos la respuesta de Supabase.
  const { data, error } = await client
    .schema("dtshop")
    .from("product")
    .select("id, name, price_cents")
    .order("name");

  // 4. Si la consulta falló, comunicamos el error.
  if (error) {
    throw error;
  }

  // 5. Entregamos los productos encontrados.
  return data || [];
}
```

No pegues este método fuera del objeto. La estructura debe ser:

```js
window.catalogApi = Object.freeze({
  async listCategories() {
    // CONSERVA AQUÍ TODA TU CONSULTA ACTUAL DE CATEGORÍAS.
  },

  async listProducts() {
    // AQUÍ VA EL CUERPO DE LA CONSULTA REAL DEL BLOQUE ANTERIOR.
  }
});
```

El segundo bloque es solo un mapa de ubicación. **No reemplaces tus consultas por esos comentarios.**

## 3. Entiende cada parte

| Código | Qué hace |
|---|---|
| `async listProducts()` | Define un método cuyo resultado se entrega mediante una Promise |
| `const client = window.dirtytaskSupabase` | Obtiene el cliente compartido; no crea otro |
| `if (!client)` | Comprueba que existe el cliente; no verifica por sí solo Internet ni la sesión |
| `.schema("dtshop")` | Selecciona el esquema de nuestras tablas |
| `.from("product")` | Selecciona la tabla de productos |
| `.select("id, name, price_cents")` | Solicita únicamente esas tres columnas |
| `.order("name")` | Ordena por nombre de forma ascendente |
| `await` | Espera la respuesta antes de continuar esta función |
| `const { data, error }` | Extrae los datos y el posible error del objeto de respuesta |
| `throw error` | Termina la función con un error que quien la llama puede manejar |
| `return data || []` | Devuelve los datos o, si no hay un valor en data, un arreglo vacío |

La consulta utiliza la sesión del cliente y los permisos RLS de Supabase. No necesitas claves secretas ni desactivar RLS.

## 4. Guarda y prueba

1. Guarda `catalog-api.js`.
2. Abre el administrador desde tu servidor local o sitio de pruebas y recarga. Si pruebas el sitio publicado, primero necesitas publicar el archivo actualizado.
3. Inicia sesión con uno de los socios.
4. Abre **F12 → Console / Consola**.
5. Ejecuta:

```js
const productosReales = await window.catalogApi.listProducts();
console.table(productosReales);
```

Definir la función no la ejecuta: los paréntesis `listProducts()` la llaman. `await` obtiene su resultado y `console.table()` lo muestra como tabla.

La consola de los navegadores modernos admite `await` directamente. Si repites la declaración y aparece un error de variable ya declarada, recarga antes de repetirla.

## 5. Interpreta el resultado

### Aparecen productos

Verás las columnas `id`, `name` y `price_cents`. Son registros reales visibles para tu cuenta.

Por ejemplo, `price_cents = 29900` representa 299 unidades de moneda: Q299 si la tienda utiliza GTQ.

### Aparece []

La consulta no encontró filas visibles. No significa necesariamente que falló.

Revisa **Supabase → Table Editor → esquema dtshop → product**. El script inicial no crea productos de prueba. Comprueba que existan registros, que estés usando el mismo proyecto y que tu cuenta tenga un rol de socio activo.

No agregues datos ficticios al código para ocultar este resultado. Si la tabla está vacía, revisaremos juntos ese caso.

### Aparece un error

| Síntoma | Qué revisar |
|---|---|
| `listProducts is not a function` | Guardaste el método dentro del objeto y recargaste la versión correcta |
| Cliente no disponible | Configuración de Supabase y carga del login |
| Error de sintaxis | Coma entre métodos y llaves de cierre |
| Esquema o tabla no encontrados | `dtshop` expuesto en Data API y tabla `product` instalada |
| Error de red | Internet y URL del proyecto |

Compárteme el mensaje para revisarlo. No compartas contraseñas ni tokens de sesión.

## 6. Practica con los datos recibidos

Consulta cuántos productos recibió esta respuesta:

```js
productosReales.length
```

Si es mayor que cero, ejecuta:

```js
productosReales[0].name
productosReales[0].price_cents / 100
```

- `[0]` accede al primer producto: los índices empiezan en cero.
- `.name` obtiene su nombre.
- Dividir los centavos entre 100 convierte el importe para mostrarlo.

Esta consulta está sujeta al límite de filas de Data API. `.length` cuenta los registros recibidos, no garantiza el total de toda la tabla. La paginación la veremos después.

## 7. Termina esta tarea antes de avanzar

- [ ] Conservé la función de categorías.
- [ ] Agregué la consulta real de productos.
- [ ] Guardé y recargué el administrador.
- [ ] Ejecuté la función en la consola.
- [ ] Identifiqué si recibí datos, una lista vacía o un error.

**Detente aquí y comparte el resultado.** Lo revisaremos antes de mostrar los productos en `admin.js`.

Esta práctica solo lee datos: no crea, modifica ni elimina productos en Supabase.
