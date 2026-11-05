-- Execute after admin-role-integration.sql, using the SQL Editor.
BEGIN;
DO $assign$
DECLARE target uuid;
BEGIN
 SELECT id INTO STRICT target FROM auth.users WHERE lower(email)=lower('dirtytask.clothes+admin@gmail.com');
 UPDATE dtshop.app_user SET role='admin',is_active=true WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta no tiene perfil en la tienda.'; END IF;
END $assign$;
COMMIT;
SELECT id,display_name,role,is_active FROM dtshop.app_user WHERE id IN (SELECT id FROM auth.users WHERE lower(email)=lower('dirtytask.clothes+admin@gmail.com'));
