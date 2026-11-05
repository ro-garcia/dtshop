-- Run after store-integration.sql. Adds the editable home banner without replacing existing content.
BEGIN;
ALTER TABLE dtshop.content_block ADD COLUMN IF NOT EXISTS hero_image_key text;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='dtshop.content_block'::regclass AND conname='content_banner_key_check') THEN
    ALTER TABLE dtshop.content_block ADD CONSTRAINT content_banner_key_check CHECK(
      hero_image_key IS NULL OR (char_length(hero_image_key) BETWEEN 1 AND 300 AND hero_image_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$')
    );
  END IF;
END $$;
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
  UPDATE content_block SET hero_image_key=CASE WHEN p_content ? 'hero_image_key' THEN nullif(p_content->>'hero_image_key','') ELSE hero_image_key END,hero_copy=p_content->>'hero_copy',feed_copy=p_content->>'feed_copy',
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


REVOKE ALL ON FUNCTION dtshop.save_store_content(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dtshop.save_store_content(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
