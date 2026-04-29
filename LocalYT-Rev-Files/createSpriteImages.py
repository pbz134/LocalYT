import os
import sys
import subprocess
import shutil
import re
import struct
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Optional: Check if Pillow is available
try:
    from PIL import Image
    import io
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Warning: Pillow not found.")

# --- CONFIGURATION ---
# Using threads now. A good default is usually 4-8 for I/O bound tasks (Disk/FFmpeg)
MAX_WORKERS = 8 
# ---------------------

# Lock for console output so threads don't overwrite each other messily
console_lock = threading.Lock()

def safe_makedirs(path):
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except Exception:
        return False

def format_time(seconds):
    """Formats seconds to HH:MM:SS.mmm string"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"

def get_video_duration_fast(video_path):
    """Fast duration check using ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            str(video_path)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def draw_progress_bar(progress, bar_length=20):
    """Helper to create a visual progress bar string"""
    if progress >= 100:
        filled = bar_length
    else:
        filled = int(bar_length * progress // 100)
    empty = bar_length - filled
    # Bar looks like: [======>     ]
    bar = '[' + '=' * filled + '>' * min(1, empty) + ' ' * max(0, empty - min(1, empty)) + ']'
    return f"{bar} {progress:3d}%"

def update_status_line(done_count, total_files, fname, progress):
    """Thread-safe function to update the single status line"""
    with console_lock:
        bar_str = draw_progress_bar(progress)
        # Truncate long filenames to keep layout stable
        display_name = (fname[:40] + '..') if len(fname) > 40 else fname
        
        line_output = (
            f"[{done_count}/{total_files}] "
            f"{display_name:<42s} " 
            f"{bar_str}"
        )
        sys.stdout.write(line_output + "\r")
        sys.stdout.flush()

def process_single_video(args):
    """
    Worker Function.
    Now runs in a Thread, allowing it to update the UI in real-time.
    """
    root, filename, output_subdir, skip_check, total_file_count, current_index_ref = args
    
    video_name = os.path.splitext(filename)[0]
    safe_video_name = video_name
    
    vtt_filename = f"{safe_video_name}.vtt"
    sprite_filename = f"{safe_video_name}SpriteImg.jpg"
    
    vtt_file_path = os.path.join(output_subdir, vtt_filename)
    sprite_file_path = os.path.join(output_subdir, sprite_filename)

    # 1. Skip Check
    if skip_check and os.path.exists(vtt_file_path) and os.path.exists(sprite_file_path):
        # We don't print anything for skipped files as requested
        return ("skipped", filename)

    # Update UI: Starting File
    # We use a list for current_index_ref so we can pass by reference and modify it
    update_status_line(current_index_ref[0], total_file_count, filename, 0)

    safe_makedirs(output_subdir)
    video_full_path = os.path.join(root, filename)
    
    # 2. Generate Thumbnails Logic
    try:
        duration = get_video_duration_fast(video_full_path)
        if duration <= 0:
            return ("error", filename)

        thumb_width = 160 
        interval = 5
        
        num_frames = int(duration // interval)
        if num_frames > 200: 
            num_frames = 200
        if num_frames <= 0:
            return ("error", filename)

        vf_filter = f"fps=1/{interval},scale={thumb_width}:-1"
        
        cmd = [
            'ffmpeg', '-i', str(video_full_path),
            '-vf', vf_filter,
            '-vframes', str(num_frames),
            '-f', 'image2pipe',
            '-vcodec', 'bmp',
            '-'
        ]
        
        # Use Popen to stream data
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        
        images = []
        frames_data = []
        
        byte_stream = process.stdout
        
        while True:
            header = byte_stream.read(54)
            if len(header) < 54:
                break
            if header[:2] != b'BM':
                break
                
            size = struct.unpack('<I', header[2:6])[0]
            remaining = size - 54
            img_data = header + byte_stream.read(remaining)
            
            if len(img_data) < size:
                break
                
            try:
                img = Image.open(io.BytesIO(img_data))
                images.append(img)
                
                # Calculate Progress
                current_progress = int((len(images) / num_frames) * 100)
                
                frames_data.append({
                    'start': format_time((len(images) - 1) * interval), 
                    'end': format_time(min(len(images) * interval, duration))
                })
                
                # UPDATE PROGRESS BAR IN REAL-TIME
                # This works because we are using Threads, not Processes
                update_status_line(current_index_ref[0], total_file_count, filename, current_progress)
                
            except Exception:
                continue

        process.wait()
        
        if not images:
            return ("error", filename)

        # Create Sprite
        max_height = max(im.height for im in images)
        total_width = sum(im.width for im in images)
        
        sprite = Image.new('RGB', (total_width, max_height))
        x_offset = 0
            
        for i, im in enumerate(images):
            sprite.paste(im, (x_offset, 0))
            frames_data[i]['x'] = x_offset
            frames_data[i]['y'] = 0
            frames_data[i]['w'] = im.width
            frames_data[i]['h'] = im.height
            x_offset += im.width
        
        sprite.save(str(sprite_file_path), 'JPEG')

        # Write VTT
        vtt_content = "WEBVTT\n\n"
        for f in frames_data:
            vtt_content += f"{f['start']} --> {f['end']}\n{sprite_filename}#xywh={f['x']},{f['y']},{f['w']},{f['h']}\n\n"
        
        with open(str(vtt_file_path), 'w', encoding='utf-8') as f:
            f.write(vtt_content)
            
        return ("created", filename)

    except Exception as e:
        return ("error", filename)

def scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=True):
    
    safe_makedirs(thumbnails_dir)
    print("Scanning for media files...", end="\r")
    
    tasks = [] 
    
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
                tasks.append((root, filename, output_subdir))

    total_files = len(tasks)
    if total_files == 0:
        print("No video files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    
    print(f"Processing {total_files} files...")

    # Mutable counter to track global progress across threads
    done_counter = [0]

    # --- THREADING EXECUTION ---
    # Switched to ThreadPoolExecutor to allow real-time UI updates from workers
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        
        for task in tasks:
            # Prepare args: add total count and mutable reference
            full_args = task + (skip_existing, total_files, done_counter)
            future = executor.submit(process_single_video, full_args)
            futures[future] = task[1] # Store filename for reference
            
        for future in as_completed(futures):
            result = future.result() # Returns tuple (status, name)
            
            done_counter[0] += 1
            
            status, fname = result
            
            if status == "created": 
                created_count += 1
            elif status == "skipped": 
                skipped_count += 1
            elif status == "error":
                error_count += 1
                # Optionally show error state briefly? 
                # Request asked to hide skipped/errors, keeping it clean.

    # Final Summary
    print(f"\n{'':80s}") # Clear line
    print(f"Update Complete:")
    print(f"  Total Scanned:   {total_files}")
    print(f"  New Sprites:     {created_count}")
    print(f"  Skipped:         {skipped_count}")
    if error_count > 0: print(f"  Errors:          {error_count}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate Thumbnail Sprites (Optimized)')
    parser.add_argument('--overwrite', action='store_true', help='Overwrite existing files')
    parser.add_argument('--workers', type=int, default=None, help='Number of workers (default: 8)')
    args = parser.parse_args()
    
    if args.workers:
        MAX_WORKERS = args.workers
        
    skip_existing = not args.overwrite

    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    thumbnails_dir = root_dir / "thumbnails"
    
    scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=skip_existing)