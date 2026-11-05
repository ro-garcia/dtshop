-- Run after orders-integration.sql. Expands only the buyer-owned receipt; no records are changed.
BEGIN;
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

REVOKE ALL ON FUNCTION dtshop.checkout_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dtshop.checkout_receipt(uuid) TO authenticated;
COMMIT;
