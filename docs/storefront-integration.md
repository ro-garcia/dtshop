# Tienda pública y resumen del checkout

`storefront-api.js` crea un cliente público independiente de Supabase. No restaura la sesión administrativa ni lee sus credenciales guardadas: usa `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false` y una clave de almacenamiento distinta. Consulta `dtshop` con la clave pública de `supabase-config.js`.

## Activar y comprobar

No necesitas una nueva migración para este paso. Las tablas y permisos de lectura anónima ya están definidos en la instalación original de `sql/supabase.sql`. Conserva `dtshop` expuesto en Data API; el límite de respuesta debe ser de 1000 filas o más. Las migraciones de catálogo y configuración siguen siendo necesarias para guardar desde el administrador.

1. Sirve la carpeta por HTTP y abre `index.html` sin iniciar sesión.
2. Desde Operaciones, crea un producto con una categoría y tallas, estado **Activo** y **Visible en el catálogo**. Recarga la página pública: debe aparecer con su precio e imagen.
3. Cambia el estado a Borrador o Archivado. Al recargar la tienda ya no debe aparecer.
4. Crea una preventa y vincúlala a un lanzamiento abierto o próximo. El lanzamiento muestra sus modelos, incluso cuando la preventa no está en la cuadrícula general.
5. Cambia textos y videos desde Contenido, guarda y recarga la tienda. Una lista vacía de videos se conserva vacía.
6. Agrega una talla a la bolsa, recarga y verifica que se conserve. Continúa al resumen: las tarifas se calculan con `department.is_metro` y los importes de `store_setting`; solo aparecen métodos habilitados.

La carga se realiza al abrir o recargar la página. No hay sincronización en tiempo real. Conserva las restricciones RLS del esquema original; no concedas permisos de escritura anónimos.

## Consultas y visualización

| Tablas | Uso público |
|---|---|
| `category` | Filtros, navegación y etiquetas |
| `product`, `product_variant`, `product_media` | Productos activos publicados; tallas con UUID e imágenes públicas |
| `launch`, `launch_product` | Lanzamientos abiertos/próximos y sus productos accesibles |
| `content_block`, `content_video` | Textos, enlaces sociales y videos publicados |
| `store_setting`, `department`, `payment_method` | Moneda, tarifas, departamentos y opciones habilitadas del resumen |

La cuadrícula y la sección de recién ingresados usan productos publicados. Las preventas sin publicación general solo son accesibles cuando están vinculadas a un lanzamiento abierto o próximo. Borradores y archivados se excluyen también en la transformación del cliente, además de RLS.

Las imágenes se resuelven desde `dtshop-products`. Si falta una imagen, se muestra el logo de la tienda. Los videos de TikTok se cargan al entrar en pantalla; los videos de Instagram se abren mediante un enlace. Nombres, etiquetas y tallas se insertan como texto o HTML escapado.

## Bolsa y resumen

La bolsa se guarda en localStorage con producto, talla y cantidad. Se valida después de recibir el catálogo. La disponibilidad se limita por producto, sumando todas sus tallas; una preventa permite hasta 99 unidades. Una lectura fallida no borra la bolsa guardada y muestra un botón para reintentar.

Al continuar se conserva la referencia de variante y se vuelve a consultar Supabase. El resumen ignora nombres, precios e imágenes guardados por el navegador. Calcula con centavos enteros y los valores actuales del catálogo. Si falta una pieza o talla, hay líneas duplicadas o el stock es insuficiente, bloquea la continuación y solicita revisar la bolsa. No descarta líneas silenciosamente para generar un pedido parcial.

El botón **Consultar disponibilidad** muestra el contacto de la tienda. No envía datos personales, no reserva inventario, no cobra y no registra un pedido. Para registrar pedidos reales debe integrarse un flujo autenticado o un endpoint de servidor; `place_order` no se expone a visitantes anónimos.

## Pruebas

```text
node --test tests/storefront-api.test.cjs
node tests/storefront-browser.cjs
node tests/supabase.cjs
```

Las pruebas del navegador usan un cliente simulado y Edge. Comprueban catálogo, filtros, tallas, stock, bolsa, precios alterados en el navegador, envío por departamento, métodos habilitados y fallos de carga. Las pruebas SQL instalan el esquema en PostgreSQL embebido y verifican los permisos reales del rol anónimo, incluidas las exclusiones de borradores y pedidos privados.
