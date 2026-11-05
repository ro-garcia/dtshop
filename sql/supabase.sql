-- DIRTYTASK / Supabase PostgreSQL 15+ â€” instalaciÃ³n inicial, no destructiva.
-- Ejecutar TODO el archivo una sola vez en SQL Editor como postgres.
-- Si dtshop ya existe se aborta sin modificarlo. No ejecutar dirtytask.sql.
-- No crea contraseÃ±as ni usuarios de ejemplo. Auth administra las credenciales.
-- Exponer Ãºnicamente dtshop en Data API; nunca dtshop_private.
-- Importes en centavos enteros. Ver sql/SUPABASE.md para puesta en marcha.
BEGIN;
CREATE SCHEMA dtshop;
CREATE SCHEMA dtshop_private;
REVOKE ALL ON SCHEMA dtshop, dtshop_private FROM PUBLIC;
GRANT USAGE ON SCHEMA dtshop TO anon, authenticated;
GRANT USAGE ON SCHEMA dtshop_private TO anon, authenticated;
SET LOCAL search_path = dtshop, pg_catalog;

CREATE FUNCTION business_today() RETURNS date LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$ SELECT (now() AT TIME ZONE 'America/Guatemala')::date $$;
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE app_user (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 display_name text NOT NULL DEFAULT 'Usuario' CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60),
 avatar_key text,
 role text NOT NULL DEFAULT 'customer' CHECK (role IN ('partner_ops','partner_finance','customer')),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_partner_per_role ON app_user(role)
 WHERE is_active AND role IN ('partner_ops','partner_finance');
CREATE FUNCTION dtshop_private.app_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = dtshop, pg_catalog AS $$
 SELECT role FROM dtshop.app_user WHERE id = auth.uid() AND is_active
$$;
CREATE FUNCTION is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = dtshop, pg_catalog AS $$
 SELECT coalesce(dtshop_private.app_role() IN ('partner_ops','partner_finance'),false)
$$;
CREATE FUNCTION current_app_user() RETURNS uuid LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$ SELECT auth.uid() $$;
CREATE FUNCTION dtshop_private.sync_auth_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dtshop, pg_catalog AS $$
BEGIN
 INSERT INTO dtshop.app_user(id,display_name) VALUES (NEW.id,
   coalesce(nullif(left(btrim(NEW.raw_user_meta_data->>'display_name'),60),''),'Usuario'));
 RETURN NEW;
END $$;
CREATE TRIGGER dtshop_new_auth_user AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION dtshop_private.sync_auth_user();
-- Accounts already present in Auth receive customer status, never privileges from metadata.
INSERT INTO app_user(id,display_name) SELECT id,
 coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),60),''),'Usuario') FROM auth.users;
CREATE TRIGGER app_user_touch BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE audit_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid, action text NOT NULL, entity text NOT NULL, entity_id text,
 before_data jsonb, after_data jsonb
);
CREATE FUNCTION write_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = dtshop, pg_catalog AS $$
BEGIN
 INSERT INTO audit_event(actor_id,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),
 CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
 RETURN coalesce(NEW,OLD);
END $$;

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
  CONSTRAINT product_media_key_check CHECK ((char_length(storage_key) BETWEEN 1 AND 300 AND storage_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'))
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
    image_key IS NULL OR (char_length(image_key) BETWEEN 1 AND 300 AND image_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$')
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
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user (id) ON DELETE RESTRICT,
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
  currency char(3) NOT NULL CHECK (currency IN ('GTQ','USD')),
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
    (payment_method_code = 'visa_installments' AND installment_count IS NOT NULL AND installment_count IN (3, 6, 9, 12))
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
  preorder boolean NOT NULL DEFAULT false,
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
-- Cuentas, ventas internas, mensajerÃ­a y libro
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
  CONSTRAINT cash_sale_line_price_check CHECK (unit_price_cents >= 0)
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
    OR (status = 'confirmed' AND confirmed_on IS NOT NULL AND account_id IS NOT NULL AND received_cents IS NOT NULL AND received_cents > 0
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
      withheld_cents IS NOT NULL AND positive_adjustment_cents IS NOT NULL
      AND withheld_cents >= 0 AND positive_adjustment_cents >= 0 AND net_cents IS NOT NULL
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
  CONSTRAINT attachment_key_check CHECK ((char_length(storage_key) BETWEEN 1 AND 300 AND storage_key ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$')),
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
  CONSTRAINT obligation_movement_type_check CHECK (movement_type IN ('payment', 'principal', 'purchase', 'charge', 'statement')),
  CONSTRAINT obligation_movement_total_check CHECK ((movement_type='statement' AND total_cents=0) OR (movement_type<>'statement' AND total_cents>0)),
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
        RAISE EXCEPTION 'La fecha debe ser vÃ¡lida y no posterior a hoy.';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- Relaciones adicionales y control de aprobaciÃ³n.
CREATE TABLE bank (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 150)
);
ALTER TABLE money_account ADD COLUMN bank_id uuid REFERENCES bank(id);
ALTER TABLE obligation ADD COLUMN bank_id uuid REFERENCES bank(id);
ALTER TABLE cash_sale ADD COLUMN customer_id uuid REFERENCES customer(id);
ALTER TABLE settlement ADD COLUMN attachment_id uuid REFERENCES attachment(id);
ALTER TABLE attachment ADD COLUMN bucket_id text NOT NULL DEFAULT 'dtshop-receipts' CHECK (bucket_id='dtshop-receipts');
ALTER TABLE ledger_entry ADD COLUMN reversal_of uuid UNIQUE REFERENCES ledger_entry(id);
ALTER TABLE ledger_entry DROP CONSTRAINT ledger_entry_source_pair_check;
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_source_pair_check CHECK
 ((source_type='manual' AND source_id IS NULL) OR (source_type<>'manual' AND source_id IS NOT NULL));
CREATE TABLE operation_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key uuid NOT NULL,
 operation text NOT NULL CHECK (operation IN ('account_open','obligation_open','receipt','expense','income','transfer',
 'settlement_open','settlement_confirm','obligation_movement','sale_adjustment','reverse_manual')),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by uuid NOT NULL REFERENCES app_user(id), reviewed_by uuid REFERENCES app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, review_note text,
 result_id uuid, UNIQUE(requested_by,idempotency_key),
 CHECK (reviewed_by IS NULL OR reviewed_by<>requested_by),
 CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND result_id IS NULL)
 OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND result_id IS NOT NULL)
 OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND result_id IS NULL))
);
CREATE TABLE account_reconciliation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES money_account(id),
 as_of_date date NOT NULL, recorded_balance_cents bigint NOT NULL, observed_balance_cents bigint NOT NULL,
 difference_cents bigint GENERATED ALWAYS AS (observed_balance_cents-recorded_balance_cents) STORED,
 prepared_by uuid NOT NULL REFERENCES app_user(id), reviewed_by uuid REFERENCES app_user(id),
 attachment_id uuid REFERENCES attachment(id), notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz, CHECK (observed_balance_cents>=0),
 CHECK ((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by<>prepared_by))
);
CREATE TABLE inventory_movement (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id text NOT NULL REFERENCES product(id),
 quantity_delta integer NOT NULL CHECK(quantity_delta<>0), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 240),
 order_id uuid REFERENCES shop_order(id), actor_id uuid REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operation_pending_idx ON operation_request(status,created_at);
