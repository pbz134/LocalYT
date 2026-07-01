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
    print("Warning: Pillow not found. Please install it (pip install Pillow).")

# --- CONFIGURATION ---
MAX_WORKERS = 8 

# --- GRID / SAFETY SETTINGS ---
# Maximum width of the generated sprite image in pixels.
# Keeping this under 30000 ensures compatibility with almost all browsers/viewers.
MAX_SPRITE_WIDTH_PX = 25000 
# Hard limit on number of frames to generate per video (~13.5 hours at 5s interval).
MAX_FRAMES_HARD_LIMIT = 10000 
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
    Generates a Grid-based Sprite sheet for long videos.
    """
    root, filename, output_subdir, skip_check, total_file_count, current_index_ref = args
    
    video_name = os.path.splitext(filename)[0]
    
    # 1. Use original video name for output files
    safe_video_name = video_name
    
    vtt_filename = f"{safe_video_name}.vtt"
    sprite_filename = f"{safe_video_name}SpriteImg.jpg"
    
    vtt_file_path = os.path.join(output_subdir, vtt_filename)
    sprite_file_path = os.path.join(output_subdir, sprite_filename)

    # 1. Skip Check
    if skip_check and os.path.exists(vtt_file_path) and os.path.exists(sprite_file_path):
        return ("skipped", filename)

    # Update UI: Starting File
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
        
        # Apply Safety Limit
        if num_frames > MAX_FRAMES_HARD_LIMIT:
            # We don't print inside the thread to avoid messy logs, 
            # but logic truncates here to prevent memory crashes.
            num_frames = MAX_FRAMES_HARD_LIMIT
            
        if num_frames <= 0:
            return ("error", filename)

        # --- GRID LAYOUT CALCULATION ---
        # Calculate how many columns fit in our max width limit
        cols = MAX_SPRITE_WIDTH_PX // thumb_width
        
        # If we have few frames, just use a single row (or fewer cols)
        if num_frames < cols:
            cols = num_frames
            
        # Calculate rows needed
        rows = (num_frames + cols - 1) // cols
        
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
        default_height = 90 # Fallback height
        
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
                default_height = img.height # Update actual height from first image
                
                # Calculate Progress
                current_progress = int((len(images) / num_frames) * 100)
                
                # UPDATE PROGRESS BAR IN REAL-TIME
                update_status_line(current_index_ref[0], total_file_count, filename, current_progress)
                
            except Exception:
                continue

        process.wait()
        
        if not images:
            return ("error", filename)

        # --- CREATE GRID SPRITE ---
        # Final dimensions based on grid calculation
        canvas_width = cols * thumb_width
        canvas_height = rows * default_height
        
        sprite = Image.new('RGB', (canvas_width, canvas_height))
            
        for i, im in enumerate(images):
            # Determine Grid Position
            row_idx = i // cols
            col_idx = i % cols
            
            x_offset = col_idx * thumb_width
            y_offset = row_idx * im.height
            
            # Paste image into grid slot
            sprite.paste(im, (x_offset, y_offset))
            
            # Store data for VTT with correct X,Y coordinates
            frames_data.append({
                'start': format_time(i * interval), 
                'end': format_time(min((i + 1) * interval, duration)),
                'x': x_offset,
                'y': y_offset,
                'w': im.width,
                'h': im.height
            })
        
        # Save Sprite
        sprite.save(str(sprite_file_path), 'JPEG')

        # Write VTT (WebVTT Format)
        vtt_content = "WEBVTT\n\n"
        for f in frames_data:
            # Format: TIME --> TIME \n FILENAME#xywh=X,Y,W,H
            vtt_content += f"{f['start']} --> {f['end']}\n{sprite_filename}#xywh={f['x']},{f['y']},{f['w']},{f['h']}\n\n"
        
        with open(str(vtt_file_path), 'w', encoding='utf-8') as f:
            f.write(vtt_content)
            
        return ("created", filename)

    except Exception as e:
        # Optionally log error e somewhere if debugging
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
                
                # Logic to handle root level vs subdirectories
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
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        
        for task in tasks:
            # Prepare args: add total count and mutable reference
            full_args = task + (skip_existing, total_files, done_counter)
            future = executor.submit(process_single_video, full_args)
            futures[future] = task[1] # Store filename for reference
            
        for future in as_completed(futures):
            result = future.result() 
            
            done_counter[0] += 1
            
            status, fname = result
            
            if status == "created": 
                created_count += 1
            elif status == "skipped": 
                skipped_count += 1
            elif status == "error":
                error_count += 1

    # Final Summary
    print(f"\n{'':80s}") # Clear line
    print(f"Update Complete:")
    print(f"  Total Scanned:   {total_files}")
    print(f"  New Sprites:     {created_count}")
    print(f"  Skipped:         {skipped_count}")
    if error_count > 0: print(f"  Errors:          {error_count}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate Thumbnail Sprites (Grid Optimized)')
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