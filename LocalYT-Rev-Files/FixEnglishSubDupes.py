#!/usr/bin/env python3
import os
from pathlib import Path

def main():
    # Determine the subtitles directory (one level above the script)
    script_dir = Path(__file__).parent.resolve()
    target_dir = script_dir.parent / "subtitles"

    # Folder to ignore (case-insensitive check)
    IGNORE_FOLDER = "#STT"

    if not target_dir.exists():
        print(f"Error: Subtitles directory not found at {target_dir}")
        return

    print(f"Scanning directory: {target_dir}")
    print(f"Ignoring folder: {IGNORE_FOLDER}")
    print("-" * 40)

    # Recursively find all files ending in 'en-US.vtt'
    pattern = "*en-US.vtt"
    files_found = list(target_dir.rglob(pattern))

    if not files_found:
        print("No files matching '*en-US.vtt' found.")
        return

    renamed_count = 0
    skipped_count = 0

    for file_path in files_found:
        # Check if the file is inside the ignored folder
        # Use .relative_to(target_dir) without keyword arguments for compatibility
        try:
            rel_path = file_path.relative_to(target_dir)
            if IGNORE_FOLDER in rel_path.parts:
                continue
        except ValueError:
            continue

        current_stem = file_path.stem
        
        # Ensure it actually ends with en-US before renaming
        if current_stem.endswith("en-US"):
            new_stem = current_stem[:-5] + "en" 
            new_name = new_stem + file_path.suffix
            new_path = file_path.parent / new_name

            # Check if destination file already exists
            if new_path.exists():
                print(f"[SKIP] {file_path.name} -> Target '{new_name}' already exists.")
                skipped_count += 1
            else:
                # Perform rename
                try:
                    file_path.rename(new_path)
                    print(f"[RENAME] {file_path.name} -> {new_name}")
                    renamed_count += 1
                except OSError as e:
                    print(f"[ERROR] Failed to rename {file_path.name}: {e}")

    print("-" * 40)
    print(f"Complete. Renamed: {renamed_count}, Skipped: {skipped_count}")

if __name__ == "__main__":
    main()