CREATE INDEX allocation_sale_idx ON settlement_allocation(sale_id);
CREATE INDEX customer_auth_idx ON customer(user_id);
CREATE INDEX money_account_bank_idx ON money_account(bank_id);
CREATE INDEX account_reconciliation_idx ON account_reconciliation(account_id,as_of_date);

-- Inmutabilidad de hechos confirmados. Corregir con nuevos movimientos, nunca borrar.
CREATE FUNCTION dtshop_private.immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro confirmado: no se permite editar ni eliminar %.',TG_TABLE_NAME; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['receipt','account_transfer','ledger_entry','obligation_movement','cash_sale','cash_sale_line',
 'cash_sale_adjustment','money_account','obligation','attachment','audit_event','inventory_movement'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON dtshop.%I FOR EACH ROW EXECUTE FUNCTION dtshop_private.immutable_row()',t);
 END LOOP;
END $$;
CREATE FUNCTION dtshop_private.settlement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='confirmed' THEN RAISE EXCEPTION 'LiquidaciÃ³n confirmada o eliminaciÃ³n no permitida.'; END IF;
 IF NEW.status<>'confirmed' OR NEW.id<>OLD.id OR NEW.courier<>OLD.courier OR NEW.business_date<>OLD.business_date
 OR NEW.currency<>OLD.currency OR NEW.reference<>OLD.reference THEN RAISE EXCEPTION 'Solo se permite confirmar el depÃ³sito pendiente.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_no_rewrite BEFORE UPDATE OR DELETE ON settlement
 FOR EACH ROW EXECUTE FUNCTION dtshop_private.settlement_immutable();
CREATE FUNCTION dtshop_private.allocation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'No se elimina una asignaciÃ³n confirmada como cobrada.'; END IF;
 IF EXISTS(SELECT 1 FROM dtshop.settlement WHERE id=NEW.settlement_id AND status='confirmed') THEN
 RAISE EXCEPTION 'La liquidaciÃ³n ya estÃ¡ confirmada.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.settlement_id<>OLD.settlement_id OR NEW.sale_id<>OLD.sale_id OR NEW.amount_cents<>OLD.amount_cents) THEN
 RAISE EXCEPTION 'No se cambia el cobro original.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_no_rewrite BEFORE INSERT OR UPDATE OR DELETE ON settlement_allocation
 FOR EACH ROW EXECUTE FUNCTION dtshop_private.allocation_immutable();

CREATE FUNCTION dtshop_private.lock_finance() RETURNS void LANGUAGE sql VOLATILE
SET search_path=pg_catalog AS $$ SELECT pg_advisory_xact_lock(20261103,73) $$;
CREATE FUNCTION dtshop_private.require_staff() RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT dtshop.is_staff() THEN RAISE EXCEPTION 'Acceso exclusivo a socios activos.' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION dtshop_private.require_ops() RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF dtshop_private.app_role() IS DISTINCT FROM 'partner_ops' THEN RAISE EXCEPTION 'Acceso exclusivo a operaciones.' USING ERRCODE='42501'; END IF; END $$;

-- Saldo real por fecha; los rangos incluyen la historia previa.
CREATE FUNCTION account_balance(p_account uuid,p_as_of date DEFAULT business_today()) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN a.opened_on>p_as_of THEN 0 ELSE a.opening_balance_cents+
 coalesce((SELECT sum(CASE direction WHEN 'in' THEN amount_cents ELSE -amount_cents END)
 FROM ledger_entry e WHERE e.account_id=a.id AND e.business_date<=p_as_of),0) END FROM money_account a WHERE a.id=p_account
$$;
CREATE FUNCTION sale_customer_due(p_sale uuid,p_as_of date DEFAULT business_today()) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN s.business_date>p_as_of THEN 0 ELSE s.total_cents
 +coalesce((SELECT sum(amount_cents) FROM cash_sale_adjustment WHERE sale_id=s.id AND business_date<=p_as_of),0)
 -coalesce((SELECT sum(amount_cents) FROM receipt WHERE sale_id=s.id AND business_date<=p_as_of),0)
 -coalesce((SELECT sum(al.amount_cents) FROM settlement_allocation al JOIN settlement st ON st.id=al.settlement_id
 WHERE al.sale_id=s.id AND st.business_date<=p_as_of),0) END FROM cash_sale s WHERE s.id=p_sale
$$;
CREATE FUNCTION sale_courier_due(p_sale uuid,p_as_of date DEFAULT business_today()) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT coalesce(sum(al.amount_cents),0)::bigint FROM settlement_allocation al JOIN settlement st ON st.id=al.settlement_id
 WHERE al.sale_id=p_sale AND st.business_date<=p_as_of AND (st.confirmed_on IS NULL OR st.confirmed_on>p_as_of)
$$;
CREATE FUNCTION obligation_balance(p_obligation uuid,p_as_of date DEFAULT business_today()) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE running bigint; r record; BEGIN
 SELECT opening_balance_cents INTO running FROM obligation WHERE id=p_obligation AND start_date<=p_as_of;
 IF NOT FOUND THEN RETURN NULL; END IF;
 FOR r IN SELECT * FROM obligation_movement WHERE obligation_id=p_obligation AND business_date<=p_as_of ORDER BY business_date,sequence LOOP
 running:=CASE WHEN r.statement_balance_cents IS NOT NULL THEN r.statement_balance_cents
 WHEN r.movement_type IN ('purchase','charge') THEN running+r.total_cents ELSE running-coalesce(r.principal_cents,0) END;
 END LOOP; RETURN running; END $$;
CREATE FUNCTION obligation_balance_pending(p_obligation uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM obligation_movement m WHERE m.obligation_id=p_obligation AND m.movement_type='payment'
 AND NOT m.principal_known AND m.statement_balance_cents IS NULL AND NOT EXISTS
 (SELECT 1 FROM obligation_movement n WHERE n.obligation_id=p_obligation AND n.statement_balance_cents IS NOT NULL
 AND (n.business_date,n.sequence)>(m.business_date,m.sequence)))
$$;

CREATE FUNCTION dtshop_private.check_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a money_account%ROWTYPE; r record; running bigint; BEGIN
 SELECT * INTO STRICT a FROM money_account WHERE id=NEW.account_id FOR UPDATE;
 IF NEW.currency<>a.currency THEN RAISE EXCEPTION 'Moneda de cuenta incorrecta.'; END IF;
 running:=a.opening_balance_cents;
 FOR r IN SELECT * FROM ledger_entry WHERE account_id=a.id ORDER BY business_date,sequence LOOP
 IF r.business_date<a.opened_on THEN RAISE EXCEPTION 'Movimiento anterior a apertura.'; END IF;
 running:=running+CASE r.direction WHEN 'in' THEN r.amount_cents ELSE -r.amount_cents END;
 IF running<0 THEN RAISE EXCEPTION 'Saldo histÃ³rico insuficiente.'; END IF;
 END LOOP; RETURN NEW; END $$;
