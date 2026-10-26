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

Abre `index.html` en Chrome o Edge. No necesita instalación ni proceso de compilación. La sección de videos y las tipografías de Google Fonts requieren conexión a internet.

El catálogo, los precios y el checkout son una maqueta front-end: no hay inventario, pagos, reservas ni pedidos conectados a un servicio real.

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
