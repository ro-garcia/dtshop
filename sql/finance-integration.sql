-- Run after supabase.sql. Uses the existing two-partner approval rules.
BEGIN;
CREATE TABLE IF NOT EXISTS dtshop.finance_action_request (
  requested_by uuid NOT NULL REFERENCES dtshop.app_user(id),
  request_key uuid NOT NULL,
  action text NOT NULL,
  payload_hash text NOT NULL,
  result_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(requested_by,request_key)
);
ALTER TABLE dtshop.finance_action_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dtshop.finance_action_request FROM PUBLIC,anon,authenticated;

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
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'role',role)),'[]') FROM app_user WHERE role IN ('partner_ops','partner_finance')),
  'customers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name)),'[]') FROM customer WHERE id IN (SELECT customer_id FROM cash_sale)),
  'orders',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'currency',currency,'total_cents',total_cents,'placed_at',placed_at) ORDER BY placed_at DESC,id),'[]') FROM shop_order WHERE status IN ('confirmed','preparing','shipped','delivered') AND id NOT IN (SELECT shop_order_id FROM cash_sale WHERE shop_order_id IS NOT NULL)),
  'read_at',now()
 ) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_account_ledger(p_account uuid,p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE a money_account%ROWTYPE; opening bigint;
BEGIN
 PERFORM dtshop_private.require_staff();
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to>business_today() THEN RAISE EXCEPTION 'Rango de fechas inválido.'; END IF;
 SELECT * INTO STRICT a FROM money_account WHERE id=p_account;
 opening:=account_balance(a.id,p_from-1)+CASE WHEN a.opened_on BETWEEN p_from AND p_to THEN a.opening_balance_cents ELSE 0 END;
 RETURN jsonb_build_object('account',to_jsonb(a),'opening',opening,'balance',account_balance(a.id,p_to),
  'rows',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY business_date,sequence),'[]') FROM v_account_ledger e WHERE account_id=a.id AND business_date BETWEEN p_from AND p_to));
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_sale_status(p_sale uuid,p_as_of date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE s cash_sale%ROWTYPE; total bigint;
BEGIN
 PERFORM dtshop_private.require_staff();
 IF p_as_of IS NULL OR p_as_of>business_today() THEN RAISE EXCEPTION 'Fecha inválida.'; END IF;
 SELECT * INTO STRICT s FROM cash_sale WHERE id=p_sale;
 total:=CASE WHEN s.business_date>p_as_of THEN 0 ELSE s.total_cents+coalesce((SELECT sum(amount_cents) FROM cash_sale_adjustment WHERE sale_id=s.id AND business_date<=p_as_of),0) END;
 RETURN jsonb_build_object('total',total,'customerDue',sale_customer_due(s.id,p_as_of),'courierDue',sale_courier_due(s.id,p_as_of),
  'direct',coalesce((SELECT sum(amount_cents) FROM receipt WHERE sale_id=s.id AND business_date<=p_as_of),0),
  'courier',coalesce((SELECT sum(al.amount_cents) FROM settlement_allocation al JOIN settlement st ON st.id=al.settlement_id WHERE al.sale_id=s.id AND st.business_date<=p_as_of),0));
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_report(p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM dtshop_private.require_staff();
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to>business_today() THEN RAISE EXCEPTION 'Rango de fechas inválido.'; END IF;
 WITH currencies AS (SELECT 'GTQ'::text currency UNION SELECT 'USD'),
 entries AS (SELECT * FROM ledger_entry WHERE business_date BETWEEN p_from AND p_to AND category<>'transfer')
 SELECT jsonb_object_agg(c.currency,jsonb_build_object(
  'balance',coalesce((SELECT sum(account_balance(a.id,p_to)) FROM money_account a WHERE a.currency=c.currency),0),
  'incoming',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='in'),0),
  'outgoing',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='out'),0),
  'operatingIncome',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='in' AND category NOT IN ('contribution','financing')),0),
  'operatingExpenses',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='out' AND category<>'debt'),0),
  'debtPayments',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='out' AND category='debt'),0),
  'contributions',coalesce((SELECT sum(amount_cents) FROM entries WHERE currency=c.currency AND direction='in' AND category IN ('contribution','financing')),0),
  'sales',coalesce((SELECT sum(total_cents) FROM cash_sale WHERE currency=c.currency AND business_date BETWEEN p_from AND p_to),0)+coalesce((SELECT sum(x.amount_cents) FROM cash_sale_adjustment x JOIN cash_sale s ON s.id=x.sale_id WHERE s.currency=c.currency AND x.business_date BETWEEN p_from AND p_to),0),
  'customerDue',coalesce((SELECT sum(sale_customer_due(id,p_to)) FROM cash_sale WHERE currency=c.currency AND business_date<=p_to),0),
  'courierDue',coalesce((SELECT sum(sale_courier_due(id,p_to)) FROM cash_sale WHERE currency=c.currency AND business_date<=p_to),0),
  'withheld',coalesce((SELECT sum(service_cents+commission_cents+discount_cents) FROM settlement WHERE currency=c.currency AND status='confirmed' AND confirmed_on BETWEEN p_from AND p_to),0)
 )) INTO result FROM currencies c;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_create_sale(p_key uuid,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE prior finance_action_request%ROWTYPE; result uuid;
BEGIN
 PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
 IF p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 SELECT * INTO prior FROM finance_action_request WHERE requested_by=auth.uid() AND request_key=p_key;
 IF FOUND THEN
  IF prior.action<>'sale' OR prior.payload_hash<>md5(p_payload::text) THEN RAISE EXCEPTION 'La solicitud ya se utilizó con otros datos. Actualiza las ventas antes de crear otra.'; END IF;
  RETURN prior.result_id;
 END IF;
 IF nullif(p_payload->>'shop_order_id','') IS NOT NULL THEN
  SELECT id INTO result FROM cash_sale WHERE shop_order_id=(p_payload->>'shop_order_id')::uuid;
  IF FOUND THEN
   INSERT INTO finance_action_request(requested_by,request_key,action,payload_hash,result_id) VALUES(auth.uid(),p_key,'sale',md5(p_payload::text),result);
   RETURN result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM shop_order WHERE id=(p_payload->>'shop_order_id')::uuid AND status IN ('confirmed','preparing','shipped','delivered')) THEN RAISE EXCEPTION 'Confirma el pedido antes de registrarlo como venta.'; END IF;
 END IF;
 result:=create_sale(p_payload);
 INSERT INTO finance_action_request(requested_by,request_key,action,payload_hash,result_id) VALUES(auth.uid(),p_key,'sale',md5(p_payload::text),result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_prepare_reconciliation(p_key uuid,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE prior finance_action_request%ROWTYPE; result uuid;
BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 IF p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 SELECT * INTO prior FROM finance_action_request WHERE requested_by=auth.uid() AND request_key=p_key;
 IF FOUND THEN
  IF prior.action<>'reconciliation' OR prior.payload_hash<>md5(p_payload::text) THEN RAISE EXCEPTION 'La solicitud ya se utilizó con otros datos.'; END IF;
  RETURN prior.result_id;
 END IF;
 result:=prepare_reconciliation((p_payload->>'account_id')::uuid,(p_payload->>'as_of_date')::date,(p_payload->>'observed_balance_cents')::bigint,coalesce(p_payload->>'notes',''),nullif(p_payload->>'attachment_id','')::uuid);
 INSERT INTO finance_action_request(requested_by,request_key,action,payload_hash,result_id) VALUES(auth.uid(),p_key,'reconciliation',md5(p_payload::text),result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION dtshop.finance_register_attachment(p_key text,p_name text,p_type text,p_bytes integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE existing attachment%ROWTYPE;
BEGIN
 PERFORM dtshop_private.require_staff();
 SELECT * INTO existing FROM attachment WHERE storage_key=p_key AND created_by=auth.uid();
 IF FOUND THEN
  IF existing.file_name<>p_name OR existing.media_type<>p_type OR existing.byte_size<>p_bytes THEN RAISE EXCEPTION 'El archivo ya fue registrado con otros datos.'; END IF;
  RETURN existing.id;
 END IF;
 RETURN register_attachment(p_key,p_name,p_type,p_bytes);
END $$;

REVOKE ALL ON FUNCTION dtshop.finance_snapshot(),dtshop.finance_account_ledger(uuid,date,date),dtshop.finance_sale_status(uuid,date),dtshop.finance_report(date,date),dtshop.finance_create_sale(uuid,jsonb),dtshop.finance_prepare_reconciliation(uuid,jsonb),dtshop.finance_register_attachment(text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dtshop.finance_snapshot(),dtshop.finance_account_ledger(uuid,date,date),dtshop.finance_sale_status(uuid,date),dtshop.finance_report(date,date),dtshop.finance_create_sale(uuid,jsonb),dtshop.finance_prepare_reconciliation(uuid,jsonb),dtshop.finance_register_attachment(text,text,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