CREATE TRIGGER ledger_integrity AFTER INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION dtshop_private.check_ledger();
CREATE FUNCTION dtshop_private.check_sale_collections() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid:=NEW.sale_id; s cash_sale%ROWTYPE; d date; st settlement%ROWTYPE; BEGIN
 SELECT * INTO STRICT s FROM cash_sale WHERE id=target FOR UPDATE;
 IF TG_TABLE_NAME='settlement_allocation' THEN
 SELECT * INTO STRICT st FROM settlement WHERE id=NEW.settlement_id;
 IF st.business_date<s.business_date OR st.currency<>s.currency THEN RAISE EXCEPTION 'Fecha o moneda de liquidaciÃ³n incompatible.'; END IF;
 ELSE
 IF NEW.business_date<s.business_date THEN RAISE EXCEPTION 'Movimiento anterior a la venta.'; END IF;
 IF TG_TABLE_NAME='receipt' AND s.currency<>(SELECT currency FROM money_account WHERE id=NEW.account_id) THEN RAISE EXCEPTION 'Moneda del cobro incompatible.'; END IF;
 END IF;
 FOR d IN SELECT business_date FROM cash_sale WHERE id=target UNION SELECT business_date FROM cash_sale_adjustment WHERE sale_id=target
 UNION SELECT business_date FROM receipt WHERE sale_id=target UNION SELECT settled.business_date FROM settlement settled JOIN settlement_allocation al ON settled.id=al.settlement_id WHERE al.sale_id=target LOOP
 IF sale_customer_due(target,d)<0 THEN RAISE EXCEPTION 'El cobro excede el saldo de la venta.'; END IF;
 END LOOP; RETURN NEW; END $$;
CREATE TRIGGER receipt_integrity AFTER INSERT ON receipt FOR EACH ROW EXECUTE FUNCTION dtshop_private.check_sale_collections();
CREATE TRIGGER adjustment_integrity AFTER INSERT ON cash_sale_adjustment FOR EACH ROW EXECUTE FUNCTION dtshop_private.check_sale_collections();
CREATE TRIGGER allocation_integrity AFTER INSERT ON settlement_allocation FOR EACH ROW EXECUTE FUNCTION dtshop_private.check_sale_collections();

-- Movimientos vinculados generan el libro automÃ¡ticamente: no escribirlo desde el cliente.
CREATE FUNCTION dtshop_private.post_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,sale_id,source_type,source_id,attachment_id)
 SELECT NEW.account_id,NEW.business_date,'in',NEW.amount_cents,s.currency,'sale','Cobro '||s.reference,s.id,'receipt',NEW.id,NEW.attachment_id FROM cash_sale s WHERE s.id=NEW.sale_id;
 RETURN NEW; END $$;
CREATE TRIGGER receipt_post AFTER INSERT ON receipt FOR EACH ROW EXECUTE FUNCTION dtshop_private.post_receipt();
CREATE FUNCTION dtshop_private.post_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM money_account WHERE id IN (NEW.from_account_id,NEW.to_account_id) AND currency<>NEW.currency) THEN RAISE EXCEPTION 'Transferencia entre monedas distintas.'; END IF;
 INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,source_type,source_id,attachment_id)
 VALUES(NEW.from_account_id,NEW.business_date,'out',NEW.amount_cents,NEW.currency,'transfer',NEW.concept,'transfer',NEW.id,NEW.attachment_id),
 (NEW.to_account_id,NEW.business_date,'in',NEW.amount_cents,NEW.currency,'transfer',NEW.concept,'transfer',NEW.id,NEW.attachment_id);
 RETURN NEW; END $$;
CREATE TRIGGER transfer_post AFTER INSERT ON account_transfer FOR EACH ROW EXECUTE FUNCTION dtshop_private.post_transfer();

CREATE FUNCTION dtshop_private.check_obligation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o obligation%ROWTYPE; r record; running bigint; first_due date; BEGIN
 SELECT * INTO STRICT o FROM obligation WHERE id=NEW.obligation_id FOR UPDATE;
 IF NEW.business_date<o.start_date THEN RAISE EXCEPTION 'Fecha anterior al prÃ©stamo.'; END IF;
 IF NEW.movement_type='statement' THEN
 IF NEW.account_id IS NOT NULL OR NEW.statement_balance_cents IS NULL OR NEW.principal_cents IS NOT NULL OR NEW.interest_cents IS NOT NULL OR NEW.fee_cents IS NOT NULL THEN RAISE EXCEPTION 'Actualización de saldo sin débito ni desglose.'; END IF;
 ELSIF NEW.movement_type IN ('purchase','charge') THEN
 IF o.obligation_type<>'card' OR NEW.account_id IS NOT NULL OR NEW.statement_balance_cents IS NOT NULL THEN RAISE EXCEPTION 'Consumo/cargo solo en tarjetas, sin dÃ©bito de cuenta.'; END IF;
 IF coalesce(NEW.principal_cents,0)<>0 THEN RAISE EXCEPTION 'Consumos no amortizan capital.'; END IF;
 ELSE
 IF NEW.account_id IS NULL OR (SELECT currency FROM money_account WHERE id=NEW.account_id)<>o.currency THEN RAISE EXCEPTION 'Selecciona una cuenta de la misma moneda.'; END IF;
 END IF;
 IF NEW.movement_type='principal' AND (NEW.principal_cents IS DISTINCT FROM NEW.total_cents OR NOT NEW.principal_known OR NEW.statement_balance_cents IS NOT NULL) THEN RAISE EXCEPTION 'Abono a capital incorrecto.'; END IF;
 IF NEW.movement_type='payment' THEN
 first_due:=date_trunc('month',o.start_date)::date;
 IF least(o.due_day,extract(day FROM (first_due+interval '1 month - 1 day'))::integer)<extract(day FROM o.start_date) THEN first_due:=(first_due+interval '1 month')::date; END IF;
 IF NEW.period_month<first_due THEN RAISE EXCEPTION 'PerÃ­odo anterior a primera cuota.'; END IF;
 IF (SELECT coalesce(sum(total_cents),0) FROM obligation_movement WHERE obligation_id=o.id AND movement_type='payment' AND period_month=NEW.period_month)>o.installment_cents THEN RAISE EXCEPTION 'La cuota excede lo pendiente; registrar abono a capital por separado.'; END IF;
 IF NEW.principal_known THEN
 IF NEW.principal_cents IS NULL OR NEW.interest_cents IS NULL OR NEW.fee_cents IS NULL OR NEW.total_cents<>NEW.principal_cents+NEW.interest_cents+NEW.fee_cents THEN RAISE EXCEPTION 'Desglose no cuadra.'; END IF;
 ELSE IF NEW.principal_cents IS NOT NULL OR NEW.interest_cents IS NOT NULL OR NEW.fee_cents IS NOT NULL THEN RAISE EXCEPTION 'Sin desglose: usar NULL, no ceros inventados.'; END IF;
 END IF;
 END IF;
 running:=o.opening_balance_cents;
 FOR r IN SELECT * FROM obligation_movement WHERE obligation_id=o.id ORDER BY business_date,sequence LOOP
 running:=CASE WHEN r.statement_balance_cents IS NOT NULL THEN r.statement_balance_cents WHEN r.movement_type IN ('purchase','charge') THEN running+r.total_cents ELSE running-coalesce(r.principal_cents,0) END;
 IF running<0 THEN RAISE EXCEPTION 'Saldo histÃ³rico de obligaciÃ³n negativo.'; END IF;
 END LOOP;
 IF NEW.movement_type IN ('payment','principal') THEN
 INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,source_type,source_id,attachment_id)
 VALUES(NEW.account_id,NEW.business_date,'out',NEW.total_cents,o.currency,'debt',left('Pago '||o.name,180),'obligation_movement',NEW.id,NEW.attachment_id);
 END IF; RETURN NEW; END $$;
CREATE TRIGGER obligation_integrity AFTER INSERT ON obligation_movement FOR EACH ROW EXECUTE FUNCTION dtshop_private.check_obligation();

