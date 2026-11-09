# Activar Realtime del admin

1. Abre el proyecto de DT Shop en Supabase y entra en **SQL Editor**.
2. Copia y ejecuta completo `sql/admin-realtime.sql` con el rol `postgres`.
3. Comprueba que la transacción termina sin errores. El primer resultado contiene 28 tablas y debe mostrar `publicada = true` en todas. El segundo muestra el estado previo de las cuatro tablas excluidas. Si el editor solo muestra el último resultado, revisa también los resultados anteriores.

El archivo agrega las tablas verificadas contra el esquema compartido a `supabase_realtime`; repetirlo no duplica sus entradas. No modifica registros, permisos, políticas RLS ni identidad de réplica. Si falta una tabla, se revierte toda la operación. Si una ejecución manual deja una transacción abortada, ejecuta `ROLLBACK;` antes de reintentar.

Incluye catálogo, inventario, lanzamientos, pedidos y contabilidad. Resumen y estadísticas se actualizan a partir de esas mismas tablas. `app_user` se incluye por los nombres de solicitantes y revisores financieros; no implica refrescar el módulo Configuración.

No agrega `content_block`, `content_video`, `store_setting` ni `payment_method`. Si ya estaban publicadas, las deja como estaban para conservar otros consumidores. Tampoco agrega carritos, favoritos, auditoría ni tablas internas de idempotencia.

## Permisos y comprobación real

El esquema compartido no contiene las políticas RLS ni los permisos actuales. El diagnóstico informa si `authenticated` tiene USAGE y SELECT, si RLS está habilitado y cuántas políticas de lectura existen. **El número de políticas no prueba acceso**: también cuentan sus roles y condiciones. Un filtro de publicación existente puede limitar los eventos.

Si falta SELECT o una política impide leer las filas, publicar la tabla no basta. En particular, una función financiera con permisos de propietario puede funcionar aunque el usuario no pueda leer directamente sus tablas. Comparte el resultado del diagnóstico y las políticas relevantes para resolverlo sin abrir acceso general a información financiera.

Las suscripciones deben usar la sesión autenticada y el esquema `dtshop`. Los eventos servirán para volver a consultar los módulos; no se necesita habilitar `REPLICA IDENTITY FULL` para obtener todas las columnas anteriores. Los eventos DELETE tienen limitaciones de filtrado y RLS: no deben utilizarse como fuente de datos privados, solo para invalidar la vista y volver a consultar mediante las APIs autorizadas.

El admin carga `admin-realtime.js` con el cliente autenticado. Suscripciones explícitas agrupan avisos de las 28 tablas por catálogo, pedidos y finanzas. Al reconectar se consultan nuevamente los tres módulos. Los cambios de Contenido y Configuración no disparan consultas.

El estado bajo la barra superior indica conexión, actualización pendiente o reintento. “Actualizaciones automáticas conectadas” confirma la suscripción, pero no demuestra que todas las tablas permitan leer eventos: verifica también el diagnóstico SQL y la prueba entre sesiones.

Los editores abiertos y los campos con foco aplazan la actualización del módulo afectado. Al terminar la edición o salir del campo se aplica la actualización pendiente. Se conservan filtros, notas de pedidos y aprobaciones, detalles de pedidos abiertos y selección de exportación. Los botones manuales mantienen su comportamiento habitual.

## Probar en dos sesiones

1. Publica o sirve los archivos actualizados y recarga `admin.html` en dos navegadores o perfiles con acceso autorizado. Una sesión puede ser Operaciones y la otra Finanzas.
2. Espera el estado de conexión. Edita un producto desde Operaciones y comprueba el nombre, stock y estadísticas en la otra sesión sin pulsar Actualizar.
3. Crea un pedido de prueba o cambia su estado. Verifica Pedidos, sus contadores y Resumen en la otra sesión.
4. En Contabilidad, crea una solicitud con Finanzas y verifica que aparezca en Aprobaciones de Operaciones. Utiliza datos de prueba apropiados; una aprobación puede aplicar un movimiento real.
5. Deja un editor abierto y modifica el mismo módulo en la otra sesión. El borrador debe conservarse y la actualización aplicarse al cerrar el editor. Si intentas guardar una versión antigua, siguen vigentes las comprobaciones de conflicto del servidor.
6. Desconecta y reconecta la red; los módulos deben recuperar los cambios omitidos. Cierra sesión y comprueba que el panel se oculta y se retira la suscripción.

Si un módulo no recibe cambios pese a mostrar conexión, revisa `authenticated_select`, políticas RLS y la publicación de sus tablas. La prueba local usa un cliente simulado y no comprueba esos permisos del proyecto real.

## Pruebas locales

Sin dependencias: `node --test tests/admin-realtime.cjs tests/finance-realtime.cjs`.

Con Playwright accesible mediante Node.js y Microsoft Edge instalado: `node tests/admin-realtime-browser.cjs`. La prueba sirve el admin localmente, sustituye el cliente Supabase y bloquea las conexiones externas; no accede a datos reales. Puede configurarse `NODE_PATH` para usar una instalación temporal de Playwright.

Referencia: [Postgres Changes de Supabase](https://supabase.com/docs/guides/realtime/postgres-changes).
