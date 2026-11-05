# Contrato frontend de control de dinero

> Documento histórico del prototipo. El panel ya utiliza [la integración financiera con Supabase](finance-integration.md). Los motores en memoria se conservan para pruebas de dominio; ya no crean los datos del panel.

La demostración se crea en `cash.js` con `Cash.createRepository({products})`. Datos, archivos y modificaciones viven únicamente en memoria. `adminCatalog.products()` y `launches()` exponen copias del catálogo para seleccionar productos y lanzamientos; las ventas conservan nombre y precio como snapshot. No se crean pedidos reales ni se modifica inventario.

## Repositorio asíncrono

- `list()` devuelve una copia independiente del esquema v2.
- `createAccount({name,type,bank,reference,currency,openingBalance,startDate})` registra banco o caja. Solo conserva los últimos cuatro caracteres de la referencia.
- `createSale({reference,date,channel,currency,customer,launchId,shippingMode,shipping,lines})`: cada línea contiene `productId?`, `name`, `qty`, `price`. Canal web/external/physical; envío extra/included/none.
- `adjustSale({saleId,date,direction,amount,reason})`: aumenta o reduce el total preservando el original.
- `collect({saleId,accountId,date,amount,reference},file?)`: cobro directo/anticipo y entrada de cuenta atómicos.
- `createSettlement({courier,date,reference,allocations:[{saleId,amount}]})`: importes que mensajería ya cobró al cliente. No crea una entrada bancaria.
- `confirmSettlement({id,accountId,date,service,commission,discounts,adjustment,received,reason},file?)`: valida el cuadre y crea una sola entrada bancaria neta.
- `addEntry({accountId,date,direction,category,amount,concept,saleId?,currency?,sourceType?,sourceId?},file?)`: otros ingresos/gastos; utilizado también por obligaciones para sus pagos. No duplicar cobros aquí.
- `transfer({fromId,toId,date,amount,concept},file?)`: salida y entrada vinculadas en igual moneda.
- `saleStatus(id,asOf?)`: total vigente, cobros directos, cobros de mensajería, saldo del cliente y saldo en mensajería a la fecha.
- `accountLedger(id,from?,to?)`: cuenta, saldo inicial del rango, saldo final y apuntes con saldo acumulado.
- `report(from,to)`: totales por moneda de disponible, entradas, salidas, operación, deudas, aportes, ventas y pendientes.
- `getAttachment(id)`: File/Blob de la sesión.

Todos los inputs monetarios son cadenas decimales; registros y exports usan centavos enteros. Fechas de negocio ISO `YYYY-MM-DD`, timestamps UTC, secuencia monotónica para ordenar movimientos del mismo día. Monedas GTQ/USD, sin conversión. La interfaz no escribe directamente en los arrays ni calcula saldos por su cuenta.

## Integridad

Las mutaciones en memoria se ejecutan sin awaits internos y revierten datos, secuencia y archivos ante errores. Se rechazan fechas futuras, fechas anteriores a cuentas/ventas, referencias de venta repetidas, sobrecobros, liquidaciones repetidas, monedas incompatibles, cuentas iguales en transferencia y saldos históricos negativos. Una liquidación de Forza tiene una venta; Fast admite varias. No se puede cobrar directamente un importe ya confirmado en poder del transportista.

Un depósito posterior no elimina los pendientes de consultas históricas anteriores. Los ajustes de venta tampoco permiten exceder lo cobrado/comprometido en ninguna fecha afectada.

El neto recibido debe ser exactamente bruto menos servicio, comisión y descuentos, más ajuste positivo; descuentos/ajustes requieren motivo. Los costos se prorratean proporcionalmente en centavos con remanentes deterministas. Cada asignación cumple neto = bruto − retenido + ajuste. Las retenciones no crean otra salida bancaria. Las transferencias no se incluyen como ingreso/gasto.

## Obligaciones y cuota sin desglose

`Accounting.createRepository({cashRepository})` integra los pagos. Nuevas cuotas requieren total, fecha, período y cuenta. `statementBalance` es opcional: si falta, `principalKnown:false` indica que el capital amortizado es desconocido y el saldo anterior permanece marcado por actualizar. Si se informa, establece el saldo del banco en esa fecha. Los abonos a capital reducen el saldo conocido y debitan la cuenta.

Las cuotas admiten parcialidades hasta cubrir el importe del período. El excedente se registra mediante abono a capital. La cuota y su salida comparten `sourceId`; la operación de obligaciones revierte sus cambios si la cuenta rechaza el débito. Los pagos de ejemplo también se reflejan en cuentas. Los desgloses anteriores siguen legibles para compatibilidad, pero no se solicitan en el formulario.

## Archivos y BI

Comprobantes de caja: imágenes JPG/PNG/WEBP y PDF hasta 5 MB. Obligaciones: imágenes hasta 5 MB. El control es por MIME declarado en frontend; un servidor deberá inspeccionar y validar el contenido real. No hay biblioteca ni mosaicos.

JSON incluye todas las entidades y obligaciones, versión, fecha de exportación y aviso de demo. CSV por cuentas, ventas, líneas de venta, cobros, liquidaciones, asignaciones por venta, apuntes, transferencias y ajustes. Los campos anidados de metadatos se serializan en JSON dentro de la celda; líneas y asignaciones tienen además exports planos con claves foráneas. No incluye archivos binarios ni mecanismo de importación/restauración.

## Backend futuro

Sustituir el repositorio por un adaptador HTTP, manteniendo el contrato de promesas. Las operaciones vinculadas deberán ser transacciones del servidor con idempotencia, control de concurrencia, autorización y auditoría. El servidor será la autoridad del saldo y validará nuevamente todos los importes y archivos. Quedan fuera de esta demo devoluciones, anulaciones, sobregiros, impuestos, costo de mercancía, integraciones bancarias/logísticas y cálculo de utilidad contable.

## Pruebas

`node --test tests/accounting.test.cjs tests/cash.test.cjs`.

Con Playwright y Edge: `node tests/cash-browser.cjs`, `node tests/accounting-browser.cjs` y `node tests/admin.cjs`. Verifican anticipos mixtos, recibos, mensajería agrupada, gastos, transferencias, cuenta de pago de obligaciones, exportaciones, reinicio y navegación en cinco anchos de pantalla.
