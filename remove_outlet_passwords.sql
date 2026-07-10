-- Migration to remove plain-text passwords for outlets
-- Since we are migrating to Google OAuth, this column is no longer needed.

ALTER TABLE cinemas DROP COLUMN IF EXISTS login_password;
