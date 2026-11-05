# DIRTYTASK — DT Shop

Tienda web en español para Dirtytask Clothing Store, Guatemala, con catálogo, lanzamientos, bolsa y checkout conectados a Supabase.

[Repositorio público](https://github.com/ro-garcia/dtshop)

## Funciones

- Catálogo adaptable con búsqueda, categorías, orden por precio y selector global Product / Look.
- Sección «Compra por categoría» con imágenes de los productos publicados y acceso directo al catálogo filtrado.
- Sección editorial de piezas recién ingresadas con enlaces a las fichas del catálogo.
- Anuncios de próximos drops desplegables, con precios, fechas y modelos vinculados.
- Videos de TikTok de Dirtytask cargados al entrar en pantalla; la reproducción se silencia automáticamente.
- Bolsa en el navegador y checkout con registro de pedidos en Supabase.

## Uso local

Sirve esta carpeta desde un servidor HTTP local o tu hosting y abre `index.html` en Chrome o Edge. No necesita compilación. Supabase, los videos y las tipografías de Google Fonts requieren conexión a internet.

La tienda pública lee catálogo, variantes, imágenes, lanzamientos y contenido desde Supabase. El checkout consulta precios, stock, departamentos, tarifas y métodos habilitados y registra pedidos pendientes de confirmación mediante una sesión de invitado. No procesa pagos. Consulta [la integración pública](docs/storefront-integration.md) y [la activación de pedidos](docs/orders-integration.md).

### Panel de administración

El panel `admin.html` usa Supabase Auth y requiere un socio activo de operaciones o finanzas. El catálogo del administrador consulta categorías, productos, variantes, imágenes y lanzamientos desde Supabase. Operaciones puede crear, editar y archivar productos y cerrar lanzamientos; Finanzas solo los consulta. Para activar el guardado, instala la migración indicada en [la integración del catálogo](docs/catalog-integration.md).

Contenido y configuración también consultan Supabase: textos, redes sociales, videos, tarifas de envío y métodos de pago. Operaciones guarda cada sección con su botón; Finanzas puede consultarla. Activa este guardado con `sql/store-integration.sql`; consulta [la guía de contenido y configuración](docs/store-integration.md).

La imagen del banner se cambia desde **Contenido**, con vista previa y opción de volver a la original. Para habilitarla ejecuta `sql/banner-integration.sql` después de la migración de contenido. Los pedidos incluyen búsqueda, detalle desplegable y confirmación de cancelación. Las recargas usan controles discretos y los errores se muestran en su sección.

El catálogo público usa un cliente anónimo separado de la sesión administrativa. El checkout usa otra sesión para el comprador. En **Pedidos**, ambos socios pueden consultar datos de entrega, líneas e historial; Operaciones confirma, prepara, envía, entrega o cancela. Instala `sql/orders-integration.sql` y habilita Anonymous Sign-Ins para activar el registro. La edición del perfil sigue pendiente de integración.

### Verificación del panel

Con Node.js, `playwright` y Microsoft Edge disponibles, ejecuta `node tests/catalog-browser.cjs`, `node tests/store-browser.cjs` y `node tests/orders-browser.cjs`. Comprueban los flujos remotos con un cliente simulado. `node tests/supabase.cjs` ejecuta las migraciones y verifica permisos y transacciones con `@electric-sql/pglite`.

### Contabilidad

**Contabilidad** consulta cuentas, libros, ventas, cobros, mensajería, obligaciones y solicitudes reales de Supabase. Activa la conexión ejecutando `sql/finance-integration.sql`. Finanzas prepara los movimientos y el otro socio los aprueba o rechaza; los pendientes no cambian saldos. El panel muestra los registros guardados en la base de datos.

Los registros y comprobantes persisten al recargar. Los saldos y reportes se calculan en PostgreSQL, los importes se manejan en centavos y las monedas permanecen separadas. Consulta [la guía de integración financiera](docs/finance-integration.md) para los roles, aprobaciones, cuadres y pruebas. No conecta bancos automáticamente ni procesa pagos en línea.

### Cuentas, ingresos, ventas y mensajería

Contabilidad ahora incluye Resumen, Cuentas y caja, Ventas y cobros, Mensajería, Ingresos y gastos y Obligaciones. Permite anticipos y pagos en distintas cuentas o efectivo, envío incluido/adicional, cobros individuales de Forza y liquidaciones individuales o agrupadas de Fast Delivery. El depósito real se concilia con retenciones y ajustes, sin duplicar entradas. Cada cobro puede tener comprobante.

Los libros de cuentas y obligaciones tienen apariencia de papel. El resumen compara rangos diarios, semanales y mensuales, separando efectivo disponible, ventas, saldos por cobrar y dinero pendiente de mensajería. Las cuotas se registran por monto total, sin desglose obligatorio; el saldo del banco es opcional y queda marcado por actualizar si no se informa.

Los pedidos confirmados pueden registrarse explícitamente como ventas desde **Ventas y cobros**, conservando sus importes y sin descontar inventario de nuevo. Crear una venta no registra un cobro. Los movimientos financieros y exportaciones utilizan el repositorio remoto descrito en [la guía financiera](docs/finance-integration.md).

## Estructura

```text
index.html       Catálogo y página principal
styles.css       Estilos compartidos
app.js           Catálogo, bolsa, checkout y videos
checkout.html    Detalles de facturación
checkout.css     Estilos del checkout
checkout.js      Resumen del pedido
assets/          Logotipos, fotos y gráficos
```

## Créditos y derechos

El logo, la mascota y la bolsa de Dirtytask fueron compartidos para este proyecto. Las fotos de producto corresponden a publicaciones públicas de [@dirtytask](https://www.instagram.com/dirtytask/?hl=es). La fotografía editorial de portada es de Jakob Owens en Unsplash: [Man wearing a hoodie in a crowded city](https://unsplash.com/photos/man-wearing-a-hoodie-in-a-crowded-city-z2Xg_AtyjAw). El sitio también usa Barlow Condensed, DM Sans e IBM Plex Mono desde Google Fonts y videos embebidos desde TikTok.

Los nombres y logotipos de Adidas, RIPNDIP, Crocs y Pokémon pertenecen a sus respectivos titulares. Este proyecto es una implementación independiente y no implica afiliación. No se incluye una licencia que autorice reutilizar las fotos, los logotipos o las marcas.
