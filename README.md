# DIRTYTASK — DT Shop

Catálogo web estático en español para Dirtytask Clothing Store, Guatemala. El repositorio contiene la interfaz del catálogo, los lanzamientos y el flujo visual de bolsa y checkout.

[Repositorio público](https://github.com/ro-garcia/dtshop)

## Funciones

- Catálogo adaptable con búsqueda, categorías, orden por precio y selector global Product / Look.
- Sección editorial de piezas recién ingresadas con enlaces a las fichas del catálogo.
- Anuncios de próximos drops desplegables, con precios, fechas y acceso a la reserva de muestra.
- Videos de TikTok de Dirtytask cargados al entrar en pantalla; la reproducción se silencia automáticamente.
- Bolsa y checkout front-end que conservan los datos en el navegador.

## Uso local

Sirve esta carpeta desde un servidor HTTP local o tu hosting y abre `index.html` en Chrome o Edge. No necesita compilación. Supabase, los videos y las tipografías de Google Fonts requieren conexión a internet.

La tienda pública lee catálogo, variantes, imágenes, lanzamientos y contenido desde Supabase. La bolsa se conserva en el navegador. El resumen del checkout consulta precios, disponibilidad, departamentos, tarifas y métodos habilitados; todavía no registra pedidos, reservas ni pagos. Consulta [la integración pública](docs/storefront-integration.md).

### Panel de demostración

El panel `admin.html` usa Supabase Auth y requiere un socio activo de operaciones o finanzas. El catálogo del administrador consulta categorías, productos, variantes, imágenes y lanzamientos desde Supabase. Operaciones puede crear, editar y archivar productos y cerrar lanzamientos; Finanzas solo los consulta. Para activar el guardado, instala la migración indicada en [la integración del catálogo](docs/catalog-integration.md).

Contenido y configuración también consultan Supabase: textos, redes sociales, videos, tarifas de envío y métodos de pago. Operaciones guarda cada sección con su botón; Finanzas puede consultarla. Activa este guardado con `sql/store-integration.sql`; consulta [la guía de contenido y configuración](docs/store-integration.md).

El catálogo público y el resumen del checkout también consultan estos datos mediante un cliente anónimo separado de la sesión administrativa. Todavía no generan pedidos reales. La edición del perfil sigue pendiente de integración; ventas y contabilidad siguen en demostración.

### Verificación del panel

Con Node.js, el paquete `playwright` y Microsoft Edge disponibles, ejecuta `node tests/admin.cjs`. Comprueba el acceso desde un dominio no local, la persistencia y cierre de sesión, el editor y la ausencia de desbordamiento horizontal en las ocho secciones a cinco anchos de pantalla.

### Contabilidad (frontend)

En el menú del administrador, **Contabilidad** permite probar préstamos, financiamientos y tarjetas con tres obligaciones ficticias. Incluye pagos desglosados, abonos a capital, consumos/cargos de tarjeta, comprobantes por archivo, consulta de cuotas y exportación JSON/CSV para análisis. Los importes se calculan en centavos y se agrupan por moneda.

Este módulo es una demostración en memoria: **sus cambios y comprobantes se pierden al recargar**, a diferencia del catálogo. No conecta bancos ni un backend. La interfaz y el repositorio de datos están separados; consulta [el contrato de integración](docs/accounting-api.md) para conectar una API en el futuro y conocer las reglas de cálculo del prototipo.

### Cuentas, ingresos, ventas y mensajería

Contabilidad ahora incluye Resumen, Cuentas y caja, Ventas y cobros, Mensajería, Ingresos y gastos y Obligaciones. Permite anticipos y pagos en distintas cuentas o efectivo, envío incluido/adicional, cobros individuales de Forza y liquidaciones individuales o agrupadas de Fast Delivery. El depósito real se concilia con retenciones y ajustes, sin duplicar entradas. Cada cobro puede tener comprobante.

Los libros de cuentas y obligaciones tienen apariencia de papel. El resumen compara rangos diarios, semanales y mensuales, separando efectivo disponible, ventas, saldos por cobrar y dinero pendiente de mensajería. Las cuotas se registran por monto total, sin desglose obligatorio; el saldo del banco es opcional y queda marcado por actualizar si no se informa.

Consulta [el contrato de control de dinero](docs/cash-api.md) para el modelo de datos, exportaciones e integración futura. La versión sigue siendo **frontend con ejemplos, sin persistencia al recargar**. Las ventas web son registros de demostración: el checkout todavía no genera pedidos reales.

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
