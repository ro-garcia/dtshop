-- Run after supabase.sql on an existing installation. Does not change catalog RPCs.
BEGIN;
CREATE OR REPLACE FUNCTION dtshop.save_store_content(p_content jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE urls text[]; saved content_block%ROWTYPE;
BEGIN
  PERFORM dtshop_private.require_ops();
  PERFORM dtshop_private.lock_finance();
  IF jsonb_typeof(p_content->'videos') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de videos inválida.'; END IF;
  SELECT coalesce(array_agg(value ORDER BY ord),ARRAY[]::text[]) INTO urls
    FROM jsonb_array_elements_text(p_content->'videos') WITH ORDINALITY AS v(value,ord);
  IF cardinality(urls)>12 OR (SELECT count(DISTINCT url) FROM unnest(urls) url)<>cardinality(urls) THEN
    RAISE EXCEPTION 'Usa hasta 12 videos distintos.';
  END IF;
  UPDATE content_block SET hero_copy=p_content->>'hero_copy',feed_copy=p_content->>'feed_copy',
    instagram_url=p_content->>'instagram_url',tiktok_url=p_content->>'tiktok_url'
    WHERE id=1 AND updated_at=(p_content->>'expected_updated_at')::timestamptz RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'El contenido cambió o no existe. Actualiza antes de guardar.'; END IF;
  DELETE FROM content_video WHERE NOT(url=ANY(urls));
  INSERT INTO content_video(url,sort_order)
    SELECT url,(ord-1)::smallint FROM unnest(urls) WITH ORDINALITY AS v(url,ord)
    ON CONFLICT(url) DO UPDATE SET sort_order=excluded.sort_order;
  RETURN jsonb_build_object('block',to_jsonb(saved),'videos',
    (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY sort_order,id),'[]'::jsonb) FROM content_video v));
END $$;

CREATE OR REPLACE FUNCTION dtshop.save_store_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE saved store_setting%ROWTYPE; payment_flags jsonb := p_settings->'payments'; affected integer;
BEGIN
  PERFORM dtshop_private.require_ops();
  PERFORM dtshop_private.lock_finance();
  IF jsonb_typeof(payment_flags) IS DISTINCT FROM 'object'
    OR jsonb_typeof(payment_flags->'cash') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(payment_flags->'visa_installments') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(payment_flags->'visalink') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Métodos de pago inválidos.';
  END IF;
  IF NOT ((payment_flags->>'cash')::boolean OR (payment_flags->>'visa_installments')::boolean OR (payment_flags->>'visalink')::boolean) THEN
    RAISE EXCEPTION 'Deja al menos un método de pago disponible.';
  END IF;
  IF jsonb_typeof(p_settings->'shipping_guatemala_cents') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_settings->'shipping_other_cents') IS DISTINCT FROM 'number'
    OR (p_settings->>'shipping_guatemala_cents') !~ '^[0-9]+$'
    OR (p_settings->>'shipping_other_cents') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Las tarifas deben ser centavos enteros no negativos.';
  END IF;
  UPDATE store_setting SET shipping_guatemala_cents=(p_settings->>'shipping_guatemala_cents')::bigint,
    shipping_other_cents=(p_settings->>'shipping_other_cents')::bigint
    WHERE id=1 AND updated_at=(p_settings->>'expected_updated_at')::timestamptz RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'La configuración cambió o no existe. Actualiza antes de guardar.'; END IF;
  UPDATE payment_method SET enabled=(payment_flags->>code)::boolean WHERE code IN ('cash','visa_installments','visalink');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>3 THEN RAISE EXCEPTION 'Faltan métodos de pago de la tienda. Revisa payment_method.'; END IF;
  RETURN jsonb_build_object('settings',to_jsonb(saved),'payments',
    (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY sort_order,code),'[]'::jsonb) FROM payment_method p));
END $$;

REVOKE ALL ON FUNCTION dtshop.save_store_content(jsonb),dtshop.save_store_settings(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dtshop.save_store_content(jsonb),dtshop.save_store_settings(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
