import os
import sys
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
SUBTITLES_DIR = ROOT_DIR / "subtitles"

TARGET_STRING = "_NA"

def remove_na_from_subtitles(subtitles_path, target_str):
    """
    Recursively scans the subtitles folder and removes the target string from file names.
    Skips renaming if the correctly-named file already exists.
    """
    
    # --- PRE-SCAN PHASE ---
    # Collect all subtitle files first to enable a progress bar
    files_to_process = []
    
    if not os.path.exists(subtitles_path):
        print(f"Error: Subtitles directory not found at: {subtitles_path}")
        return

    for root, _, files in os.walk(subtitles_path):
        for file in files:
            files_to_process.append((root, file))

    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No subtitle files found to process.")
        return

    # --- PROCESSING PHASE ---
    changes_made = 0
    skipped_duplicates = 0
    
    print(f"Scanning {total_files} subtitle files...", end="\r")

    for i, (root, file) in enumerate(files_to_process, 1):
        
        # Update live counter
        status_msg = f"Processing file #{i}/{total_files}... (Fixed: {changes_made})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        # Only proceed if the target string is in the filename
        if target_str in file:
            old_path = os.path.join(root, file)
            
            # Construct the desired new filename by replacing the target string
            new_filename = file.replace(target_str, "")
            new_path = os.path.join(root, new_filename)
            
            # CHECK: Does the correct file already exist?
            if os.path.exists(new_path):
                # SKIP silently
                skipped_duplicates += 1
                continue
            
            # Safe to rename
            try:
                os.rename(old_path, new_path)
                changes_made += 1
            except OSError as e:
                # Silently handle errors to maintain clean output
                pass

    # Clear the status line
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    # Print final summary
    print(f"Subtitle _NA Removal Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  Files Renamed:        {changes_made}")
    
    if skipped_duplicates > 0:
        print(f"  Duplicates Skipped:   {skipped_duplicates}")

if __name__ == "__main__":
    remove_na_from_subtitles(SUBTITLES_DIR, TARGET_STRING)