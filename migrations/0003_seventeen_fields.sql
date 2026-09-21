CREATE TABLE IF NOT EXISTS s2k_fields (
  idx INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT OR REPLACE INTO s2k_fields (idx, name) VALUES
  (1, 'Gas Inventory from S2K'),
  (2, 'Non integrated fuel'),
  (3, 'Propane exchange'),
  (4, 'Safe drop'),
  (5, 'Diesel Gallons sold'),
  (6, 'Total Gallons Sold'),
  (7, 'Gas Profit'),
  (8, 'Net Cstore Sales'),
  (9, 'Tax1 + Tax4'),
  (10, 'Lotto Sales'),
  (11, 'Scratchers Sales'),
  (12, 'Lotto Payout'),
  (13, 'Lottery Payout'),
  (14, 'Cashier Over/Short'),
  (15, 'Payouts'),
  (16, 'Fuel Deposit'),
  (17, 'Credit + Debit + EBT + Mobile + Prepaid Gift − fees');
