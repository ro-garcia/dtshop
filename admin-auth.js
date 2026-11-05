(() => {
  'use strict';
  const form = document.querySelector('#loginForm');
  const button = form.querySelector('[type=submit]');
  const errorBox = document.querySelector('#loginError');
  // Never allow the browser's default GET submission to put a password in the URL.
  form.addEventListener('submit', event => event.preventDefault());
  let client, revision = 0, signingIn = false, signingOut = false;
  const message = text => { errorBox.textContent = text; errorBox.hidden = !text; };
  const busy = value => { button.disabled = value; button.textContent = value ? 'Verificando…' : 'Entrar al panel'; };
  function publish(profile) {
    if (JSON.stringify(window.adminIdentity || null) === JSON.stringify(profile)) return;
    window.adminIdentity = profile;
    document.dispatchEvent(new CustomEvent('dirtytask:auth', { detail: profile }));
  }
  function configError() {
    const config = window.DIRTYTASK_SUPABASE;
    if (!config?.url || !config?.publishableKey) return 'La conexión de la tienda no está configurada. Contacta al administrador.';
    try {
      const url = new URL(config.url);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error();
      if (!config.publishableKey.startsWith('sb_publishable_')) {
        const payload = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role !== 'anon') throw Error();
      }
    } catch { return 'La conexión de la tienda no está disponible. Contacta al administrador.'; }
    if (!window.supabase?.createClient) return 'No se pudo cargar la tienda. Comprueba tu conexión y recarga la página.';
    return '';
  }
  async function verify() {
    const ticket = ++revision;
    busy(true);
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) { if (ticket === revision) publish(null); return; }
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) throw error || Error('session');
      const { data: profile, error: profileError } = await client.schema('dtshop').from('app_user')
        .select('id,display_name,role,is_active').eq('id', data.user.id).single();
      if (profileError) throw Error('profile');
      if (!profile?.is_active || !['partner_ops','partner_finance','admin'].includes(profile.role)) {
        if (ticket === revision) { publish(null); message('Esta cuenta no tiene acceso autorizado al panel.'); }
        return;
      }
      if (ticket === revision) { message(''); publish({ ...profile, email: data.user.email }); }
    } catch {
      if (ticket === revision) { publish(null); message('No se pudo verificar el acceso. Comprueba tu conexión y vuelve a iniciar sesión.'); }
    } finally { if (ticket === revision) busy(false); }
  }
  async function logout() {
    if (signingOut) return;
    signingOut = true;
    ++revision;
    publish(null);
    busy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      message('');
      form.reset();
    } catch { message('No se pudo cerrar la sesión guardada. Comprueba la conexión y vuelve a entrar para intentarlo.'); }
    finally { signingOut = false; busy(false); }
  }
  publish(null);
  const problem = configError();
  if (problem) { message(problem); button.disabled = true; return; }
  const config = window.DIRTYTASK_SUPABASE;
  client = window.supabase.createClient(config.url.trim(), config.publishableKey.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  window.dirtytaskSupabase = client;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (signingIn) return;
    signingIn = true; busy(true); message(''); publish(null);
    const passwordInput = document.querySelector('#loginPassword');
    try {
      const { error } = await client.auth.signInWithPassword({
        email: document.querySelector('#loginEmail').value.trim(), password: passwordInput.value
      });
      if (error) {
        message(error.code === 'invalid_credentials' ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Verifica tu conexión y que el correo esté confirmado.');
      } else { await verify(); }
    } catch { message('No se pudo conectar con la tienda. Comprueba tu conexión e inténtalo de nuevo.'); }
    finally { passwordInput.value = ''; signingIn = false; busy(false); }
  });
  document.querySelector('#logoutButton').addEventListener('click', logout);
  document.querySelector('#mobileLogout').addEventListener('click', logout);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) { ++revision; publish(null); if (!signingIn && !signingOut) busy(false); }
    // Avoid awaiting la tienda calls while its auth callback holds the session lock.
    else if (!signingIn && !signingOut && event !== 'INITIAL_SESSION') setTimeout(verify, 0);
  });
  window.addEventListener('focus', () => { if (!signingIn && !signingOut) verify(); });
  verify();
})();
