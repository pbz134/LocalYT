import os
import json
import random
import re
import html
import sys
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

def generate_meta_cache(channel, preview_data, existing_meta_cache):
    """Generates metadata cache. Updates existing items, only scans disk for new items."""
    meta_cache = existing_meta_cache.copy() if existing_meta_cache else {}
    os.makedirs(META_CACHE_DIR, exist_ok=True)
    
    for item in preview_data:
        # If we already have valid metadata for this video/playlist from a previous run, skip the disk scan!
        if item["path"] in meta_cache:
            if item.get("type") == "playlist":
                existing = meta_cache[item["path"]]
                if existing.get("videoCount") and existing.get("thumbnail"):
                    continue
            else:
                continue

        if item.get("type") == "video":
            path = item["path"]
            video_path_without_ext = re.sub(r'\.(mp4|mp3|mkv|avi|mov|wmv|flv|webm)$', '', path, flags=re.IGNORECASE)
            filename = os.path.basename(video_path_without_ext)
            meta = {}
            
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

            # Original Filename
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

        elif item.get("type") == "playlist":
            pl_path = item["path"]
            pl_meta_path = os.path.join(SERVER_ROOT, "playlist-meta", f"{pl_path}.json")
            meta = meta_cache.get(pl_path, {}) # Preserve if partially existing
            
            # Safely extract videoCount
            meta["videoCount"] = 0
            if os.path.exists(pl_meta_path):
                try:
                    with open(pl_meta_path, 'r', encoding='utf-8') as f:
                        pl_data = json.load(f)
                        meta["videoCount"] = pl_data.get("videoCount", 0)
                        meta["thumbnail"] = pl_data.get("thumbnail")
                except Exception:
                    pass
            else:
                meta["thumbnail"] = None
                
            meta_cache[pl_path] = meta

    out_file = os.path.join(META_CACHE_DIR, f"{channel}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(meta_cache, f, indent=2, ensure_ascii=False)

def generate_preview_rows(channel, playlists, standalone_videos, all_channel_videos):
    """Generate preview rows: 5 recent videos, up to 6 playlists, 20 random videos."""
    rows = []
    
    # 1. Pick the 5 most recent videos from the entire channel
    all_sorted = sorted(all_channel_videos, key=lambda v: parse_eu_date(v.get("fileDate")), reverse=True)
    for v in all_sorted[:5]:
        rows.append({
            "type": "video",
            "path": v["path"],
            "displayName": v.get("displayName", ""),
            "fileDate": v.get("fileDate", "")
        })
        
    # 2. Pick up to 6 random playlists
    channel_playlists = [pl_path for (ch, pl_path) in playlists.keys() if ch == channel]
    playlists_to_use = random.sample(channel_playlists, min(6, len(channel_playlists)))
    
    for pl_path in playlists_to_use:
        # Safely get the playlist name by taking everything after the last slash
        playlist_name = pl_path.split('/')[-1]
        rows.append({
            "type": "playlist",
            "path": pl_path,
            "displayName": playlist_name
        })
        
    # 3. Pick 20 entirely random videos from the channel
    if all_channel_videos:
        random_videos = random.sample(all_channel_videos, min(20, len(all_channel_videos)))
        for v in random_videos:
            rows.append({
                "type": "video",
                "path": v["path"],
                "displayName": v.get("displayName", ""),
                "fileDate": v.get("fileDate", "")
            })
            
    return rows

def main():
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

    stats = {
        "created": 0,
        "updated": 0
    }

    for channel in all_channels_in_cache:
        # Single-line progress bar update
        sys.stdout.write(f'\rProcessing: {channel:<50}')
        sys.stdout.flush()
        
        preview_data = generate_preview_rows(channel, playlists, standalone_videos, all_channel_videos[channel])
        
        if not preview_data:
            continue
            
        out_file = os.path.join(OUTPUT_DIR, f"{channel}.json")
        is_update = os.path.exists(out_file)
        
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(preview_data, f, indent=2, ensure_ascii=False)
            
        # Load existing meta cache for this channel if it exists (to avoid redundant disk reads)
        existing_meta_cache = None
        meta_cache_file = os.path.join(META_CACHE_DIR, f"{channel}.json")
        if os.path.exists(meta_cache_file):
            try:
                with open(meta_cache_file, 'r', encoding='utf-8') as f:
                    existing_meta_cache = json.load(f)
            except Exception:
                pass
        
        # Generate the fast-loading meta cache for the frontend
        generate_meta_cache(channel, preview_data, existing_meta_cache)
        
        if is_update:
            stats["updated"] += 1
        else:
            stats["created"] += 1

    # Clear the progress line cleanly
    sys.stdout.write('\r' + ' ' * 60 + '\r')
    sys.stdout.flush()

    print("Done!")

if __name__ == "__main__":
    main()