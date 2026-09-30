-- Migration 002: Customer Profile & Extended Preferences
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN home_city TEXT;
ALTER TABLE users ADD COLUMN travel_style TEXT DEFAULT 'balanced';
ALTER TABLE users ADD COLUMN budget_pref TEXT DEFAULT 'medium';
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN preferences_json TEXT;
