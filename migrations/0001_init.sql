CREATE TABLE IF NOT EXISTS calendar_days (
  station TEXT NOT NULL,
  day TEXT NOT NULL,
  gas_vol REAL,
  gas_profit REAL,
  sales REAL,
  purch REAL,
  store_profit REAL,
  margin REAL,
  total_profit REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (station, day)
);

CREATE INDEX IF NOT EXISTS idx_calendar_days_station_day
  ON calendar_days (station, day);

CREATE TABLE IF NOT EXISTS view_prefs (
  role TEXT PRIMARY KEY,
  station TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT,
  station TEXT NOT NULL,
  filename TEXT,
  row_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
