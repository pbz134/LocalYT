import os
import subprocess
import sys
import random
import shutil
import time
from pathlib import Path

# --- DYNAMIC PATH RESOLUTION ---
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent

VIDEOS_DIR = ROOT_DIR / "videos"
THUMBNAILS_DIR = ROOT_DIR / "thumbnails"
PLACEHOLDER_PATH = SCRIPT_DIR / "thumbnail-placeholder.jpg"
# -------------------------------

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.mp3'}

def get_video_duration(video_path):
    """Gets the duration of a video file using ffprobe."""
    cmd = [
        'ffprobe', '-v', 'error', 
        '-show_entries', 'format=duration', 
        '-of', 'default=noprint_wrappers=1:nokey=1', 
        str(video_path)
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        
        if result.returncode != 0:
            return 10

        duration = float(result.stdout.strip())
        return duration if duration > 1 else 10
    except (ValueError, FileNotFoundError):
        return 10

def generate_thumbnail(video_path, thumbnail_path):
    """Generates a thumbnail for a video file."""
    duration = get_video_duration(video_path)
    
    max_time = max(1, duration * 0.9)
    random_time = random.uniform(1, max_time) if max_time > 1 else 0

    cmd = [
        'ffmpeg',
        '-ss', str(random_time),
        '-i', str(video_path),
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        str(thumbnail_path)
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return True, None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False, "Error generating thumbnail"

def extract_mp3_cover(mp3_path, thumbnail_path):
    """Extracts embedded cover art from an MP3."""
    cmd = [
        'ffmpeg',
        '-i', str(mp3_path),
        '-an', '-vcodec', 'copy',
        '-y',
        str(thumbnail_path)
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return True, None
    except (subprocess.CalledProcessError, FileNotFoundError):
         return False, "No cover art found"

def collect_files(current_dir):
    """Recursively collects media files to process."""
    files_to_process = []
    
    try:
        entries = os.listdir(current_dir)
    except (PermissionError, FileNotFoundError):
        return []

    for entry in entries:
        full_path = os.path.join(current_dir, entry)
        
        # Skip the thumbnails directory itself
        try:
            if os.path.abspath(full_path) == os.path.abspath(THUMBNAILS_DIR):
                continue
        except:
            pass

        if os.path.isdir(full_path):
            files_to_process.extend(collect_files(full_path))
        
        elif os.path.isfile(full_path):
            _, ext = os.path.splitext(entry)
            if ext.lower() in VIDEO_EXTENSIONS:
                files_to_process.append((full_path, entry, ext))
                
    return files_to_process

def main():
    print("Starting thumbnail generation...", end="\r")

    # Check prerequisites
    if not os.path.exists(PLACEHOLDER_PATH):
        print(f"Error: Placeholder image not found at {PLACEHOLDER_PATH}       ")
        return

    if not os.path.exists(VIDEOS_DIR):
        print(f"Error: Videos directory not found at {VIDEOS_DIR}              ")
        return

    os.makedirs(THUMBNAILS_DIR, exist_ok=True)

    # Check for FFmpeg
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
    except FileNotFoundError:
        print("Error: ffmpeg not found. Please install FFmpeg.                 ")
        sys.exit(1)

    # Collect files
    all_files = collect_files(VIDEOS_DIR)
    total_files = len(all_files)
    
    if total_files == 0:
        print("No video or audio files found to process.                       ")
        return

    start_time = time.time()
    created_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, (full_path, entry, ext) in enumerate(all_files, 1):
        
        status_msg = f"Processing file #{i}/{total_files}... (Created: {created_count})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        base_name = os.path.splitext(entry)[0]
        thumb_filename = f"{base_name}.jpg"
        
        relative_path = os.path.relpath(os.path.dirname(full_path), VIDEOS_DIR)
        output_dir = THUMBNAILS_DIR / relative_path if relative_path != '.' else THUMBNAILS_DIR
        
        thumb_path = output_dir / thumb_filename

        # Skip if exists
        if os.path.exists(thumb_path):
            skipped_count += 1
            continue

        os.makedirs(output_dir, exist_ok=True)

        success = False
        
        if ext.lower() == '.mp3':
            success, _ = extract_mp3_cover(full_path, thumb_path)
        else:
            success, _ = generate_thumbnail(full_path, thumb_path)
        
        if not success:
            try:
                shutil.copy(PLACEHOLDER_PATH, thumb_path)
                created_count += 1
            except Exception as e:
                print(f"\nFailed to copy placeholder for {entry}: {e}")
                error_count += 1
        else:
            created_count += 1

    end_time = time.time()
    
    # Clear line and print summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    print(f"Thumbnail Generation Complete:")
    print(f"  Total Files Scanned:   {total_files}")
    print(f"  New Thumbnails Created:{created_count}")
    print(f"  Skipped (Exist):       {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:                {error_count}")
        
    print(f"  Time Taken:            {end_time - start_time:.2f}s")

if __name__ == "__main__":
    main()