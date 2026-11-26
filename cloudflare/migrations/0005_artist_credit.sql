-- Editable creator credit for each wallpaper, including AI-assisted originals.
ALTER TABLE wallpapers ADD COLUMN credit TEXT NOT NULL DEFAULT '';
