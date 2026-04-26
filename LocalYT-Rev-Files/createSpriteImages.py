import os
import sys
import subprocess
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Optional: Check if Pillow is available
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Warning: Pillow not found. Install with 'pip install Pillow' for image processing.")

# --- CONFIGURATION ---
# Increase this number if you have a powerful CPU (e.g., 8 or 16). 
# Keep it at 2-4 if you are using a HDD (Hard Drive) to prevent lag.
MAX_WORKERS = 4 
# ---------------------

def safe_makedirs(path):
    """Safely create directories."""
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except Exception as e:
        # print(f"Error creating directory {path}: {e}") # Suppress noise in threads
        return False

def get_video_duration(video_path):
    """Get duration of video in seconds using ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def format_time(seconds):
    """Formats seconds to HH:MM:SS.mmm string"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"

def process_single_video(args):
    """
    Worker function: Processes ONE video.
    Returns a status string for logging.
    """
    root, filename, output_subdir, skip_check = args
    
    video_name = os.path.splitext(filename)[0]
    
    # Sanitize name
    import re
    # Remove or replace all special characters except spaces, hyphens, underscores
    # This converts "Hard Trance (DjlogicMixes... Mix)!" to "Hard Trance DjlogicMixes Mix"
    safe_video_name = re.sub(r'[^\w\s-]', '', video_name).strip()
    
    vtt_filename = f"{safe_video_name}.vtt"
    sprite_filename = f"{safe_video_name}SpriteImg.jpg"
    
    vtt_file_path = os.path.join(output_subdir, vtt_filename)
    sprite_file_path = os.path.join(output_subdir, sprite_filename)

    # 1. Skip Check
    if skip_check and os.path.exists(vtt_file_path) and os.path.exists(sprite_file_path):
        return "skipped"

    # Ensure dir exists
    safe_makedirs(output_subdir)

    video_full_path = os.path.join(root, filename)
    
    # 2. Generate Thumbnails Logic
    try:
        output_sprite_path = Path(sprite_file_path)
        output_vtt_path = Path(vtt_file_path)
        
        duration = get_video_duration(video_full_path)
        if duration <= 0:
            return "error"

        thumb_width = 160 
        interval = 5
        frames = []
        
        temp_dir = output_sprite_path.parent / f"_temp_{safe_video_name}"
        safe_makedirs(temp_dir)

        num_frames = int(duration // interval)
        if num_frames > 200: num_frames = 200 

        frame_paths = []

        for i in range(num_frames):
            target_time = i * interval
            frame_filename = f"{i}.jpg"
            frame_path = temp_dir / frame_filename
            
            cmd = [
                'ffmpeg', '-ss', str(target_time), '-i', str(video_full_path),
                '-vframes', '1', '-vf', f'scale={thumb_width}:-1', '-q:v', '5', '-y',
                str(frame_path)
            ]
            
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            if frame_path.exists():
                frame_paths.append(frame_path)

        if not frame_paths:
            if temp_dir.exists(): shutil.rmtree(temp_dir)
            return "error"

        # Create Sprite
        if HAS_PIL:
            images = []
            max_height = 0
            for fp in frame_paths:
                img = Image.open(fp)
                images.append(img)
                if img.height > max_height: max_height = img.height
            
            total_width = sum(im.width for im in images)
            sprite = Image.new('RGB', (total_width, max_height))
            x_offset = 0
            
            for i, im in enumerate(images):
                sprite.paste(im, (x_offset, 0))
                start_sec = i * interval
                end_sec = min((i + 1) * interval, duration)
                frames.append({
                    'start': format_time(start_sec), 'end': format_time(end_sec),
                    'x': x_offset, 'y': 0, 'w': im.width, 'h': im.height
                })
                x_offset += im.width
            
            sprite.save(str(output_sprite_path), 'JPEG')
        else:
             if temp_dir.exists(): shutil.rmtree(temp_dir)
             return "error"

        # Write VTT
        vtt_content = "WEBVTT\n\n"
        for f in frames:
            vtt_content += f"{f['start']} --> {f['end']}\n{output_sprite_path.name}#xywh={f['x']},{f['y']},{f['w']},{f['h']}\n\n"
        
        with open(str(output_vtt_path), 'w', encoding='utf-8') as f:
            f.write(vtt_content)
            
        # Cleanup
        if temp_dir.exists(): shutil.rmtree(temp_dir)
        return "created"

    except Exception as e:
        # print(f"Error {filename}: {e}")
        return "error"

def scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=True):
    
    safe_makedirs(thumbnails_dir)
    print("Scanning for media files...", end="\r")
    
    tasks = [] # List of args for our worker function
    
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    valid_extensions = ('.mp4', '.mkv', '.webm', '.avi', '.mov')
    
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.lower().endswith(valid_extensions):
                
                relative_path = os.path.relpath(root, videos_dir)
                path_parts = relative_path.split(os.sep)
                
                if not path_parts or (path_parts[0] == '.' and len(path_parts) < 2):
                    continue
                
                output_subdir = os.path.join(thumbnails_dir, relative_path)
                
                # Pack data into tuple for the worker
                tasks.append((root, filename, output_subdir, skip_existing))

    total_files = len(tasks)
    if total_files == 0:
        print("No video files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    
    print(f"Starting Processing with {MAX_WORKERS} threads...")

    # --- MULTI-THREADED EXECUTION ---
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        futures = {executor.submit(process_single_video, task): task for task in tasks}
        
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            result = future.result()
            
            if result == "created": created_count += 1
            elif result == "skipped": skipped_count += 1
            else: error_count += 1
            
            # Update Status Line
            sys.stdout.write(
                f"Processing... {done_count}/{total_files} "
                f"(Active: {created_count}, Skip: {skipped_count})".ljust(70) + "\r"
            )
            sys.stdout.flush()

    print(f"\nThumbnail Sprite Update Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  New Sprites Created:  {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    if error_count > 0: print(f"  Errors:               {error_count}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate Thumbnail Sprites (Multi-threaded)')
    parser.add_argument('--overwrite', action='store_true', help='Overwrite existing files')
    parser.add_argument('--workers', type=int, default=4, help='Number of parallel threads (default 4)')
    args = parser.parse_args()
    
    MAX_WORKERS = args.workers
    skip_existing = not args.overwrite

    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    thumbnails_dir = root_dir / "thumbnails"
    
    scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=skip_existing)