CREATE FUNCTION dtshop_private.validate_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t settlement%ROWTYPE; n integer; gross bigint; held bigint; extra bigint; net bigint; BEGIN
 -- Consult final state: deferred events may contain the initial pending snapshot.
 SELECT * INTO STRICT t FROM settlement WHERE id=NEW.id;
 SELECT count(*),sum(amount_cents),sum(withheld_cents),sum(positive_adjustment_cents),sum(net_cents) INTO n,gross,held,extra,net FROM settlement_allocation WHERE settlement_id=t.id;
 IF n=0 OR (t.courier='Forza' AND n<>1) THEN RAISE EXCEPTION 'Cantidad de pedidos invÃ¡lida para transportista.'; END IF;
 IF t.status='confirmed' THEN
 IF (SELECT currency FROM money_account WHERE id=t.account_id)<>t.currency THEN RAISE EXCEPTION 'Moneda incorrecta.'; END IF;
 IF gross-t.service_cents-t.commission_cents-t.discount_cents+t.adjustment_cents<>t.received_cents THEN RAISE EXCEPTION 'LiquidaciÃ³n no cuadra.'; END IF;
 IF (t.discount_cents>0 OR t.adjustment_cents>0) AND length(btrim(t.reason))=0 THEN RAISE EXCEPTION 'Explica el ajuste.'; END IF;
 IF EXISTS(SELECT 1 FROM settlement_allocation WHERE settlement_id=t.id AND net_cents IS NULL) OR held IS DISTINCT FROM t.service_cents+t.commission_cents+t.discount_cents OR extra IS DISTINCT FROM t.adjustment_cents OR net IS DISTINCT FROM t.received_cents THEN RAISE EXCEPTION 'Prorrateo invÃ¡lido.'; END IF;
 END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER settlement_validate AFTER INSERT OR UPDATE ON settlement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dtshop_private.validate_settlement();
CREATE FUNCTION dtshop_private.post_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.status='confirmed' THEN
 INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,source_type,source_id,attachment_id)
 VALUES(NEW.account_id,NEW.confirmed_on,'in',NEW.received_cents,NEW.currency,'settlement','DepÃ³sito '||NEW.courier,'settlement',NEW.id,NEW.attachment_id);
 END IF; RETURN NEW; END $$;
CREATE TRIGGER settlement_post AFTER UPDATE ON settlement FOR EACH ROW EXECUTE FUNCTION dtshop_private.post_settlement();

