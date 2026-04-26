-- Move preferences from user_preferences table to children.preferences
-- The children table already has a preferences JSONB column
DROP TABLE IF EXISTS user_preferences;
