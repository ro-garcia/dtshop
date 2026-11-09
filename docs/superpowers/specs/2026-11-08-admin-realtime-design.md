# Supabase Realtime en administración

Estado: implementación autorizada por el usuario («hazlo») y completada localmente. Fecha: 2026-11-08. Pendiente de verificación con sesiones reales de Supabase.

## Objetivo y alcance confirmado

Actualizar automáticamente las vistas administrativas cuando cambien datos en Supabase, sin recargar la página. Incluye Resumen, Productos, Lanzamientos, Estadísticas, Pedidos y toda Contabilidad (cuentas, ventas, cobros, mensajería, ingresos, gastos, obligaciones y aprobaciones). El usuario excluyó expresamente Configuración y Contenido.

## Enfoque

La propuesta es usar eventos de Supabase Realtime como señales para volver a consultar únicamente los módulos afectados mediante sus APIs actuales. Es una decisión técnica propuesta, no una elección técnica expresada por el usuario.

Aplicar directamente cada fila recibida a las vistas exigiría reconstruir relaciones y cálculos que hoy resuelven las consultas y `finance_snapshot`; por eso no se propone esa alternativa. Broadcast privado desde PostgreSQL es una alternativa si los permisos de las tablas financieras impiden Postgres Changes, pero requiere conocer el esquema y crear disparadores. La vía inicial es Postgres Changes con permisos existentes, sin ampliar acceso a datos para conseguir notificaciones.

## Comportamiento

- Crear la suscripción con el cliente administrativo autenticado y retirarla al cerrar sesión. Descartar eventos y respuestas de sesiones anteriores.
- Agrupar eventos consecutivos por módulo. Mantener una actualización pendiente si llega otro evento durante una consulta o escritura; no perderla por un indicador `busy`.
- Refrescar catálogo y categorías con sus dependencias; sus vistas actualizarán resumen y estadísticas. Refrescar pedidos con sus líneas, historial y datos asociados. Invalidar el caché financiero y consultar una sola instantánea compartida para todas las vistas financieras.
- Conservar búsqueda, filtros, pestañas, selección y detalles abiertos. Aplazar el refresco visual del módulo mientras haya un formulario, una nota en edición o una operación en curso, y ejecutarlo al terminar. No sobrescribir borradores ni interrumpir el foco al escribir.
- Recuperar los datos al restablecer la conexión para cubrir eventos perdidos. Conservar los botones de actualización manual y mostrar fallos de conexión sin vaciar datos ya cargados.
- No suscribir las tablas de contenido y configuración ni llamar a sus funciones de carga desde Realtime. No cambiar cálculos financieros, permisos, navegación ni diseño general.

## Archivos y activación

Añadir un coordinador `admin-realtime.js` y conectarlo a `admin.js`, `orders.js`, `finance-api.js` y `finance-approvals.js`, ajustando las vistas financieras cuando sea necesario para preservar su estado. Cargarlo desde `admin.html`, conservando las modificaciones del usuario que ya existen en ese archivo.

Preparar una migración de activación y una guía. Las tablas deben estar publicadas en `supabase_realtime` y ser legibles por el rol autenticado conforme a sus políticas. Referencia oficial: https://supabase.com/docs/guides/realtime/postgres-changes.

Las consultas del catálogo y pedidos identifican sus tablas en el esquema `dtshop`. Contabilidad se consulta mediante `finance_snapshot`. El usuario aportó posteriormente el esquema con los nombres físicos, usados en `sql/admin-realtime.sql` y las suscripciones. Sus políticas y permisos reales todavía deben comprobarse: el resultado que compartió corresponde únicamente a las cuatro tablas excluidas. No considerar una suscripción establecida como prueba de que recibe cambios.

## Verificación y entrega

Comprobar eventos de inserción, modificación y eliminación, agrupación de eventos, cambios durante consultas, reconexión, cierre de sesión, preservación de borradores y exclusión de contenido/configuración. Verificar que un evento financiero refresca todas sus vistas sin consultar instantáneas duplicadas. Hacer pruebas locales automatizadas con cliente simulado y una comprobación entre dos sesiones cuando haya acceso a Supabase y una sesión administrativa autorizada.

La entrega distinguirá el código y las pruebas locales de la activación y verificación real en Supabase. No afirmar que Realtime está operativo en producción si falta ejecutar la migración o comprobar los eventos reales.
