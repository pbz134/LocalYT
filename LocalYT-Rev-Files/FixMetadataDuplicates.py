import os
import sys
import re
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
VIDEOS_DIR = ROOT_DIR / "videos"

SCAN_FOLDERS = [
    "livechats",
    "filenames",
    "filedates",
    "descriptions",
    "comments",
    "viewcounts",
    "videostats",
    "videos",
    "videoresolutions",
    "videolengths",
    "thumbnails-small",
    "thumbnails",
    "subtitles"
]

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mp3"}

def normalize_name(name):
    """Normalizes name by removing dashes and collapsing spaces for matching."""
    name = name.replace(' - ', ' ').replace('-', ' ')
    name = " ".join(name.split())
    return name

def get_video_name_mapping(videos_path):
    name_mapping = {}
    if not os.path.exists(videos_path):
        return name_mapping

    for root, _, files in os.walk(videos_path):
        for file in files:
            name, ext = os.path.splitext(file)
            if ext.lower() in VIDEO_EXTENSIONS:
                normalized_key = normalize_name(name)
                if normalized_key not in name_mapping:
                    name_mapping[normalized_key] = name
    return name_mapping

def get_meta_base_and_suffix(file):
    """Extracts the base name and any suffixes (like _NA.de.vtt) for matching."""
    name, ext = os.path.splitext(file)
    suffix = ext
    
    # Handle double extensions like .en.vtt or .de.vtt
    if ext.lower() == '.vtt':
        stem, lang_ext = os.path.splitext(name)
        if re.match(r'^\.[a-z]{2}(-[a-z]+)?$', lang_ext, re.IGNORECASE):
            suffix = lang_ext + suffix
            name = stem
            
    # Strip _NA suffix if present
    if name.endswith('_NA'):
        suffix = '_NA' + suffix
        name = name[:-3]
        
    return name, suffix

def fix_metadata_names(name_mapping, root_path, target_folders):
    changes_made = 0
    duplicates_removed = 0
    
    # Exclude 'videos' from the renaming scan to prevent renaming the source of truth
    folders_to_scan = [f for f in target_folders if f != "videos"]
    
    files_to_process = []
    for folder_name in folders_to_scan:
        folder_path = os.path.join(root_path, folder_name)
        if not os.path.exists(folder_path):
            continue
        for root, _, files in os.walk(folder_path):
            for file in files:
                files_to_process.append((root, file))

    total_files = len(files_to_process)
    if total_files == 0:
        print("No metadata files found.")
        return

    print(f"Scanning {total_files} metadata files...")

    for i, (root, file) in enumerate(files_to_process, 1):
        status_msg = f"Processing file #{i}/{total_files}... (Fixed: {changes_made}, Dupes Removed: {duplicates_removed})"
        sys.stdout.write(status_msg.ljust(80) + "\r")
        sys.stdout.flush()

        base_name, suffix = get_meta_base_and_suffix(file)
        normalized_meta_name = normalize_name(base_name)

        if normalized_meta_name in name_mapping:
            correct_video_name = name_mapping[normalized_meta_name]
            target_filename = correct_video_name + suffix
            target_path = os.path.join(root, target_filename)
            old_path = os.path.join(root, file)

            if file != target_filename:
                if os.path.exists(target_path):
                    # Target already exists! This is the duplicate. Delete the wrong one.
                    try:
                        os.remove(old_path)
                        duplicates_removed += 1
                    except Exception:
                        pass
                else:
                    # Safe to rename
                    try:
                        os.rename(old_path, target_path)
                        changes_made += 1
                    except Exception:
                        pass

    sys.stdout.write(" " * 80 + "\r")
    sys.stdout.flush()
    print(f"Metadata Fix Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  Files Renamed:        {changes_made}")
    print(f"  Duplicates Removed:   {duplicates_removed}")

if __name__ == "__main__":
    video_map = get_video_name_mapping(VIDEOS_DIR)
    if video_map:
        fix_metadata_names(video_map, ROOT_DIR, SCAN_FOLDERS)
    else:
        print("No video files found.")