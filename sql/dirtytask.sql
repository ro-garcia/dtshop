-- DIRTYTASK — esquema de creación
-- PostgreSQL 15 o superior.
--
-- Crea el esquema dirtytask con catálogo, contenido, checkout, bolsa,
-- pedidos, contabilidad y cuentas. Los importes se guardan en centavos
-- enteros (Q 299 = 29900). Las fechas de negocio no pueden ser futuras
-- respecto a America/Guatemala.
--
-- ADVERTENCIA: la primera línea destructiva borra y vuelve a crear solo
-- el esquema dirtytask. No toca otras bases ni otros esquemas.
-- Ejecutar como superusuario:
--   psql -d dirtytask -v ON_ERROR_STOP=1 -f sql/dirtytask.sql
--
-- La aplicación debe conectarse con el rol dirtytask_app, sin BYPASSRLS.
-- Cada petición abre una transacción, llama assume_session(token) y
-- deja que las políticas limiten las filas. Las contraseñas no salen
-- de login(): solo se compara un hash bcrypt.

DROP SCHEMA IF EXISTS dirtytask CASCADE;
CREATE SCHEMA dirtytask;
COMMENT ON SCHEMA dirtytask IS 'Tienda, pedidos y contabilidad de Dirtytask.';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dirtytask_app') THEN
    CREATE ROLE dirtytask_app NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

REVOKE ALL ON SCHEMA dirtytask FROM PUBLIC;
GRANT USAGE ON SCHEMA dirtytask TO dirtytask_app;

SET search_path TO dirtytask, public;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE FUNCTION business_today() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Guatemala')::date
$$;

CREATE FUNCTION reject_future_date() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  payload jsonb := to_jsonb(NEW);
  key text;
  value date;
BEGIN
  FOREACH key IN ARRAY ARRAY['business_date', 'opened_on', 'start_date', 'confirmed_on']
  LOOP
    IF payload ? key AND NULLIF(payload->>key, '') IS NOT NULL THEN
      value := (payload->>key)::date;
      IF value > business_today() THEN
        RAISE EXCEPTION 'La fecha debe ser válida y no posterior a hoy.';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE FUNCTION current_app_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.user_id', true) ~ '^[0-9a-fA-F-]{36}$'
      THEN current_setting('app.user_id', true)::uuid
    ELSE NULL
  END
$$;

CREATE FUNCTION current_app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.role', true), '')
$$;

CREATE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_app_role() IN ('owner', 'staff')
$$;

CREATE FUNCTION write_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
DECLARE
  payload jsonb;
  entity_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := to_jsonb(OLD) - 'password_hash';
    entity_id := OLD.id;
  ELSE
    payload := to_jsonb(NEW) - 'password_hash';
    entity_id := NEW.id;
  END IF;
  INSERT INTO audit_event (actor_id, action, entity, entity_id, payload)
  VALUES (current_app_user(), lower(TG_OP), TG_TABLE_NAME, entity_id, payload);
  RETURN COALESCE(NEW, OLD);
END $$;

-- ---------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar_key text,
  role text NOT NULL DEFAULT 'customer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_email_unique UNIQUE (email),
  CONSTRAINT app_user_role_check CHECK (role IN ('owner', 'staff', 'customer')),
  CONSTRAINT app_user_name_check CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 60),
  CONSTRAINT app_user_avatar_check CHECK (
    avatar_key IS NULL OR avatar_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,299}$'
  ),
  CONSTRAINT app_user_hash_check CHECK (password_hash ~ '^\$2[aby]\$')
);

CREATE TABLE user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_session_expiry_check CHECK (expires_at > created_at)
);

CREATE TABLE audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER app_user_touch BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER app_user_audit AFTER INSERT OR UPDATE OR DELETE ON app_user
  FOR EACH ROW EXECUTE FUNCTION write_audit();

-- ---------------------------------------------------------------------------
-- Catálogo, lanzamientos y contenido
-- ---------------------------------------------------------------------------

CREATE TABLE department (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_metro boolean NOT NULL DEFAULT false
);

CREATE TABLE category (
  code text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE product (
  id text PRIMARY KEY,
  name text NOT NULL,
  category_code text NOT NULL REFERENCES category (code),
  description text NOT NULL DEFAULT '',
  price_cents bigint NOT NULL,
  variant_label text NOT NULL DEFAULT 'talla',
  stock integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  published boolean NOT NULL DEFAULT false,
  preorder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_id_check CHECK (id ~ '^[a-z0-9-]{2,50}$'),
  CONSTRAINT product_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT product_description_check CHECK (char_length(description) <= 240),
  CONSTRAINT product_price_check CHECK (price_cents >= 0),
  CONSTRAINT product_stock_check CHECK (stock >= 0),
  CONSTRAINT product_status_check CHECK (status IN ('active', 'draft', 'archived')),
  CONSTRAINT product_variant_label_check CHECK (char_length(btrim(variant_label)) BETWEEN 1 AND 40)
);

CREATE TABLE product_variant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  UNIQUE (product_id, label),
  CONSTRAINT product_variant_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 12)
);

CREATE TABLE product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_key text NOT NULL,
  UNIQUE (product_id, kind),
  CONSTRAINT product_media_kind_check CHECK (kind IN ('product', 'look')),
  CONSTRAINT product_media_key_check CHECK (storage_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,299}$')
);

CREATE TABLE launch (
  id text PRIMARY KEY,
  name text NOT NULL,
  launch_on date,
  arrival_label text NOT NULL DEFAULT '',
  image_key text,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT launch_id_check CHECK (id ~ '^[a-z0-9-]{2,50}$'),
  CONSTRAINT launch_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 90),
  CONSTRAINT launch_arrival_check CHECK (char_length(arrival_label) <= 60),
  CONSTRAINT launch_status_check CHECK (status IN ('open', 'upcoming', 'closed')),
  CONSTRAINT launch_image_check CHECK (
    image_key IS NULL OR image_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,299}$'
  )
);

