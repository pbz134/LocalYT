import os
import sys
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
VIDEOS_DIR = ROOT_DIR / "videos"

SCAN_FOLDERS = [
    "comments",
    "livechats",
    "descriptions",
    "filedates",
    "filenames",
    "thumbnails",
    "videolengths",
    "videostats",
    "viewcounts",
    "subtitles"
]

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mp3"}

def get_video_name_mapping(videos_path):
    """
    Scans the videos folder and returns a dictionary:
    Key = Normalized filename (single spaces, no extension)
    Value = Actual raw filename (with original spacing, no extension)
    """
    name_mapping = {}
    
    if not os.path.exists(videos_path):
        print(f"Error: Videos directory not found at: {videos_path}")
        return name_mapping

    for root, _, files in os.walk(videos_path):
        for file in files:
            name, ext = os.path.splitext(file)
            if ext.lower() in VIDEO_EXTENSIONS:
                normalized_key = " ".join(name.split())
                name_mapping[normalized_key] = name
                
    return name_mapping

def fix_metadata_names(name_mapping, root_path, target_folders):
    """
    Renames metadata files to match the exact spacing of the corresponding video file.
    Skips renaming if the correctly-named file already exists.
    """
    
    # --- PRE-SCAN PHASE ---
    # Collect all metadata files first to enable a progress bar
    files_to_process = []
    
    for folder_name in target_folders:
        folder_path = os.path.join(root_path, folder_name)
        
        if not os.path.exists(folder_path):
            continue

        for root, _, files in os.walk(folder_path):
            for file in files:
                # We store the full path and filename
                files_to_process.append((root, file))

    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No metadata files found to process.")
        return

    # --- PROCESSING PHASE ---
    changes_made = 0
    skipped_duplicates = 0
    
    print(f"Scanning {total_files} metadata files...", end="\r")

    for i, (root, file) in enumerate(files_to_process, 1):
        
        # Update live counter
        status_msg = f"Processing file #{i}/{total_files}... (Fixed: {changes_made})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        name, ext = os.path.splitext(file)
        normalized_meta_name = " ".join(name.split())
        
        if normalized_meta_name in name_mapping:
            correct_video_name = name_mapping[normalized_meta_name]
            
            # Only proceed if the name actually needs changing
            if name != correct_video_name:
                old_path = os.path.join(root, file)
                
                # Construct the desired new filename
                target_filename = correct_video_name + ext
                target_path = os.path.join(root, target_filename)
                
                # CHECK: Does the correct file already exist?
                if os.path.exists(target_path):
                    # SKIP silently
                    skipped_duplicates += 1
                    continue
                
                # Safe to rename
                try:
                    os.rename(old_path, target_path)
                    changes_made += 1
                except OSError as e:
                    # Silently handle errors to maintain clean output
                    pass

    # Clear the status line
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    # Print final summary
    print(f"Metadata Renaming Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  Files Renamed:        {changes_made}")
    
    if skipped_duplicates > 0:
        print(f"  Duplicates Skipped:   {skipped_duplicates}")

if __name__ == "__main__":
    video_map = get_video_name_mapping(VIDEOS_DIR)
    if video_map:
        fix_metadata_names(video_map, ROOT_DIR, SCAN_FOLDERS)
    else:
        print("No video files found.")