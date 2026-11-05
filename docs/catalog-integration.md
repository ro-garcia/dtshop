# Catálogo del administrador conectado a Supabase

El administrador reutiliza `window.dirtytaskSupabase`, creado por `admin-auth.js`. Carga al iniciar sesión y con **Actualizar catálogo**. No hay sincronización en tiempo real.

| Tabla | Integración |
|---|---|
| `category` | Consulta para selector y etiquetas |
| `product` | Consulta, creación, edición y archivado |
| `product_variant` | Consulta y guardado de tallas; conserva UUID por etiqueta |
| `product_media` | Consulta y guardado de rutas de imágenes |
| `launch` | Consulta, creación, edición y cierre |
| `launch_product` | Consulta y guardado de modelos vinculados y su orden |

## Activar en el proyecto existente

1. Con el esquema de `sql/supabase.sql` ya instalado, ejecuta **todo `sql/catalog-integration.sql`** en el SQL Editor de Supabase. No vuelvas a ejecutar la instalación inicial ni `dirtytask.sql`. La migración se puede repetir y no introduce datos de ejemplo.
2. Conserva `dtshop` expuesto en Data API y el bucket público `dtshop-products`, con las políticas de la instalación inicial.
3. Abre `admin.html` desde un servidor HTTP local o el hosting e inicia sesión con el socio de operaciones. No subas imágenes desde `file://`.
4. Comprueba carga, creación, edición y recarga de un producto de prueba; verifica tallas e imágenes. Crea un lanzamiento, vincula ese producto y comprueba su persistencia al recargar.
5. Con Finanzas, verifica que puedes consultar, pero no editar.

Sin la migración funciona la lectura; al intentar guardar se muestra la instrucción para instalarla. El código local no instala automáticamente funciones en el proyecto remoto.

## Guardado y errores

`catalog-api.js` consulta páginas de 1000 filas (mantén el límite de Data API en 1000 o más) con orden estable. El administrador aplica productos y lanzamientos cuando ambas consultas terminan. Una carga fallida conserva lo visible, lo marca como anterior y bloquea la edición hasta reintentar. Una respuesta vacía elimina las filas anteriores. Las respuestas de sesiones anteriores se descartan.

Las imágenes nuevas se suben con rutas únicas `usuario/uuid.ext`; las imágenes existentes conservan su ruta. Cada RPC guarda el producto completo o el lanzamiento completo en una transacción, con validación del rol de operaciones en PostgreSQL. Los precios se convierten entre quetzales y centavos. Un registro cambiado desde la última carga requiere actualizar antes de editarlo, para proteger también cambios de stock.

Archivar productos y cerrar lanzamientos conserva sus relaciones. No se eliminan productos ni lanzamientos desde el editor. Las variantes usadas en pedidos no se pueden quitar y las etiquetas que permanecen conservan sus identificadores.

Storage y PostgreSQL son servicios separados: si la subida funciona y luego falla el guardado, puede quedar un archivo sin referencia. No se borran archivos existentes automáticamente. No se migran productos locales de demostración; el catálogo remoto no se guarda en localStorage.

## Alcance

La integración del administrador se complementa con [contenido y configuración](store-integration.md), [la tienda pública](storefront-integration.md), [pedidos](orders-integration.md) y [contabilidad](finance-integration.md). El navegador no contiene claves administrativas ni de servicio.

## Verificación local

Con `playwright`, Microsoft Edge y `@electric-sql/pglite` disponibles:

```text
node --test tests/catalog-api.test.cjs
node tests/supabase.cjs
node tests/catalog-browser.cjs
node tests/categories-browser.cjs
```

Las pruebas SQL ejecutan la instalación y la migración en PostgreSQL embebido; las del navegador usan un cliente simulado. No sustituyen la comprobación contra el proyecto real.
