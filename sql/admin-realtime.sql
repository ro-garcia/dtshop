-- DT Shop: activar Postgres Changes para administracion.
-- Ejecutar TODO el archivo en el SQL Editor de Supabase como postgres.
-- Basado en el esquema compartido por el usuario el 2026-11-08.
-- No ejecutar el CREATE TABLE del esquema de referencia.
-- No modifica registros, GRANT, politicas RLS ni REPLICA IDENTITY.
-- Puede ejecutarse de nuevo: solo agrega tablas que aun no estan publicadas.
-- Contenido y Configuracion NO se agregan. Tampoco se retiran publicaciones
-- previas de esas tablas, porque otros consumidores podrian utilizarlas.

BEGIN;

CREATE TEMP TABLE dtshop_admin_realtime_targets (
  table_name text PRIMARY KEY,
  module text NOT NULL
) ON COMMIT DROP;

INSERT INTO dtshop_admin_realtime_targets (table_name, module) VALUES
  ('category', 'catalogo'),
  ('product', 'catalogo'),
  ('product_variant', 'catalogo'),
  ('product_media', 'catalogo'),
  ('launch', 'catalogo'),
  ('launch_product', 'catalogo'),
  ('inventory_movement', 'catalogo'),
  ('shop_order', 'pedidos y contabilidad'),
  ('shop_order_line', 'pedidos'),
  ('order_status_event', 'pedidos'),
  ('customer', 'pedidos y contabilidad'),
  ('department', 'pedidos'),
  ('money_account', 'contabilidad'),
  ('cash_sale', 'contabilidad'),
  ('cash_sale_line', 'contabilidad'),
  ('cash_sale_adjustment', 'contabilidad'),
  ('settlement', 'contabilidad'),
  ('settlement_allocation', 'contabilidad'),
  ('attachment', 'contabilidad'),
  ('receipt', 'contabilidad'),
  ('account_transfer', 'contabilidad'),
  ('ledger_entry', 'contabilidad'),
  ('obligation', 'contabilidad'),
  ('obligation_movement', 'contabilidad'),
  ('bank', 'contabilidad'),
  ('operation_request', 'contabilidad'),
  ('account_reconciliation', 'contabilidad'),
  -- Nombres de quienes solicitan y revisan operaciones financieras.
  -- El frontend no debe usar este evento para recargar Configuracion.
  ('app_user', 'personas de contabilidad');

DO $realtime$
DECLARE
  target record;
  relation_id oid;
  publication record;
BEGIN
  SELECT * INTO publication
  FROM pg_publication WHERE pubname = 'supabase_realtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe supabase_realtime. Verifica que este sea el proyecto Supabase correcto.';
  END IF;
  IF NOT (publication.pubinsert AND publication.pubupdate AND publication.pubdelete) THEN
    RAISE EXCEPTION 'supabase_realtime no publica INSERT, UPDATE y DELETE. Revisa su configuracion antes de continuar.';
  END IF;

  FOR target IN SELECT * FROM pg_temp.dtshop_admin_realtime_targets ORDER BY table_name LOOP
    relation_id := to_regclass(format('%I.%I', 'dtshop', target.table_name));
    IF relation_id IS NULL THEN
      RAISE EXCEPTION 'Falta dtshop.%. Se cancela toda la activacion.', target.table_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = relation_id AND relkind = 'r' AND relpersistence = 'p'
    ) THEN
      RAISE EXCEPTION 'dtshop.% no es una tabla permanente ordinaria como en el esquema de referencia.', target.table_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_index WHERE indrelid = relation_id AND indisprimary
    ) OR EXISTS (
      SELECT 1 FROM pg_class WHERE oid = relation_id AND relreplident = 'n'
    ) THEN
      RAISE EXCEPTION 'Revisa la clave primaria y REPLICA IDENTITY de dtshop.% antes de publicar UPDATE/DELETE.', target.table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'dtshop' AND tablename = target.table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', 'dtshop', target.table_name);
    END IF;
  END LOOP;
END;
$realtime$;

-- Resultado 1: las 28 tablas deben mostrar publicada = true.
-- SELECT y USAGE son requisitos, pero NO prueban que RLS permita leer filas.
-- Este diagnostico no concede permisos. Si SELECT es false (p. ej. finanzas
-- accesibles solo por RPC), hay que revisar las politicas antes de activar
-- la suscripcion del navegador; no usar GRANT general ni USING (true).
SELECT
  t.module AS modulo,
  'dtshop.' || t.table_name AS tabla,
  p.tablename IS NOT NULL AS publicada,
  has_schema_privilege('authenticated', 'dtshop', 'USAGE') AS authenticated_schema_usage,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  c.relrowsecurity AS rls_habilitado,
  (
    SELECT count(*) FROM pg_policy pol
    WHERE pol.polrelid = c.oid AND pol.polcmd IN ('r', '*')
  ) AS politicas_select_totales,
  p.rowfilter AS filtro_publicacion
FROM pg_temp.dtshop_admin_realtime_targets t
JOIN pg_namespace n ON n.nspname = 'dtshop'
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
LEFT JOIN pg_publication_tables p ON p.pubname = 'supabase_realtime'
  AND p.schemaname = 'dtshop' AND p.tablename = t.table_name
ORDER BY t.module, t.table_name;

-- Resultado 2: estas cuatro tablas no se modifican. Si ya estaban publicadas,
-- el frontend igualmente debe excluirlas de sus suscripciones del admin.
SELECT
  name AS tabla_excluida,
  EXISTS (
    SELECT 1 FROM pg_publication_tables p
    WHERE p.pubname = 'supabase_realtime'
      AND p.schemaname = 'dtshop' AND p.tablename = name
  ) AS ya_publicada
FROM unnest(ARRAY['content_block', 'content_video', 'store_setting', 'payment_method']) AS excluded(name)
ORDER BY name;

COMMIT;
