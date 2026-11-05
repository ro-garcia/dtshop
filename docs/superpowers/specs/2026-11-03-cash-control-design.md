# Control de ventas, cobros, liquidaciones y cuentas

Estado: enfoque elegido por el usuario y continuación autorizada mediante «sigue». Implementado como frontend de demostración. Amplía Contabilidad existente.

## Objetivo y alcance acordado

Conocer cuánto dinero hay en cada cuenta bancaria y caja, lo pendiente de cobro y la relación entre entradas y salidas por día, semana o mes. Vincular ventas, productos, pagos y comprobantes; mantener trazabilidad suficiente para futura integración de backend y BI.

Se mantiene el alcance aprobado: solo frontend, pocos datos ficticios, cambios en memoria que se reinician al recargar. No se conectarán bancos, pasarelas, empresas de mensajería ni un backend. El checkout actual no genera pedidos: las ventas web se simularán mediante registros identificados como ejemplos, sin presentarlos como pedidos reales.

## Enfoque elegido

1. Movimientos manuales por cuenta: sencillo, pero exige conciliación manual y permite duplicar cobros.
2. Ventas, cobros y liquidaciones vinculados: elegido por el usuario. Permite pagos parciales, cuentas distintas, efectivo y depósitos que reúnen varios pedidos.

La implementación conservará los estilos actuales, las tarjetas de crédito y la navegación de Contabilidad. Los historiales de cuentas y obligaciones tendrán apariencia de libro en papel: fondo cálido, encabezados de columnas y líneas discretas, conservando legibilidad, selección de texto y desplazamiento en móvil.

## Flujos

### Cuentas y cajas

Crear cuentas bancarias o cajas de efectivo con nombre, banco cuando corresponda, referencia enmascarada/opcional, moneda, fecha y saldo inicial. No se requieren números completos. Cada movimiento identifica su cuenta. Los saldos iniciales no son ingresos.

Saldo de cuenta = saldo inicial + entradas registradas − salidas registradas. Los totales se separan por moneda; no habrá conversiones automáticas. Las fechas anteriores al inicio de una cuenta no se admitirán. Como propuesta de esta versión, las cuentas operan sin sobregiro: los movimientos no podrán producir saldo histórico negativo.

Una transferencia entre cuentas de igual moneda genera dos apuntes vinculados y atómicos: salida y entrada. No se cuenta como ingreso, gasto ni venta. Un traslado de efectivo al banco se registra de esta manera.

### Ventas

Registrar canal (web de ejemplo, venta externa o física), referencia, fecha, cliente/referencia de contacto opcional, productos y cantidades. Los productos pueden provenir del catálogo existente o ser líneas manuales para artículos externos. Se conservan copias de nombre y precio al vender para que cambios posteriores del catálogo no alteren el historial. El enlace con catálogo no modificará existencias en este prototipo.

Modalidad de envío: adicional, incluido o no aplica. Para envío adicional, total = productos + envío cobrado. Para envío incluido, el precio acordado ya contiene el envío y no se vuelve a sumar. No aplica registra envío cero. Los gastos reales de mensajería se contabilizan por separado del precio cobrado al cliente.

Un apartado de lanzamiento es una venta con referencia opcional al lanzamiento y pagos parciales; no exige exactamente 50/50. Una vez registrado un cobro o una liquidación pendiente, el total y las líneas de la venta quedan fijos en esta primera versión. Si cambia el precio o se acuerda envío adicional después, se registra un ajuste explícito a la venta, con importe y motivo, sin sobrescribir el total original. Nunca se reduce el total por debajo de lo ya cobrado o comprometido para liquidar.

### Cobros directos y anticipos

Cada cobro contiene venta, fecha, monto, cuenta receptora o caja, referencia opcional, notas y comprobante opcional. Puede haber varios cobros en distintas cuentas y efectivo para una misma venta. Cada cobro entra una sola vez en el libro de la cuenta.

Saldo por cobrar al cliente = total vigente de venta − cobros directos − importes confirmados como cobrados al cliente por mensajería. La parte en poder de mensajería se muestra separada como pendiente de liquidar; no es dinero disponible en una cuenta.

No se permiten cobros que excedan el saldo de la venta, ni cobrar directamente una parte ya confirmada en poder del transportista. Los anticipos aumentan el dinero disponible al recibirse, sin registrar el valor completo de la venta como entrada bancaria.

### Mensajería y liquidaciones

