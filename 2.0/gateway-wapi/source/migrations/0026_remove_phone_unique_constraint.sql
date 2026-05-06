-- Migration: Remove unique constraint from phone column
-- This allows multiple users to have the same phone number

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
