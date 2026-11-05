# Contabilidad conectada a Supabase

## Activar en el proyecto existente

1. Ejecuta **todo `sql/finance-integration.sql`, desde `BEGIN;` hasta `COMMIT;`**, en el SQL Editor de Supabase. Requiere la instalación original de `sql/supabase.sql`; no vuelvas a ejecutar esa instalación ni `dirtytask.sql`. La migración se puede repetir y no crea cuentas ni movimientos ficticios.
2. Recarga el administrador e ingresa con el socio de **Finanzas**. Abre **Contabilidad → Cuentas y caja** y envía una cuenta o caja con su saldo inicial.
3. Entra con **Operaciones** y abre **Contabilidad → Verificación y aprobaciones**. Revisa los datos y pulsa **Aprobar y aplicar**. La cuenta aparece después de esa aprobación.
4. Prueba un ingreso, una obligación o un pago: debe aparecer como solicitud, sin cambiar saldos hasta la revisión del otro socio. Un rechazo requiere motivo y no modifica el libro.

El código local no ejecuta esta migración en tu proyecto. Si falta, la pantalla muestra el archivo que debe instalarse. No hay que habilitar escrituras directas de los socios sobre las tablas financieras ni usar una clave de servicio en el navegador.

## Qué está conectado

| Área | Registros y operaciones |
|---|---|
| Resumen | Disponible, entradas/salidas, ventas, saldos del cliente y mensajería, costos y pagos, separados en GTQ/USD |
| Cuentas y caja | Bancos, cuentas, saldos iniciales, libro histórico, transferencias y preparación de cuadres |
| Ventas y cobros | Ventas externas/físicas, registro de pedidos confirmados como venta, anticipos, cobros y ajustes |
| Mensajería | Cobros Forza/Fast Delivery, asignaciones por venta, retenciones y confirmación de depósitos |
| Ingresos y gastos | Solicitudes de movimientos manuales y consulta del libro aprobado |
| Obligaciones | Préstamos, financiamientos, tarjetas, cuotas, abonos, consumos/cargos y actualización del saldo informado por el banco |
| Verificación y aprobaciones | Espacio propio con filtros de pendientes, mis solicitudes, historial y todas; contador de pendientes, aprobaciones/rechazos, notas, responsables y seguimiento de cuadres |
| Comprobantes | Archivos privados persistentes, imágenes y PDF de hasta 5 MB |

Los repositorios se inicializan vacíos y no contienen registros precargados. El panel obtiene sus cuentas, ventas y obligaciones desde `finance-api.js`.

## Roles y efectos

**Finanzas** prepara cuentas, obligaciones, transferencias, ingresos/gastos, depósitos y movimientos de deuda. **Operaciones** registra ventas y puede proponer cobros, cobros de mensajería y ajustes de venta. Finanzas también puede proponer estos tres últimos tipos. Ambos pueden consultar, preparar un cuadre y revisar solicitudes del otro socio; nadie aprueba su propia solicitud.

Registrar una venta es una operación directa de Operaciones. Los demás movimientos financieros se envían mediante `submit_operation` y se aplican con `review_operation`, conservando las reglas originales del esquema. Una solicitud pendiente o rechazada no aporta entradas, salidas ni deuda a los reportes.

En **Ventas y cobros**, los pedidos confirmados, en preparación, enviados o entregados que todavía no tienen venta aparecen para registrarlos explícitamente. Se copian sus importes y líneas desde el pedido; no se descuenta inventario otra vez. La base impide convertir dos veces el mismo pedido. No se crean cobros por registrar una venta.

Una cuota sin saldo informado debita la cuenta una vez, conserva el último saldo conocido de la obligación y lo marca por actualizar. **Actualización de saldo** permite registrar posteriormente el saldo del banco, sin otro débito. El calendario sigue siendo una referencia de cuotas, no una proyección de intereses ni un estado de cuenta bancario.

Un cuadre guarda el saldo del libro y el observado. Su revisión por el otro socio cierra las fechas de esa cuenta hasta el corte; no ajusta automáticamente diferencias. Si el libro cambió desde que se preparó, hay que preparar un nuevo cuadre.

## Integridad y acceso

- Los saldos de cuentas, estados de cobro y reportes por fechas se calculan en PostgreSQL mediante funciones que verifican el rol de socio activo.
- Las lecturas iniciales usan una instantánea agregada coherente de las tablas, sin truncar silenciosamente relaciones por el límite de 1000 filas de Data API. La aplicación carga la instantánea completa; un volumen grande de años de movimientos requeriría separar consultas paginadas.
- Las ventas, cuadres y solicitudes conservan su clave de reintento durante el formulario. Una respuesta interrumpida no debe producir otra venta ni otro movimiento al reenviar los mismos datos.
- Los importes se envían como centavos enteros. El navegador rechaza valores fuera de su rango entero seguro. PostgreSQL valida moneda, stock, fechas, saldos históricos y reglas de liquidación al aplicar la operación.
- Los comprobantes se suben con rutas únicas del socio al bucket privado `dtshop-receipts`; se registran como metadatos y se descargan mediante la sesión autenticada. No se usan URLs públicas para los comprobantes. Storage y PostgreSQL son servicios separados: un archivo subido puede quedar sin vínculo si luego falla la solicitud.
- Al cerrar sesión se invalidan lecturas pendientes, se vacían repositorios y pantallas privadas y se cierran/limpian los formularios. Los datos financieros no se copian a localStorage para persistirlos.

El icono de actualización de Contabilidad vuelve a consultar la instantánea y las pantallas. No hay sincronización en tiempo real ni conexión automática con bancos o empresas de mensajería. Los registros son contables/manuales; esta integración no procesa pagos en línea.

## Exportaciones y pruebas

JSON/CSV contienen los datos reales aprobados, importes en centavos y relaciones por ID. Los binarios no se incorporan. La instantánea disponible para revisión conserva también solicitudes y cuadres; los repositorios de caja y obligaciones mantienen el contrato de las exportaciones existentes.

```text
node --test tests/finance-api.test.cjs tests/cash.test.cjs tests/accounting.test.cjs
node tests/supabase.cjs
node tests/finance-browser.cjs
```

`finance-browser.cjs` conecta el navegador a PostgreSQL embebido y ejecuta las funciones SQL reales con ambos roles. Prueba la cuenta pendiente/aprobada, ventas, cobros con PDF privado, obligación y cuota, actualización de saldo, rechazo por fondos insuficientes, persistencia al recargar y cierre de sesión. No escribe en el proyecto remoto.
