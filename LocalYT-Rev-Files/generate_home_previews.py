import os
import json
from collections import defaultdict

# Determine paths relative to this script's location (inside /LocalYT-Rev-Files)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.dirname(SCRIPT_DIR)
CACHE_FILE = os.path.join(SERVER_ROOT, "video_cache.json")
OUTPUT_DIR = os.path.join(SERVER_ROOT, "channel-home-previews")

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

def main():
    if not os.path.exists(CACHE_FILE):
        print(f"Error: video_cache.json not found at {CACHE_FILE}")
        return

    # Load the cache
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        video_cache = json.load(f)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Group videos by their channel (first part of the path)
    playlists = defaultdict(list)
    standalone_videos = defaultdict(list)

    for video in video_cache:
        path_parts = video["path"].split('/')
        channel = path_parts[0]
        
        # If there are more than 2 parts (e.g., Channel/Playlist/video.mp4), it's a playlist video
        if len(path_parts) > 2:
            # Group by channel AND playlist path
            playlist_path = "/".join(path_parts[:-1])
            playlists[(channel, playlist_path)].append(video)
        else:
            standalone_videos[channel].append(video)

    print(f"Found {len(set(v['path'].split('/')[0] for v in video_cache))} channels. Generating home previews...")

    channels_skipped = 0
    channels_processed = 0

    for channel, vids in standalone_videos.items():
        out_file = os.path.join(OUTPUT_DIR, f"{channel}.json")
        
        # Skip if the file already exists
        if os.path.exists(out_file):
            channels_skipped += 1
            continue

        channel_pool = []

        # 1. Add standalone videos directly
        channel_pool.extend(vids)

        # 2. Process playlists for this channel: find the FIRST video of each
        for (ch, pl_path), pl_videos in playlists.items():
            if ch == channel:
                # Sort by Oldest First (Date ASC, then A-Z)
                pl_videos.sort(key=lambda v: (
                    parse_eu_date(v.get("fileDate")),
                    v.get("displayName", "").lower()
                ))
                # Pick only the very first video of the playthrough
                channel_pool.append(pl_videos[0])

        if not channel_pool:
            continue

        # 3. Sort the combined channel pool by Newest First (Date DESC)
        channel_pool.sort(key=lambda v: parse_eu_date(v.get("fileDate")), reverse=True)

        # 4. Take 1 main video + up to 12 smaller videos
        preview_data = []
        for v in channel_pool[:13]:
            preview_data.append({
                "path": v["path"],
                "displayName": v.get("displayName", ""),
                "fileDate": v.get("fileDate", "")
            })

        # 5. Write to JSON
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(preview_data, f, indent=2, ensure_ascii=False)
            
        channels_processed += 1

    print(f"Done! Generated {channels_processed} new previews, skipped {channels_skipped} existing.")

if __name__ == "__main__":
    main()