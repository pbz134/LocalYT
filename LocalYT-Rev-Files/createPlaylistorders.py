#!/usr/bin/env python3
"""
generate_playlist_orders.py

Scans the videos directory, finds all playlists, and writes/updates the current order
to JSONL files in /playlist-orders. Preserves existing custom order for known videos
and appends new videos at the end.
"""

import os
import re
import json
import sys
from pathlib import Path

# Video file extensions (same as used in the server)
VIDEO_EXTENSIONS = ('.mp4', '.mp3', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.flac', '.wav')


def natural_sort_key(text):
    """Convert a string into a list of strings and integers for natural sorting."""
    return [int(part) if part.isdigit() else part.lower()
            for part in re.split(r'(\d+)', text)]


def get_progress_bar(current, total, width=20):
    """Generate a simple progress bar string."""
    if total == 0:
        return "[" + " " * width + "]"
    
    filled = int((current / total) * width)
    bar = "=" * filled + " " * (width - filled)
    return f"[{bar}]"


def find_media_files(directory):
    """Return a list of relative paths for all media files in the directory (recursive)."""
    media_files = []
    for root, _, files in os.walk(directory):
        for f in files:
            if f.startswith('._'):
                continue
            if f.lower().endswith(VIDEO_EXTENSIONS):
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, videos_dir).replace(os.sep, '/')
                media_files.append(rel_path)
    # Sort naturally by filename
    media_files.sort(key=lambda p: natural_sort_key(os.path.basename(p)))
    return media_files


def load_existing_order(file_path):
    """Load existing order from JSONL file. Returns list of paths in order."""
    if not os.path.exists(file_path):
        return []
    
    paths = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if 'path' in obj:
                        paths.append(obj['path'])
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass
    
    return paths


def save_order(file_path, ordered_paths):
    """Save the ordered list of paths to a JSONL file."""
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            for path in ordered_paths:
                json_line = json.dumps({"path": path}, ensure_ascii=False)
                f.write(json_line + '\n')
        return True
    except Exception:
        return False


def merge_orders(existing_paths, current_paths):
    """
    Merge existing order with current files.
    - Keep existing paths in their current order
    - Append new paths (not in existing order) at the end, sorted naturally
    - Remove paths that no longer exist (videos deleted)
    """
    existing_set = set(existing_paths)
    current_set = set(current_paths)
    
    # Keep only existing paths that still exist
    preserved_paths = [p for p in existing_paths if p in current_set]
    
    # Find new paths that weren't in the existing order
    new_paths = [p for p in current_paths if p not in existing_set]
    
    # Combine: preserved order first, then new files (naturally sorted)
    merged = preserved_paths + new_paths
    
    return merged


def generate_playlist_orders(videos_dir, output_dir, force_overwrite=False):
    """Main function: walk videos_dir, create/update order files for each playlist."""
    
    if not os.path.isdir(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    os.makedirs(output_dir, exist_ok=True)

    # Find all channels (top-level folders)
    channels = []
    try:
        for item in os.listdir(videos_dir):
            item_path = os.path.join(videos_dir, item)
            if os.path.isdir(item_path) and not item.startswith('.'):
                channels.append(item)
    except OSError as e:
        print(f"Error reading videos directory: {e}")
        return

    if not channels:
        print("No channels found.")
        return

    # Pre-scan to find all playlists for progress tracking
    sys.stdout.write("Scanning for playlists...".ljust(70) + "\r")
    sys.stdout.flush()
    
    playlist_data = []
    for channel in channels:
        channel_path = os.path.join(videos_dir, channel)
        for root, dirs, files in os.walk(channel_path):
            media_files = find_media_files(root)
            if not media_files:
                continue
            rel_playlist_path = os.path.relpath(root, channel_path).replace(os.sep, '/')
            if rel_playlist_path == '.':
                continue
            playlist_data.append({
                'channel': channel,
                'playlist_path': rel_playlist_path,
                'media_files': media_files,
                'root': root
            })
    
    total_playlists = len(playlist_data)
    
    if total_playlists == 0:
        print("No playlists found.                                        ")
        return

    # Stats tracking
    created_files = 0
    updated_files = 0
    skipped_files = 0
    error_count = 0
    added_videos_total = 0
    removed_videos_total = 0

    # Process each playlist
    for i, data in enumerate(playlist_data, 1):
        channel = data['channel']
        rel_playlist_path = data['playlist_path']
        media_files = data['media_files']

        # Build status message with progress bar
        progress_bar = get_progress_bar(i, total_playlists)
        status_msg = f"{progress_bar} {i}/{total_playlists} (Created: {created_files} | Updated: {updated_files} | Skipped: {skipped_files})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()

        try:
            # Output file path
            out_dir = os.path.join(output_dir, channel, os.path.dirname(rel_playlist_path))
            out_file = os.path.join(out_dir, os.path.basename(rel_playlist_path) + '.jsonl')

            # Load existing order if it exists
            existing_paths = load_existing_order(out_file)
            
            # Determine what to do
            if force_overwrite or not existing_paths:
                # Create new file from scratch
                ordered_paths = media_files
                created_files += 1
                added = len(media_files)
                removed = 0
            else:
                # Merge: preserve existing order, add new videos at end
                merged_paths = merge_orders(existing_paths, media_files)
                
                # Count changes
                added = len([p for p in merged_paths if p not in existing_paths])
                removed = len([p for p in existing_paths if p not in merged_paths])
                
                if merged_paths == existing_paths and len(merged_paths) == len(media_files):
                    skipped_files += 1
                    continue
                
                ordered_paths = merged_paths
                updated_files += 1
                added_videos_total += added
                removed_videos_total += removed

            # Write the order file
            if not save_order(out_file, ordered_paths):
                error_count += 1

        except Exception:
            error_count += 1

    # Clear status line and print final summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    print(f"\nPlaylist Orders Complete:")
    print(f"  Total Playlists:        {total_playlists}")
    print(f"  Newly Created:          {created_files}")
    print(f"  Updated (added/removed):{updated_files}")
    print(f"  Skipped (no changes):   {skipped_files}")
    if error_count > 0:
        print(f"  Errors:                 {error_count}")
    if added_videos_total > 0 or removed_videos_total > 0:
        print(f"\n  Changes Made:")
        if added_videos_total > 0:
            print(f"    {added_videos_total} new videos added to custom orders")
        if removed_videos_total > 0:
            print(f"    {removed_videos_total} missing videos removed from custom orders")


if __name__ == '__main__':
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    videos_dir = root_dir / 'videos'
    output_dir = root_dir / 'playlist-orders'
    
    # Optional: pass --force to overwrite all files
    force = '--force' in sys.argv or '-f' in sys.argv
    
    if force:
        print("⚠FORCE MODE: All order files will be overwritten!")
        response = input("Continue? (y/N): ")
        if response.lower() != 'y':
            print("Aborted.")
            sys.exit(0)
    
    generate_playlist_orders(videos_dir, output_dir, force_overwrite=force)