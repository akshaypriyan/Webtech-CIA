-- ============================================================
-- Day 3 Migration: Add is_default column to addresses table
-- ============================================================
-- Run this ONCE on existing databases that were created before Day 3.
-- schema.sql already includes this column for fresh installs.
--
-- NOTE: ALTER TABLE ... ADD COLUMN IF NOT EXISTS is supported in
-- MySQL 8.0+. For older versions, check manually before running.
-- ============================================================

USE marketplace_db;

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS is_default TINYINT(1) NOT NULL DEFAULT 0;
