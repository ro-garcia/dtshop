# Contabilidad: diseño aprobado

Frontend integrado en admin.html, sin backend ni persistencia de los cambios al recargar. Tres obligaciones ficticias (préstamo, financiamiento y tarjeta) en dos bancos; tres movimientos iniciales (cuota, abono a capital y consumo). Respeta la interfaz existente y usa selectores de archivo sin mosaicos.

## Alcance y decisiones
- Resumen por moneda, obligaciones, detalle, calendario mensual de cuotas e historial de movimientos.
- Alta de obligaciones con banco, referencia, nombre, tipo, moneda, saldo inicial, fecha inicial, cuota y día de pago.
- Movimientos: cuota con período y desglose, abono a capital, consumo o cargo de tarjeta. Importes en centavos enteros; una cuota reduce el principal únicamente por su capital. Intereses y cargos pagados son gastos, no amortización. Consumos/cargos de tarjeta aumentan el saldo.
- Un abono extraordinario no cubre automáticamente la cuota mensual. La cobertura del período suma pagos ordinarios y los compara con la cuota configurada. El día 29–31 se ajusta al último día del mes. No se proyectan intereses ni reglas bancarias.
- Evitar saldo negativo, fechas anteriores a la apertura, monedas mezcladas y movimientos inválidos. No aceptar pagos futuros como pagos realizados.
- Comprobantes JPG/PNG/WEBP: archivo, nombre y vista mediante enlace; solo memoria durante la demostración. Sin comprobantes ficticios.
- Exportación JSON versionada y CSV separados de obligaciones/movimientos para BI, con IDs, fechas, tipo y desglose. Los archivos adjuntos no se incluyen en las exportaciones analíticas.

## Arquitectura y alternativas
Elegido por el usuario: solo frontend, datos mínimos de prueba, reinicio al recargar. Se descartó construir ahora autenticación/base de datos y se descartó persistencia local permanente. Un repositorio asíncrono en memoria separa el contrato de datos de la interfaz; la integración futura sustituirá este repositorio por API. El backend deberá repetir validaciones y proporcionar almacenamiento, autorización y auditoría.

## Aceptación
El menú abre Contabilidad y marca su selección. Se pueden crear obligaciones, registrar pagos y abonos, elegir comprobantes y consultar saldos/historial. Los datos no se mezclan con el localStorage del catálogo. Exportación estructurada. Interfaz usable desde 320px. Las pruebas cubren precisión monetaria, períodos, validación, navegación y reinicio.
