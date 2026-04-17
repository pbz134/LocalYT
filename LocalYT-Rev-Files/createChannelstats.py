import os
import json
import re

def get_parent_directory():
    """
    Returns the absolute path of the directory one level above 
    where this script is located.
    """
    # __file__ is the path to the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    return parent_dir

def parse_view_count(text):
    """
    Parses a view count string (e.g., "13,731") into an integer.
    Returns 0 if parsing fails or file is empty.
    """
    if not text:
        return 0
    # Remove commas, whitespace, and convert to integer
    try:
        clean_text = text.replace(",", "").strip()
        return int(clean_text)
    except ValueError:
        return 0

def process_channel(channel_name, base_path):
    """
    Scans viewcounts, videos, and filedates for a specific channel.
    Returns a dictionary with stats or None if no valid data found.
    """
    
    # Define paths for this specific channel
    vc_dir = os.path.join(base_path, "viewcounts", channel_name)
    vid_dir = os.path.join(base_path, "videos", channel_name)
    fd_dir = os.path.join(base_path, "filedates", channel_name)

    total_views_raw = 0
    video_count = 0
    earliest_date = None

    # We iterate based on the ViewCounts folder structure because it contains 
    # the specific .txt files we need to read for views. 
    # If viewcounts folder doesn't exist for this channel, we can't process it effectively.
    if not os.path.exists(vc_dir):
        return None

    # Valid extensions for counting videos/audio
    valid_extensions = ('.mp4', '.mp3', '.wav', '.flac', '.mkv')

    # Recursively walk through the channel's viewcounts folder
    for root, dirs, files in os.walk(vc_dir):
        for filename in files:
            if filename.endswith(".txt"):
                # 1. Get Views
                txt_path = os.path.join(root, filename)
                try:
                    with open(txt_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    views = parse_view_count(content)
                except Exception as e:
                    print(f"Error reading {txt_path}: {e}")
                    views = 0
                
                total_views_raw += views

                # 2. Check if Video/Audio exists
                # Construct the relative path from the channel root to find the media file
                rel_path = os.path.relpath(root, vc_dir)
                
                # Determine potential media filenames (same name, different extensions)
                base_filename_no_ext = os.path.splitext(filename)[0]
                
                media_exists = False
                for ext in valid_extensions:
                    # Reconstruct path: /videos/ChannelName/Subfolders/Filename.ext
                    if rel_path == ".":
                        check_path = os.path.join(vid_dir, base_filename_no_ext + ext)
                    else:
                        check_path = os.path.join(vid_dir, rel_path, base_filename_no_ext + ext)
                    
                    if os.path.exists(check_path):
                        media_exists = True
                        break
                
                if media_exists:
                    video_count += 1

                    # 3. Check FileDate
                    # Reconstruct path: /filedates/ChannelName/Subfolders/Filename.txt
                    if rel_path == ".":
                        date_path = os.path.join(fd_dir, filename)
                    else:
                        date_path = os.path.join(fd_dir, rel_path, filename)
                    
                    current_file_date = None
                    if os.path.exists(date_path):
                        try:
                            with open(date_path, 'r', encoding='utf-8') as f:
                                current_file_date = f.read().strip()
                        except:
                            pass
                    
                    # Update earliest date logic
                    if current_file_date:
                        if earliest_date is None:
                            earliest_date = current_file_date
                        else:
                            # Simple string comparison works for DD.MM.YYYY format
                            if current_file_date < earliest_date:
                                earliest_date = current_file_date

    if video_count == 0:
        return None

    # Format total views with comma separator
    total_views_formatted = "{:,}".format(total_views_raw)

    return {
        "total_video_count": video_count,
        "total_views": total_views_formatted,
        "total_views_raw": total_views_raw,
        "channel_creation_date": earliest_date or "Unknown"
    }

def main():
    # Setup Paths
    base_path = get_parent_directory()
    channels_dir = os.path.join(base_path, "videos")
    stats_dir = os.path.join(base_path, "channelstats")

    print(f"Base Path: {base_path}")
    print(f"Scanning Channels in: {channels_dir}")
    print(f"Outputting Stats to: {stats_dir}")

    # Ensure output directory exists
    if not os.path.exists(stats_dir):
        os.makedirs(stats_dir)

    processed_count = 0
    skipped_count = 0

    # Iterate over immediate subfolders in /videos (The Channels)
    if not os.path.exists(channels_dir):
        print("Error: /videos directory not found.")
        return

    for channel_name in os.listdir(channels_dir):
        channel_path = os.path.join(channels_dir, channel_name)
        
        # Only process directories (Channels)
        if not os.path.isdir(channel_path):
            continue

        # Check if JSON already exists
        json_path = os.path.join(stats_dir, f"{channel_name}.json")
        if os.path.exists(json_path):
            skipped_count += 1
            continue

        print(f"Processing channel: {channel_name} ...")
        
        stats = process_channel(channel_name, base_path)

        if stats:
            try:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(stats, f, indent=4, ensure_ascii=False)
                print(f" -> Created {channel_name}.json")
                processed_count += 1
            except IOError as e:
                print(f" -> Error writing JSON for {channel_name}: {e}")
        else:
            print(f" -> No valid video data found for {channel_name}")

    print("-" * 30)
    print(f"Done. Processed: {processed_count}, Skipped (existing): {skipped_count}")

if __name__ == "__main__":
    main()