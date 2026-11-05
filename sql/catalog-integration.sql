-- Run after supabase.sql, including on existing installations. No sample data.
BEGIN;

CREATE OR REPLACE FUNCTION dtshop.save_catalog_product(p_product jsonb, p_existing text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE
  target text := p_product->>'id';
  labels text[];
BEGIN
  PERFORM dtshop_private.require_ops();
  PERFORM dtshop_private.lock_finance();
  IF jsonb_typeof(p_product->'variants') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Agrega tallas o variantes.';
  END IF;
  SELECT array_agg(btrim(value) ORDER BY ord) INTO labels
    FROM jsonb_array_elements_text(p_product->'variants') WITH ORDINALITY AS v(value,ord);
  IF coalesce(cardinality(labels),0) NOT BETWEEN 1 AND 20
     OR EXISTS(SELECT 1 FROM unnest(labels) label WHERE char_length(label) NOT BETWEEN 1 AND 12)
     OR (SELECT count(DISTINCT label) FROM unnest(labels) label) <> cardinality(labels) THEN
    RAISE EXCEPTION 'Usa entre 1 y 20 variantes distintas, de hasta 12 caracteres.';
  END IF;
  IF p_existing IS NULL THEN
    INSERT INTO product(id,name,category_code,description,price_cents,variant_label,stock,status,published,preorder)
    VALUES(target,p_product->>'name',p_product->>'category_code',coalesce(p_product->>'description',''),
      (p_product->>'price_cents')::bigint,p_product->>'variant_label',(p_product->>'stock')::integer,
      p_product->>'status',(p_product->>'published')::boolean,(p_product->>'preorder')::boolean);
  ELSE
    IF target IS DISTINCT FROM p_existing THEN RAISE EXCEPTION 'No se puede cambiar el identificador.'; END IF;
    UPDATE product SET name=p_product->>'name',category_code=p_product->>'category_code',
      description=coalesce(p_product->>'description',''),price_cents=(p_product->>'price_cents')::bigint,
      variant_label=p_product->>'variant_label',stock=(p_product->>'stock')::integer,
      status=p_product->>'status',published=(p_product->>'published')::boolean,preorder=(p_product->>'preorder')::boolean
      WHERE id=p_existing AND updated_at=(p_product->>'expected_updated_at')::timestamptz;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto cambió desde la última carga. Cierra el editor y actualiza el catálogo.'; END IF;
  END IF;
  -- Keep IDs for unchanged labels. Referenced order variants cannot be removed.
  IF EXISTS(SELECT 1 FROM product_variant v JOIN shop_order_line l ON l.variant_id=v.id
    WHERE v.product_id=target AND NOT(v.label=ANY(labels))) THEN
    RAISE EXCEPTION 'No puedes quitar una variante utilizada en pedidos. Conserva su etiqueta.';
  END IF;
  IF EXISTS(SELECT 1 FROM product_variant v JOIN cart_item c ON c.variant_id=v.id
    WHERE v.product_id=target AND NOT(v.label=ANY(labels))) THEN
    RAISE EXCEPTION 'No puedes quitar una variante presente en una bolsa. Conserva su etiqueta.';
  END IF;
  DELETE FROM product_variant WHERE product_id=target AND NOT(label=ANY(labels));
  INSERT INTO product_variant(product_id,label,sort_order)
    SELECT target,label,(ord-1)::smallint FROM unnest(labels) WITH ORDINALITY AS v(label,ord)
    ON CONFLICT(product_id,label) DO UPDATE SET sort_order=excluded.sort_order;
  DELETE FROM product_media WHERE product_id=target;
  INSERT INTO product_media(product_id,kind,storage_key)
    SELECT target,kind,key FROM (VALUES ('product',p_product->>'image_key'),('look',p_product->>'look_key')) m(kind,key)
    WHERE nullif(key,'') IS NOT NULL;
  RETURN target;
END $$;

CREATE OR REPLACE FUNCTION dtshop.save_catalog_launch(p_launch jsonb, p_existing text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE target text := p_launch->>'id'; links text[];
BEGIN
  PERFORM dtshop_private.require_ops();
  PERFORM dtshop_private.lock_finance();
  IF jsonb_typeof(p_launch->'product_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Modelos inválidos.'; END IF;
  SELECT coalesce(array_agg(value ORDER BY ord),ARRAY[]::text[]) INTO links
    FROM jsonb_array_elements_text(p_launch->'product_ids') WITH ORDINALITY AS v(value,ord);
  IF cardinality(links)>12 OR (SELECT count(DISTINCT id) FROM unnest(links) id)<>cardinality(links) THEN
    RAISE EXCEPTION 'Selecciona hasta 12 modelos distintos.';
  END IF;
  IF p_existing IS NULL THEN
    INSERT INTO launch(id,name,launch_on,arrival_label,image_key,status)
      VALUES(target,p_launch->>'name',(p_launch->>'launch_on')::date,coalesce(p_launch->>'arrival_label',''),
        nullif(p_launch->>'image_key',''),p_launch->>'status');
  ELSE
    IF target IS DISTINCT FROM p_existing THEN RAISE EXCEPTION 'No se puede cambiar el identificador.'; END IF;
    UPDATE launch SET name=p_launch->>'name',launch_on=(p_launch->>'launch_on')::date,
      arrival_label=coalesce(p_launch->>'arrival_label',''),image_key=nullif(p_launch->>'image_key',''),status=p_launch->>'status'
      WHERE id=p_existing AND updated_at=(p_launch->>'expected_updated_at')::timestamptz;
    IF NOT FOUND THEN RAISE EXCEPTION 'El lanzamiento cambió desde la última carga. Cierra el editor y actualiza el catálogo.'; END IF;
  END IF;
  DELETE FROM launch_product WHERE launch_id=target;
  INSERT INTO launch_product(launch_id,product_id,sort_order)
    SELECT target,id,(ord-1)::smallint FROM unnest(links) WITH ORDINALITY AS p(id,ord);
  RETURN target;
END $$;

CREATE OR REPLACE FUNCTION dtshop.archive_catalog_product(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
BEGIN
  PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
  UPDATE product SET status='archived',published=false WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto ya no existe.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION dtshop.close_catalog_launch(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
BEGIN
  PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
  UPDATE launch SET status='closed' WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El lanzamiento ya no existe.'; END IF;
END $$;

REVOKE ALL ON FUNCTION dtshop.save_catalog_product(jsonb,text),dtshop.save_catalog_launch(jsonb,text),
  dtshop.archive_catalog_product(text),dtshop.close_catalog_launch(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dtshop.save_catalog_product(jsonb,text),dtshop.save_catalog_launch(jsonb,text),
  dtshop.archive_catalog_product(text),dtshop.close_catalog_launch(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