-- RPC de operaciones: ventas originales, siempre sin cobrar automÃ¡ticamente.
CREATE FUNCTION create_sale(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=dtshop,pg_catalog AS $$
DECLARE sid uuid; subtotal bigint:=0; shipping bigint; item jsonb; oid uuid:=nullif(p->>'shop_order_id','')::uuid; o shop_order%ROWTYPE; BEGIN
 PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
 IF oid IS NOT NULL THEN
 SELECT * INTO STRICT o FROM shop_order WHERE id=oid FOR UPDATE;
 IF o.status='cancelled' THEN RAISE EXCEPTION 'Pedido cancelado.'; END IF;
 INSERT INTO cash_sale(shop_order_id,reference,business_date,channel,currency,customer_id,shipping_mode,shipping_cents,subtotal_cents,total_cents)
 VALUES(o.id,p->>'reference',(p->>'business_date')::date,'web',o.currency,o.customer_id,'extra',o.shipping_cents,o.subtotal_cents,o.total_cents) RETURNING id INTO sid;
 INSERT INTO cash_sale_line(sale_id,product_id,name,qty,unit_price_cents) SELECT sid,product_id,product_name||' / '||variant_label,qty,unit_price_cents FROM shop_order_line WHERE order_id=oid;
 ELSE
 IF coalesce(p->>'channel','') NOT IN ('physical','external') OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Venta externa/fÃ­sica requiere entre 1 y 30 lÃ­neas.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
 IF (item->>'qty')::integer NOT BETWEEN 1 AND 10000 OR (item->>'unit_price_cents')::bigint<0 THEN RAISE EXCEPTION 'LÃ­nea invÃ¡lida.'; END IF;
 subtotal:=subtotal+(item->>'qty')::integer*(item->>'unit_price_cents')::bigint;
 END LOOP;
 shipping:=CASE WHEN p->>'shipping_mode'='extra' THEN coalesce((p->>'shipping_cents')::bigint,0) ELSE 0 END;
 INSERT INTO cash_sale(reference,business_date,channel,currency,customer_name,launch_id,shipping_mode,shipping_cents,subtotal_cents,total_cents)
 VALUES(p->>'reference',(p->>'business_date')::date,p->>'channel',p->>'currency',coalesce(p->>'customer_name',''),nullif(p->>'launch_id',''),p->>'shipping_mode',shipping,subtotal,subtotal+shipping) RETURNING id INTO sid;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
 IF nullif(item->>'product_id','') IS NOT NULL THEN
 PERFORM 1 FROM product WHERE id=item->>'product_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto inexistente.'; END IF;
 IF NOT (SELECT preorder FROM product WHERE id=item->>'product_id') THEN
 UPDATE product SET stock=stock-(item->>'qty')::integer WHERE id=item->>'product_id' AND stock>=(item->>'qty')::integer;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock insuficiente.'; END IF; END IF; END IF;
 INSERT INTO cash_sale_line(sale_id,product_id,name,qty,unit_price_cents) VALUES(sid,nullif(item->>'product_id',''),item->>'name',(item->>'qty')::integer,(item->>'unit_price_cents')::bigint);
 END LOOP;
 END IF; RETURN sid;
END $$;

-- Cada solicitud guarda el payload original, sin modificaciones posteriores.
CREATE FUNCTION submit_operation(p_operation text,p_payload jsonb,p_idempotency_key uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE r operation_request%ROWTYPE; rid uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO r FROM operation_request WHERE requested_by=auth.uid() AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
 IF r.operation<>p_operation OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Clave de idempotencia utilizada para otra operaciÃ³n.'; END IF;
 RETURN r.id; END IF;
 IF dtshop_private.app_role()='partner_ops' AND p_operation NOT IN ('receipt','settlement_open','sale_adjustment') THEN RAISE EXCEPTION 'Esta solicitud corresponde a finanzas.'; END IF;
 INSERT INTO operation_request(operation,payload,idempotency_key,requested_by) VALUES(p_operation,p_payload,p_idempotency_key,auth.uid()) RETURNING id INTO rid;
 RETURN rid;
END $$;

-- AplicaciÃ³n interna; sin EXECUTE para clientes, ni siquiera para socios.
CREATE FUNCTION dtshop_private.apply_operation(op text,p jsonb) RETURNS uuid LANGUAGE plpgsql
SET search_path=dtshop,pg_catalog AS $$
DECLARE result uuid; item jsonb; bid uuid; a money_account%ROWTYPE; t settlement%ROWTYPE; e ledger_entry%ROWTYPE;
 gross numeric; cost bigint; extra bigint; allocation record; count_sales integer; kind text; BEGIN
 IF op IN ('account_open','obligation_open') AND nullif(btrim(p->>'bank_name'),'') IS NOT NULL THEN
 INSERT INTO bank(name) VALUES(btrim(p->>'bank_name')) ON CONFLICT(name) DO NOTHING;
 SELECT id INTO bid FROM bank WHERE name=btrim(p->>'bank_name'); END IF;
 CASE op
 WHEN 'account_open' THEN
 INSERT INTO money_account(name,account_type,bank_name,bank_id,reference_last4,currency,opening_balance_cents,opened_on)
 VALUES(p->>'name',p->>'account_type',coalesce(p->>'bank_name',''),bid,coalesce(p->>'reference_last4',''),p->>'currency',(p->>'opening_balance_cents')::bigint,(p->>'opened_on')::date) RETURNING id INTO result;
 WHEN 'obligation_open' THEN
 INSERT INTO obligation(bank_name,bank_id,reference,name,obligation_type,currency,opening_balance_cents,installment_cents,due_day,start_date)
 VALUES(p->>'bank_name',bid,p->>'reference',p->>'name',p->>'obligation_type',p->>'currency',(p->>'opening_balance_cents')::bigint,(p->>'installment_cents')::bigint,(p->>'due_day')::smallint,(p->>'start_date')::date) RETURNING id INTO result;
 WHEN 'receipt' THEN
 INSERT INTO receipt(sale_id,account_id,business_date,amount_cents,reference,attachment_id)
 VALUES((p->>'sale_id')::uuid,(p->>'account_id')::uuid,(p->>'business_date')::date,(p->>'amount_cents')::bigint,coalesce(p->>'reference',''),nullif(p->>'attachment_id','')::uuid) RETURNING id INTO result;
 WHEN 'expense','income' THEN
 SELECT * INTO STRICT a FROM money_account WHERE id=(p->>'account_id')::uuid;
 IF (op='expense' AND coalesce(p->>'category','') NOT IN ('advertising','delivery','supplies','other')) OR (op='income' AND coalesce(p->>'category','') NOT IN ('operating','contribution','financing')) THEN RAISE EXCEPTION 'CategorÃ­a incompatible.'; END IF;
 IF nullif(p->>'sale_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cash_sale WHERE id=(p->>'sale_id')::uuid AND currency=a.currency AND business_date<=(p->>'business_date')::date) THEN RAISE EXCEPTION 'Venta vinculada incompatible.'; END IF;
 INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,sale_id,attachment_id)
 VALUES(a.id,(p->>'business_date')::date,CASE op WHEN 'income' THEN 'in' ELSE 'out' END,(p->>'amount_cents')::bigint,a.currency,p->>'category',p->>'concept',nullif(p->>'sale_id','')::uuid,nullif(p->>'attachment_id','')::uuid) RETURNING id INTO result;
 WHEN 'transfer' THEN
 SELECT * INTO STRICT a FROM money_account WHERE id=(p->>'from_account_id')::uuid;
 INSERT INTO account_transfer(from_account_id,to_account_id,business_date,amount_cents,currency,concept,attachment_id)
 VALUES(a.id,(p->>'to_account_id')::uuid,(p->>'business_date')::date,(p->>'amount_cents')::bigint,a.currency,p->>'concept',nullif(p->>'attachment_id','')::uuid) RETURNING id INTO result;
 WHEN 'sale_adjustment' THEN
 INSERT INTO cash_sale_adjustment(sale_id,business_date,amount_cents,reason)
 VALUES((p->>'sale_id')::uuid,(p->>'business_date')::date,(p->>'amount_cents')::bigint,p->>'reason') RETURNING id INTO result;
 WHEN 'obligation_movement' THEN
 kind:=p->>'movement_type';
 INSERT INTO obligation_movement(obligation_id,account_id,movement_type,business_date,period_month,total_cents,principal_cents,interest_cents,fee_cents,principal_known,statement_balance_cents,notes,attachment_id)
 VALUES((p->>'obligation_id')::uuid,nullif(p->>'account_id','')::uuid,kind,(p->>'business_date')::date,nullif(p->>'period_month','')::date,(p->>'total_cents')::bigint,
 CASE WHEN kind='principal' THEN (p->>'total_cents')::bigint WHEN kind='payment' AND coalesce((p->>'principal_known')::boolean,false) THEN (p->>'principal_cents')::bigint ELSE NULL END,
 CASE WHEN kind='payment' AND coalesce((p->>'principal_known')::boolean,false) THEN (p->>'interest_cents')::bigint END,
 CASE WHEN kind='payment' AND coalesce((p->>'principal_known')::boolean,false) THEN (p->>'fee_cents')::bigint END,
 kind='principal' OR (kind='payment' AND coalesce((p->>'principal_known')::boolean,false)),nullif(p->>'statement_balance_cents','')::bigint,coalesce(p->>'notes',''),nullif(p->>'attachment_id','')::uuid) RETURNING id INTO result;
 WHEN 'settlement_open' THEN
 IF jsonb_typeof(p->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'allocations') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Agrega de 1 a 100 ventas.'; END IF;
 INSERT INTO settlement(courier,business_date,currency,reference) VALUES(p->>'courier',(p->>'business_date')::date,p->>'currency',coalesce(p->>'reference','')) RETURNING id INTO result;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'allocations') LOOP
 INSERT INTO settlement_allocation(settlement_id,sale_id,amount_cents) VALUES(result,(item->>'sale_id')::uuid,(item->>'amount_cents')::bigint);
 END LOOP;
 WHEN 'settlement_confirm' THEN
 SELECT * INTO STRICT t FROM settlement WHERE id=(p->>'settlement_id')::uuid FOR UPDATE;
 IF t.status<>'pending' THEN RAISE EXCEPTION 'DepÃ³sito ya confirmado.'; END IF;
 SELECT sum(amount_cents) INTO gross FROM settlement_allocation WHERE settlement_id=t.id;
 cost:=coalesce((p->>'service_cents')::bigint,0)+coalesce((p->>'commission_cents')::bigint,0)+coalesce((p->>'discount_cents')::bigint,0);
 extra:=coalesce((p->>'adjustment_cents')::bigint,0);
 IF cost<0 OR extra<0 OR gross IS NULL THEN RAISE EXCEPTION 'Importes de liquidaciÃ³n invÃ¡lidos.'; END IF;
 -- Largest remainder, ordering by sale UUID for deterministic cents.
 WITH parts AS (SELECT sale_id,floor(amount_cents*cost::numeric/gross)::bigint AS base,
 row_number() OVER(ORDER BY mod(amount_cents*cost::numeric,gross) DESC,sale_id) AS rn FROM settlement_allocation WHERE settlement_id=t.id),
 totals AS (SELECT cost-sum(base) AS remaining FROM parts)
 UPDATE settlement_allocation al SET withheld_cents=parts.base+CASE WHEN parts.rn<=totals.remaining THEN 1 ELSE 0 END,
 positive_adjustment_cents=0,net_cents=al.amount_cents-(parts.base+CASE WHEN parts.rn<=totals.remaining THEN 1 ELSE 0 END)
 FROM parts,totals WHERE al.settlement_id=t.id AND al.sale_id=parts.sale_id;
 WITH parts AS (SELECT sale_id,floor(amount_cents*extra::numeric/gross)::bigint AS base,
 row_number() OVER(ORDER BY mod(amount_cents*extra::numeric,gross) DESC,sale_id) AS rn FROM settlement_allocation WHERE settlement_id=t.id),
 totals AS (SELECT extra-sum(base) AS remaining FROM parts)
 UPDATE settlement_allocation al SET positive_adjustment_cents=parts.base+CASE WHEN parts.rn<=totals.remaining THEN 1 ELSE 0 END,
 net_cents=al.amount_cents-al.withheld_cents+parts.base+CASE WHEN parts.rn<=totals.remaining THEN 1 ELSE 0 END
 FROM parts,totals WHERE al.settlement_id=t.id AND al.sale_id=parts.sale_id;
 UPDATE settlement SET status='confirmed',account_id=(p->>'account_id')::uuid,confirmed_on=(p->>'confirmed_on')::date,
 service_cents=coalesce((p->>'service_cents')::bigint,0),commission_cents=coalesce((p->>'commission_cents')::bigint,0),
 discount_cents=coalesce((p->>'discount_cents')::bigint,0),adjustment_cents=extra,received_cents=(p->>'received_cents')::bigint,
 reason=coalesce(p->>'reason',''),attachment_id=nullif(p->>'attachment_id','')::uuid WHERE id=t.id;
 result:=t.id;
 WHEN 'reverse_manual' THEN
 SELECT * INTO STRICT e FROM ledger_entry WHERE id=(p->>'entry_id')::uuid;
 IF e.source_type<>'manual' OR e.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Solo se revierte un ingreso/gasto manual original.'; END IF;
 IF (p->>'business_date')::date<e.business_date THEN RAISE EXCEPTION 'ReversiÃ³n anterior al original.'; END IF;
 INSERT INTO ledger_entry(account_id,business_date,direction,amount_cents,currency,category,concept,reversal_of,attachment_id)
 VALUES(e.account_id,(p->>'business_date')::date,CASE e.direction WHEN 'in' THEN 'out' ELSE 'in' END,e.amount_cents,e.currency,e.category,'ReversiÃ³n: '||left(p->>'reason',150),e.id,nullif(p->>'attachment_id','')::uuid) RETURNING id INTO result;
 ELSE RAISE EXCEPTION 'OperaciÃ³n desconocida.';
 END CASE; RETURN result;
END $$;
CREATE FUNCTION review_operation(p_request uuid,p_approve boolean,p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE r operation_request%ROWTYPE; result uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO STRICT r FROM operation_request WHERE id=p_request FOR UPDATE;
 IF r.requested_by=auth.uid() OR (SELECT role FROM app_user WHERE id=r.requested_by) IS NOT DISTINCT FROM dtshop_private.app_role() THEN RAISE EXCEPTION 'Debe revisar el otro socio.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=r.requested_by AND is_active AND role IN ('partner_ops','partner_finance')) THEN RAISE EXCEPTION 'Solicitante inactivo.'; END IF;
 IF r.status='approved' AND p_approve THEN RETURN r.result_id; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Solicitud ya revisada.'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Indica aprobar o rechazar.'; END IF;
 IF NOT p_approve AND length(btrim(p_note))=0 THEN RAISE EXCEPTION 'Indica motivo de rechazo.'; END IF;
 IF p_approve THEN result:=dtshop_private.apply_operation(r.operation,r.payload); END IF;
 UPDATE operation_request SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,500),result_id=result WHERE id=r.id;
 RETURN result;
END $$;

CREATE FUNCTION register_attachment(p_key text,p_name text,p_type text,p_bytes integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE result uuid; BEGIN
 PERFORM dtshop_private.require_staff();
 IF split_part(p_key,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='dtshop-receipts' AND name=p_key) THEN RAISE EXCEPTION 'Primero sube el archivo a tu carpeta de comprobantes.'; END IF;
 INSERT INTO attachment(storage_key,file_name,media_type,byte_size,created_by) VALUES(p_key,p_name,p_type,p_bytes,auth.uid()) RETURNING id INTO result;
 RETURN result; END $$;

CREATE FUNCTION prepare_reconciliation(p_account uuid,p_date date,p_observed bigint,p_notes text DEFAULT '',p_attachment uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE result uuid; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 IF p_date>business_today() OR p_date<(SELECT opened_on FROM money_account WHERE id=p_account) THEN RAISE EXCEPTION 'Fecha invÃ¡lida.'; END IF;
 INSERT INTO account_reconciliation(account_id,as_of_date,recorded_balance_cents,observed_balance_cents,prepared_by,notes,attachment_id)
 VALUES(p_account,p_date,account_balance(p_account,p_date),p_observed,auth.uid(),left(p_notes,500),p_attachment) RETURNING id INTO result;
 RETURN result; END $$;
CREATE FUNCTION review_reconciliation(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=dtshop,pg_catalog AS $$
DECLARE r account_reconciliation%ROWTYPE; BEGIN
 PERFORM dtshop_private.require_staff(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO STRICT r FROM account_reconciliation WHERE id=p_id FOR UPDATE;
 IF r.prepared_by=auth.uid() OR r.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'Debe revisar el otro socio una vez.'; END IF;
 IF account_balance(r.account_id,r.as_of_date)<>r.recorded_balance_cents THEN RAISE EXCEPTION 'CambiÃ³ el libro: prepara un nuevo cuadre.'; END IF;
 UPDATE account_reconciliation SET reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id;
END $$;
-- No backdating into a reviewed close: future corrections use a later date.
CREATE FUNCTION dtshop_private.respect_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS(SELECT 1 FROM account_reconciliation WHERE account_id=NEW.account_id AND reviewed_at IS NOT NULL AND as_of_date>=NEW.business_date) THEN RAISE EXCEPTION 'La fecha pertenece a un cuadre revisado; registra la correcciÃ³n en fecha posterior.'; END IF; RETURN NEW; END $$;
CREATE TRIGGER ledger_closed BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION dtshop_private.respect_close();


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
SET search_path = dtshop, pg_catalog AS $$
DECLARE
  dept department%ROWTYPE;
  method payment_method%ROWTYPE;
  settings store_setting%ROWTYPE;
  item jsonb;
  found_product product%ROWTYPE;
  found_variant product_variant%ROWTYPE;
  qty integer;
  new_customer_id uuid;
  new_order_id uuid;
  subtotal bigint := 0;
  shipping bigint;
  clean_nit text := NULLIF(btrim(COALESCE(p_nit, '')), '');
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Inicia sesiÃ³n o usa el endpoint de checkout del servidor.'; END IF;
  PERFORM dtshop_private.lock_finance();
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Agrega entre 1 y 30 productos.';
  END IF;
  SELECT * INTO settings FROM store_setting WHERE id = 1;
  SELECT * INTO dept FROM department WHERE name = btrim(p_department);
  IF NOT FOUND THEN RAISE EXCEPTION 'Elige un departamento vÃ¡lido.'; END IF;
  SELECT * INTO method FROM payment_method WHERE code = p_payment_method AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'El mÃ©todo de pago no estÃ¡ disponible.'; END IF;
  IF method.code = 'visa_installments' THEN
    IF p_installments IS NULL OR p_installments NOT IN (3, 6, 9, 12) THEN
      RAISE EXCEPTION 'Elige 3, 6, 9 o 12 cuotas.';
    END IF;
  ELSIF p_installments IS NOT NULL THEN
    RAISE EXCEPTION 'Este mÃ©todo no usa cuotas.';
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
  RETURNING id INTO new_customer_id;

  INSERT INTO shop_order (
    currency, customer_id, department_id, street_address, neighborhood, municipality, phone, nit,
    payment_method_code, installment_count, shipping_cents, subtotal_cents, total_cents, status
  ) VALUES (
    settings.currency, new_customer_id, dept.id, btrim(p_street), btrim(p_neighborhood), btrim(p_municipality), btrim(p_phone), clean_nit,
    method.code, CASE WHEN method.code = 'visa_installments' THEN p_installments ELSE NULL END,
    shipping, 0, shipping, 'pending'
  )
  RETURNING id INTO new_order_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    qty := (item->>'qty')::integer;
    SELECT * INTO found_variant FROM product_variant WHERE id = (item->>'variant_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'La talla elegida ya no estÃ¡ disponible.'; END IF;
    SELECT * INTO found_product FROM product WHERE id = found_variant.product_id;
    IF found_product.status <> 'active' OR NOT (found_product.published OR (found_product.preorder AND EXISTS(SELECT 1 FROM launch_product lp JOIN launch l ON l.id=lp.launch_id WHERE lp.product_id=found_product.id AND l.status IN ('open','upcoming')))) THEN
      RAISE EXCEPTION 'Un producto del pedido ya no estÃ¡ disponible.';
    END IF;
    IF found_product.id <> item->>'product_id' THEN
      RAISE EXCEPTION 'El producto no coincide con la talla.';
    END IF;
    IF qty IS NULL OR qty NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Cantidad invÃ¡lida.'; END IF;
    IF NOT found_product.preorder THEN
      UPDATE product SET stock=stock-qty WHERE id=found_product.id AND stock>=qty;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stock insuficiente.'; END IF;
    END IF;
    subtotal := subtotal + found_product.price_cents * qty;
    INSERT INTO shop_order_line (order_id, product_id, variant_id, product_name, variant_label, qty, unit_price_cents, preorder)
    VALUES (new_order_id, found_product.id, found_variant.id, found_product.name, found_variant.label, qty, found_product.price_cents, found_product.preorder);
  END LOOP;

  UPDATE shop_order
     SET subtotal_cents = subtotal,
         total_cents = subtotal + shipping
   WHERE id = new_order_id;
  INSERT INTO order_status_event (order_id, status, actor_id)
  VALUES (new_order_id, 'pending', current_app_user());
  RETURN new_order_id;
END $$;


-- ConfiguraciÃ³n mÃ­nima; sin datos de clientes, cuentas ni contraseÃ±as.
CREATE FUNCTION set_order_status(p_order uuid,p_status text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE o shop_order%ROWTYPE; BEGIN
 PERFORM dtshop_private.require_ops(); PERFORM dtshop_private.lock_finance();
 SELECT * INTO STRICT o FROM shop_order WHERE id=p_order FOR UPDATE;
 IF NOT ((o.status='pending' AND p_status IN ('confirmed','cancelled')) OR (o.status='confirmed' AND p_status IN ('preparing','cancelled')) OR (o.status='preparing' AND p_status IN ('shipped','cancelled')) OR (o.status='shipped' AND p_status='delivered')) THEN RAISE EXCEPTION 'TransiciÃ³n de pedido invÃ¡lida.'; END IF;
 IF p_status='cancelled' THEN
 IF EXISTS(SELECT 1 FROM cash_sale WHERE shop_order_id=o.id) THEN RAISE EXCEPTION 'Pedido convertido en venta: requiere flujo de devoluciÃ³n, no cancelaciÃ³n simple.'; END IF;
 UPDATE product p SET stock=p.stock+x.qty FROM (SELECT l.product_id,sum(l.qty)::integer qty FROM shop_order_line l WHERE l.order_id=o.id AND NOT l.preorder GROUP BY l.product_id) x WHERE p.id=x.product_id;
 END IF;
 UPDATE shop_order SET status=p_status WHERE id=o.id;
 INSERT INTO order_status_event(order_id,status,actor_id,note) VALUES(o.id,p_status,auth.uid(),left(p_note,240));
END $$;
CREATE FUNCTION dtshop_private.record_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=dtshop,pg_catalog AS $$
DECLARE delta integer; BEGIN
 delta:=NEW.stock-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.stock END;
 IF delta<>0 THEN INSERT INTO inventory_movement(product_id,quantity_delta,reason,actor_id) VALUES(NEW.id,delta,CASE WHEN TG_OP='INSERT' THEN 'Stock inicial' ELSE 'Cambio de stock (ver auditorÃ­a)' END,auth.uid()); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER product_stock_log AFTER INSERT OR UPDATE OF stock ON product FOR EACH ROW EXECUTE FUNCTION dtshop_private.record_stock();

-- Todas las tablas expuestas tienen RLS. NingÃºn socio escribe el libro directamente.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='dtshop' LOOP
 EXECUTE format('ALTER TABLE dtshop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY staff_read ON dtshop.%I FOR SELECT TO authenticated USING ((SELECT dtshop.is_staff()))',t);
 END LOOP;
END $$;
CREATE POLICY profile_self_read ON app_user FOR SELECT TO authenticated USING(id=(SELECT auth.uid()));
CREATE POLICY profile_self_update ON app_user FOR UPDATE TO authenticated USING(id=(SELECT auth.uid())) WITH CHECK(id=(SELECT auth.uid()));
CREATE POLICY catalogue_read ON product FOR SELECT TO anon,authenticated USING(status='active' AND (published OR (preorder AND EXISTS(SELECT 1 FROM launch_product lp JOIN launch l ON l.id=lp.launch_id WHERE lp.product_id=product.id AND l.status IN ('open','upcoming')))));
CREATE POLICY variants_read ON product_variant FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM product p WHERE p.id=product_id));
CREATE POLICY media_read ON product_media FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM product p WHERE p.id=product_id));
CREATE POLICY launches_read ON launch FOR SELECT TO anon,authenticated USING(status IN ('open','upcoming'));
CREATE POLICY launch_products_read ON launch_product FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM launch l WHERE l.id=launch_id AND l.status IN ('open','upcoming')));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['department','category','store_setting','content_block','content_video'] LOOP
 EXECUTE format('CREATE POLICY public_read ON dtshop.%I FOR SELECT TO anon,authenticated USING(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['category','product','product_variant','product_media','launch','launch_product','store_setting','payment_method','content_block','content_video'] LOOP
 EXECUTE format('CREATE POLICY ops_insert ON dtshop.%I FOR INSERT TO authenticated WITH CHECK ((SELECT dtshop_private.app_role())=''partner_ops'')',t);
 EXECUTE format('CREATE POLICY ops_update ON dtshop.%I FOR UPDATE TO authenticated USING ((SELECT dtshop_private.app_role())=''partner_ops'') WITH CHECK ((SELECT dtshop_private.app_role())=''partner_ops'')',t);
 END LOOP;
END $$;
CREATE POLICY enabled_payment_read ON payment_method FOR SELECT TO anon,authenticated USING(enabled);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['product_media','launch_product','content_video'] LOOP
 EXECUTE format('CREATE POLICY ops_delete ON dtshop.%I FOR DELETE TO authenticated USING ((SELECT dtshop_private.app_role())=''partner_ops'')',t);
 END LOOP;
END $$;
CREATE POLICY customer_self_read ON customer FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY own_saved ON saved_product FOR ALL TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY own_cart ON cart FOR ALL TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()) AND guest_key IS NULL);
CREATE POLICY own_cart_items ON cart_item FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM cart c WHERE c.id=cart_id AND c.user_id=(SELECT auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM cart c WHERE c.id=cart_id AND c.user_id=(SELECT auth.uid())));
CREATE POLICY own_order ON shop_order FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM customer c WHERE c.id=customer_id AND c.user_id=(SELECT auth.uid())));
CREATE POLICY own_order_line ON shop_order_line FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM shop_order o JOIN customer c ON c.id=o.customer_id WHERE o.id=order_id AND c.user_id=(SELECT auth.uid())));
CREATE POLICY own_order_events ON order_status_event FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM shop_order o JOIN customer c ON c.id=o.customer_id WHERE o.id=order_id AND c.user_id=(SELECT auth.uid())));