CREATE TABLE launch_product (
  launch_id text NOT NULL REFERENCES launch (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES product (id) ON DELETE RESTRICT,
  sort_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (launch_id, product_id)
);

CREATE TABLE store_setting (
  id smallint PRIMARY KEY DEFAULT 1,
  shipping_guatemala_cents bigint NOT NULL DEFAULT 2500,
  shipping_other_cents bigint NOT NULL DEFAULT 3500,
  currency char(3) NOT NULL DEFAULT 'GTQ',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_setting_singleton CHECK (id = 1),
  CONSTRAINT store_setting_shipping_check CHECK (
    shipping_guatemala_cents >= 0 AND shipping_other_cents >= 0
  ),
  CONSTRAINT store_setting_currency_check CHECK (currency IN ('GTQ', 'USD'))
);

CREATE TABLE payment_method (
  code text PRIMARY KEY,
  label text NOT NULL,
  detail text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE content_block (
  id smallint PRIMARY KEY DEFAULT 1,
  hero_copy text NOT NULL DEFAULT '',
  feed_copy text NOT NULL DEFAULT '',
  instagram_url text NOT NULL,
  tiktok_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_block_singleton CHECK (id = 1),
  CONSTRAINT content_block_hero_check CHECK (char_length(hero_copy) <= 240),
  CONSTRAINT content_block_feed_check CHECK (char_length(feed_copy) <= 140),
  CONSTRAINT content_block_instagram_check CHECK (instagram_url ~ '^https://(www\.)?instagram\.com/'),
  CONSTRAINT content_block_tiktok_check CHECK (tiktok_url ~ '^https://(www\.)?tiktok\.com/')
);

CREATE TABLE content_video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0,
  CONSTRAINT content_video_url_check CHECK (
    url ~ '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._-]+/video/[0-9]{8,22}$'
    OR url ~ '^https://(www\.)?instagram\.com/(reel|p)/[A-Za-z0-9_-]+/$'
  )
);

CREATE TRIGGER product_touch BEFORE UPDATE ON product
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER launch_touch BEFORE UPDATE ON launch
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER store_setting_touch BEFORE UPDATE ON store_setting
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER content_block_touch BEFORE UPDATE ON content_block
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Clientes, bolsa, guardados y pedidos de la tienda
-- ---------------------------------------------------------------------------

CREATE TABLE customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  nit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_first_name_check CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80),
  CONSTRAINT customer_last_name_check CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 80),
  CONSTRAINT customer_phone_check CHECK (phone ~ '^[0-9+() -]{8,20}$'),
  CONSTRAINT customer_nit_check CHECK (nit IS NULL OR char_length(btrim(nit)) BETWEEN 2 AND 20)
);

CREATE TABLE saved_product (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user (id) ON DELETE CASCADE,
  guest_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_owner_check CHECK ((user_id IS NULL) <> (guest_key IS NULL)),
  CONSTRAINT cart_guest_key_check CHECK (guest_key IS NULL OR guest_key ~ '^[A-Za-z0-9_-]{16,80}$')
);

CREATE UNIQUE INDEX cart_user_unique ON cart (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX cart_guest_unique ON cart (guest_key) WHERE guest_key IS NOT NULL;

CREATE TABLE cart_item (
  cart_id uuid NOT NULL REFERENCES cart (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variant (id) ON DELETE CASCADE,
  qty integer NOT NULL,
  PRIMARY KEY (cart_id, variant_id),
  CONSTRAINT cart_item_qty_check CHECK (qty BETWEEN 1 AND 10000)
);

CREATE TABLE shop_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,
  department_id smallint NOT NULL REFERENCES department (id),
  street_address text NOT NULL,
  neighborhood text NOT NULL,
  municipality text NOT NULL,
  phone text NOT NULL,
  nit text,
  payment_method_code text NOT NULL REFERENCES payment_method (code),
  installment_count smallint,
  shipping_cents bigint NOT NULL,
  subtotal_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  placed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_order_address_check CHECK (
    char_length(btrim(street_address)) BETWEEN 1 AND 160
    AND char_length(btrim(neighborhood)) BETWEEN 1 AND 120
    AND char_length(btrim(municipality)) BETWEEN 1 AND 120
  ),
  CONSTRAINT shop_order_phone_check CHECK (phone ~ '^[0-9+() -]{8,20}$'),
  CONSTRAINT shop_order_nit_check CHECK (nit IS NULL OR char_length(btrim(nit)) BETWEEN 2 AND 20),
  CONSTRAINT shop_order_installments_check CHECK (
    (payment_method_code = 'visa_installments' AND installment_count IN (3, 6, 9, 12))
    OR (payment_method_code <> 'visa_installments' AND installment_count IS NULL)
  ),
  CONSTRAINT shop_order_money_check CHECK (
    shipping_cents >= 0 AND subtotal_cents >= 0 AND total_cents = subtotal_cents + shipping_cents
  ),
  CONSTRAINT shop_order_status_check CHECK (
    status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')
  )
);

CREATE TABLE shop_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES shop_order (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES product (id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variant (id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  variant_label text NOT NULL,
  qty integer NOT NULL,
  unit_price_cents bigint NOT NULL,
  CONSTRAINT shop_order_line_qty_check CHECK (qty BETWEEN 1 AND 10000),
  CONSTRAINT shop_order_line_price_check CHECK (unit_price_cents >= 0),
  UNIQUE (order_id, variant_id)
);

CREATE TABLE order_status_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES shop_order (id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_event_status_check CHECK (
    status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  CONSTRAINT order_status_event_note_check CHECK (char_length(note) <= 240)
);

CREATE TRIGGER cart_touch BEFORE UPDATE ON cart
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER shop_order_audit AFTER INSERT OR UPDATE OR DELETE ON shop_order
  FOR EACH ROW EXECUTE FUNCTION write_audit();

-- ---------------------------------------------------------------------------
-- Cuentas, ventas internas, mensajería y libro
-- ---------------------------------------------------------------------------

CREATE TABLE money_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_type text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  reference_last4 text NOT NULL DEFAULT '',
  currency char(3) NOT NULL,
  opening_balance_cents bigint NOT NULL,
  opened_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT money_account_name_unique UNIQUE (name),
  CONSTRAINT money_account_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  CONSTRAINT money_account_type_check CHECK (account_type IN ('bank', 'cash')),
  CONSTRAINT money_account_bank_check CHECK (
    (account_type = 'bank' AND char_length(btrim(bank_name)) BETWEEN 1 AND 150)
    OR (account_type = 'cash' AND bank_name = '')
  ),
  CONSTRAINT money_account_reference_check CHECK (reference_last4 ~ '^[A-Za-z0-9]{0,4}$'),
  CONSTRAINT money_account_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT money_account_opening_check CHECK (opening_balance_cents >= 0)
);

CREATE TABLE cash_sale (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id uuid UNIQUE REFERENCES shop_order (id) ON DELETE RESTRICT,
  reference text NOT NULL,
  business_date date NOT NULL,
  channel text NOT NULL,
  currency char(3) NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  launch_id text REFERENCES launch (id) ON DELETE SET NULL,
  shipping_mode text NOT NULL,
  shipping_cents bigint NOT NULL DEFAULT 0,
  subtotal_cents bigint NOT NULL,
  total_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_sale_reference_unique UNIQUE (reference),
  CONSTRAINT cash_sale_reference_check CHECK (char_length(btrim(reference)) BETWEEN 1 AND 60),
  CONSTRAINT cash_sale_channel_check CHECK (channel IN ('web', 'external', 'physical')),
  CONSTRAINT cash_sale_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT cash_sale_customer_check CHECK (char_length(customer_name) <= 100),
  CONSTRAINT cash_sale_shipping_mode_check CHECK (shipping_mode IN ('extra', 'included', 'none')),
  CONSTRAINT cash_sale_shipping_check CHECK (
    (shipping_mode = 'extra' AND shipping_cents >= 0)
    OR (shipping_mode <> 'extra' AND shipping_cents = 0)
  ),
  CONSTRAINT cash_sale_total_check CHECK (
    subtotal_cents >= 0 AND total_cents = subtotal_cents + shipping_cents
  )
);

CREATE TABLE cash_sale_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES cash_sale (id) ON DELETE CASCADE,
  product_id text REFERENCES product (id) ON DELETE RESTRICT,
  name text NOT NULL,
  qty integer NOT NULL,
  unit_price_cents bigint NOT NULL,
  CONSTRAINT cash_sale_line_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  CONSTRAINT cash_sale_line_qty_check CHECK (qty BETWEEN 1 AND 10000),
  CONSTRAINT cash_sale_line_price_check CHECK (unit_price_cents > 0)
);

CREATE TABLE cash_sale_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES cash_sale (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  amount_cents bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_sale_adjustment_amount_check CHECK (amount_cents <> 0),
  CONSTRAINT cash_sale_adjustment_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 150)
);

CREATE TABLE settlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier text NOT NULL,
  business_date date NOT NULL,
  currency char(3) NOT NULL,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  confirmed_on date,
  account_id uuid REFERENCES money_account (id) ON DELETE RESTRICT,
  service_cents bigint NOT NULL DEFAULT 0,
  commission_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  adjustment_cents bigint NOT NULL DEFAULT 0,
  received_cents bigint,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_courier_check CHECK (courier IN ('Forza', 'Fast Delivery')),
  CONSTRAINT settlement_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT settlement_reference_check CHECK (char_length(reference) <= 100),
  CONSTRAINT settlement_status_check CHECK (status IN ('pending', 'confirmed')),
  CONSTRAINT settlement_costs_check CHECK (
    service_cents >= 0 AND commission_cents >= 0 AND discount_cents >= 0 AND adjustment_cents >= 0
  ),
  CONSTRAINT settlement_reason_check CHECK (char_length(reason) <= 150),
  CONSTRAINT settlement_confirmed_check CHECK (
    (status = 'pending' AND confirmed_on IS NULL AND account_id IS NULL AND received_cents IS NULL)
    OR (status = 'confirmed' AND confirmed_on IS NOT NULL AND account_id IS NOT NULL AND received_cents > 0
        AND confirmed_on >= business_date)
  )
);

