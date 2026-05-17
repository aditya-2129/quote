-- Track whether a quote's title was set by the user or auto-generated, so
-- subsequent CAD attaches can safely overwrite auto names (file name, or
-- 'Untitled quote N') without trampling a name the user typed themselves.
ALTER TABLE quotes ADD COLUMN project_name_source TEXT;

-- Legacy back-fill:
--   • Empty / NULL / literal 'Untitled quote' titles came from cleanTitle()
--     with no user input — treat them as auto so a file attach can rename.
--   • Everything else was typed by a user, preserve it.
UPDATE quotes
   SET project_name_source = 'auto'
 WHERE project_name_source IS NULL
   AND (title IS NULL OR title = '' OR title = 'Untitled quote');

UPDATE quotes
   SET project_name_source = 'user'
 WHERE project_name_source IS NULL;