-- Vistas BI: security_invoker evita saltarse RLS por ser propietario de la vista.
CREATE VIEW v_account_ledger WITH (security_invoker=true) AS
 SELECT e.*,a.name AS account_name,a.opening_balance_cents+sum(CASE e.direction WHEN 'in' THEN e.amount_cents ELSE -e.amount_cents END)
 OVER(PARTITION BY e.account_id ORDER BY e.business_date,e.sequence ROWS UNBOUNDED PRECEDING) AS balance_cents
 FROM ledger_entry e JOIN money_account a ON a.id=e.account_id;
CREATE VIEW v_account_balances WITH (security_invoker=true) AS SELECT a.*,account_balance(a.id) AS balance_cents FROM money_account a;
CREATE VIEW v_sale_balances WITH (security_invoker=true) AS SELECT s.*,sale_customer_due(s.id) AS customer_due_cents,sale_courier_due(s.id) AS courier_due_cents FROM cash_sale s;
CREATE VIEW v_obligation_balances WITH (security_invoker=true) AS SELECT o.*,obligation_balance(o.id) AS known_balance_cents,obligation_balance_pending(o.id) AS needs_bank_update FROM obligation o;
CREATE VIEW v_cash_daily WITH (security_invoker=true) AS
 SELECT business_date,currency,
 sum(CASE WHEN direction='in' THEN amount_cents ELSE 0 END) AS incoming_cents,
 sum(CASE WHEN direction='out' THEN amount_cents ELSE 0 END) AS outgoing_cents,
 sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END) AS net_cents
 FROM ledger_entry WHERE category<>'transfer' GROUP BY business_date,currency;
