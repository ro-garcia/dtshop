-- Run after catalog/store/orders/banner/finance integrations. Safe to repeat. No users are promoted here.
BEGIN;
ALTER TABLE dtshop.app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE dtshop.app_user ADD CONSTRAINT app_user_role_check CHECK(role IN ('customer','partner_ops','partner_finance','admin'));
ALTER TABLE dtshop.operation_request ADD COLUMN IF NOT EXISTS applied_directly boolean NOT NULL DEFAULT false;
ALTER TABLE dtshop.account_reconciliation ADD COLUMN IF NOT EXISTS applied_directly boolean NOT NULL DEFAULT false;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='dtshop.operation_request'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%reviewed_by%' AND pg_get_constraintdef(oid) LIKE '%requested_by%' LOOP
 EXECUTE format('ALTER TABLE dtshop.operation_request DROP CONSTRAINT %I',c.conname); END LOOP;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='dtshop.account_reconciliation'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%reviewed_by%' AND pg_get_constraintdef(oid) LIKE '%prepared_by%' LOOP
 EXECUTE format('ALTER TABLE dtshop.account_reconciliation DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE dtshop.operation_request ADD CONSTRAINT operation_request_reviewer_check CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by OR applied_directly);
ALTER TABLE dtshop.account_reconciliation ADD CONSTRAINT reconciliation_reviewer_check CHECK((reviewed_by IS NULL AND reviewed_at IS NULL AND NOT applied_directly) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND (reviewed_by<>prepared_by OR applied_directly)));
CREATE OR REPLACE FUNCTION dtshop.is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = dtshop, pg_catalog AS $$
 SELECT coalesce(dtshop_private.app_role() IN ('partner_ops','partner_finance','admin'),false)
