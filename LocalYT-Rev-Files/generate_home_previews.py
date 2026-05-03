import os
import json
import random
import re
import html
import sys
import argparse
from collections import defaultdict

# Determine paths relative to this script's location (inside /LocalYT-Rev-Files)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.dirname(SCRIPT_DIR)
CACHE_FILE = os.path.join(SERVER_ROOT, "video_cache.json")
OUTPUT_DIR = os.path.join(SERVER_ROOT, "channel-home-previews")
META_CACHE_DIR = os.path.join(SERVER_ROOT, "channel-home-meta-cache")

def parse_eu_date(date_str):
    """Parse a DD.MM.YYYY date string into a sortable tuple."""
    if not date_str:
        return (0, 0, 0)
    try:
        parts = date_str.strip().split('.')
        if len(parts) == 3:
            return (int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        pass
    return (0, 0, 0)

def parse_description_for_html(desc_text):
    if not desc_text:
        return None
    processed = html.escape(desc_text)
    url_regex = r'(https?:\/\/[^\s<]+)'
    processed = re.sub(url_regex, r'<a href="\1" target="_blank" style="color: #3ea6ff; text-decoration: none;">\1</a>', processed)
    timestamp_regex = r'(\b\d{1,2}:\d{2}(?::\d{2})?\b)'
    processed = re.sub(timestamp_regex, r'<span style="color: #3ea6ff;">\1</span>', processed)
    return processed.replace('\n', '<br>')

def strip_extension(filename):
    return re.sub(r'\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$', '', filename, flags=re.IGNORECASE)

def generate_meta_cache(channel, all_channel_videos, playlists, force_overwrite):
    """Generates metadata cache for ALL videos and playlists in a channel."""
    os.makedirs(META_CACHE_DIR, exist_ok=True)
    
    meta_cache_file = os.path.join(META_CACHE_DIR, f"{channel}.json")
    
    # Load existing cache to avoid redundant disk reads
    if os.path.exists(meta_cache_file) and not force_overwrite:
        try:
            with open(meta_cache_file, 'r', encoding='utf-8') as f:
                meta_cache = json.load(f)
        except Exception:
            meta_cache = {}
    else:
        meta_cache = {}
    
    # Process all videos
    for v in all_channel_videos:
        path = v["path"]
        
        # Skip if we already have complete metadata
        if path in meta_cache and meta_cache[path].get("viewCount"):
            continue

        video_path_without_ext = strip_extension(path)
        filename = os.path.basename(video_path_without_ext)
        meta = meta_cache.get(path, {})
        
        # View count
        vc_path = os.path.join(SERVER_ROOT, "viewcounts", f"{video_path_without_ext}.txt")
        if not os.path.exists(vc_path):
             vc_path = os.path.join(SERVER_ROOT, "viewcounts", f"{video_path_without_ext}.txt".replace('/', os.sep))
        if os.path.exists(vc_path):
            with open(vc_path, 'r', encoding='utf-8') as f:
                meta["viewCount"] = f.read().strip() or "0"

        # Video Length
        vl_path = os.path.join(SERVER_ROOT, "videolengths", channel, f"{filename}.txt")
        if os.path.exists(vl_path):
            with open(vl_path, 'r', encoding='utf-8') as f:
                meta["videoLength"] = f.read().strip()

        # Original Filename (used as displayName)
        fn_path = os.path.join(SERVER_ROOT, "filenames", f"{video_path_without_ext}.txt")
        if not os.path.exists(fn_path):
             fn_path = os.path.join(SERVER_ROOT, "filenames", f"{video_path_without_ext}.txt".replace('/', os.sep))
        if os.path.exists(fn_path):
            with open(fn_path, 'r', encoding='utf-8') as f:
                meta["displayName"] = f.read().strip()

        # Description
        desc_path = os.path.join(SERVER_ROOT, "descriptions", channel, f"{filename}.txt")
        if os.path.exists(desc_path):
            with open(desc_path, 'r', encoding='utf-8') as f:
                meta["descriptionHtml"] = parse_description_for_html(f.read())

        meta_cache[path] = meta

    # Process all playlists
    channel_playlists = [pl_path for (ch, pl_path) in playlists.keys() if ch == channel]
    for pl_path in channel_playlists:
        # Skip if we already have complete metadata (including the newly added video names)
        if pl_path in meta_cache and meta_cache[pl_path].get("videoCount") and meta_cache[pl_path].get("thumbnail") is not None and meta_cache[pl_path].get("firstVideoName") is not None:
            continue
            
        pl_meta_path = os.path.join(SERVER_ROOT, "playlist-meta", f"{pl_path}.json")
        pl_videos = playlists.get((channel, pl_path), [])
        meta = meta_cache.get(pl_path, {})
        
        meta["videoCount"] = 0
        meta["thumbnail"] = None
        meta["firstVideoName"] = None
        meta["secondVideoName"] = None
        
        # Try loading from playlist-meta.json
        if os.path.exists(pl_meta_path):
            try:
                with open(pl_meta_path, 'r', encoding='utf-8') as f:
                    pl_data = json.load(f)
                    meta["videoCount"] = pl_data.get("videoCount", 0)
                    meta["thumbnail"] = pl_data.get("thumbnail")
            except Exception:
                pass
                
        # Fallback: If playlist-meta was missing or incomplete, fetch data directly from video_cache paths
        if not meta["thumbnail"] or meta["firstVideoName"] is None:
            if pl_videos:
                # Fallback video count
                if meta["videoCount"] == 0:
                    meta["videoCount"] = len(pl_videos)
                
                # Fallback thumbnail (Use the first video's thumbnail)
                if not meta["thumbnail"]:
                    v1_path = pl_videos[0].get("path", "")
                    if v1_path:
                        v1_path_without_ext = strip_extension(v1_path)
                        thumb_path = os.path.join(SERVER_ROOT, "thumbnails", f"{v1_path_without_ext}.jpg")
                        if not os.path.exists(thumb_path):
                            thumb_path = os.path.join(SERVER_ROOT, "thumbnails", f"{v1_path_without_ext}.jpg".replace('/', os.sep))
                        if os.path.exists(thumb_path):
                            meta["thumbnail"] = f"/thumbnails/{v1_path_without_ext}.jpg"

                # 1. First Video Name
                if meta["firstVideoName"] is None:
                    v1_path = pl_videos[0].get("path", "")
                    if v1_path:
                        v1_path_without_ext = strip_extension(v1_path)
                        fn1_path = os.path.join(SERVER_ROOT, "filenames", f"{v1_path_without_ext}.txt")
                        if not os.path.exists(fn1_path):
                            fn1_path = os.path.join(SERVER_ROOT, "filenames", f"{v1_path_without_ext}.txt".replace('/', os.sep))
                        if os.path.exists(fn1_path):
                            with open(fn1_path, 'r', encoding='utf-8') as f1:
                                meta["firstVideoName"] = f1.read().strip()
                                
                # 2. Second Video Name
                if meta["secondVideoName"] is None and len(pl_videos) > 1:
                    v2_path = pl_videos[1].get("path", "")
                    if v2_path:
                        v2_path_without_ext = strip_extension(v2_path)
                        fn2_path = os.path.join(SERVER_ROOT, "filenames", f"{v2_path_without_ext}.txt")
                        if not os.path.exists(fn2_path):
                            fn2_path = os.path.join(SERVER_ROOT, "filenames", f"{v2_path_without_ext}.txt".replace('/', os.sep))
                        if os.path.exists(fn2_path):
                            with open(fn2_path, 'r', encoding='utf-8') as f2:
                                meta["secondVideoName"] = f2.read().strip()

        meta_cache[pl_path] = meta

    # Clean up deleted videos/playlists that no longer exist
    valid_paths = set(v["path"] for v in all_channel_videos) | set(channel_playlists)
    keys_to_remove = [k for k in meta_cache.keys() if k not in valid_paths]
    for k in keys_to_remove:
        del meta_cache[k]

    with open(meta_cache_file, 'w', encoding='utf-8') as f:
        json.dump(meta_cache, f, indent=2, ensure_ascii=False)

def generate_preview_rows(channel, playlists, standalone_videos, all_channel_videos):
    """Generate preview data: 5 recent videos, up to 6 playlists, all other videos shuffled."""
    rows = []
    recent_paths = set()
    
    # 1. Pick the 5 most recent videos from the entire channel
    all_sorted = sorted(all_channel_videos, key=lambda v: parse_eu_date(v.get("fileDate")), reverse=True)
    for v in all_sorted[:5]:
        rows.append({
            "type": "video",
            "path": v["path"],
            "displayName": v.get("displayName", ""),
            "fileDate": v.get("fileDate", "")
        })
        recent_paths.add(v["path"])
        
    # 2. Pick up to 6 random playlists
    channel_playlists = [pl_path for (ch, pl_path) in playlists.keys() if ch == channel]
    playlists_to_use = random.sample(channel_playlists, min(6, len(channel_playlists)))
    
    for pl_path in playlists_to_use:
        playlist_name = pl_path.split('/')[-1]
        rows.append({
            "type": "playlist",
            "path": pl_path,
            "displayName": playlist_name
        })
        
    # 3. Up to 20 remaining videos (shuffled)
    remaining_videos = [v for v in all_channel_videos if v["path"] not in recent_paths]
    if remaining_videos:
        random.shuffle(remaining_videos)
        for v in remaining_videos[:21]:
            rows.append({
                "type": "video",
                "path": v["path"],
                "displayName": v.get("displayName", ""),
                "fileDate": v.get("fileDate", "")
            })
            
    return rows

def main():
    parser = argparse.ArgumentParser(description="Generate Home tab preview and meta cache files for LocalYT channels.")
    parser.add_argument("-c", "--channel", type=str, help="Process only a specific channel (e.g., 'TWD98').")
    parser.add_argument("-o", "--overwrite", action="store_true", help="Force overwrite existing JSON files instead of skipping them.")
    
    args = parser.parse_args()

    if not os.path.exists(CACHE_FILE):
        print(f"Error: video_cache.json not found at {CACHE_FILE}")
        return

    # Load the cache to get the absolute truth of what videos exist right now
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        video_cache = json.load(f)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(META_CACHE_DIR, exist_ok=True)

    # Group valid videos by their channel
    playlists = defaultdict(list)
    standalone_videos = defaultdict(list)
    all_channel_videos = defaultdict(list)

    for video in video_cache:
        path_parts = video["path"].split('/')
        channel = path_parts[0]
        all_channel_videos[channel].append(video)
        
        if len(path_parts) > 2:
            playlist_path = "/".join(path_parts[1:-1])
            playlists[(channel, playlist_path)].append(video)
        else:
            standalone_videos[channel].append(video)

    # Identify all channels that actually have videos
    all_channels_in_cache = set(all_channel_videos.keys())

    # Determine which channels to process based on CLI arguments
    if args.channel:
        target_channels = [args.channel]
        if args.channel not in all_channels_in_cache:
            print(f"Error: Channel '{args.channel}' not found in video_cache.json.")
            sys.exit(1)
    else:
        target_channels = list(all_channels_in_cache)

    stats = {
        "created": 0,
        "updated": 0,
        "skipped": 0
    }

    for channel in target_channels:
        out_file = os.path.join(OUTPUT_DIR, f"{channel}.json")
        
        # Skip logic for the preview file
        if os.path.exists(out_file) and not args.overwrite:
            stats["skipped"] += 1
            continue
            
        # Single-line progress bar update
        sys.stdout.write(f'\rProcessing: {channel:<50}')
        sys.stdout.flush()
        
        preview_data = generate_preview_rows(channel, playlists, standalone_videos, all_channel_videos[channel])
        
        if not preview_data:
            stats["skipped"] += 1
            continue
            
        is_update = os.path.exists(out_file)
        
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(preview_data, f, indent=2, ensure_ascii=False)
        
        # Generate the fast-loading meta cache for the frontend
        # Note: Meta cache ALWAYS runs its fallback logic if data is incomplete, 
        # but -o forces it to start entirely from scratch.
        generate_meta_cache(channel, all_channel_videos[channel], playlists, args.overwrite)
        
        if is_update:
            stats["updated"] += 1
        else:
            stats["created"] += 1

    # Clear the progress line cleanly
    sys.stdout.write('\r' + ' ' * 60 + '\r')
    sys.stdout.flush()

    print(f"Done! Created: {stats['created']}, Updated: {stats['updated']}, Skipped: {stats['skipped']}")

if __name__ == "__main__":
    main()