CREATE VIEW v_cash_weekly WITH (security_invoker=true) AS SELECT date_trunc('week',business_date)::date AS week_start,currency,sum(incoming_cents) incoming_cents,sum(outgoing_cents) outgoing_cents,sum(net_cents) net_cents FROM v_cash_daily GROUP BY 1,2;
CREATE VIEW v_cash_monthly WITH (security_invoker=true) AS SELECT date_trunc('month',business_date)::date AS month_start,currency,sum(incoming_cents) incoming_cents,sum(outgoing_cents) outgoing_cents,sum(net_cents) net_cents FROM v_cash_daily GROUP BY 1,2;
CREATE VIEW v_settlement_costs WITH (security_invoker=true) AS SELECT st.id,st.confirmed_on,st.courier,st.currency,al.sale_id,al.amount_cents,al.withheld_cents,al.positive_adjustment_cents,al.net_cents FROM settlement st JOIN settlement_allocation al ON al.settlement_id=st.id WHERE st.status='confirmed';

-- AuditorÃ­a general y validaciÃ³n de fechas en hechos de negocio.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='dtshop' AND tablename NOT IN ('audit_event','shop_order') LOOP
 EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON dtshop.%I FOR EACH ROW EXECUTE FUNCTION dtshop.write_audit()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['money_account','cash_sale','cash_sale_adjustment','settlement','receipt','account_transfer','ledger_entry','obligation','obligation_movement'] LOOP
 EXECUTE format('CREATE TRIGGER valid_business_date BEFORE INSERT OR UPDATE ON dtshop.%I FOR EACH ROW EXECUTE FUNCTION dtshop.reject_future_date()',t);
 END LOOP;
