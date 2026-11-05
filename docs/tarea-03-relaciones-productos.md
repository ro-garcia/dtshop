# Tarea 3: consultar las variantes e imágenes de cada producto

## Punto de partida

La corrección de `window` ya está guardada en ambos archivos y la comprobación de sintaxis pasó. Esto no sustituye la prueba contra tu Supabase: si la consulta actual muestra un error en la consola, compártelo antes de continuar.

Ya tienes este recorrido: inicio de sesión → `loadProducts()` en admin.js → `listProducts()` en catalog-api.js → resultados en la consola.

## Objetivo: un solo cambio

Ampliaremos **el select de listProducts()**, para recibir los campos del producto y sus variantes e imágenes. No modificaremos `admin.js` ni el guardado en esta tarea.

## 1. Entiende las relaciones

Un producto puede tener varias tallas e imágenes. Estas se guardan en tablas separadas:

| Tabla | Datos | Relación |
|---|---|---|
| `product` | Identificador, nombre, precio, stock, etc. | Su clave es `id` |
| `product_variant` | Etiquetas como S, M o L | `product_id` apunta a `product.id` |
| `product_media` | Tipo de imagen y ruta del archivo | `product_id` apunta a `product.id` |

Esas relaciones ya están definidas con claves foráneas en el SQL. Supabase puede usarlas para devolver cada producto acompañado de sus filas relacionadas.

## 2. Cambia solamente el select

En [`catalog-api.js`](../catalog-api.js), dentro de `listProducts()`, busca:

```js
.select('id,name,price_cents,description')
```

Reemplaza esa línea por este bloque:

```js
.select(`
  id,
  name,
  description,
  category_code,
  price_cents,
  stock,
  status,
  published,
  preorder,
  variant_label,
  product_variant(id, label, sort_order),
  product_media(id, kind, storage_key)
`)
```

Usa **acentos graves o backticks** alrededor del texto: `` ` ``. Permiten escribir una cadena de texto en varias líneas. No uses comillas simples alrededor de este bloque multilínea.

Conserva `.order('name');` debajo. Esta parte de tu función quedará así:

```js
const { data, error } = await client
  .schema('dtshop')
  .from('product')
  .select(`
    id,
    name,
    description,
    category_code,
    price_cents,
    stock,
    status,
    published,
    preorder,
    variant_label,
    product_variant(id, label, sort_order),
    product_media(id, kind, storage_key)
  `)
  .order('name');
```

Conserva también la comprobación del cliente, `if (error) throw error;` y `return data || [];`. No cambies `listCategories()`.

## 3. Qué acabas de escribir

Los primeros nombres son columnas de `product`.

Estas dos partes solicitan datos relacionados:

```text
product_variant(id, label, sort_order)
product_media(id, kind, storage_key)
```

Dentro de los paréntesis indicas las columnas que quieres recibir de cada tabla relacionada. No estás ejecutando funciones JavaScript: todo ese texto forma parte de la consulta que interpreta Supabase.

El resultado de cada producto tendrá esta forma ilustrativa —no pegues estos datos en el archivo—:

```js
{
  id: "camiseta-ejemplo",
  name: "Camiseta",
  price_cents: 29900,
  // ...otros campos...
  product_variant: [
    { id: "uuid-de-la-variante", label: "M", sort_order: 1 }
  ],
  product_media: [
    {
      id: "uuid-de-la-imagen",
      kind: "product",
      storage_key: "usuario/carpeta/foto.webp"
    }
  ]
}
```

`product_variant` y `product_media` son **arreglos dentro de cada producto**. Si no hay registros relacionados visibles para tu sesión, serán arreglos vacíos; el producto puede seguir apareciendo.

`kind` diferencia la imagen principal (`product`) de la imagen del look (`look`). `storage_key` es una ruta dentro de Storage, no el archivo ni su URL pública. Aprenderemos a mostrar esa imagen después.

## 4. Guarda y prueba

1. Guarda `catalog-api.js`.
2. Recarga el administrador e inicia sesión si hace falta.
3. Abre F12 → Consola. La carga automática de la tarea anterior ya usará la consulta ampliada.
4. Para inspeccionar los arreglos más cómodamente, ejecuta:

```js
const productosConRelaciones = await window.catalogApi.listProducts();
console.log(productosConRelaciones);
```

Expande un producto con la flecha de la consola y busca `product_variant` y `product_media`.

Si recibiste al menos un producto, también puedes ejecutar:

```js
console.table(productosConRelaciones[0].product_variant);
console.table(productosConRelaciones[0].product_media);
```

`[0]` selecciona el primer producto recibido. `.order('name')` ordena productos; no garantiza el orden de las variantes dentro de cada producto. Más adelante las ordenaremos con `sort_order`.

## 5. Cómo interpretar lo que ves

- **Productos con arreglos llenos:** la consulta encontró registros relacionados.
- **Productos con arreglos vacíos:** revisa si existen filas en las tablas relacionadas con el `product_id` correcto y si son visibles para tu sesión.
- **Lista principal vacía:** no hay productos visibles; aún no puedes inspeccionar el elemento `[0]`.
- **Error de relación:** comparte el mensaje. Revisaremos las claves foráneas y el esquema; no desactives RLS ni inventes relaciones en el código.

No necesitas crear datos de prueba para fingir un resultado. Un arreglo vacío también es un resultado que debemos entender.

## 6. Preguntas para comprobar lo aprendido

1. ¿Qué campo conecta una variante con su producto?
2. ¿Por qué `product_variant` es un arreglo y no solo un texto?
3. ¿Cuál es la diferencia entre `storage_key` y una URL de imagen?

## Termina aquí

- [ ] Modifiqué únicamente el select de productos.
- [ ] Conservé la consulta de categorías y el manejo de errores.
- [ ] Inspeccioné la respuesta real en la consola.
- [ ] Entiendo si las relaciones tienen registros o están vacías.

Dime **«revisa la tarea 3»** y cuéntame qué devolvió Supabase. Después aprenderemos a convertir esos datos al formato de la pantalla; todavía no conectamos escrituras.
