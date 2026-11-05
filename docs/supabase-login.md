# Conectar el acceso de socios

Abre `supabase-config.js` en la raíz del proyecto y completa:

```js
window.DIRTYTASK_SUPABASE = Object.freeze({
  url: "https://TU-PROYECTO.supabase.co",
  publishableKey: "sb_publishable_TU_CLAVE"
});
```

Estos valores son públicos en una aplicación web. No uses `service_role`, `sb_secret_...` ni la contraseña de la base de datos. También se admite una clave antigua `anon`; se rechazan claves de otro rol.

Abre `admin.html` desde un servidor HTTP local o desde tu sitio HTTPS, no haciendo doble clic en el archivo. Entra con el correo y contraseña de uno de los socios que creaste. El correo debe estar confirmado y su registro en `dtshop.app_user` debe tener `is_active=true` y rol `partner_ops` o `partner_finance`. El esquema `dtshop` debe estar expuesto en Data API.

El acceso utiliza el [SDK oficial y signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword). El SDK se carga desde jsDelivr, fijado a la versión 2.49.8. Se necesita conexión a Internet. La sesión se conserva en el navegador y se valida contra Auth y `dtshop.app_user` al cargar, renovar sesión o volver a la ventana.

La cuenta de finanzas puede consultar el catálogo, pero sus controles de edición están bloqueados. El nombre y rol mostrados proceden de Supabase. El cierre de sesión afecta este navegador; cierra también los diálogos abiertos. No existe acceso alternativo de demostración.

**Solo el acceso está conectado.** El catálogo/configuración sigue en almacenamiento local; ventas y contabilidad siguen usando sus repositorios de demostración. No son datos compartidos entre socios ni registros contables reales. Los controles de las demostraciones financieras todavía no implementan el flujo de aprobaciones del SQL. La edición del perfil/avatar también sigue siendo local: no modifica la identidad de Supabase.

Esta etapa no incluye registro público, invitaciones ni recuperación por correo. Si creaste un usuario mediante invitación y aún no tiene contraseña, completa su alta mediante Supabase antes de usar este acceso. No se procesan enlaces de recuperación/invitación en `admin.html`.

## Verificación después de completar los valores

1. Intenta entrar con contraseña incorrecta: el panel debe permanecer cerrado.
2. Entra con operaciones, recarga y comprueba que mantiene la sesión.
3. Cierra sesión e ingresa con finanzas: debe mostrar el rol correspondiente y catálogo de consulta.
4. Usa una cuenta de cliente o socio inactivo: no debe entrar al panel.
5. Repite en otro navegador para confirmar que cada socio usa su propia sesión.

Los tests `tests/auth-browser.cjs` usan un SDK simulado; cubren los estados sin enviar credenciales a ningún servicio. La comprobación contra tu Supabase real queda pendiente de introducir la URL y clave.
