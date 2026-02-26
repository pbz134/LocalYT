import os

# Configuration
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEOS_DIR = os.path.join(ROOT_DIR, "videos")

SCAN_FOLDERS = [
    "descriptions",
    "filedates",
    "filenames",
    "thumbnails",
    "videolengths",
    "videostats",
    "viewcounts"
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

    print(f"Scanning videos in: {videos_path} ...")
    
    for root, _, files in os.walk(videos_path):
        for file in files:
            name, ext = os.path.splitext(file)
            if ext.lower() in VIDEO_EXTENSIONS:
                normalized_key = " ".join(name.split())
                name_mapping[normalized_key] = name
                
    print(f"Found {len(name_mapping)} reference video files.")
    return name_mapping

def fix_metadata_names(name_mapping, root_path, target_folders):
    """
    Renames metadata files to match the exact spacing of the corresponding video file.
    Skips renaming if the correctly-named file already exists.
    """
    changes_made = 0
    skipped_duplicates = 0

    for folder_name in target_folders:
        folder_path = os.path.join(root_path, folder_name)
        
        if not os.path.exists(folder_path):
            continue

        print(f"\nProcessing folder: {folder_name}")

        for root, _, files in os.walk(folder_path):
            for file in files:
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
                            # SKIP: The correct file is already there.
                            print(f"  [SKIP] Target already exists for: {file}")
                            skipped_duplicates += 1
                            continue
                        
                        # Safe to rename
                        try:
                            os.rename(old_path, target_path)
                            print(f"  [FIXED] {file}")
                            print(f"    -> {target_filename}")
                            changes_made += 1
                        except OSError as e:
                            print(f"  [ERROR] Could not rename {file}: {e}")

    print(f"\nFinished. Total files renamed: {changes_made}")
    print(f"Total duplicates skipped: {skipped_duplicates}")

if __name__ == "__main__":
    video_map = get_video_name_mapping(VIDEOS_DIR)
    if video_map:
        fix_metadata_names(video_map, ROOT_DIR, SCAN_FOLDERS)
    else:
        print("No video files found.")