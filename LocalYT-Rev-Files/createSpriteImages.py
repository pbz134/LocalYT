import os
import sys
import subprocess
import shutil
import re
import struct
import threading
import random
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Optional: Check if Pillow is available
try:
    from PIL import Image, ImageChops, ImageStat
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


def is_still_image(video_path, duration):
    """
    Determines if a video is essentially a still image by sampling four
    deterministic frames from the middle-to-late portion of the video
    (0.40, 0.60, 0.80, 0.92 of the duration) and comparing each against
    the first sample.

    The first third is skipped entirely because many still-image videos
    (lo-fi music, ASMR, ambience) have intro fades / title cards that
    would otherwise cause a false negative.

    Returns True only if EVERY sampled frame matches the first sampled
    frame to within ~2% average RGB difference (worst-case, not pairwise).
    """
    if duration < 10:
        return False

    sample_fractions = [0.40, 0.60, 0.80, 0.92]
    sample_times = [duration * f for f in sample_fractions]

    frames = []
    for t in sample_times:
        cmd = [
            'ffmpeg', '-ss', str(t), '-i', str(video_path),
            '-frames:v', '1',
            '-f', 'image2pipe',
            '-vcodec', 'bmp',
            '-'
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        header = process.stdout.read(54)
        if len(header) < 54 or header[:2] != b'BM':
            process.wait()
            return False

        size = struct.unpack('<I', header[2:6])[0]
        remaining = size - 54
        img_data = header + process.stdout.read(remaining)
        process.wait()

        try:
            img = Image.open(io.BytesIO(img_data))
            img = img.resize((32, 32)).convert('RGB')
            frames.append(img)
        except Exception:
            return False

    if len(frames) < 2:
        return False

    # Compare every subsequent frame against the first; take the WORST diff.
    # Any single divergent frame → not a still video.
    worst_diff = 0.0
    for f in frames[1:]:
        diff = ImageChops.difference(frames[0], f)
        stat = ImageStat.Stat(diff)
        avg = sum(stat.mean) / 3.0
        if avg > worst_diff:
            worst_diff = avg

    # 255 * 0.02 = 5.1 → ~98% identical
    return worst_diff < 5.1


def process_single_video(args):
    """
    Worker Function.
    Generates a Grid-based Sprite sheet for long videos.
    Outputs both the sprite (.jpg) and timeline VTT (.vtt) to /spriteimages/,
    mirroring the /videos/ folder structure.
    """
    root, filename, output_subdir, skip_check, total_file_count, current_index_ref = args

    video_name = os.path.splitext(filename)[0]

    # Sprite + VTT both share the video's bare name (no "SpriteImg" suffix).
    # Because they live in /spriteimages/<path>/ they never collide with
    # the real thumbnail <name>.jpg in /thumbnails/<path>/.
    safe_video_name = video_name

    vtt_filename = f"{safe_video_name}.vtt"
    sprite_filename = f"{safe_video_name}.jpg"

    vtt_file_path = os.path.join(output_subdir, vtt_filename)
    sprite_file_path = os.path.join(output_subdir, sprite_filename)
    nosprite_marker_path = os.path.join(output_subdir, f"{safe_video_name}.nosprite")

    # 1a. Skip Check — already-generated sprites
    if skip_check and os.path.exists(vtt_file_path) and os.path.exists(sprite_file_path):
        return ("skipped", filename)

    # 1b. Skip Check — previously classified as still image.
    # This avoids re-running 4 ffmpeg spawns per still video on every setup pass.
    if os.path.exists(nosprite_marker_path):
        return ("still", filename)

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

        # --- STILL IMAGE DETECTION ---
        with console_lock:
            sys.stdout.write(f"\nChecking for still image video: {filename}...      ")
            sys.stdout.flush()

        if is_still_image(video_full_path, duration):
            with console_lock:
                sys.stdout.write(f"\nSkipping still image video: {filename}                     \n")
                sys.stdout.flush()
            # Persist the verdict so we never re-check this file.
            try:
                open(nosprite_marker_path, 'w').close()
            except Exception:
                pass
            return ("still", filename)

        # Dynamic interval based on video duration.
        # Sub-5-minute videos use 3s (was 5s).
        if duration > 14400:      # > 240 minutes
            interval = 80
        elif duration > 7200:     # > 120 minutes
            interval = 40
        elif duration > 3600:     # > 60 minutes
            interval = 20
        elif duration > 1800:     # > 30 minutes
            interval = 10
        elif duration > 300:      # > 5 minutes
            interval = 7
        else:                     # <= 5 minutes
            interval = 3

        num_frames = int(duration // interval)

        # Apply Safety Limit
        if num_frames > MAX_FRAMES_HARD_LIMIT:
            # We don't print inside the thread to avoid messy logs,
            # but logic truncates here to prevent memory crashes.
            num_frames = MAX_FRAMES_HARD_LIMIT

        if num_frames <= 0:
            return ("error", filename)

        # Verbose output for interval and frame image quantity
        with console_lock:
            sys.stdout.write(f"\nCreating image every {interval} seconds for this video... ({num_frames} frames)\n")
            sys.stdout.flush()

        # --- GRID LAYOUT CALCULATION ---
        cols = MAX_SPRITE_WIDTH_PX // thumb_width
        if num_frames < cols:
            cols = num_frames
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

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        images = []
        frames_data = []

        byte_stream = process.stdout
        default_height = 90

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
                default_height = img.height

                current_progress = int((len(images) / num_frames) * 100)
                update_status_line(current_index_ref[0], total_file_count, filename, current_progress)
            except Exception:
                continue

        process.wait()

        if not images:
            return ("error", filename)

        # --- CREATE GRID SPRITE ---
        canvas_width = cols * thumb_width
        canvas_height = rows * default_height

        sprite = Image.new('RGB', (canvas_width, canvas_height))

        for i, im in enumerate(images):
            row_idx = i // cols
            col_idx = i % cols
            x_offset = col_idx * thumb_width
            y_offset = row_idx * im.height

            sprite.paste(im, (x_offset, y_offset))

            frames_data.append({
                'start': format_time(i * interval),
                'end': format_time(min((i + 1) * interval, duration)),
                'x': x_offset,
                'y': y_offset,
                'w': im.width,
                'h': im.height
            })

        sprite.save(str(sprite_file_path), 'JPEG')

        # Write VTT (WebVTT Format).
        # The sprite filename now matches the video's bare name — no "SpriteImg" suffix.
        vtt_content = "WEBVTT\n\n"
        for f in frames_data:
            vtt_content += f"{f['start']} --> {f['end']}\n{sprite_filename}#xywh={f['x']},{f['y']},{f['w']},{f['h']}\n\n"

        with open(str(vtt_file_path), 'w', encoding='utf-8') as f:
            f.write(vtt_content)

        return ("created", filename)

    except Exception:
        return ("error", filename)


def scan_videos_directory(videos_dir, spriteimages_dir, skip_existing=True):
    safe_makedirs(spriteimages_dir)
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

                output_subdir = os.path.join(spriteimages_dir, relative_path)
                tasks.append((root, filename, output_subdir))

    total_files = len(tasks)
    if total_files == 0:
        print("No video files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    still_count = 0
    error_count = 0

    print(f"Processing {total_files} files...")

    done_counter = [0]

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        for task in tasks:
            full_args = task + (skip_existing, total_files, done_counter)
            future = executor.submit(process_single_video, full_args)
            futures[future] = task[1]

        for future in as_completed(futures):
            result = future.result()
            done_counter[0] += 1
            status, fname = result

            if status == "created":
                created_count += 1
            elif status == "skipped":
                skipped_count += 1
            elif status == "still":
                still_count += 1
            elif status == "error":
                error_count += 1

    print(f"\n{'':80s}")
    print(f"Update Complete:")
    print(f"  Total Scanned:   {total_files}")
    print(f"  New Sprites:     {created_count}")
    print(f"  Skipped:         {skipped_count}")
    if still_count > 0: print(f"  Still Images:    {still_count}")
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
    spriteimages_dir = root_dir / "spriteimages"

    scan_videos_directory(videos_dir, spriteimages_dir, skip_existing=skip_existing)