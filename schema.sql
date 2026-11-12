-- VNWL D1 schema base. Existing DB may already have these tables.
CREATE TABLE IF NOT EXISTS docs_d0 (
  work_day TEXT NOT NULL,
  collection_path TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, collection_path, doc_id)
);
CREATE TABLE IF NOT EXISTS events_d0 (
  work_day TEXT NOT NULL,
  event_id TEXT NOT NULL,
  collection_path TEXT,
  data_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, event_id)
);
CREATE TABLE IF NOT EXISTS daily_counters_d0 (
  work_day TEXT NOT NULL,
  counter_key TEXT NOT NULL,
  value INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, counter_key)
);
CREATE TABLE IF NOT EXISTS active_slots_d0 (
  work_day TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  location TEXT NOT NULL,
  sub_no INTEGER NOT NULL CHECK(sub_no >= 1 AND sub_no <= 40),
  order_id TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, warehouse, location, sub_no)
);
CREATE TABLE IF NOT EXISTS active_boxes_d0 (
  work_day TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  box_code TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  ticket_no TEXT NOT NULL,
  assigned_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, warehouse, box_code)
);
CREATE TABLE IF NOT EXISTS active_hold_orders_d0 (
  work_day TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  order_key TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  ticket_no TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(work_day, warehouse, order_key)
);

-- A failed conditional update aborts the complete D1 batch.
CREATE TABLE IF NOT EXISTS pilot_guard(singleton INTEGER PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));

CREATE TABLE IF NOT EXISTS ifc_permissions (email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('staff','kiosk')));

-- Warehouse directory and per-warehouse access. WH1-WH5 are seeded for the pilot;
-- the super admin can add further codes from /admin/.
CREATE TABLE IF NOT EXISTS ifc_warehouses (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ifc_memberships (
  email TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('warehouse_admin','staff','kiosk')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(email,warehouse),
  FOREIGN KEY(warehouse) REFERENCES ifc_warehouses(code)
);
CREATE INDEX IF NOT EXISTS idx_ifc_memberships_warehouse ON ifc_memberships(warehouse,role,email);
CREATE TABLE IF NOT EXISTS ifc_customer_service (
  email TEXT NOT NULL,
  station TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(email,station),
  FOREIGN KEY(station) REFERENCES ifc_warehouses(code)
);
CREATE INDEX IF NOT EXISTS idx_ifc_customer_service_station ON ifc_customer_service(station,email);
CREATE TABLE IF NOT EXISTS ifc_support_calls (
  id TEXT PRIMARY KEY,
  station TEXT NOT NULL,
  kiosk_email TEXT NOT NULL,
  rider_name TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('waiting','accepted','held','resolved','cancelled')),
  accepted_by TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL,
  accepted_at_ms INTEGER,
  resolved_at_ms INTEGER,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(station) REFERENCES ifc_warehouses(code)
);
CREATE INDEX IF NOT EXISTS idx_ifc_support_calls_station ON ifc_support_calls(station,status,created_at_ms);
CREATE INDEX IF NOT EXISTS idx_ifc_support_calls_kiosk ON ifc_support_calls(kiosk_email,status,created_at_ms);
INSERT OR IGNORE INTO ifc_warehouses(code,name,active,created_at_ms) VALUES
  ('WH1','WH1',1,0),('WH2','WH2',1,0),('WH3','WH3',1,0),('WH4','WH4',1,0),('WH5','WH5',1,0);

-- Bring pre-warehouse pilot grants forward as WH1 grants, preserving existing sign-ins.
INSERT OR IGNORE INTO ifc_memberships(email,warehouse,role,created_at_ms,updated_at_ms)
  SELECT p.email,'WH1',p.role,0,0 FROM ifc_permissions p WHERE p.role IN ('staff','kiosk');
CREATE TABLE IF NOT EXISTS ifc_devices(
 email TEXT PRIMARY KEY, station TEXT NOT NULL REFERENCES ifc_warehouses(code),
 uid TEXT NOT NULL UNIQUE, ready INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ifc_mobile_meetings (
 call_id TEXT PRIMARY KEY REFERENCES ifc_support_calls(id),
 meeting_url TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS ifc_station_qr(station TEXT PRIMARY KEY REFERENCES ifc_warehouses(code), code TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS ifc_station_qr_aliases(code TEXT PRIMARY KEY, station TEXT NOT NULL REFERENCES ifc_warehouses(code));
CREATE INDEX IF NOT EXISTS idx_qr_call_source ON ifc_support_calls(kiosk_email,created_at_ms);
CREATE TABLE IF NOT EXISTS ifc_help_queue(call_id TEXT PRIMARY KEY,station TEXT NOT NULL,day TEXT NOT NULL,number INTEGER NOT NULL,UNIQUE(station,day,number));
CREATE TABLE IF NOT EXISTS ifc_desk_duty(email TEXT PRIMARY KEY, active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS ifc_guest_signals (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL REFERENCES ifc_support_calls(id),
 sender TEXT NOT NULL CHECK(sender IN ('rider','agent')), message_id TEXT NOT NULL,
 payload TEXT NOT NULL, UNIQUE(call_id,sender,message_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_signals_call ON ifc_guest_signals(call_id,seq);

-- Global Admin Pro is independent of warehouse assignments.
CREATE TABLE IF NOT EXISTS ifc_admins (
 email TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at_ms INTEGER NOT NULL, created_by TEXT NOT NULL
);
