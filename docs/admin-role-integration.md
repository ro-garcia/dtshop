# Administrador sin aprobación cruzada

1. Ejecuta completo `sql/admin-role-integration.sql` después de las migraciones de catálogo, tienda, pedidos y contabilidad. Puede repetirse. Conserva los registros existentes.
2. La cuenta `dirtytask.clothes+admin@gmail.com` debe existir en Authentication. Si no existe, créala desde el panel de usuarios, con su contraseña y correo confirmado. No hay contraseñas incluidas en el código.
3. Ejecuta completo `sql/assign-dirtytask-admin.sql`. Asigna exclusivamente esa cuenta y devuelve el perfil para verificarlo. Falla sin modificar nada si el correo no existe.
4. Cierra sesión e ingresa con esa cuenta. El encabezado mostrará Administrador.

El rol admin tiene acceso al catálogo, contenido, configuración, pedidos y finanzas. Sus movimientos se aplican de forma atómica y quedan como aprobados con autor, fecha, resultado y marca applied_directly. Sus conciliaciones quedan verificadas y cierran el período. También puede revisar solicitudes de socios.

Los socios mantienen aprobación cruzada. Se conservan validación de importes, fondos disponibles, cierres, archivos privados e idempotencia. El rol no se asigna desde metadatos del registro ni se puede modificar desde el navegador; se requiere acceso administrativo a la base de datos. No se deshabilitan RLS ni las restricciones financieras.

En instalaciones nuevas, aplica también esta migración después de las demás. Si reinstalas una migración anterior que reemplaza estas funciones, vuelve a ejecutar admin-role-integration.sql.