END $$;

-- Storage: productos pÃºblicos; comprobantes y avatares privados.
-- No modificar storage.objects directamente: subir archivos con Storage API.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('dtshop-products','dtshop-products',true,15728640,ARRAY['image/jpeg','image/png','image/webp']),
 ('dtshop-receipts','dtshop-receipts',false,5242880,ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
 ('dtshop-avatars','dtshop-avatars',false,2097152,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY dtshop_product_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='dtshop-products' AND (SELECT dtshop_private.app_role())='partner_ops' AND split_part(name,'/',1)=(SELECT auth.uid())::text);
CREATE POLICY dtshop_product_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='dtshop-products');
CREATE POLICY dtshop_receipt_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='dtshop-receipts' AND (SELECT dtshop.is_staff()) AND split_part(name,'/',1)=(SELECT auth.uid())::text);
CREATE POLICY dtshop_receipt_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='dtshop-receipts' AND (SELECT dtshop.is_staff()));
CREATE POLICY dtshop_avatar_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='dtshop-avatars' AND split_part(name,'/',1)=(SELECT auth.uid())::text);
CREATE POLICY dtshop_avatar_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='dtshop-avatars' AND ((SELECT dtshop.is_staff()) OR split_part(name,'/',1)=(SELECT auth.uid())::text));
-- No UPDATE/DELETE policies for receipts: retain evidence. Use a new unique object path.

-- Search paths fijos, sin public; solo RPC expresamente autorizadas.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('dtshop','dtshop_private') LOOP
 EXECUTE format('ALTER FUNCTION %s SET search_path=dtshop,pg_catalog',f.sig);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA dtshop FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dtshop FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dtshop,dtshop_private FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA dtshop,dtshop_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA dtshop TO authenticated;
GRANT SELECT ON department,category,product,product_variant,product_media,launch,launch_product,store_setting,payment_method,content_block,content_video TO anon;
GRANT INSERT,UPDATE ON category,product,product_variant,product_media,launch,launch_product,store_setting,payment_method,content_block,content_video TO authenticated;
GRANT DELETE ON product_media,launch_product,content_video TO authenticated;
GRANT INSERT,UPDATE,DELETE ON saved_product,cart,cart_item TO authenticated;
GRANT UPDATE(display_name,avatar_key) ON app_user TO authenticated;
GRANT EXECUTE ON FUNCTION dtshop_private.app_role(),is_staff(),business_today(),current_app_user() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION account_balance(uuid,date),sale_customer_due(uuid,date),sale_courier_due(uuid,date),obligation_balance(uuid,date),obligation_balance_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_sale(jsonb),submit_operation(text,jsonb,uuid),review_operation(uuid,boolean,text),register_attachment(text,text,text,integer),prepare_reconciliation(uuid,date,bigint,text,uuid),review_reconciliation(uuid),set_order_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION place_order(text,text,text,text,text,text,text,text,text,smallint,jsonb) TO authenticated,service_role;
GRANT USAGE ON SCHEMA dtshop TO service_role;

INSERT INTO department (name, is_metro) VALUES
  ('Alta Verapaz', false), ('Baja Verapaz', false), ('Chimaltenango', false), ('Chiquimula', false),
  ('El Progreso', false), ('Escuintla', false), ('Guatemala', true), ('Huehuetenango', false),
  ('Izabal', false), ('Jalapa', false), ('Jutiapa', false), ('PetÃ©n', false),
  ('Quetzaltenango', false), ('QuichÃ©', false), ('Retalhuleu', false), ('SacatepÃ©quez', false),
  ('San Marcos', false), ('Santa Rosa', false), ('SololÃ¡', false), ('SuchitepÃ©quez', false),
  ('TotonicapÃ¡n', false), ('Zacapa', false);

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
  ('visalink', 'Tarjeta de crÃ©dito', 'Visalink', true, 3);

INSERT INTO content_block (hero_copy, feed_copy, instagram_url, tiktok_url) VALUES (
  'Streetwear, cultura sneaker y piezas con actitud. Encuentra tu prÃ³ximo outfit y descubre la selecciÃ³n de Dirtytask Store. TambiÃ©n te traemos la prenda que tÃº quieras.',
  'Las mejores marcas de todo el mundo en Guatemala.',
  'https://www.instagram.com/dirtytask/?hl=es',
  'https://www.tiktok.com/@dirtytask'
);


COMMIT;