CREATE TABLE settlement_allocation (
  settlement_id uuid NOT NULL REFERENCES settlement (id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES cash_sale (id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL,
  withheld_cents bigint,
  positive_adjustment_cents bigint,
  net_cents bigint,
  PRIMARY KEY (settlement_id, sale_id),
  CONSTRAINT settlement_allocation_amount_check CHECK (amount_cents > 0),
  CONSTRAINT settlement_allocation_split_check CHECK (
    (withheld_cents IS NULL AND positive_adjustment_cents IS NULL AND net_cents IS NULL)
    OR (
      withheld_cents >= 0 AND positive_adjustment_cents >= 0 AND net_cents IS NOT NULL
      AND net_cents = amount_cents - withheld_cents + positive_adjustment_cents
    )
  )
);

CREATE TABLE attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  media_type text NOT NULL,
  byte_size integer NOT NULL,
  created_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_key_check CHECK (storage_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,299}$'),
  CONSTRAINT attachment_name_check CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  CONSTRAINT attachment_type_check CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  CONSTRAINT attachment_size_check CHECK (byte_size BETWEEN 1 AND 5242880)
);

CREATE TABLE receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES cash_sale (id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES money_account (id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  amount_cents bigint NOT NULL,
  reference text NOT NULL DEFAULT '',
  attachment_id uuid REFERENCES attachment (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_amount_check CHECK (amount_cents > 0),
  CONSTRAINT receipt_reference_check CHECK (char_length(reference) <= 100)
);

CREATE TABLE account_transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid NOT NULL REFERENCES money_account (id) ON DELETE RESTRICT,
  to_account_id uuid NOT NULL REFERENCES money_account (id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  amount_cents bigint NOT NULL,
  currency char(3) NOT NULL,
  concept text NOT NULL,
  attachment_id uuid REFERENCES attachment (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_transfer_distinct_check CHECK (from_account_id <> to_account_id),
  CONSTRAINT account_transfer_amount_check CHECK (amount_cents > 0),
  CONSTRAINT account_transfer_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT account_transfer_concept_check CHECK (char_length(btrim(concept)) BETWEEN 1 AND 150)
);

CREATE TABLE ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES money_account (id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  direction text NOT NULL,
  amount_cents bigint NOT NULL,
  currency char(3) NOT NULL,
  category text NOT NULL,
  concept text NOT NULL,
  sale_id uuid REFERENCES cash_sale (id) ON DELETE RESTRICT,
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  attachment_id uuid REFERENCES attachment (id) ON DELETE RESTRICT,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entry_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT ledger_entry_amount_check CHECK (amount_cents > 0),
  CONSTRAINT ledger_entry_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT ledger_entry_category_check CHECK (category IN (
    'advertising', 'delivery', 'supplies', 'other', 'operating', 'contribution',
    'financing', 'debt', 'sale', 'settlement', 'transfer'
  )),
  CONSTRAINT ledger_entry_concept_check CHECK (char_length(btrim(concept)) BETWEEN 1 AND 180),
  CONSTRAINT ledger_entry_source_check CHECK (source_type IN (
    'manual', 'receipt', 'settlement', 'transfer', 'obligation_movement'
  )),
  CONSTRAINT ledger_entry_source_pair_check CHECK (
    (source_type = 'manual' AND source_id IS NULL)
    OR (source_type <> 'manual' AND source_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ledger_entry_source_unique
  ON ledger_entry (source_type, source_id, account_id, direction)
  WHERE source_id IS NOT NULL;

CREATE TABLE obligation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  reference text NOT NULL,
  name text NOT NULL,
  obligation_type text NOT NULL,
  currency char(3) NOT NULL,
  opening_balance_cents bigint NOT NULL,
  installment_cents bigint NOT NULL,
  due_day smallint NOT NULL,
  start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obligation_bank_check CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 100),
  CONSTRAINT obligation_reference_check CHECK (char_length(btrim(reference)) BETWEEN 1 AND 60),
  CONSTRAINT obligation_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT obligation_type_check CHECK (obligation_type IN ('loan', 'financing', 'card')),
  CONSTRAINT obligation_currency_check CHECK (currency IN ('GTQ', 'USD')),
  CONSTRAINT obligation_amounts_check CHECK (opening_balance_cents >= 0 AND installment_cents > 0),
  CONSTRAINT obligation_due_day_check CHECK (due_day BETWEEN 1 AND 31),
  UNIQUE (bank_name, reference)
);

CREATE TABLE obligation_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES obligation (id) ON DELETE RESTRICT,
  account_id uuid REFERENCES money_account (id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  business_date date NOT NULL,
  period_month date,
  total_cents bigint NOT NULL,
  principal_cents bigint,
  interest_cents bigint,
  fee_cents bigint,
  statement_balance_cents bigint,
  principal_known boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  attachment_id uuid REFERENCES attachment (id) ON DELETE RESTRICT,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obligation_movement_type_check CHECK (movement_type IN ('payment', 'principal', 'purchase', 'charge')),
  CONSTRAINT obligation_movement_total_check CHECK (total_cents > 0),
  CONSTRAINT obligation_movement_parts_check CHECK (
    (principal_cents IS NULL OR principal_cents >= 0)
    AND (interest_cents IS NULL OR interest_cents >= 0)
    AND (fee_cents IS NULL OR fee_cents >= 0)
  ),
  CONSTRAINT obligation_movement_period_check CHECK (
    (movement_type = 'payment' AND period_month IS NOT NULL AND period_month = date_trunc('month', period_month)::date)
    OR (movement_type <> 'payment' AND period_month IS NULL)
  ),
  CONSTRAINT obligation_movement_notes_check CHECK (char_length(notes) <= 500),
  CONSTRAINT obligation_movement_balance_check CHECK (
    statement_balance_cents IS NULL OR statement_balance_cents >= 0
  )
);

CREATE INDEX product_category_idx ON product (category_code);
CREATE INDEX shop_order_customer_idx ON shop_order (customer_id);
CREATE INDEX shop_order_status_idx ON shop_order (status, placed_at);
CREATE INDEX cash_sale_date_idx ON cash_sale (business_date);
CREATE INDEX ledger_entry_account_idx ON ledger_entry (account_id, business_date, sequence);
CREATE INDEX receipt_sale_idx ON receipt (sale_id);
CREATE INDEX obligation_movement_idx ON obligation_movement (obligation_id, business_date, sequence);
CREATE INDEX audit_event_entity_idx ON audit_event (entity, entity_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Integridad de fechas, saldos y cobros
-- ---------------------------------------------------------------------------

CREATE TRIGGER money_account_date BEFORE INSERT OR UPDATE ON money_account
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER cash_sale_date BEFORE INSERT OR UPDATE ON cash_sale
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER cash_sale_adjustment_date BEFORE INSERT OR UPDATE ON cash_sale_adjustment
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER settlement_date BEFORE INSERT OR UPDATE ON settlement
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER receipt_date BEFORE INSERT OR UPDATE ON receipt
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER account_transfer_date BEFORE INSERT OR UPDATE ON account_transfer
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER ledger_entry_date BEFORE INSERT OR UPDATE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER obligation_date BEFORE INSERT OR UPDATE ON obligation
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();
CREATE TRIGGER obligation_movement_date BEFORE INSERT OR UPDATE ON obligation_movement
  FOR EACH ROW EXECUTE FUNCTION reject_future_date();

CREATE FUNCTION guard_ledger_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  accounts uuid[] := ARRAY[]::uuid[];
  acct uuid;
  opened date;
  opening bigint;
  running bigint;
  row record;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN accounts := accounts || NEW.account_id; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN accounts := accounts || OLD.account_id; END IF;
  accounts := ARRAY(SELECT DISTINCT unnest(accounts));
  FOREACH acct IN ARRAY accounts
  LOOP
    SELECT opened_on, opening_balance_cents INTO opened, opening
    FROM money_account WHERE id = acct;
    running := opening;
    FOR row IN
      SELECT business_date, direction, amount_cents
      FROM ledger_entry
      WHERE account_id = acct
      ORDER BY business_date, sequence, id
    LOOP
      IF row.business_date < opened THEN
        RAISE EXCEPTION 'El movimiento es anterior al inicio de la cuenta.';
      END IF;
      running := running + CASE WHEN row.direction = 'in' THEN row.amount_cents ELSE -row.amount_cents END;
      IF running < 0 THEN
        RAISE EXCEPTION 'Saldo insuficiente: el movimiento deja un saldo histórico negativo.';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER ledger_entry_balance
  AFTER INSERT OR UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION guard_ledger_balance();

CREATE FUNCTION sale_customer_due(p_sale uuid, p_as_of date) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN s.business_date > p_as_of THEN 0 ELSE
    s.total_cents
    + COALESCE((SELECT SUM(amount_cents) FROM cash_sale_adjustment a WHERE a.sale_id = s.id AND a.business_date <= p_as_of), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM receipt r WHERE r.sale_id = s.id AND r.business_date <= p_as_of), 0)
    - COALESCE((
        SELECT SUM(al.amount_cents)
        FROM settlement_allocation al
        JOIN settlement st ON st.id = al.settlement_id
        WHERE al.sale_id = s.id AND st.business_date <= p_as_of
      ), 0)
  END
  FROM cash_sale s
  WHERE s.id = p_sale
$$;

CREATE FUNCTION assert_sale_collectable(p_sale uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  due bigint;
  day date;
BEGIN
  FOR day IN
    SELECT DISTINCT business_date FROM (
      SELECT business_date FROM cash_sale WHERE id = p_sale
      UNION SELECT business_date FROM cash_sale_adjustment WHERE sale_id = p_sale
      UNION SELECT business_date FROM receipt WHERE sale_id = p_sale
      UNION SELECT st.business_date
        FROM settlement st
        JOIN settlement_allocation al ON al.settlement_id = st.id
        WHERE al.sale_id = p_sale
    ) days
  LOOP
    due := sale_customer_due(p_sale, day);
    IF due < 0 THEN
      RAISE EXCEPTION 'El monto supera el saldo disponible por cobrar de la venta.';
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION guard_sale_collections() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'cash_sale_adjustment' THEN
    target := COALESCE(NEW.sale_id, OLD.sale_id);
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.business_date < (SELECT business_date FROM cash_sale WHERE id = NEW.sale_id) THEN
      RAISE EXCEPTION 'El ajuste es anterior a la venta.';
    END IF;
  ELSIF TG_TABLE_NAME = 'receipt' THEN
    target := COALESCE(NEW.sale_id, OLD.sale_id);
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      IF NEW.business_date < (SELECT business_date FROM cash_sale WHERE id = NEW.sale_id) THEN
        RAISE EXCEPTION 'El cobro es anterior a la venta.';
      END IF;
      IF (SELECT currency FROM cash_sale WHERE id = NEW.sale_id) <> (SELECT currency FROM money_account WHERE id = NEW.account_id) THEN
        RAISE EXCEPTION 'La moneda debe coincidir; no se convierten monedas automáticamente.';
      END IF;
    END IF;
  ELSE
    target := COALESCE(NEW.sale_id, OLD.sale_id);
  END IF;
  PERFORM assert_sale_collectable(target);
  IF TG_OP = 'UPDATE' AND OLD.sale_id IS DISTINCT FROM NEW.sale_id THEN
    PERFORM assert_sale_collectable(OLD.sale_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER cash_sale_adjustment_guard
  AFTER INSERT OR UPDATE OR DELETE ON cash_sale_adjustment
  FOR EACH ROW EXECUTE FUNCTION guard_sale_collections();
CREATE TRIGGER receipt_guard
  AFTER INSERT OR UPDATE OR DELETE ON receipt
  FOR EACH ROW EXECUTE FUNCTION guard_sale_collections();
CREATE TRIGGER settlement_allocation_guard
  AFTER INSERT OR UPDATE OR DELETE ON settlement_allocation
  FOR EACH ROW EXECUTE FUNCTION guard_sale_collections();

CREATE FUNCTION guard_settlement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  gross bigint;
  withheld bigint;
  extra bigint;
  nets bigint;
  sale_count integer;
  account_currency char(3);
BEGIN
  SELECT COUNT(*), SUM(al.amount_cents), SUM(al.withheld_cents), SUM(al.positive_adjustment_cents), SUM(al.net_cents)
    INTO sale_count, gross, withheld, extra, nets
  FROM settlement_allocation al
  WHERE al.settlement_id = NEW.id;

  IF sale_count = 0 THEN
    RAISE EXCEPTION 'La liquidación necesita al menos una venta.';
  END IF;
  IF NEW.courier = 'Forza' AND sale_count <> 1 THEN
    RAISE EXCEPTION 'Forza requiere un pedido; Fast Delivery permite uno o varios.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM settlement_allocation al
    JOIN cash_sale s ON s.id = al.sale_id
    WHERE al.settlement_id = NEW.id AND s.currency <> NEW.currency
  ) THEN
    RAISE EXCEPTION 'La moneda debe coincidir; no se convierten monedas automáticamente.';
  END IF;
  IF NEW.status = 'confirmed' THEN
    SELECT currency INTO account_currency FROM money_account WHERE id = NEW.account_id;
    IF account_currency <> NEW.currency THEN
      RAISE EXCEPTION 'La moneda debe coincidir; no se convierten monedas automáticamente.';
    END IF;
    IF gross - NEW.service_cents - NEW.commission_cents - NEW.discount_cents + NEW.adjustment_cents <> NEW.received_cents THEN
      RAISE EXCEPTION 'El depósito no cuadra: identifica la diferencia en descuentos o ajustes positivos.';
    END IF;
    IF (NEW.discount_cents > 0 OR NEW.adjustment_cents > 0) AND char_length(btrim(NEW.reason)) = 0 THEN
      RAISE EXCEPTION 'Motivo del ajuste/descuento: completa el campo (máximo 150 caracteres).';
    END IF;
    IF withheld IS NULL OR extra IS NULL OR nets IS NULL
       OR withheld <> NEW.service_cents + NEW.commission_cents + NEW.discount_cents
       OR extra <> NEW.adjustment_cents
       OR nets <> NEW.received_cents THEN
      RAISE EXCEPTION 'El prorrateo de la liquidación no cuadra con el depósito.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER settlement_shape
  AFTER INSERT OR UPDATE ON settlement
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION guard_settlement();

CREATE FUNCTION guard_transfer_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  from_currency char(3);
  to_currency char(3);
  from_opened date;
  to_opened date;
BEGIN
  SELECT currency, opened_on INTO from_currency, from_opened FROM money_account WHERE id = NEW.from_account_id;
  SELECT currency, opened_on INTO to_currency, to_opened FROM money_account WHERE id = NEW.to_account_id;
  IF from_currency <> to_currency OR from_currency <> NEW.currency THEN
    RAISE EXCEPTION 'La moneda debe coincidir; no se convierten monedas automáticamente.';
  END IF;
  IF NEW.business_date < from_opened OR NEW.business_date < to_opened THEN
    RAISE EXCEPTION 'El movimiento es anterior al inicio de la cuenta.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER account_transfer_currency
  BEFORE INSERT OR UPDATE ON account_transfer
  FOR EACH ROW EXECUTE FUNCTION guard_transfer_currency();

CREATE FUNCTION guard_obligation_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind text;
  started date;
  file_type text;
BEGIN
  SELECT obligation_type, start_date INTO kind, started FROM obligation WHERE id = NEW.obligation_id;
  IF NEW.business_date < started THEN
    RAISE EXCEPTION 'El movimiento es anterior al inicio de la obligación.';
  END IF;
  IF NEW.movement_type IN ('purchase', 'charge') AND kind <> 'card' THEN
    RAISE EXCEPTION 'Los consumos y cargos solo aplican a tarjetas.';
  END IF;
  IF NEW.movement_type = 'payment' AND NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona la cuenta que paga la cuota.';
  END IF;
  IF NEW.attachment_id IS NOT NULL THEN
    SELECT media_type INTO file_type FROM attachment WHERE id = NEW.attachment_id;
    IF file_type = 'application/pdf' THEN
      RAISE EXCEPTION 'El comprobante de la obligación debe ser una imagen.';
    END IF;
  END IF;
  IF NEW.principal_cents IS NOT NULL AND NEW.interest_cents IS NOT NULL AND NEW.fee_cents IS NOT NULL
     AND NEW.principal_cents + NEW.interest_cents + NEW.fee_cents <> NEW.total_cents THEN
    RAISE EXCEPTION 'La cuota debe cuadrar: total = capital + intereses + cargos.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER obligation_movement_shape
  BEFORE INSERT OR UPDATE ON obligation_movement
  FOR EACH ROW EXECUTE FUNCTION guard_obligation_movement();

CREATE FUNCTION guard_launch_size() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM launch_product WHERE launch_id = NEW.launch_id) > 12 THEN
    RAISE EXCEPTION 'Puedes incluir hasta 12 modelos por lanzamiento.';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER launch_product_limit
  AFTER INSERT OR UPDATE ON launch_product
  FOR EACH ROW EXECUTE FUNCTION guard_launch_size();

CREATE FUNCTION guard_video_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM content_video) > 12 THEN
    RAISE EXCEPTION 'Puedes agregar hasta 12 videos.';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER content_video_limit
  AFTER INSERT ON content_video
  FOR EACH ROW EXECUTE FUNCTION guard_video_count();

CREATE FUNCTION guard_enabled_payments() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM payment_method WHERE enabled) < 1 THEN
    RAISE EXCEPTION 'Deja al menos un método de pago disponible.';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER payment_method_minimum
  AFTER UPDATE ON payment_method
  FOR EACH ROW EXECUTE FUNCTION guard_enabled_payments();

-- ---------------------------------------------------------------------------
-- Sesión, perfil y pedido
-- La clave temporal del propietario se genera al ejecutar este script
-- y se anuncia con un NOTICE. Cámbiala antes de exponer el servicio.
-- ---------------------------------------------------------------------------

CREATE FUNCTION login(p_email text, p_password text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
DECLARE
  found app_user%ROWTYPE;
  token text;
BEGIN
  SELECT * INTO found FROM app_user WHERE email = btrim(p_email) AND is_active;
  IF NOT FOUND OR found.password_hash <> public.crypt(p_password, found.password_hash) THEN
    RAISE EXCEPTION 'Credenciales no válidas.' USING ERRCODE = '28000';
  END IF;
  token := encode(public.gen_random_bytes(32), 'hex');
  INSERT INTO user_session (user_id, token_hash, expires_at)
  VALUES (found.id, public.digest(token, 'sha256'), now() + interval '12 hours');
  RETURN token;
END $$;

CREATE FUNCTION assume_session(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
DECLARE
  found_user uuid;
  found_role text;
BEGIN
  SELECT u.id, u.role INTO found_user, found_role
  FROM user_session s
  JOIN app_user u ON u.id = s.user_id
  WHERE s.token_hash = public.digest(p_token, 'sha256')
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = '28000';
  END IF;
  PERFORM set_config('app.user_id', found_user::text, true);
  PERFORM set_config('app.role', found_role, true);
END $$;

CREATE FUNCTION logout(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
BEGIN
  UPDATE user_session
     SET revoked_at = now()
   WHERE token_hash = public.digest(p_token, 'sha256')
     AND revoked_at IS NULL;
  PERFORM set_config('app.user_id', '', true);
  PERFORM set_config('app.role', '', true);
END $$;

CREATE FUNCTION update_own_profile(p_display_name text, p_avatar_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
DECLARE
  clean_name text := regexp_replace(btrim(COALESCE(p_display_name, '')), '\s+', ' ', 'g');
BEGIN
  IF current_app_user() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = '28000';
  END IF;
  UPDATE app_user
     SET display_name = clean_name,
         avatar_key = NULLIF(btrim(COALESCE(p_avatar_key, '')), '')
   WHERE id = current_app_user()
     AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar el usuario.';
  END IF;
END $$;

CREATE FUNCTION set_user_role(p_user uuid, p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
BEGIN
  IF current_app_role() <> 'owner' THEN
    RAISE EXCEPTION 'No autorizado.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('owner', 'staff', 'customer') THEN
    RAISE EXCEPTION 'Rol no válido.';
  END IF;
  IF EXISTS (SELECT 1 FROM app_user WHERE id = p_user AND role = 'owner')
     AND p_role <> 'owner'
     AND (SELECT COUNT(*) FROM app_user WHERE role = 'owner' AND is_active) < 2 THEN
    RAISE EXCEPTION 'Debe quedar al menos un propietario activo.';
  END IF;
  UPDATE app_user SET role = p_role WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;
END $$;

CREATE FUNCTION place_order(
  p_first_name text,
  p_last_name text,
  p_street text,
  p_neighborhood text,
  p_municipality text,
  p_department text,
  p_phone text,
  p_nit text,
  p_payment_method text,
  p_installments smallint,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dirtytask AS $$
DECLARE
  dept department%ROWTYPE;
  method payment_method%ROWTYPE;
  settings store_setting%ROWTYPE;
  item jsonb;
  found_product product%ROWTYPE;
  found_variant product_variant%ROWTYPE;
  qty integer;
  customer_id uuid;
  order_id uuid;
  subtotal bigint := 0;
  shipping bigint;
  clean_nit text := NULLIF(btrim(COALESCE(p_nit, '')), '');
BEGIN
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Agrega entre 1 y 30 productos.';
  END IF;
  SELECT * INTO settings FROM store_setting WHERE id = 1;
  SELECT * INTO dept FROM department WHERE name = btrim(p_department);
  IF NOT FOUND THEN RAISE EXCEPTION 'Elige un departamento válido.'; END IF;
  SELECT * INTO method FROM payment_method WHERE code = p_payment_method AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'El método de pago no está disponible.'; END IF;
  IF method.code = 'visa_installments' THEN
    IF p_installments NOT IN (3, 6, 9, 12) THEN
      RAISE EXCEPTION 'Elige 3, 6, 9 o 12 cuotas.';
    END IF;
  ELSIF p_installments IS NOT NULL THEN
    RAISE EXCEPTION 'Este método no usa cuotas.';
  END IF;

  shipping := CASE WHEN dept.is_metro THEN settings.shipping_guatemala_cents ELSE settings.shipping_other_cents END;
  INSERT INTO customer (user_id, first_name, last_name, phone, nit)
  VALUES (
    current_app_user(),
    btrim(p_first_name),
    btrim(p_last_name),
    btrim(p_phone),
    clean_nit
  )
  RETURNING id INTO customer_id;

  INSERT INTO shop_order (
    customer_id, department_id, street_address, neighborhood, municipality, phone, nit,
    payment_method_code, installment_count, shipping_cents, subtotal_cents, total_cents, status
  ) VALUES (
    customer_id, dept.id, btrim(p_street), btrim(p_neighborhood), btrim(p_municipality), btrim(p_phone), clean_nit,
    method.code, CASE WHEN method.code = 'visa_installments' THEN p_installments ELSE NULL END,
    shipping, 0, shipping, 'pending'
  )
  RETURNING id INTO order_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    qty := (item->>'qty')::integer;
    SELECT * INTO found_variant FROM product_variant WHERE id = (item->>'variant_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'La talla elegida ya no está disponible.'; END IF;
    SELECT * INTO found_product FROM product WHERE id = found_variant.product_id;
    IF found_product.status <> 'active' THEN
      RAISE EXCEPTION 'Un producto del pedido ya no está disponible.';
    END IF;
    IF found_product.id <> item->>'product_id' THEN
      RAISE EXCEPTION 'El producto no coincide con la talla.';
    END IF;
    subtotal := subtotal + found_product.price_cents * qty;
    INSERT INTO shop_order_line (order_id, product_id, variant_id, product_name, variant_label, qty, unit_price_cents)
    VALUES (order_id, found_product.id, found_variant.id, found_product.name, found_variant.label, qty, found_product.price_cents);
  END LOOP;

  UPDATE shop_order
     SET subtotal_cents = subtotal,
         total_cents = subtotal + shipping
   WHERE id = order_id;
  INSERT INTO order_status_event (order_id, status, actor_id)
  VALUES (order_id, 'pending', current_app_user());
  RETURN order_id;
END $$;

REVOKE ALL ON FUNCTION login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION assume_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_own_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION place_order(text, text, text, text, text, text, text, text, text, smallint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login(text, text) TO dirtytask_app;
GRANT EXECUTE ON FUNCTION assume_session(text) TO dirtytask_app;
GRANT EXECUTE ON FUNCTION logout(text) TO dirtytask_app;
GRANT EXECUTE ON FUNCTION update_own_profile(text, text) TO dirtytask_app;
GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO dirtytask_app;
GRANT EXECUTE ON FUNCTION place_order(text, text, text, text, text, text, text, text, text, smallint, jsonb) TO dirtytask_app;

-- ---------------------------------------------------------------------------
-- Seguridad por filas
-- Sin assume_session() el rol de la aplicación solo lee el catálogo público,
-- departamentos, métodos de pago activos y el contenido de la portada.
-- ---------------------------------------------------------------------------

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sale ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sale_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sale_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_video ENABLE ROW LEVEL SECURITY;
ALTER TABLE department ENABLE ROW LEVEL SECURITY;
ALTER TABLE category ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_user_select ON app_user FOR SELECT
  USING (is_staff() OR id = current_app_user());
CREATE POLICY app_user_update ON app_user FOR UPDATE
  USING (id = current_app_user())
  WITH CHECK (id = current_app_user());

CREATE POLICY session_none ON user_session FOR SELECT USING (false);

CREATE POLICY audit_staff ON audit_event FOR SELECT USING (is_staff());

CREATE POLICY department_read ON department FOR SELECT USING (true);
CREATE POLICY category_read ON category FOR SELECT USING (true);
CREATE POLICY category_staff ON category FOR ALL USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY product_public ON product FOR SELECT
  USING (is_staff() OR status = 'active');
CREATE POLICY product_staff ON product FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY variant_public ON product_variant FOR SELECT
  USING (is_staff() OR EXISTS (SELECT 1 FROM product p WHERE p.id = product_id AND p.status = 'active'));
CREATE POLICY variant_staff ON product_variant FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY media_public ON product_media FOR SELECT
  USING (is_staff() OR EXISTS (SELECT 1 FROM product p WHERE p.id = product_id AND p.status = 'active'));
CREATE POLICY media_staff ON product_media FOR ALL USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY launch_public ON launch FOR SELECT
  USING (is_staff() OR status IN ('open', 'upcoming'));
CREATE POLICY launch_staff ON launch FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY launch_product_public ON launch_product FOR SELECT
  USING (is_staff() OR EXISTS (SELECT 1 FROM launch l WHERE l.id = launch_id AND l.status IN ('open', 'upcoming')));
CREATE POLICY launch_product_staff ON launch_product FOR ALL USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY settings_read ON store_setting FOR SELECT USING (true);
CREATE POLICY settings_staff ON store_setting FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY payment_read ON payment_method FOR SELECT USING (is_staff() OR enabled);
CREATE POLICY payment_staff ON payment_method FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY content_read ON content_block FOR SELECT USING (true);
CREATE POLICY content_staff ON content_block FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY video_read ON content_video FOR SELECT USING (true);
CREATE POLICY video_staff ON content_video FOR ALL USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY customer_access ON customer FOR SELECT
  USING (is_staff() OR user_id = current_app_user());
CREATE POLICY saved_owner ON saved_product FOR ALL
  USING (user_id = current_app_user())
  WITH CHECK (user_id = current_app_user());
CREATE POLICY cart_owner ON cart FOR ALL
  USING (user_id = current_app_user())
  WITH CHECK (user_id = current_app_user());
CREATE POLICY cart_item_owner ON cart_item FOR ALL
  USING (EXISTS (SELECT 1 FROM cart c WHERE c.id = cart_id AND c.user_id = current_app_user()))
  WITH CHECK (EXISTS (SELECT 1 FROM cart c WHERE c.id = cart_id AND c.user_id = current_app_user()));

CREATE POLICY order_access ON shop_order FOR SELECT
  USING (is_staff() OR EXISTS (SELECT 1 FROM customer c WHERE c.id = customer_id AND c.user_id = current_app_user()));
CREATE POLICY order_staff ON shop_order FOR UPDATE USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY order_line_access ON shop_order_line FOR SELECT
  USING (is_staff() OR EXISTS (
    SELECT 1 FROM shop_order o JOIN customer c ON c.id = o.customer_id
    WHERE o.id = order_id AND c.user_id = current_app_user()
  ));
CREATE POLICY status_access ON order_status_event FOR SELECT
  USING (is_staff() OR EXISTS (
    SELECT 1 FROM shop_order o JOIN customer c ON c.id = o.customer_id
    WHERE o.id = order_id AND c.user_id = current_app_user()
  ));
CREATE POLICY status_staff ON order_status_event FOR INSERT WITH CHECK (is_staff());

CREATE POLICY finance_account ON money_account FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_sale ON cash_sale FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_sale_line ON cash_sale_line FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_adjustment ON cash_sale_adjustment FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_settlement ON settlement FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_allocation ON settlement_allocation FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_attachment ON attachment FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_receipt ON receipt FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_transfer ON account_transfer FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_ledger ON ledger_entry FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_obligation ON obligation FOR ALL USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY finance_movement ON obligation_movement FOR ALL USING (is_staff()) WITH CHECK (is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  category, product, product_variant, product_media, launch, launch_product,
  store_setting, payment_method, content_block, content_video,
  saved_product, cart, cart_item, order_status_event,
  money_account, cash_sale, cash_sale_line, cash_sale_adjustment, settlement, settlement_allocation,
  attachment, receipt, account_transfer, ledger_entry, obligation, obligation_movement
TO dirtytask_app;

GRANT SELECT ON department, customer, shop_order, shop_order_line, audit_event TO dirtytask_app;
GRANT UPDATE ON shop_order TO dirtytask_app;
GRANT SELECT (id, email, display_name, avatar_key, role, is_active, created_at, updated_at) ON app_user TO dirtytask_app;
GRANT UPDATE (display_name, avatar_key) ON app_user TO dirtytask_app;

-- ---------------------------------------------------------------------------
-- Datos que las pantallas necesitan para funcionar
-- ---------------------------------------------------------------------------

INSERT INTO department (name, is_metro) VALUES
  ('Alta Verapaz', false), ('Baja Verapaz', false), ('Chimaltenango', false), ('Chiquimula', false),
  ('El Progreso', false), ('Escuintla', false), ('Guatemala', true), ('Huehuetenango', false),
  ('Izabal', false), ('Jalapa', false), ('Jutiapa', false), ('Petén', false),
  ('Quetzaltenango', false), ('Quiché', false), ('Retalhuleu', false), ('Sacatepéquez', false),
  ('San Marcos', false), ('Santa Rosa', false), ('Sololá', false), ('Suchitepéquez', false),
  ('Totonicapán', false), ('Zacapa', false);

INSERT INTO category (code, label, sort_order) VALUES
  ('sneakers', 'Sneakers', 1),
  ('hoodies', 'Hoodies', 2),
  ('tshirts', 'T-Shirts', 3),
  ('clogs', 'Clogs', 4),
  ('accessories', 'Accesorios', 5),
  ('denim', 'Denim', 6),
  ('outerwear', 'Chaquetas', 7);

INSERT INTO store_setting (shipping_guatemala_cents, shipping_other_cents) VALUES (2500, 3500);

INSERT INTO payment_method (code, label, detail, enabled, sort_order) VALUES
  ('cash', 'Efectivo', 'Pago contra entrega', true, 1),
  ('visa_installments', 'Visa cuotas', '3, 6, 9 o 12 cuotas', true, 2),
  ('visalink', 'Tarjeta de crédito', 'Visalink', true, 3);

INSERT INTO content_block (hero_copy, feed_copy, instagram_url, tiktok_url) VALUES (
  'Streetwear, cultura sneaker y piezas con actitud. Encuentra tu próximo outfit y descubre la selección de Dirtytask Store. También te traemos la prenda que tú quieras.',
  'Las mejores marcas de todo el mundo en Guatemala.',
  'https://www.instagram.com/dirtytask/?hl=es',
  'https://www.tiktok.com/@dirtytask'
);

DO $$
DECLARE
  temporary_password text := 'CambiarEstaClave-2026';
BEGIN
  INSERT INTO app_user (email, password_hash, display_name, role)
  VALUES (
    'admin@dirtytask.local',
    public.crypt(temporary_password, public.gen_salt('bf')),
    'Administrador',
    'owner'
  );
  RAISE NOTICE 'Propietario inicial: admin@dirtytask.local / %. Cámbiala antes de exponer el servicio.', temporary_password;
END $$;

-- Catálogo visible para la tienda. price_cents = quetzales x 100.
INSERT INTO product (id, name, category_code, description, price_cents, variant_label, stock, status, published, preorder) VALUES
  ('tee-noche', 'Playera gráfica RIPNDIP', 'tshirts', 'Playera negra con gráfica ilustrada de RIPNDIP.', 29900, 'talla', 0, 'active', true, false),
  ('tee-grateful', 'Playera gráfica negra', 'tshirts', 'Playera negra con gráfico circular de estilo psicodélico.', 34900, 'talla', 0, 'active', true, false),
  ('tee-solar', 'Playera gráfica ilustrada', 'tshirts', 'Playera con ilustración azul y amarilla.', 29900, 'talla', 0, 'active', true, false),
  ('clogs-pokemon', 'Clogs Crocs x Pokémon', 'clogs', 'Clogs de Pikachu, Jigglypuff y Gengar.', 69900, 'talla', 0, 'active', true, false),
  ('sneakers-adidas', 'Sneakers Adidas', 'sneakers', 'Par blanco con detalles negros.', 119000, 'talla', 0, 'active', true, false),
  ('tumbler-ripndip', 'Vaso térmico RIPNDIP', 'accessories', 'Vaso térmico azul con ilustración de gato.', 39900, 'variante', 0, 'active', true, false),
  ('preorder-pikachu', 'Pikachu Classic Clog', 'clogs', 'Pikachu Classic Clog de la colección Crocs x Pokémon.', 89900, 'talla', 0, 'active', false, true),
  ('preorder-jigglypuff', 'Jigglypuff Classic Clog', 'clogs', 'Jigglypuff Classic Clog de la colección Crocs x Pokémon.', 89900, 'talla', 0, 'active', false, true),
  ('preorder-gengar', 'Gengar Classic Clog', 'clogs', 'Gengar Classic Clog de la colección Crocs x Pokémon.', 94900, 'talla', 0, 'active', false, true);

INSERT INTO product_variant (product_id, label, sort_order)
SELECT p.id, size.label, size.sort_order
FROM product p
JOIN (VALUES
  ('S', 1), ('M', 2), ('L', 3), ('XL', 4), ('XXL', 5)
) AS size(label, sort_order) ON true
WHERE p.variant_label = 'talla' AND p.category_code IN ('tshirts', 'hoodies', 'outerwear');

INSERT INTO product_variant (product_id, label, sort_order)
SELECT p.id, size.label, size.sort_order
FROM product p
JOIN (VALUES
  ('37', 1), ('38', 2), ('39', 3), ('40', 4), ('41', 5), ('42', 6), ('43', 7)
) AS size(label, sort_order) ON true
WHERE p.category_code IN ('sneakers', 'clogs');

INSERT INTO product_variant (product_id, label, sort_order)
SELECT id, 'Única', 1 FROM product WHERE id = 'tumbler-ripndip';

INSERT INTO product_media (product_id, kind, storage_key) VALUES
  ('tee-noche', 'product', 'assets/ripndip-tee.jpg'),
  ('tee-noche', 'look', 'assets/look-daylight.jpg'),
  ('tee-grateful', 'product', 'assets/grateful-tee.jpg'),
  ('tee-grateful', 'look', 'assets/beard-black-tee.jpg'),
  ('tee-solar', 'product', 'assets/graphic-tee.jpg'),
  ('tee-solar', 'look', 'assets/look-white-hoodie.jpg'),
  ('clogs-pokemon', 'product', 'assets/pokemon-clogs.jpg'),
  ('clogs-pokemon', 'look', 'assets/look-daylight.jpg'),
  ('sneakers-adidas', 'product', 'assets/adidas-sneakers.jpg'),
  ('sneakers-adidas', 'look', 'assets/leather-denim.jpg'),
  ('tumbler-ripndip', 'product', 'assets/ripndip-tumbler.jpg'),
  ('tumbler-ripndip', 'look', 'assets/campaign-city.jpg'),
  ('preorder-pikachu', 'product', 'assets/pokemon-clogs.jpg'),
  ('preorder-pikachu', 'look', 'assets/look-daylight.jpg'),
  ('preorder-jigglypuff', 'product', 'assets/pokemon-clogs.jpg'),
  ('preorder-jigglypuff', 'look', 'assets/look-daylight.jpg'),
  ('preorder-gengar', 'product', 'assets/pokemon-clogs.jpg'),
  ('preorder-gengar', 'look', 'assets/look-daylight.jpg');

INSERT INTO launch (id, name, launch_on, arrival_label, image_key, status) VALUES
  ('drop-02', 'Crocs × Pokémon', DATE '2026-11-14', '02–06 DIC 2026', 'assets/pokemon-clogs.jpg', 'open');

INSERT INTO launch_product (launch_id, product_id, sort_order) VALUES
  ('drop-02', 'preorder-pikachu', 1),
  ('drop-02', 'preorder-jigglypuff', 2),
  ('drop-02', 'preorder-gengar', 3);

INSERT INTO content_video (url, sort_order) VALUES
  ('https://www.tiktok.com/@dirtytask/video/7326274171879591173', 1),
  ('https://www.tiktok.com/@dirtytask/video/7322528374738488581', 2),
  ('https://www.tiktok.com/@dirtytask/video/7265850704454077702', 3),
  ('https://www.tiktok.com/@dirtytask/video/7689297049241603335', 4),
  ('https://www.tiktok.com/@dirtytask/video/7663144684067343624', 5),
  ('https://www.tiktok.com/@dirtytask/video/7662516090895043848', 6);

RESET search_path;
