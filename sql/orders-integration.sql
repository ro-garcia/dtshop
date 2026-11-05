-- Run after supabase.sql. No orders or customers are seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS dtshop.checkout_request (
  user_id uuid NOT NULL REFERENCES dtshop.app_user(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  order_id uuid NOT NULL REFERENCES dtshop.shop_order(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE dtshop.checkout_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dtshop.checkout_request FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION dtshop.checkout_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE receipt jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere la sesión del comprador.' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('id',o.id,'status',o.status,'currency',o.currency,'subtotal_cents',o.subtotal_cents,
    'shipping_cents',o.shipping_cents,'total_cents',o.total_cents,'placed_at',o.placed_at,
    'payment_method_code',o.payment_method_code,'installment_count',o.installment_count,
    'customer_name',(SELECT concat_ws(' ',c.first_name,c.last_name) FROM customer c WHERE c.id=o.customer_id),
    'nit',o.nit,'phone',o.phone,'street_address',o.street_address,'neighborhood',o.neighborhood,'municipality',o.municipality,
    'department',(SELECT d.name FROM department d WHERE d.id=o.department_id),
    'lines',(SELECT jsonb_agg(jsonb_build_object('product_id',l.product_id,'variant_id',l.variant_id,'product_name',l.product_name,
      'variant_label',l.variant_label,'qty',l.qty,'unit_price_cents',l.unit_price_cents,'preorder',l.preorder) ORDER BY l.id) FROM shop_order_line l WHERE l.order_id=o.id))
  INTO receipt FROM checkout_request r JOIN shop_order o ON o.id=r.order_id
    WHERE r.user_id=auth.uid() AND r.request_id=p_request_id;
  IF receipt IS NULL THEN RAISE EXCEPTION 'No se encontró el pedido en esta sesión.' USING ERRCODE='P0002'; END IF;
  RETURN receipt;
END $$;

CREATE OR REPLACE FUNCTION dtshop.submit_shop_order(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE
  prior checkout_request%ROWTYPE;
  config store_setting%ROWTYPE;
  dept department%ROWTYPE;
  line jsonb;
  total bigint := 0;
  shipping bigint;
  unit_price bigint;
  new_order uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM app_user WHERE id=auth.uid() AND is_active AND role='customer') THEN
    RAISE EXCEPTION 'Se requiere una sesión de comprador activa.' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
  PERFORM dtshop_private.lock_finance();
  SELECT * INTO prior FROM checkout_request WHERE user_id=auth.uid() AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.payload_hash<>md5(p_payload::text) THEN RAISE EXCEPTION 'Esta solicitud ya se utilizó con otros datos. Consulta el pedido registrado.'; END IF;
    RETURN checkout_receipt(p_request_id);
  END IF;
  IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Agrega entre 1 y 30 líneas al pedido.';
  END IF;
  IF (SELECT count(DISTINCT value->>'variant_id') FROM jsonb_array_elements(p_payload->'lines'))<>jsonb_array_length(p_payload->'lines') THEN
    RAISE EXCEPTION 'Las tallas del pedido están duplicadas o no son válidas.';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
    IF jsonb_typeof(line->'qty') IS DISTINCT FROM 'number' OR (line->>'qty') !~ '^[0-9]+$'
       OR (line->>'qty')::numeric NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Cantidad inválida.'; END IF;
    SELECT p.price_cents INTO unit_price FROM product p JOIN product_variant v ON v.product_id=p.id
      WHERE p.id=line->>'product_id' AND v.id=(line->>'variant_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no coincide con la talla.'; END IF;
    total:=total+unit_price*(line->>'qty')::integer;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') l
    GROUP BY l->>'product_id' HAVING sum((l->>'qty')::integer)>99) THEN RAISE EXCEPTION 'Máximo 99 unidades por producto.'; END IF;
  SELECT * INTO STRICT config FROM store_setting WHERE id=1;
  SELECT * INTO dept FROM department WHERE name=btrim(p_payload->>'department');
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecciona un departamento válido.'; END IF;
  shipping:=CASE WHEN dept.is_metro THEN config.shipping_guatemala_cents ELSE config.shipping_other_cents END;
  IF (p_payload->>'expected_currency') IS DISTINCT FROM config.currency::text
     OR jsonb_typeof(p_payload->'expected_total_cents') IS DISTINCT FROM 'number'
     OR (p_payload->>'expected_total_cents')::numeric IS DISTINCT FROM (total+shipping)::numeric THEN
    RAISE EXCEPTION 'Los precios o el envío cambiaron. Actualiza el resumen antes de enviar el pedido.';
  END IF;
  new_order:=place_order(p_payload->>'first_name',p_payload->>'last_name',p_payload->>'street',
    p_payload->>'neighborhood',p_payload->>'municipality',p_payload->>'department',p_payload->>'phone',
    p_payload->>'nit',p_payload->>'payment_method',(p_payload->>'installments')::smallint,p_payload->'lines');
  INSERT INTO checkout_request(user_id,request_id,payload_hash,order_id) VALUES(auth.uid(),p_request_id,md5(p_payload::text),new_order);
  RETURN checkout_receipt(p_request_id);
END $$;

CREATE OR REPLACE FUNCTION dtshop.transition_shop_order(p_order uuid,p_expected text,p_status text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE current_status text;
BEGIN
  PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
  SELECT status INTO STRICT current_status FROM shop_order WHERE id=p_order FOR UPDATE;
  -- Retrying a confirmed transition must not restore stock or write an event twice.
  IF current_status=p_status THEN RETURN; END IF;
  IF current_status IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'El pedido cambió. Actualiza la lista antes de continuar.'; END IF;
  PERFORM set_order_status(p_order,p_status,p_note);
END $$;

REVOKE ALL ON FUNCTION dtshop.checkout_receipt(uuid),dtshop.submit_shop_order(uuid,jsonb),dtshop.transition_shop_order(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dtshop.checkout_receipt(uuid),dtshop.submit_shop_order(uuid,jsonb),dtshop.transition_shop_order(uuid,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
