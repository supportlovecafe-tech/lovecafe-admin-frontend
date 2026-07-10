-- This script updates your Super Admin profile to your real Gmail address.
-- Replace 'your.real.email@gmail.com' with the actual Google account you want to use.

UPDATE profiles 
SET email = 'anirban0604@gmail.com' 
WHERE role = 'SUPER_ADMIN';
