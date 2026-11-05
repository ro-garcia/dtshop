# Contenido y configuración del administrador

Esta integración reutiliza el cliente de `admin-auth.js`, mediante `store-api.js`. Carga cada sección al iniciar sesión y permite actualizarla con su botón. No usa datos de ejemplo ni guarda estos datos en localStorage.

| Tabla | Integración |
|---|---|
| `content_block` | Lectura y guardado de textos y enlaces sociales del registro `id = 1` |
| `content_video` | Lectura, orden y guardado de hasta 12 videos distintos de TikTok o Instagram |
| `content_block.hero_image_key` | Imagen del banner principal desde Storage, con `sql/banner-integration.sql` |
| `store_setting` | Lectura y guardado de las dos tarifas de envío del registro `id = 1` |
| `payment_method` | Lectura de métodos y actualización de `enabled` para efectivo, Visa cuotas y Visalink |

## Activar en Supabase

1. Con la instalación original ya existente, ejecuta **todo `sql/store-integration.sql`, desde `BEGIN;` hasta `COMMIT;`**, en el SQL Editor. No vuelvas a ejecutar `supabase.sql` ni `dirtytask.sql`. La migración se puede repetir y no reemplaza datos existentes.
2. Recarga `admin.html` e inicia sesión con Operaciones. Verifica que Contenido y Configuración muestran “Datos cargados desde Supabase”.
3. Cambia un texto o agrega un video y pulsa **Guardar contenido**. Recarga y comprueba el resultado. Una lista sin videos también es válida y se conserva vacía.
4. Cambia una tarifa, por ejemplo a `30.25`, y elige al menos un método de pago. Pulsa **Guardar cambios**, recarga y verifica que se conserve.
5. Con Finanzas, comprueba que puedes consultar y actualizar la lectura, pero no editar.

La lectura funciona con las tablas originales. Sin la nueva migración, el intento de guardar muestra qué archivo falta ejecutar. El código local no aplica la migración al proyecto remoto.

## Comportamiento

### Banner principal

Después de la migración de contenido, ejecuta **todo `sql/banner-integration.sql`** en Supabase. Agrega la ruta de la imagen al bloque de contenido y actualiza su guardado sin reemplazar textos ni videos. La migración se puede repetir. Si todavía no está instalada, los textos y videos siguen funcionando y los controles de imagen indican cómo habilitarlos.

En **Contenido → Mensaje de la tienda**, usa **Cambiar imagen** para seleccionar un JPG, PNG o WEBP de hasta 15 MB. La vista previa permite revisar la selección antes de **Guardar contenido**. La imagen se sube al bucket público existente `dtshop-products`, con una ruta única del socio de operaciones. Una lectura fallida o un guardado fallido no descartan el formulario; si ya se subió la imagen, reintentar el guardado reutiliza esa subida.

**Usar imagen original** prepara el regreso a `assets/campaign-city.jpg`; también requiere guardar. Los visitantes ven el cambio al recargar la página principal. Los archivos anteriores se conservan en Storage. Finanzas puede consultar la imagen, pero no cambiarla.

### Mensajes y actualización

Los avisos amarillos de carga se eliminaron. La carga normal se anuncia de forma accesible sin ocupar espacio, los errores se muestran junto a su sección y los controles de recarga son iconos discretos con etiqueta accesible. Al guardar, el botón confirma brevemente **Guardado**.

El guardado es explícito: cambiar un campo, agregar un video o quitarlo prepara el formulario. Para persistir los cambios debes pulsar el botón de la sección. Los enlaces inválidos o repetidos se rechazan; no se eliminan silenciosamente.

El backend guarda textos y videos en una transacción; tarifas y métodos de pago se guardan en otra. Si falla una relación o validación, se revierte todo ese guardado. Las tarifas se convierten a centavos enteros. Se conservan la moneda configurada, las etiquetas y detalles de los métodos de pago, y los UUID de los videos cuya URL permanece.

Cada guardado comprueba el rol y la versión leída. Si el registro cambió desde la última carga, el administrador debe actualizar la sección antes de guardar. Durante una petición se bloquean sus controles para evitar envíos duplicados. Un guardado fallido conserva el formulario; una lectura fallida conserva lo visible, lo marca como posiblemente anterior y bloquea la edición hasta reintentar. Las respuestas de sesiones anteriores se descartan.

Actualizar una sección vuelve a cargar sus campos desde Supabase; guarda primero cualquier cambio que quieras conservar.

## Alcance y pruebas

La página pública consulta estos textos y videos, y el checkout usa las tarifas y métodos habilitados: consulta [la integración pública](storefront-integration.md), [pedidos](orders-integration.md) y [contabilidad](finance-integration.md). La edición del perfil sigue pendiente de integración.

Pruebas locales:

```text
node --test tests/store-api.test.cjs
node tests/supabase.cjs
node tests/store-browser.cjs
```

La prueba SQL requiere `@electric-sql/pglite`; la del navegador, `playwright` y Microsoft Edge. Ejecutan las funciones en PostgreSQL embebido y la interfaz con un cliente simulado. La comprobación contra tu proyecto real se realiza después de ejecutar la migración.
