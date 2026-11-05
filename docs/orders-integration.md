# Pedidos desde el checkout hasta el administrador

## Activar en el proyecto existente

1. Ejecuta **todo `sql/orders-integration.sql`, desde `BEGIN;` hasta `COMMIT;`**, en el SQL Editor de Supabase. Requiere la instalación original y se puede repetir sin crear pedidos de ejemplo. No vuelvas a ejecutar `supabase.sql` ni `dirtytask.sql`.
2. En las opciones de Authentication de Supabase, activa **Anonymous Sign-Ins**. Esta función permite crear una sesión de comprador sin pedir correo ni contraseña: [documentación oficial](https://supabase.com/docs/guides/auth/auth-anonymous). No cambies los roles de los socios ni habilites escrituras anónimas en las tablas.
3. Recarga la tienda, agrega una talla a la bolsa y continúa al checkout. Completa los datos de entrega, selecciona un método y, si corresponde, el número de cuotas. Pulsa **Enviar pedido**.
4. Comprueba que aparezcan el número del pedido, total y estado **Por confirmar**. En el administrador abre **Pedidos** y pulsa **Actualizar pedidos**.
5. Con Operaciones, prueba las transiciones con un pedido de prueba. Una cancelación devuelve el stock de productos normales. Con Finanzas verifica que puedes consultar, pero no cambiar estados.

El código local no ejecuta la migración ni activa Authentication en el proyecto remoto. Sin la migración, guardar muestra que el registro de pedidos aún no está habilitado; sin Anonymous Sign-Ins, no se puede abrir la sesión de compra.

## Datos y responsabilidades

| Archivo o tabla | Uso |
|---|---|
| `checkout-api.js` | Sesión de invitado, envío y consulta de confirmación |
| `checkout.js` | Formulario, cuotas, reintentos y confirmación |
| `orders-api.js` | Lectura de pedidos relacionados y cambios de estado |
| `orders.js` | Lista privada, detalles, historial, contadores y acciones |
| `customer`, `shop_order`, `shop_order_line` | Contacto, entrega, importes y líneas guardadas |
| `order_status_event` | Historial con actor y nota del cambio |
| `checkout_request` | Clave de reintento por comprador, hash del payload y pedido resultante |

El checkout crea o reutiliza su sesión al enviar. Usa `dirtytask-checkout-guest`, separado del cliente público y de la sesión del administrador. Supabase conserva la sesión; la aplicación no duplica los datos de contacto en localStorage ni sessionStorage. Las claves del intento y la confirmación solo contienen UUID. Al guardar se envían los datos de contacto y entrega a Supabase, tal como indica el formulario.

El usuario de Auth recibe el perfil `customer` mediante el trigger original. Las funciones de envío requieren ese perfil activo. Las confirmaciones se consultan únicamente desde la sesión que creó el pedido. La sesión anónima no se recupera desde otro navegador o después de borrar sus datos; conserva el número del pedido para consultar con la tienda.

## Registro y reintentos

`submit_shop_order` valida producto y variante, cantidades de 1 a 99, hasta 30 líneas sin variantes repetidas, método habilitado, cuotas y total esperado. Recalcula con los precios y tarifas actuales y rechaza un resumen desactualizado. Después llama a `place_order`, que valida publicación y stock y guarda cliente, pedido, líneas e historial en la misma transacción.

El stock de productos normales se descuenta al registrar el pedido. Los pedidos pendientes lo mantienen apartado hasta su gestión o cancelación; no hay vencimiento automático. Los productos de preventa no descuentan stock normal.

El navegador conserva la misma clave de intento durante los reintentos. La base devuelve el mismo pedido para la misma solicitud y rechaza reutilizar la clave con otros datos. Si se pierde la respuesta después de guardar, el checkout consulta la confirmación antes de considerar el intento fallido. No se genera otro pedido al hacer doble clic o reintentar.

Después de confirmar, se limpian los datos personales del formulario y se descuentan de la bolsa solo las líneas compradas. Recargar la confirmación no vuelve a descontar artículos añadidos después. Si no se pudo guardar la limpieza de la bolsa, se muestra el número del pedido y el aviso correspondiente.

## Gestión del pedido

| Estado actual | Acciones de Operaciones |
|---|---|
| Por confirmar | Confirmar o cancelar |
| Confirmado | Preparar o cancelar |
| En preparación | Enviar o cancelar |
| Enviado | Marcar entregado |
| Entregado o cancelado | Sin más transiciones |

Se puede añadir una nota de hasta 240 caracteres. El servidor comprueba el estado esperado para no sobrescribir un cambio de otro operador. Repetir una transición confirmada no genera otro evento ni devuelve stock dos veces. Cancelar un pedido ya vinculado a una venta requiere el flujo financiero previsto por el esquema original.

La lista se consulta al iniciar sesión y con Actualizar pedidos. Si una lectura falla, conserva lo visible y bloquea cambios. Si falla la confirmación de una transición, exige actualizar antes de reintentar. Al cerrar sesión se vacían de memoria los datos privados y se ignoran respuestas pendientes.

La vista permite buscar por cliente, teléfono o referencia y filtrar por estado. Cada fila muestra una referencia corta, cliente, fecha, estado y total. Al desplegarla aparecen entrega, productos, importes e historial, con una acción principal para el siguiente estado. Cancelar requiere una confirmación explícita. Abrir, filtrar o recargar conserva las notas en preparación durante la sesión; las notas se limpian después de aplicar el cambio.

La recarga usa el icono del encabezado y no muestra avisos amarillos. En el checkout, **Revisar disponibilidad** solo aparece cuando es necesario resolver un error y vuelve a consultar precios sin recargar la página ni borrar los datos escritos, el departamento o las cuotas.

La [integración financiera](finance-integration.md) permite registrar explícitamente un pedido confirmado como venta y gestionar sus solicitudes de cobro. El procesamiento de pagos en línea y los enlaces de pago siguen pendientes.

## Verificación local

```text
node --test tests/orders-api.test.cjs
node tests/orders-browser.cjs
node tests/storefront-browser.cjs
node tests/supabase.cjs
```

Las pruebas SQL usan PostgreSQL embebido para verificar roles, propiedad, importes, transacciones, stock y reintentos. Las del navegador usan un cliente simulado para comprobar el recorrido completo y errores de sesión o red. No envían pedidos al proyecto real.

## Comprobante del comprador

Para una instalación existente, ejecuta todo el archivo `sql/order-receipt-integration.sql` en Supabase SQL Editor. Solo amplía `checkout_receipt`; no modifica pedidos, precios ni existencias. Las instalaciones nuevas ya incluyen la misma función en `orders-integration.sql`.

La confirmación muestra nombre y dirección del comprador, productos y tallas, cantidades, precios del pedido, subtotal, envío, total, método de pago y cuotas. Los datos provienen del pedido guardado y la consulta sigue restringida a la sesión compradora. El comprobante puede imprimirse o guardarse como PDF desde el diálogo de impresión. No acredita un pago ni es una factura fiscal.

Efectivo informa el total a pagar contra entrega. Visa cuotas y tarjeta de crédito indican que la tienda enviará el enlace y contactará al comprador para completar el pago. No se envía automáticamente un enlace ni un mensaje desde esta pantalla.
