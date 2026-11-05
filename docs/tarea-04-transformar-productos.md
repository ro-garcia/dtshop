# Tarea 4: preparar los productos para la pantalla

Ya confirmaste que Supabase devuelve un arreglo con productos. Ahora aprenderemos a transformar cada registro al formato que utiliza `admin.js`.

**En esta tarea solo transformamos y observamos el resultado en consola.** No reemplazamos `state.products`, no modificamos la tabla visual y no guardamos datos.

## 1. Por qué necesitamos transformar

La base de datos y la pantalla usan nombres diferentes:

| Supabase devuelve | El administrador utiliza | Conversión |
|---|---|---|
| `category_code` | `category` | Cambiar el nombre de la propiedad |
| `price_cents` | `price` | Dividir entre 100 |
| `variant_label` | `variantName` | Cambiar el nombre de la propiedad |
| `product_variant` | `variants` | Extraer las etiquetas de las variantes |
| `product_media` | `image`, `lookImage` | Buscar la ruta y obtener la URL pública |

No cambiaremos columnas en Supabase. Crearemos objetos nuevos en memoria para que la pantalla los pueda entender.

## 2. Agrega una función en admin.js

Abre [`admin.js`](../admin.js). Busca `async function loadProducts()`.

**Antes de esa función**, dentro del bloque principal del archivo, agrega:

```js
function productFromDatabase(row) {
  // Copiamos las variantes antes de ordenarlas.
  const variantRows = [...(row.product_variant || [])];

  // Orden numérico; si empatan, ordenamos por etiqueta.
  variantRows.sort((a, b) =>
    a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  // Cada variante es un objeto; la pantalla necesita sus etiquetas.
  const variantLabels = variantRows.map(variant => variant.label);

  // Cada producto puede tener una imagen principal y una del look.
  const media = row.product_media || [];
  const mainPhoto = media.find(photo => photo.kind === 'product');
  const lookPhoto = media.find(photo => photo.kind === 'look');

  // Convierte una ruta de Storage en URL pública, si existe la ruta.
  function imageUrl(storageKey) {
    if (!storageKey) return '';

    const { data } = window.dirtytaskSupabase.storage
      .from('dtshop-products')
      .getPublicUrl(storageKey);

    return data.publicUrl;
  }

  // Devolvemos un objeto nuevo con los nombres que usa el administrador.
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
    variants: variantLabels,
    variantRecords: variantRows,
    image: imageUrl(mainPhoto?.storage_key),
    lookImage: imageUrl(lookPhoto?.storage_key)
  };
}
```

Esta función recibe **un producto** (`row`) y devuelve **un producto transformado**. No recibe todo el arreglo.

## 3. Entiende las herramientas nuevas

### Copiar un arreglo: [...arreglo]

```js
const variantRows = [...(row.product_variant || [])];
```

`...` copia los elementos a un arreglo nuevo. Lo hacemos porque `.sort()` modifica el arreglo que ordena. Es una copia superficial: los objetos internos siguen siendo los mismos, pero aquí solo cambiamos su orden, no sus propiedades.

`|| []` permite trabajar con un arreglo vacío si no recibimos variantes.

### Transformar elementos: map

```js
const variantLabels = variantRows.map(variant => variant.label);
```

Si las variantes son objetos con etiquetas M y L, el resultado será `['M', 'L']`. `.map()` devuelve un nuevo arreglo: no cambia las filas de Supabase.

Conservamos también `variantRecords`, con los UUID y demás campos, para no perder la información que necesitaremos al conectar el guardado.

### Buscar un elemento: find

```js
const mainPhoto = media.find(photo => photo.kind === 'product');
```

`.find()` devuelve el primer elemento que cumple la condición. Si no hay imagen principal, devuelve `undefined`.

Por eso usamos `mainPhoto?.storage_key`: `?.` permite leer la propiedad sin provocar un error cuando no encontramos una imagen.

### Obtener la dirección de una imagen

`getPublicUrl()` genera una URL para el bucket público `dtshop-products`. No sube el archivo ni verifica que exista. Si la ruta está equivocada, puedes obtener una URL que no muestre ninguna imagen.

Este método no necesita `await`: genera la URL de forma síncrona. La función de transformación tampoco necesita `async`.

## 4. Usa la función en loadProducts()

Dentro de `loadProducts()`, conserva la consulta y la comprobación del usuario:

```js
const products = await window.catalogApi.listProducts();
if (window.adminIdentity?.id !== userId) return;
```

Justo después, reemplaza los mensajes actuales de productos por:

```js
// Aplicamos la conversión a cada producto del arreglo.
const preparedProducts = products.map(productFromDatabase);

console.log('Datos originales de Supabase:', products);
console.log('Datos preparados para la pantalla:', preparedProducts);
console.table(preparedProducts);
```

No quites el `try`, el `catch` ni sus comprobaciones. No agregues todavía `state.products = preparedProducts` ni llames a `persist()`.

### Por qué no escribimos productFromDatabase()

En esta expresión:

```js
products.map(productFromDatabase)
```

Pasamos la función a `.map()` para que la ejecute con cada producto. Es equivalente a:

```js
products.map(product => productFromDatabase(product))
```

Si escribieras `products.map(productFromDatabase())`, ejecutarías la función inmediatamente, sin pasarle un producto. No es lo que queremos.

## 5. Guarda y prueba

1. Guarda `admin.js`.
2. Recarga el administrador e inicia sesión si hace falta.
3. Abre F12 → Consola.
4. Expande los datos originales y los preparados.

Comprueba sobre un mismo producto:

- El `id` y el `name` permanecen iguales.
- `category_code` pasó a llamarse `category`.
- Si `price_cents` era `29900`, `price` es `299`.
- `variants` contiene etiquetas; si no había variantes, es `[]`.
- `image` contiene una URL pública si hay una ruta de imagen principal; en caso contrario es una cadena vacía.

La división entre 100 convierte centavos a unidades de la moneda. No cambia USD a GTQ ni realiza conversiones de divisas.

## 6. Tu comprobación de comprensión

Antes de avanzar, intenta responder:

1. ¿Por qué usamos `.map()` para las variantes y `.find()` para la imagen principal?
2. ¿Cambiar `price_cents` por `price` en el objeto nuevo modifica la base de datos?
3. ¿Qué devuelve nuestra función si el producto no tiene imagen?

## Termina aquí

- [ ] Agregué `productFromDatabase()` fuera de `loadProducts()`.
- [ ] Apliqué la función con `.map()` después de recibir los productos.
- [ ] Comparé los datos originales y transformados en consola.
- [ ] No modifiqué `state.products` ni el guardado.

Dime **«revisa la tarea 4»** cuando termines. Después conectaremos los datos preparados con la tabla visual y trataremos los controles que aún guardan localmente.
