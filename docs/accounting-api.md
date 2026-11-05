# Integración futura de Contabilidad

> La integración está implementada en `finance-api.js`: consulta [la guía financiera actual](finance-integration.md). Este documento conserva el contrato y reglas del prototipo anterior.

> Actualización: el contrato ampliado y las reglas vigentes de cuotas sin desglose, cuentas y liquidaciones están en [cash-api.md](cash-api.md). Las reglas de desglose descritas abajo se conservan únicamente para interpretar los registros anteriores del prototipo.

La versión actual es frontend sin persistencia: `accounting.js` crea un repositorio en memoria de `accounting-data.js`. No usa el localStorage del catálogo. Al recargar se regeneran tres obligaciones y tres movimientos ficticios. No se envían datos ni archivos a un servidor.

## Contrato del repositorio

Todos los métodos devuelven promesas y rechazan con un Error que contiene un mensaje para la interfaz:

| Método | Resultado |
| --- | --- |
| `list()` | `{schemaVersion: 1, obligations: Obligation[], movements: Movement[]}` |
| `createObligation(input)` | Obligación creada |
| `addMovement(input, file?)` | Movimiento registrado con metadatos del comprobante |
| `getAttachment(id)` | Blob/File del comprobante |

Los inputs monetarios de formularios son cadenas decimales (`"125.50"`). Los registros usan **centavos enteros**, sin conversión de moneda. `GTQ` y `USD` se resumen por separado. Fechas de negocio: `YYYY-MM-DD`; períodos: `YYYY-MM`; auditoría de creación: timestamp ISO UTC. El día de referencia se calcula para America/Guatemala. Los IDs son UUID; se conservan durante la sesión y en exportaciones, pero los ejemplos se regeneran al recargar.

## Esquema

- Obligation: `id`, `bank`, `reference`, `name`, `type` (loan/financing/card), `currency`, `openingBalance`, `installment`, `dueDay`, `startDate`, `createdAt`.
- Movement: `id`, `obligationId`, `type` (payment/principal/purchase/charge), `date`, `period` (solo cuota), `total`, `principal`, `interest`, `fees`, `notes`, `createdAt`, `attachment` (null o `{id,name,type,size}`). La moneda se obtiene de la obligación; también se incluye explícitamente en el CSV de movimientos.
- Los archivos se guardan en un mapa en memoria separado de los metadatos. El frontend crea URLs blob temporales solo para visualizar/descargar un comprobante.

## Reglas del prototipo

- Saldo = saldo inicial + consumos + cargos de tarjeta − capital de cuotas − abonos a capital.
- Cuota: total = capital + intereses + cargos pagados. Estos últimos no reducen principal.
- Para tarjetas, el campo capital representa la reducción del saldo registrado. Un cargo ya incorporado al saldo debe liquidarse mediante esa reducción; no debe duplicarse como gasto en el desglose. La conciliación real de estados de cuenta se definirá con el backend.
- Cuota cubierta: pagos ordinarios asignados al período alcanzan la cuota de referencia; el abono extraordinario no cubre cuotas. Una cuota parcial conserva la diferencia pendiente.
- Primer vencimiento: el día configurado dentro del mes inicial, o el mes siguiente si ya pasó. Los días 29–31 se limitan al último día del mes.
- El calendario usa una cuota fija de referencia; no proyecta amortización, intereses, mora, cambios de tasa o cortes de tarjeta. Una obligación con saldo cero no muestra un próximo pago. Los meses que comienzan sin deuda y no registran nuevos consumos/cargos no generan cuotas. La consulta histórica mantiene la cobertura de los períodos con deuda y no representa un certificado de liquidación del banco.
- Se rechazan capital superior al saldo, saldos históricos negativos, montos inválidos, fechas futuras y anteriores al inicio, referencias duplicadas dentro de un banco y cargos/consumos en obligaciones que no son tarjetas.
- Los comprobantes aceptan JPG/PNG/WEBP, máximo 5 MB. La validación actual usa el MIME declarado; el backend deberá inspeccionar el contenido real.

## Exportaciones y BI

JSON versionado: obligaciones y movimientos más `exportedAt`, `demo`, `moneyUnit: "minor"`, `attachmentsIncluded: false`. CSV separados con relación `movements.obligationId -> obligations.id`, comillas escapadas y protección de celdas que comienzan como fórmulas. No exporta los binarios. Los archivos actuales son exportaciones analíticas, no respaldos restaurables.

## Sustitución por API

Cambiar la creación del repositorio en `accounting.js` por un adaptador HTTP con este contrato. El backend será responsable de autenticación/autorización, cálculos y validación autoritativos, transacciones atómicas, idempotencia, almacenamiento de comprobantes, registros de correcciones/anulaciones y paginación. No confiar en valores calculados por el navegador. Las pantallas y el acceso a datos están separados para realizar esa integración sin rehacer los formularios.

## Pruebas

`node --test tests/accounting.test.cjs` valida el motor. Con Playwright y Microsoft Edge: `node tests/accounting-browser.cjs` comprueba navegación, formularios, comprobantes, exportación, reinicio y cinco tamaños de pantalla. `node tests/admin.cjs` mantiene la cobertura del administrador existente.