Crear una liquidación pendiente indicando transportista, ventas e importe cobrado al cliente por cada venta. Puede incluir solo el remanente tras un anticipo. En este prototipo, este registro significa que el transportista ya cobró esos importes; no representa simplemente un pedido enviado. El seguimiento logístico anterior al cobro queda fuera del alcance.

- Forza: una venta por liquidación.
- Fast Delivery: una o varias ventas por liquidación.

Registrar total bruto cobrado, servicio de mensajería, comisión como importe efectivo, otros descuentos y otros ajustes positivos. Una calculadora opcional podrá convertir porcentaje y base elegida en importe; no se inventará una tarifa ni una base de cálculo del transportista.

Neto esperado = bruto − mensajería − comisión − otros descuentos + ajustes positivos. Se informa monto recibido, fecha, cuenta de destino y comprobante. Si el recibido difiere del esperado, se exige un ajuste identificado y su motivo antes de confirmar. No se oculta una diferencia bajo la etiqueta de comisión. El neto de una liquidación debe ser positivo; cargos independientes sin depósito se registran como gastos.

Cada asignación conserva la fecha en que mensajería cobró al cliente, distinta de la fecha del depósito bancario. Confirmar la liquidación liquida únicamente los importes asignados y crea una única entrada bancaria por el neto recibido. El estado de cada venta se deriva por separado de su saldo por cobrar al cliente y su saldo en poder del transportista; no se marca toda la venta como liquidada si tiene otros importes pendientes. Las retenciones se conservan como componentes de la liquidación, no como una segunda salida de esa cuenta. La operación completa es atómica y no puede confirmarse dos veces.

Para BI, los importes retenidos y ajustes de liquidaciones múltiples se distribuyen entre las ventas proporcionalmente al bruto cobrado, con centavos enteros y remanente asignado de forma determinista. Las sumas por venta deben coincidir exactamente con la liquidación. Se identifica esta distribución como prorrateo, no como tarifa real de cada envío.

### Otros ingresos y gastos

Otros ingresos sin venta: concepto, categoría, fecha, monto, cuenta/caja y comprobante. Aportes o financiamientos recibidos se distinguen de ingresos operativos; aumentan caja, pero no las ventas.

Gastos: publicidad, mensajería pagada directamente y otras categorías; fecha, monto, cuenta/caja de salida, concepto y comprobante. Vinculación opcional a venta. Un servicio retenido en una liquidación no se vuelve a registrar como gasto debitado en la cuenta.

### Pagos de obligaciones existentes

Al pagar una cuota se registra solo el total, fecha, período, cuenta/caja de salida y comprobante opcional. No se obliga al usuario a desglosar intereses y cargos. Se crea una salida vinculada a la obligación y la cuota queda cubierta según su importe, sin duplicar el egreso.

Se permiten pagos parciales acumulados por período; la cuota se marca cubierta al alcanzar su importe. Como propuesta, se rechaza un pago ordinario que exceda lo pendiente de esa cuota: el excedente se registra como abono a capital mediante su operación propia.

No se supondrá que toda cuota amortiza capital. Propuesta para resolver el dato que falta: saldo informado por el banco opcional; si no se proporciona, se conserva el último saldo conocido y se indica que está pendiente de actualizar. Los abonos a capital sí reducen el saldo conocido directamente. El resumen de deudas distinguirá saldos confirmados de pendientes de actualización. No se presentará el pago completo como gasto operativo o interés: se mostrará separado como servicio de deuda.

## Libro de movimientos y análisis

Historial de cada cuenta en formato papel: fecha, referencia, concepto, entrada, salida y saldo acumulado. Orden estable por fecha de negocio y secuencia; los comprobantes se abren desde un enlace. Los movimientos del mismo día conservan su secuencia. El saldo inicial del rango incorpora todos los movimientos anteriores, incluso al filtrar por fechas.

Los filtros de categoría/concepto no deben inventar un saldo distinto: mantener el saldo real cronológico de cada apunte y separar los totales de la selección del saldo de cuenta.

Los saldos por cobrar y pendientes de liquidar se reconstruyen a la fecha de cierre del rango: un cobro de mensajería en octubre depositado en noviembre sigue apareciendo pendiente al consultar octubre. Toda liquidación y transferencia debe involucrar ventas/cuentas de una misma moneda.

