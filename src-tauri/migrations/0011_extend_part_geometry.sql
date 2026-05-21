-- Hand-written migration to add nullable fingerprint and classification columns to part_geometry.
-- Using ALTER TABLE ADD COLUMN as per requirements (not dropping/recreating the table).

ALTER TABLE part_geometry ADD COLUMN fingerprint_hash TEXT;
ALTER TABLE part_geometry ADD COLUMN triangle_count INTEGER;
ALTER TABLE part_geometry ADD COLUMN shape_kind TEXT;
ALTER TABLE part_geometry ADD COLUMN shape_params TEXT;
ALTER TABLE part_geometry ADD COLUMN face_colors TEXT;
ALTER TABLE part_geometry ADD COLUMN mesh_blob_path TEXT;
