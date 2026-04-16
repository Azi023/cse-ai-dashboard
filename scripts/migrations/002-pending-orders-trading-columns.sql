-- Migration: Add trading automation columns to pending_orders
-- Date: 2026-04-16
-- Context: Phase 2 of ATrad trading automation — adds TIF, board, stop price,
--          blotter status tracking, and OCO linked order support.
--
-- Run on VPS production DB:
--   psql -U cse_user -d cse_dashboard -f scripts/migrations/002-pending-orders-trading-columns.sql
--
-- Safe to re-run: all statements use IF NOT EXISTS or check column existence.

BEGIN;

-- Time in Force (DAY, GTC, GTD, IOC, FOK)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_orders' AND column_name = 'tif'
  ) THEN
    ALTER TABLE pending_orders ADD COLUMN tif VARCHAR(10) NOT NULL DEFAULT 'DAY';
    RAISE NOTICE 'Added column: tif';
  ELSE
    RAISE NOTICE 'Column tif already exists — skipping';
  END IF;
END $$;

-- Trading board (REGULAR, CROSSING, AON, AUCTION)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_orders' AND column_name = 'board'
  ) THEN
    ALTER TABLE pending_orders ADD COLUMN board VARCHAR(10) NOT NULL DEFAULT 'REGULAR';
    RAISE NOTICE 'Added column: board';
  ELSE
    RAISE NOTICE 'Column board already exists — skipping';
  END IF;
END $$;

-- Stop/trigger price for STOP_LIMIT orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_orders' AND column_name = 'stop_price'
  ) THEN
    ALTER TABLE pending_orders ADD COLUMN stop_price DECIMAL(12,2) DEFAULT NULL;
    RAISE NOTICE 'Added column: stop_price';
  ELSE
    RAISE NOTICE 'Column stop_price already exists — skipping';
  END IF;
END $$;

-- ATrad blotter status (synced from agent polling)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_orders' AND column_name = 'atrad_blotter_status'
  ) THEN
    ALTER TABLE pending_orders ADD COLUMN atrad_blotter_status VARCHAR(50) DEFAULT NULL;
    RAISE NOTICE 'Added column: atrad_blotter_status';
  ELSE
    RAISE NOTICE 'Column atrad_blotter_status already exists — skipping';
  END IF;
END $$;

-- Linked order ID for OCO pairs (stop-loss <-> take-profit)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_orders' AND column_name = 'linked_order_id'
  ) THEN
    ALTER TABLE pending_orders ADD COLUMN linked_order_id INTEGER DEFAULT NULL;
    RAISE NOTICE 'Added column: linked_order_id';
  ELSE
    RAISE NOTICE 'Column linked_order_id already exists — skipping';
  END IF;
END $$;

COMMIT;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pending_orders'
  AND column_name IN ('tif', 'board', 'stop_price', 'atrad_blotter_status', 'linked_order_id')
ORDER BY ordinal_position;