$$;
CREATE OR REPLACE FUNCTION dtshop_private.require_ops() RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF coalesce(dtshop_private.app_role(),'') NOT IN ('partner_ops','admin') THEN RAISE EXCEPTION 'Acceso exclusivo a operaciones.' USING ERRCODE='42501'; END IF; END $$;
CREATE OR REPLACE FUNCTION dtshop.submit_operation(p_operation text,p_payload jsonb,p_idempotency_key uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE r operation_request%ROWTYPE; rid uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO r FROM operation_request WHERE requested_by=auth.uid() AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
 IF r.operation<>p_operation OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Clave de idempotencia utilizada para otra operaciÃ³n.'; END IF;
 RETURN r.id; END IF;
 IF dtshop_private.app_role()='partner_ops' AND p_operation NOT IN ('receipt','settlement_open','sale_adjustment') THEN RAISE EXCEPTION 'Esta solicitud corresponde a finanzas.'; END IF;
 INSERT INTO operation_request(operation,payload,idempotency_key,requested_by) VALUES(p_operation,p_payload,p_idempotency_key,auth.uid()) RETURNING id INTO rid;
 IF dtshop_private.app_role()='admin' THEN
 UPDATE operation_request SET status='approved',result_id=dtshop_private.apply_operation(p_operation,p_payload),reviewed_by=auth.uid(),reviewed_at=now(),review_note='Aplicado directamente por administrador',applied_directly=true WHERE id=rid;
 END IF;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION dtshop.review_operation(p_request uuid,p_approve boolean,p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE r operation_request%ROWTYPE; result uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO STRICT r FROM operation_request WHERE id=p_request FOR UPDATE;
 IF dtshop_private.app_role()<>'admin' AND (r.requested_by=auth.uid() OR (SELECT role FROM app_user WHERE id=r.requested_by) IS NOT DISTINCT FROM dtshop_private.app_role()) THEN RAISE EXCEPTION 'Debe revisar el otro socio.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=r.requested_by AND is_active AND role IN ('partner_ops','partner_finance','admin')) THEN RAISE EXCEPTION 'Solicitante inactivo.'; END IF;
 IF r.status='approved' AND p_approve THEN RETURN r.result_id; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Solicitud ya revisada.'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Indica aprobar o rechazar.'; END IF;
 IF NOT p_approve AND length(btrim(p_note))=0 THEN RAISE EXCEPTION 'Indica motivo de rechazo.'; END IF;
 IF p_approve THEN result:=dtshop_private.apply_operation(r.operation,r.payload); END IF;
 UPDATE operation_request SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,500),result_id=result,applied_directly=(r.requested_by=auth.uid()) WHERE id=r.id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION dtshop.prepare_reconciliation(p_account uuid,p_date date,p_observed bigint,p_notes text DEFAULT '',p_attachment uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE result uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 IF p_date>business_today() OR p_date<(SELECT opened_on FROM money_account WHERE id=p_account) THEN RAISE EXCEPTION 'Fecha invÃ¡lida.'; END IF;
 INSERT INTO account_reconciliation(account_id,as_of_date,recorded_balance_cents,observed_balance_cents,prepared_by,notes,attachment_id)
 VALUES(p_account,p_date,account_balance(p_account,p_date),p_observed,auth.uid(),left(p_notes,500),p_attachment) RETURNING id INTO result;
 IF dtshop_private.app_role()='admin' THEN UPDATE account_reconciliation SET reviewed_by=auth.uid(),reviewed_at=now(),applied_directly=true WHERE id=result; END IF;
 RETURN result; END $$;
CREATE OR REPLACE FUNCTION dtshop.review_reconciliation(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=dtshop,pg_catalog AS $$
DECLARE r account_reconciliation%ROWTYPE; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO STRICT r FROM account_reconciliation WHERE id=p_id FOR UPDATE;
 IF (r.prepared_by=auth.uid() AND dtshop_private.app_role()<>'admin') OR r.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'Debe revisar el otro socio una vez.'; END IF;
 IF account_balance(r.account_id,r.as_of_date)<>r.recorded_balance_cents THEN RAISE EXCEPTION 'CambiÃ³ el libro: prepara un nuevo cuadre.'; END IF;
 UPDATE account_reconciliation SET reviewed_by=auth.uid(),reviewed_at=now(),applied_directly=(r.prepared_by=auth.uid()) WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION dtshop.finance_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM dtshop_private.require_staff();
 SELECT jsonb_build_object(
  'accounts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY name,id),'[]') FROM money_account t),
  'sales',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,id),'[]') FROM cash_sale t),
  'saleLines',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY sale_id,id),'[]') FROM cash_sale_line t),
  'adjustments',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,id),'[]') FROM cash_sale_adjustment t),
  'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,id),'[]') FROM receipt t),
  'settlements',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,id),'[]') FROM settlement t),
  'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY settlement_id,sale_id),'[]') FROM settlement_allocation t),
  'entries',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,sequence),'[]') FROM ledger_entry t),
  'transfers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,id),'[]') FROM account_transfer t),
  'obligations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY bank_name,id),'[]') FROM v_obligation_balances t),
  'movements',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY business_date,sequence),'[]') FROM obligation_movement t),
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at,id),'[]') FROM attachment t),
  'requests',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC,id),'[]') FROM operation_request t),
  'reconciliations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC,id),'[]') FROM account_reconciliation t),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'role',role)),'[]') FROM app_user WHERE role IN ('partner_ops','partner_finance','admin')),
  'customers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name)),'[]') FROM customer WHERE id IN (SELECT customer_id FROM cash_sale)),
  'orders',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'currency',currency,'total_cents',total_cents,'placed_at',placed_at) ORDER BY placed_at DESC,id),'[]') FROM shop_order WHERE status IN ('confirmed','preparing','shipped','delivered') AND id NOT IN (SELECT shop_order_id FROM cash_sale WHERE shop_order_id IS NOT NULL)),
  'read_at',now()
 ) INTO result;
 RETURN result;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['category','product','product_variant','product_media','launch','launch_product','store_setting','payment_method','content_block','content_video'] LOOP
 EXECUTE format('DROP POLICY IF EXISTS admin_write ON dtshop.%I',t);
 EXECUTE format('CREATE POLICY admin_write ON dtshop.%I FOR ALL TO authenticated USING ((SELECT dtshop_private.app_role())=''admin'') WITH CHECK ((SELECT dtshop_private.app_role())=''admin'')',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS dtshop_admin_product_upload ON storage.objects;
CREATE POLICY dtshop_admin_product_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='dtshop-products' AND (SELECT dtshop_private.app_role())='admin' AND split_part(name,'/',1)=(SELECT auth.uid())::text);
COMMIT;