Panel por rango diario, semanal (lunes a domingo) y mensual:
- Disponible total y por cuenta/caja a la fecha de cierre del rango, por moneda.
- Ventas acordadas, cobros directos, cobros de mensajería confirmados y pendientes de liquidar, separados de los saldos bancarios.
- Entradas efectivas, salidas efectivas y flujo neto, excluyendo transferencias internas y saldos iniciales.
- Gastos pagados directamente y retenciones de mensajería identificados por separado. No sumar una retención a las salidas bancarias cuando ya se recibió el neto.
- Servicio de deuda, aportes y financiamientos separados de la operación comercial.

Estos indicadores no se denominarán utilidad neta: el prototipo no dispone de costo de mercancía, impuestos ni reconocimiento contable completo. Comparar ingresos/gastos y flujo de caja no equivale a calcular rentabilidad real.

## Ejemplos de aceptación

1. Venta Q100 + Q35 de envío, liquidación Forza Q128: Q135 cobrados al cliente, Q7 retenidos identificados y entrada bancaria Q128. Gasto posterior de publicidad Q50: incremento neto de cuenta Q78, más saldo inicial.
2. Dos ventas contra entrega de Q135, Fast retiene Q60: una entrada de Q210, dos ventas liquidadas y Q60 retenidos. No crear dos entradas de Q135 además del depósito.
3. Apartado Q200: anticipo Q100 al banco, saldo Q100 a caja. Venta pagada; banco aumenta Q100 y caja Q100. El envío incluido no se agrega dos veces.
4. Venta Q200, anticipo Q100, envío adicional acordado Q35: ajuste de venta +Q35; saldo pendiente Q135. Si mensajería cobra ese saldo, la liquidación solo incluye Q135.
5. Venta física Q150 con depósito, sin envío: entrada Q150. Publicidad Q50 desde la misma cuenta: saldo aumenta Q100.
6. Transferir Q80 entre dos cuentas: una baja Q80 y otra sube Q80; disponible total, ventas e ingresos operativos no cambian.
7. Cuota de préstamo Q1,000 sin desglose: salida Q1,000 y cuota pagada; capital pendiente no disminuye ficticiamente Q1,000. Un abono a capital Q200 genera salida Q200 y reducción de capital Q200.

## Datos e integración futura

Entidades separadas: Account, Sale, SaleLine, SaleAdjustment, Receipt, Settlement, SettlementAllocation, Expense/OtherIncome, Transfer, LedgerEntry y Attachment; reutilizar Obligation y vincular sus movimientos al libro. IDs estables durante la sesión, fechas de negocio, timestamps de creación, moneda, importes en centavos y referencias de origen.

El repositorio asíncrono en memoria expondrá operaciones de negocio atómicas, no escrituras sueltas del libro. La interfaz no mutará directamente los registros ni recalculará saldos con reglas diferentes. El backend futuro deberá repetir validaciones, controlar concurrencia/idempotencia y persistir archivos y auditoría.

Exportación JSON versionada y CSV por entidad para BI. Los comprobantes tendrán metadatos exportables; los binarios no se incluyen en las exportaciones analíticas. Se mantienen selectores de archivo sin biblioteca de fotos.

## Datos de prueba mínimos propuestos

Conservar tres obligaciones existentes. Agregar dos cuentas bancarias ficticias, una caja y cuatro ventas: una de Forza, dos de Fast y un apartado con cobros mixtos. Una venta de Fast podrá ser de canal externo; un gasto de publicidad y una transferencia muestran el control de cuentas. Usar productos del catálogo mediante snapshots. Evitar comprobantes falsos: los ejemplos comienzan sin archivos adjuntos.

## Límites de esta versión

Sin backend ni persistencia entre recargas. Sin pedidos web reales, conciliación bancaria automática, integración logística, cotizaciones de moneda, costos de inventario o reportes fiscales. No se editarán ni eliminarán apuntes confirmados para alterar el historial; reversos, devoluciones, reembolsos y cancelaciones quedarán para una ampliación explícita. El formulario permite revisar y corregir antes de confirmar.

## Verificación prevista

Pruebas del motor para todos los ejemplos, duplicación de liquidaciones, sobrecobros, prorrateo de centavos, monedas incompatibles, rangos de fechas, saldos históricos y transferencias. Pruebas de navegador para formularios, comprobantes, filtros, exportaciones, navegación existente y vistas desde 320px. Revisión visual de ambos historiales con apariencia de papel y confirmación del reinicio de la demostración.

## Revisión del diseño

Revisión independiente completada: casos de aceptación sin doble conteo. Se precisaron fechas separadas de cobro y depósito, estados derivados por importe y cobertura de cuotas parciales. Las reglas nuevas están identificadas como propuestas para aprobación.
