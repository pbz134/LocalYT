import os
import random
import sys
from pathlib import Path

def generate_like_dislike_counts(video_name, subscriber_count):
    # Calculate likes and dislikes based on subscriber count with more randomness
    likes = int(subscriber_count * 0.04) + random.randint(-int(subscriber_count * 0.01), int(subscriber_count * 0.01))
    dislikes = int(subscriber_count * 0.001) + random.randint(-int(subscriber_count * 0.001), int(subscriber_count * 0.001))
    return f"{likes},{dislikes}"

def scan_videos_directory(videos_dir, videostats_dir, subcount_dir):
    
    # Ensure the videostats directory exists
    if not os.path.exists(videostats_dir):
        os.makedirs(videostats_dir)

    # Pre-scan to count total files for progress bar
    print("Scanning for media files...", end="\r")
    files_to_process = []
    
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    for channel_dir in os.listdir(videos_dir):
        channel_path = os.path.join(videos_dir, channel_dir)
        
        if not os.path.isdir(channel_path):
            continue
            
        subcount_file_path = os.path.join(subcount_dir, f"{channel_dir}.txt")
        if not os.path.exists(subcount_file_path):
            continue

        try:
            with open(subcount_file_path, 'r', encoding='utf-8') as subcount_file:
                subscriber_count_str = subcount_file.read().strip().replace(',', '')
                subscriber_count = int(subscriber_count_str)
        except ValueError:
            continue

        for root, _, files in os.walk(channel_path):
            for filename in files:
                if filename.endswith(('.mp4', '.mp3')):
                    files_to_process.append((channel_dir, subscriber_count, root, filename))

    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No video/audio files found (or missing subcounts).             ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, (channel_dir, subscriber_count, root, filename) in enumerate(files_to_process, 1):
        
        status_msg = f"Processing file #{i}/{total_files}... (New: {created_count})"
        sys.stdout.write(status_msg.ljust(65) + "\r")
        sys.stdout.flush()

        try:
            video_name = os.path.splitext(filename)[0]
            
            relative_path = os.path.relpath(root, os.path.join(videos_dir, channel_dir))
            
            if relative_path == '.':
                videostats_subdir = os.path.join(videostats_dir, channel_dir)
            else:
                videostats_subdir = os.path.join(videostats_dir, channel_dir, relative_path)
            
            if not os.path.exists(videostats_subdir):
                os.makedirs(videostats_subdir)

            txt_filename = f"{video_name}.txt"
            txt_file_path = os.path.join(videostats_subdir, txt_filename)
            
            # --- FIX: Skip if file already exists ---
            if os.path.exists(txt_file_path):
                skipped_count += 1
                continue
            # ---------------------------------------

            with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(generate_like_dislike_counts(video_name, subscriber_count))
                
            created_count += 1
                
        except Exception as e:
            print(f"\nError processing '{filename}': {e}")
            error_count += 1

    # Clear status line and print final summary
    sys.stdout.write(" " * 65 + "\r") 
    sys.stdout.flush()
    
    print(f"VideoStats Update Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  New Stats Created:    {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:               {error_count}")

if __name__ == "__main__":
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    videostats_dir = root_dir / "videostats"
    subcount_dir = root_dir / "subcount"
    # -------------------------------
    
    scan_videos_directory(videos_dir, videostats_dir, subcount_dir)