import os
import random
import sys
import hashlib
from pathlib import Path

def generate_view_count(video_name, subscriber_count):
    # Introduce additional randomness by varying the percentage of subscribers that contribute to the view count
    random_factor = random.uniform(0.10, 0.78)  # Random factor between 10% and 78%
    views = int(subscriber_count * random_factor) + random.randint(-int(subscriber_count * 0.03), int(subscriber_count * 0.03))
    return "{:,}".format(views)  # Format the views with commas as thousand separators

def safe_makedirs(path):
    """Safely create directories, handling long paths and special characters"""
    try:
        if sys.platform == 'win32' and len(path) > 260:
            if not path.startswith('\\\\?\\'):
                path = '\\\\?\\' + os.path.abspath(path)
        
        os.makedirs(path, exist_ok=True)
        return True
    except Exception:
        return False

def scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir, skip_existing=True):
    
    if not os.path.exists(viewcounts_dir):
        os.makedirs(viewcounts_dir)

    print("Scanning for media files...", end="\r")
    
    files_to_process = []
    
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    # Pre-scan to count total files
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                files_to_process.append((root, filename))

    total_files = len(files_to_process)

    if total_files == 0:
        print("No video/audio files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        
        status_msg = f"Processing file #{i}/{total_files}... (Created: {created_count})"
        sys.stdout.write(status_msg.ljust(65) + "\r")
        sys.stdout.flush()

        try:
            video_name = os.path.splitext(filename)[0]
            
            relative_path = os.path.relpath(root, videos_dir)
            path_parts = relative_path.split(os.sep)
            
            if not path_parts or (path_parts[0] == '.' and len(path_parts) < 2):
                continue
                
            channel_name = path_parts[0]

            subcount_file_path = os.path.join(subcount_dir, f"{channel_name}.txt")
            if not os.path.exists(subcount_file_path):
                error_count += 1
                continue

            try:
                with open(subcount_file_path, 'r', encoding='utf-8') as subcount_file:
                    subscriber_count_str = subcount_file.read().strip().replace(',', '')
                    subscriber_count = int(subscriber_count_str)
            except Exception:
                error_count += 1
                continue

            viewcounts_subdir = os.path.join(viewcounts_dir, relative_path)
            
            if not safe_makedirs(viewcounts_subdir):
                simplified_relative = ''.join(c for c in relative_path if c.isalnum() or c in ' _-')
                viewcounts_subdir = os.path.join(viewcounts_dir, simplified_relative)
                safe_makedirs(viewcounts_subdir)

            safe_video_name = video_name
            for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
                safe_video_name = safe_video_name.replace(char, '_')
            
            txt_filename = f"{safe_video_name}.txt"
            txt_file_path = os.path.join(viewcounts_subdir, txt_filename)
            
            original_path = txt_file_path
            if sys.platform == 'win32' and len(txt_file_path) > 260:
                name_hash = hashlib.md5(video_name.encode('utf-8')).hexdigest()[:8]
                txt_filename = f"{name_hash}.txt"
                txt_file_path = os.path.join(viewcounts_subdir, txt_filename)
                
            if skip_existing and os.path.exists(txt_file_path):
                skipped_count += 1
                continue

            view_count = generate_view_count(video_name, subscriber_count)
            with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(view_count)
            created_count += 1
                
        except Exception as e:
            print(f"\nError processing '{filename}': {e}")
            error_count += 1

    sys.stdout.write(" " * 65 + "\r") 
    sys.stdout.flush()
    
    print(f"ViewCounts Update Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  New Counts Created:   {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:               {error_count}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate view counts for videos')
    parser.add_argument('--overwrite', action='store_true', 
                       help='Overwrite existing view count files')
    args = parser.parse_args()
    
    skip_existing = not args.overwrite

    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    viewcounts_dir = root_dir / "viewcounts"
    subcount_dir = root_dir / "subcount"
    # -------------------------------
    
    scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir, skip_existing=skip_existing)