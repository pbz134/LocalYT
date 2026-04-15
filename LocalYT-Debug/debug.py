import os
import json
import shutil
import subprocess
import signal

# --- PATH CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL_FOLDERS = ['videos', 'subtitles', 'thumbnails', 'videolengths', 'videostats', 'viewcounts', 'descriptions', 'filedates', 'filenames', 'comments', 'channeldesc', 'channelstats']
CHANNEL_FILES = ['channelbanner', 'channelpic', 'subcount']
MEDIA_EXTENSIONS = ('.mp4', '.mp3', '.mkv')
JSON_FILES = ['users.json', 'userPreferences.json', 'userCommentLikes.json', 'userSettings.json', 'subscriptions.json', 'watchHistory.json', 'likes.json', 'dislikes.json', 'recommendation_index.json', 'video_cache.json', 'login_attempts.json']
SESSIONS_DIR = os.path.join(BASE_DIR, 'sessions')
SERVER_SCRIPT = os.path.join(BASE_DIR, 'server.js')
USER_PROFILES_DIR = os.path.join(BASE_DIR, 'user-profiles')
TEMP_UPLOADS_DIR = os.path.join(BASE_DIR, 'temp-uploads')

def clear_screen():
    try:
        os.system('cls' if os.name == 'nt' else 'clear')
    except: pass

def format_size(size_in_bytes):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_in_bytes < 1024.0:
            return f"{size_in_bytes:.2f} {unit}"
        size_in_bytes /= 1024.0
    return f"{size_in_bytes:.2f} PB"

def format_time(seconds):
    if seconds == 0: return "0 seconds"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours}h {minutes}m {secs}s"

def parse_time_string(t_str):
    try:
        t_str = str(t_str).strip()
        try: return float(t_str)
        except ValueError: pass
        parts = t_str.split(':')
        if len(parts) == 3:
            try: return int(parts[0])*3600 + int(parts[1])*60 + float(parts[2])
            except: pass
        if len(parts) == 2:
            try: return int(parts[0])*60 + float(parts[1])
            except: pass
    except: pass
    return 0.0

def get_total_users():
    try:
        path = os.path.join(BASE_DIR, 'users.json')
        if not os.path.exists(path): return 0
        with open(path, 'r', encoding='utf-8') as f:
            return len(json.load(f))
    except: return 0

def get_total_channels():
    try:
        vid_dir = os.path.join(BASE_DIR, 'videos')
        if not os.path.exists(vid_dir): return 0
        return len([d for d in os.listdir(vid_dir) if os.path.isdir(os.path.join(vid_dir, d))])
    except: return 0

def get_total_media_files():
    count = 0
    try:
        vid_dir = os.path.join(BASE_DIR, 'videos')
        if not os.path.exists(vid_dir): return 0
        for root, _, files in os.walk(vid_dir):
            for file in files:
                if file.lower().endswith(MEDIA_EXTENSIONS):
                    count += 1
    except: pass
    return count

def get_channel_size(channel):
    total_size = 0
    for folder in CHANNEL_FOLDERS:
        try:
            target = os.path.join(BASE_DIR, folder, channel)
            if os.path.exists(target):
                for root, _, files in os.walk(target):
                    for file in files:
                        try:
                            total_size += os.path.getsize(os.path.join(root, file))
                        except: pass
        except: pass
    return total_size

def get_channel_video_count(channel):
    count = 0
    try:
        vid_dir = os.path.join(BASE_DIR, 'videos', channel)
        if not os.path.exists(vid_dir): return 0
        for root, _, files in os.walk(vid_dir):
            for file in files:
                if file.lower().endswith(MEDIA_EXTENSIONS):
                    count += 1
    except: pass
    return count

def get_channel_length(channel):
    total_seconds = 0.0
    try:
        len_dir = os.path.join(BASE_DIR, 'videolengths', channel)
        if not os.path.exists(len_dir): return 0.0
        for root, _, files in os.walk(len_dir):
            for file in files:
                if file.endswith('.txt'):
                    f_path = os.path.join(root, file)
                    try:
                        with open(f_path, 'r', encoding='utf-8') as f:
                            total_seconds += parse_time_string(f.read())
                    except: pass
    except: pass
    return total_seconds

# --- JSON UPDATE HELPERS FOR CHANNEL RENAME ---

def update_json_video_paths(json_file, old_name, new_name):
    """Update video paths in likes/dislikes JSON files"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        old_prefix = f"{old_name}/"
        new_prefix = f"{new_name}/"
        modified = False
        
        for user_id, videos in data.items():
            if isinstance(videos, dict):
                new_videos = {}
                for video_path, value in videos.items():
                    if video_path.startswith(old_prefix):
                        new_path = new_prefix + video_path[len(old_prefix):]
                        new_videos[new_path] = value
                        modified = True
                    else:
                        new_videos[video_path] = value
                data[user_id] = new_videos
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Updated paths in {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def update_json_playlist_shortlinks(json_file, old_name, new_name):
    """
    Update/verify playlist names in playlist_shortlinks.json when channel is renamed.
    
    Since playlist_shortlinks.json stores playlist names WITHOUT the channel prefix
    (e.g., "Super Mario Galaxy 2" instead of "Channel/Super Mario Galaxy 2"),
    we scan the videos directory to find which playlists belong to this channel,
    then verify those entries are still valid.
    """
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified = False
        
        # Get all playlists that exist under the NEW channel's folder structure
        # (We check NEW name because folders were already renamed before this function is called)
        channel_videos_dir = os.path.join(BASE_DIR, 'videos', new_name)
        playlists_in_channel = set()
        
        if os.path.exists(channel_videos_dir):
            for item in os.listdir(channel_videos_dir):
                item_path = os.path.join(channel_videos_dir, item)
                # Check if it's a directory (could be a playlist folder)
                if os.path.isdir(item_path):
                    # Verify it contains video files (it's actually a playlist, not just a folder)
                    has_videos = any(
                        f.lower().endswith(MEDIA_EXTENSIONS) 
                        for f in os.listdir(item_path) 
                        if os.path.isfile(os.path.join(item_path, f))
                    )
                    if has_videos:
                        playlists_in_channel.add(item)
                    
                    # Also check for nested playlists: Channel/Playlist/Subplaylist/
                    for subitem in os.listdir(item_path):
                        subitem_path = os.path.join(item_path, subitem)
                        if os.path.isdir(subitem_path):
                            has_sub_videos = any(
                                f.lower().endswith(MEDIA_EXTENSIONS) 
                                for f in os.listdir(subitem_path) 
                                if os.path.isfile(os.path.join(subitem_path, f))
                            )
                            if has_sub_videos:
                                # Store as "Playlist/Subplaylist" for nested ones
                                playlists_in_channel.add(f"{item}/{subitem}")
        
        # Verify matching entries exist in playlist_shortlinks.json
        verified_count = 0
        for playlist_name, code in data.items():
            if playlist_name in playlists_in_channel:
                print(f"  [+] Verified playlist short link: '{playlist_name}' -> {code}")
                verified_count += 1
                modified = True
        
        if modified:
            print(f"  [+] Verified {verified_count} playlist(s) in {json_file}")
        else:
            print(f"  [*] No playlist entries found for this channel in {json_file}")
            
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def update_json_channel_keys(json_file, old_name, new_name):
    """Update channel keys in subscriptions JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified = False
        
        for user_id, channels in data.items():
            if isinstance(channels, dict):
                if old_name in channels:
                    channels[new_name] = channels.pop(old_name)
                    modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Updated channel keys in {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def update_json_history(json_file, old_name, new_name):
    """Update video paths in watchHistory JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        old_prefix = f"{old_name}/"
        new_prefix = f"{new_name}/"
        modified = False
        
        for user_id, history in data.items():
            if isinstance(history, list):
                for idx, item in enumerate(history):
                    if isinstance(item, dict) and 'video' in item:
                        if item['video'].startswith(old_prefix):
                            history[idx]['video'] = new_prefix + item['video'][len(old_prefix):]
                            modified = True
                    elif isinstance(item, str):
                        if item.startswith(old_prefix):
                            history[idx] = new_prefix + item[len(old_prefix):]
                            modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Updated paths in {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def update_json_shortlinks(json_file, old_name, new_name):
    """Update video paths in shortlinks JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        old_prefix = f"{old_name}/"
        new_prefix = f"{new_name}/"
        modified = False
        
        new_data = {}
        for video_path, code in data.items():
            if video_path.startswith(old_prefix):
                new_path = new_prefix + video_path[len(old_prefix):]
                new_data[new_path] = code
                modified = True
            else:
                new_data[video_path] = code
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, indent=2)
            print(f"  [+] Updated paths in {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

# --- JSON UPDATE HELPERS FOR CHANNEL DELETE ---

def remove_json_video_paths(json_file, channel_name):
    """Remove video paths for a channel from likes/dislikes JSON files"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        prefix = f"{channel_name}/"
        modified = False
        
        for user_id, videos in data.items():
            if isinstance(videos, dict):
                new_videos = {k: v for k, v in videos.items() if not k.startswith(prefix)}
                if len(new_videos) != len(videos):
                    data[user_id] = new_videos
                    modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Removed channel entries from {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def remove_json_channel_keys(json_file, channel_name):
    """Remove channel key from subscriptions JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified = False
        
        for user_id, channels in data.items():
            if isinstance(channels, dict) and channel_name in channels:
                del channels[channel_name]
                modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Removed channel from {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def remove_json_history(json_file, channel_name):
    """Remove video paths for a channel from watchHistory JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        prefix = f"{channel_name}/"
        modified = False
        
        for user_id, history in data.items():
            if isinstance(history, list):
                original_len = len(history)
                new_history = []
                for item in history:
                    remove = False
                    if isinstance(item, dict) and 'video' in item:
                        if item['video'].startswith(prefix):
                            remove = True
                    elif isinstance(item, str):
                        if item.startswith(prefix):
                            remove = True
                    if not remove:
                        new_history.append(item)
                if len(new_history) != original_len:
                    data[user_id] = new_history
                    modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Removed channel entries from {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def remove_json_shortlinks(json_file, channel_name):
    """Remove video paths for a channel from shortlinks JSON file"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        prefix = f"{channel_name}/"
        new_data = {k: v for k, v in data.items() if not k.startswith(prefix)}
        
        if len(new_data) != len(data):
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, indent=2)
            print(f"  [+] Removed channel entries from {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def remove_json_playlist_shortlinks(json_file, channel_name):
    """
    Remove playlists for a deleted channel from playlist_shortlinks.json.
    
    IMPORTANT: This should be called BEFORE the actual folder deletion,
    so we can still scan the directory to find playlist names.
    
    Scans the channel's video directory to find all playlist names,
    then removes those entries from playlist_shortlinks.json.
    """
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Collect all playlist names that exist under this channel
        channel_videos_dir = os.path.join(BASE_DIR, 'videos', channel_name)
        playlists_to_remove = set()
        
        # Try to read from disk (folder should still exist if called before shutil.rmtree)
        if os.path.exists(channel_videos_dir):
            for item in os.listdir(channel_videos_dir):
                item_path = os.path.join(channel_videos_dir, item)
                if os.path.isdir(item_path):
                    has_videos = any(
                        f.lower().endswith(MEDIA_EXTENSIONS) 
                        for f in os.listdir(item_path) 
                        if os.path.isfile(os.path.join(item_path, f))
                    )
                    if has_videos:
                        playlists_to_remove.add(item)
                    
                    # Check for nested playlists
                    for subitem in os.listdir(item_path):
                        subitem_path = os.path.join(item_path, subitem)
                        if os.path.isdir(subitem_path):
                            has_sub_videos = any(
                                f.lower().endswith(MEDIA_EXTENSIONS) 
                                for f in os.listdir(subitem_path) 
                                if os.path.isfile(os.path.join(subitem_path, f))
                            )
                            if has_sub_videos:
                                playlists_to_remove.add(f"{item}/{subitem}")
        
        # If we couldn't read from disk (already deleted), warn user
        if not playlists_to_remove:
            print(f"  [*] Could not determine playlists for channel '{channel_name}'")
            print(f"      (Folder may already be deleted - call this function BEFORE folder deletion)")
            print(f"      Manual cleanup of {json_file} may be required for orphaned entries")
            return
        
        # Remove matching entries
        new_data = {
            k: v for k, v in data.items() 
            if k not in playlists_to_remove
        }
        
        removed_count = len(data) - len(new_data)
        if removed_count > 0:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, indent=2)
            print(f"  [+] Removed {removed_count} playlist(s) from {json_file}")
        else:
            print(f"  [*] No matching playlists found in {json_file}")
            
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def remove_channel_from_cache(json_file, channel_name):
    """Remove channel entries from cache JSON files"""
    try:
        j_path = os.path.join(BASE_DIR, json_file)
        if not os.path.exists(j_path):
            return
        
        with open(j_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified = False
        prefix = f"{channel_name}/"
        
        if isinstance(data, dict):
            # Check if channel is a top-level key
            if channel_name in data:
                del data[channel_name]
                modified = True
            # Also check for paths with channel prefix
            new_data = {k: v for k, v in data.items() if not k.startswith(prefix)}
            if len(new_data) != len(data):
                data = new_data
                modified = True
        elif isinstance(data, list):
            # If it's a list, filter out entries with the channel prefix
            new_data = []
            for item in data:
                if isinstance(item, dict):
                    path_fields = ['path', 'video', 'videoPath']
                    remove = False
                    for field in path_fields:
                        if field in item and isinstance(item[field], str) and item[field].startswith(prefix):
                            remove = True
                            break
                    if not remove:
                        new_data.append(item)
                elif isinstance(item, str):
                    if not item.startswith(prefix):
                        new_data.append(item)
                else:
                    new_data.append(item)
            if len(new_data) != len(data):
                data = new_data
                modified = True
        
        if modified:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"  [+] Removed channel from {json_file}")
    except Exception as e:
        print(f"  [-] Error updating {json_file}: {e}")

def rename_channel(old_name, new_name):
    print(f"\n[*] Attempting to rename '{old_name}' to '{new_name}'...")
    
    # Rename folders
    for folder in CHANNEL_FOLDERS:
        try:
            old_path = os.path.join(BASE_DIR, folder, old_name)
            new_path = os.path.join(BASE_DIR, folder, new_name)
            if os.path.exists(old_path):
                os.rename(old_path, new_path)
                print(f"  [+] Renamed folder: {folder}/{old_name}")
        except: pass

    # Rename channel files
    for folder in CHANNEL_FILES:
        try:
            dir_path = os.path.join(BASE_DIR, folder)
            if os.path.exists(dir_path):
                for file in os.listdir(dir_path):
                    name, ext = os.path.splitext(file)
                    if name == old_name:
                        old_f_path = os.path.join(dir_path, file)
                        new_f_path = os.path.join(dir_path, new_name + ext)
                        os.rename(old_f_path, new_f_path)
                        print(f"  [+] Renamed file: {folder}/{file}")
        except: pass

    old_path_str = f"{old_name}/"
    new_path_str = f"{new_name}/"
    
    # Update cache files (string replacement for paths)
    for json_file in ['video_cache.json', 'recommendation_index.json', 'video_cache.json']:
        try:
            j_path = os.path.join(BASE_DIR, json_file)
            if os.path.exists(j_path):
                with open(j_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                content = content.replace(old_path_str, new_path_str)
                if json_file == 'recommendation_index.json':
                    try:
                        data = json.loads(content)
                        if old_name in data:
                            data[new_name] = data.pop(old_name)
                        content = json.dumps(data, indent=2)
                    except: pass
                with open(j_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"  [+] Updated paths in {json_file}")
        except: pass

    # Update user data JSON files
    update_json_video_paths('likes.json', old_name, new_name)
    update_json_video_paths('dislikes.json', old_name, new_name)
    update_json_channel_keys('subscriptions.json', old_name, new_name)
    update_json_history('watchHistory.json', old_name, new_name)
    update_json_shortlinks('shortlinks.json', old_name, new_name)
    
    # UPDATE: Verify playlist short links for renamed channel
    update_json_playlist_shortlinks('playlist_shortlinks.json', old_name, new_name)
    
    print("[*] Channel rename complete!\n")

def delete_channel(channel_name):
    print(f"\n[*] Attempting to delete channel '{channel_name}'...")
    
    # IMPORTANT: Remove playlist short links BEFORE deleting folders,
    # so we can still scan the directory structure
    remove_json_playlist_shortlinks('playlist_shortlinks.json', channel_name)
    
    # Delete folders
    for folder in CHANNEL_FOLDERS:
        try:
            folder_path = os.path.join(BASE_DIR, folder, channel_name)
            if os.path.exists(folder_path):
                shutil.rmtree(folder_path)
                print(f"  [+] Deleted folder: {folder}/{channel_name}")
        except Exception as e:
            print(f"  [-] Error deleting {folder}/{channel_name}: {e}")
    
    # Delete channel files
    for folder in CHANNEL_FILES:
        try:
            dir_path = os.path.join(BASE_DIR, folder)
            if os.path.exists(dir_path):
                for file in os.listdir(dir_path):
                    name, ext = os.path.splitext(file)
                    if name == channel_name:
                        file_path = os.path.join(dir_path, file)
                        os.remove(file_path)
                        print(f"  [+] Deleted file: {folder}/{file}")
        except Exception as e:
            print(f"  [-] Error deleting from {folder}: {e}")
    
    # Remove from cache files
    remove_channel_from_cache('video_cache.json', channel_name)
    remove_channel_from_cache('recommendation_index.json', channel_name)
    
    # Remove from user data JSON files
    remove_json_video_paths('likes.json', channel_name)
    remove_json_video_paths('dislikes.json', channel_name)
    remove_json_channel_keys('subscriptions.json', channel_name)
    remove_json_history('watchHistory.json', channel_name)
    remove_json_shortlinks('shortlinks.json', channel_name)
    
    print("[*] Channel deletion complete!\n")

def clear_database():
    print("\nWARNING: CLEARING ALL DATABASE FILES")
    try:
        confirm = input("Type 'LOCALYTFULLDELETE' to confirm: ")
    except: return
    if confirm != 'LOCALYTFULLDELETE':
        print("Cancelled.\n")
        return

    for folder in CHANNEL_FOLDERS + CHANNEL_FILES:
        try:
            dir_path = os.path.join(BASE_DIR, folder)
            if os.path.exists(dir_path):
                for item in os.listdir(dir_path):
                    item_path = os.path.join(dir_path, item)
                    try:
                        if os.path.isdir(item_path): shutil.rmtree(item_path)
                        else: os.remove(item_path)
                    except: pass
                print(f"  [+] Cleared folder: {folder}")
        except: pass

    # Clear user-profiles directory
    if os.path.exists(USER_PROFILES_DIR):
        try:
            for item in os.listdir(USER_PROFILES_DIR):
                item_path = os.path.join(USER_PROFILES_DIR, item)
                try:
                    if os.path.isdir(item_path): shutil.rmtree(item_path)
                    else: os.remove(item_path)
                except: pass
            print(f"  [+] Cleared folder: user-profiles")
        except: pass

    # Clear temp-uploads directory
    if os.path.exists(TEMP_UPLOADS_DIR):
        try:
            for item in os.listdir(TEMP_UPLOADS_DIR):
                item_path = os.path.join(TEMP_UPLOADS_DIR, item)
                try:
                    if os.path.isdir(item_path): shutil.rmtree(item_path)
                    else: os.remove(item_path)
                except: pass
            print(f"  [+] Cleared folder: temp-uploads")
        except: pass

    for j_file in JSON_FILES:
        try:
            j_path = os.path.join(BASE_DIR, j_file)
            with open(j_path, 'w', encoding='utf-8') as f:
                if j_file in ['users.json', 'userPreferences.json', 'userCommentLikes.json', 'userSettings.json', 'subscriptions.json', 'recommendation_index.json']:
                    json.dump({}, f)
                elif j_file in ['shortlinks.json', 'playlist_shortlinks.json']:
                    json.dump({}, f)
                else:
                    json.dump([], f)
            print(f"  [+] Emptied: {j_file}")
        except: pass
    
    # Explicitly clear playlist_shortlinks.json in case it's not in JSON_FILES list
    try:
        pl_path = os.path.join(BASE_DIR, 'playlist_shortlinks.json')
        if os.path.exists(pl_path):
            with open(pl_path, 'w', encoding='utf-8') as f:
                json.dump({}, f)
            print(f"  [+] Emptied: playlist_shortlinks.json")
    except: pass
    
    print("\n[*] Database cleared successfully!\n")

def manage_accounts():
    users_path = os.path.join(BASE_DIR, 'users.json')
    if not os.path.exists(users_path):
        print("\nNo users.json found.\n"); return
    
    users = {}
    try:
        with open(users_path, 'r', encoding='utf-8') as f:
            users = json.load(f)
    except: pass
    
    if not users:
        print("\nNo accounts found.\n"); return

    print("\n--- REGISTERED ACCOUNTS ---")
    for idx, username in enumerate(users.keys(), 1):
        print(f"{idx}. {username}")
    print("---------------------------")

    try:
        choice = input("\nEnter username to delete (or 'c' to cancel): ")
    except: return
    
    if choice.lower() == 'c': return
    
    if choice in users:
        user_id = users[choice]['id']
        print(f"[*] Deleting user '{choice}' (ID: {user_id})...")
        
        try:
            del users[choice]
            with open(users_path, 'w', encoding='utf-8') as f:
                json.dump(users, f, indent=2)
        except: pass
        
        clean_files = {
            'userPreferences.json': False,
            'userCommentLikes.json': False,
            'userSettings.json': False,
            'watchHistory.json': False,
            'likes.json': False,
            'dislikes.json': False,
            'subscriptions.json': False
        }
        
        for j_file, is_array in clean_files.items():
            try:
                j_path = os.path.join(BASE_DIR, j_file)
                if os.path.exists(j_path):
                    with open(j_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if user_id in data:
                        del data[user_id]
                        with open(j_path, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2)
                        print(f"  [+] Cleaned {user_id} from {j_file}")
            except: pass
        
        # Delete user's profile image if it exists
        profile_extensions = ['.jpg', '.png', '.webp']
        for ext in profile_extensions:
            profile_pic_path = os.path.join(USER_PROFILES_DIR, f"{user_id}{ext}")
            if os.path.exists(profile_pic_path):
                try:
                    os.remove(profile_pic_path)
                    print(f"  [+] Deleted profile image: {user_id}{ext}")
                    break  # Only one profile image should exist, stop checking
                except Exception as e:
                    print(f"  [-] Error deleting profile image: {e}")
        
        print("[*] Account deleted.\n")
    else:
        print("[-] Username not found.\n")

def generate_bcrypt_hash(password):
    """Generate bcrypt hash using Node.js (bcrypt already installed for server)"""
    try:
        result = subprocess.run(
            ['node', '-e', 'const bcrypt = require("bcrypt"); bcrypt.hash(process.argv[1], 10).then(h => console.log(h));', password],
            capture_output=True,
            text=True,
            cwd=BASE_DIR,
            timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        if result.stderr:
            print(f"  [-] Node.js error: {result.stderr.strip()}")
        return None
    except subprocess.TimeoutExpired:
        print("  [-] Hash generation timed out")
        return None
    except FileNotFoundError:
        print("  [-] Node.js not found. Please ensure Node.js is installed and in PATH.")
        return None
    except Exception as e:
        print(f"  [-] Error generating hash: {e}")
        return None

def reset_user_password():
    """Reset password for a user and automatically save to users.json"""
    users_path = os.path.join(BASE_DIR, 'users.json')
    if not os.path.exists(users_path):
        print("\n[-] No users.json found.\n")
        return
    
    users = {}
    try:
        with open(users_path, 'r', encoding='utf-8') as f:
            users = json.load(f)
    except:
        print("\n[-] Error reading users.json.\n")
        return
    
    if not users:
        print("\n[-] No accounts found.\n")
        return
    
    print("\n--- REGISTERED ACCOUNTS ---")
    for idx, username in enumerate(users.keys(), 1):
        print(f"{idx}. {username}")
    print("---------------------------")
    
    try:
        choice = input("\nEnter username to reset password (or 'c' to cancel): ")
    except:
        return
    
    if choice.lower() == 'c':
        return
    
    if choice not in users:
        print("[-] Username not found.\n")
        return
    
    try:
        # Get password without echo if possible
        import getpass
        password = getpass.getpass("Enter new password: ")
        if not password:
            print("[-] Password cannot be empty.\n")
            return
        
        confirm = getpass.getpass("Confirm new password: ")
        if password != confirm:
            print("[-] Passwords do not match.\n")
            return
    except ImportError:
        password = input("Enter new password: ")
        if not password:
            print("[-] Password cannot be empty.\n")
            return
        confirm = input("Confirm new password: ")
        if password != confirm:
            print("[-] Passwords do not match.\n")
            return
    except:
        return
    
    print("\n[*] Generating password hash...")
    hash_value = generate_bcrypt_hash(password)
    
    if hash_value:
        users[choice]['password'] = hash_value
        try:
            with open(users_path, 'w', encoding='utf-8') as f:
                json.dump(users, f, indent=2)
            print(f"[+] Password for '{choice}' has been reset successfully!\n")
        except Exception as e:
            print(f"[-] Error saving users.json: {e}\n")
    else:
        print("[-] Failed to generate password hash.\n")

def reinitiate_cache_scan():
    """Delete cache files so server rebuilds them on next startup"""
    files_to_delete = [
        os.path.join(BASE_DIR, 'recommendation_index.json'),
        os.path.join(BASE_DIR, 'video_cache.json'),
        os.path.join(BASE_DIR, 'shortlinks.json'),
        # ADD: Also delete playlist_shortlinks.json so it regenerates on startup
        os.path.join(BASE_DIR, 'playlist_shortlinks.json')
    ]
    
    print("\n[*] Re-initiating cache scan...")
    for file_path in files_to_delete:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"  [+] Deleted: {os.path.basename(file_path)}")
            except Exception as e:
                print(f"  [-] Error deleting {os.path.basename(file_path)}: {e}")
        else:
            print(f"  [*] Not found (will be created): {os.path.basename(file_path)}")
    
    print("\n[*] Cache files cleared. Server will rebuild them on next startup/restart.\n")

def find_server_pid():
    """Find the PID of the running server.js process"""
    try:
        if os.name == 'nt':
            # Windows: use wmic or tasklist
            # Added encoding='utf-8' to prevent UnicodeDecodeError on Windows
            result = subprocess.run(
                ['wmic', 'process', 'where', "commandline like '%server.js%'", 'get', 'processid', '/format:csv'],
                capture_output=True, text=True, timeout=10, encoding='utf-8', errors='ignore'
            )
            for line in result.stdout.split('\n'):
                line = line.strip()
                if line and line.isdigit():
                    return int(line)
        else:
            # Unix: use pgrep
            result = subprocess.run(
                ['pgrep', '-f', 'node.*server.js'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                return [int(pid) for pid in pids if pid.isdigit()]
    except:
        pass
    return None

def is_server_running():
    """Check if server is running"""
    pid = find_server_pid()
    if pid:
        return True
    # Alternative check: try to connect to the port
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('localhost', 3000))
        sock.close()
        return result == 0
    except:
        return False

def logout_all_users():
    """Delete all session files to log out all users"""
    if not os.path.exists(SESSIONS_DIR):
        print("\n[*] No sessions directory found.\n")
        return
    
    session_files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith('.session')]
    
    if not session_files:
        print("\n[*] No active sessions found.\n")
        return
    
    print(f"\n[*] Found {len(session_files)} active session(s)")
    print("[*] Logging out all users...")
    
    count = 0
    errors = 0
    for file in session_files:
        try:
            os.remove(os.path.join(SESSIONS_DIR, file))
            count += 1
        except Exception as e:
            errors += 1
            print(f"  [-] Error deleting {file}: {e}")
    
    print(f"  [+] Deleted {count} session file(s)")
    if errors:
        print(f"  [-] Failed to delete {errors} file(s)")
    
    print("[*] All users have been logged out.\n")

def reboot_server():
    print("\n[*] Checking server status...")
    
    running = is_server_running()
    
    if not running:
        print("  [*] Server does not appear to be running.")
        
        if not os.path.exists(SERVER_SCRIPT):
            print("  [-] server.js not found!")
            print()
            return
        
        try:
            start_choice = input("  Start the server now? (y/n): ")
        except:
            print()
            return
        
        if start_choice.lower() != 'y':
            print("  [*] Cancelled.\n")
            return
    else:
        print("  [+] Server is running")
    
    # Stop the server
    print("  [*] Stopping server...")
    stopped = False
    
    try:
        if os.name == 'nt':
            # Windows: kill all node processes running server.js
            subprocess.run(
                ['wmic', 'process', 'where', "commandline like '%server.js%'", 'call', 'terminate'],
                capture_output=True, timeout=10
            )
            stopped = True
        else:
            # Unix: use pkill
            result = subprocess.run(['pkill', '-f', 'node.*server.js'], capture_output=True, timeout=10)
            stopped = result.returncode == 0 or result.returncode == 1  # 1 means no process found
    except Exception as e:
        print(f"  [-] Error stopping server: {e}")
    
    if stopped:
        print("  [+] Server stop command sent")
        # Wait a moment for the process to terminate
        import time
        time.sleep(1)
    else:
        print("  [!] Could not verify server was stopped")
    
    # Start the server using #Launch-Server.bat
    launch_bat = os.path.join(BASE_DIR, '#Launch-Server.bat')
    
    if not os.path.exists(launch_bat):
        print("  [-] #Launch-Server.bat not found in root directory!")
        print()
        return
    
    print("  [*] Starting server via #Launch-Server.bat...")
    try:
        if os.name == 'nt':
            # Windows: open a new cmd window, execute the bat file, and keep the window open (/K)
            subprocess.Popen(
                f'cmd /K "cd /D "{BASE_DIR}" && "#Launch-Server.bat""',
                shell=True
            )
        else:
            # Unix: run in background (assuming bash can execute .bat via wine or similar isn't standard, 
            # but providing a best-effort fallback using cmd.exe if available)
            subprocess.Popen(
                ['cmd', '/c', launch_bat],
                cwd=BASE_DIR,
                start_new_session=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        print("  [+] Server launch initiated")
    except Exception as e:
        print(f"  [-] Error starting server: {e}")
    
    print("[*] Server reboot complete.\n")

def print_stats():
    pkg_path = os.path.join(BASE_DIR, 'package.json')
    if not os.path.exists(pkg_path):
        print("package.json not found!"); return

    pkg = {}
    try:
        with open(pkg_path, 'r', encoding='utf-8') as f:
            pkg = json.load(f)
    except: return

    clear_screen()
    print("=" * 45)
    print("       LocalYT Instance Statistics")
    print("=" * 45)
    print(f" Name:           {pkg.get('name', 'N/A')}")
    print(f" Version:        {pkg.get('version', 'N/A')}")
    print(f" Codeowner:      pbz134")
    print("-" * 45)
    print(" Dependencies:")
    for dep, ver in pkg.get('dependencies', {}).items():
        print(f"   - {dep}: {ver}")
    print("-" * 45)
    print(f" Total Users:    {get_total_users()}")
    print(f" Total Channels: {get_total_channels()}")
    print(f" Total Media:    {get_total_media_files()} files")
    
    total_size = 0
    try:
        vid_dir = os.path.join(BASE_DIR, 'videos')
        if os.path.exists(vid_dir):
            for root, _, files in os.walk(vid_dir):
                for f in files:
                    try:
                        total_size += os.path.getsize(os.path.join(root, f))
                    except: pass
    except: pass
    
    print(f" Total Media Size: {format_size(total_size)}")
    
    # Show server status
    server_status = "Running" if is_server_running() else "Stopped"
    print(f" Server Status:  {server_status}")
    
    # Show active sessions
    active_sessions = 0
    if os.path.exists(SESSIONS_DIR):
        active_sessions = len([f for f in os.listdir(SESSIONS_DIR) if f.endswith('.session')])
    print(f" Active Sessions: {active_sessions}")
    
    # Show playlist short link count
    try:
        pl_path = os.path.join(BASE_DIR, 'playlist_shortlinks.json')
        if os.path.exists(pl_path):
            with open(pl_path, 'r', encoding='utf-8') as f:
                pl_data = json.load(f)
            print(f" Playlist Short Links: {len(pl_data)}")
        else:
            print(" Playlist Short Links: 0 (file not found)")
    except Exception as e:
        print(f" Playlist Short Links: Error reading ({e})")
    
    print("=" * 45 + "\n")

def main_menu():
    while True:
        try:
            clear_screen()
            print("=" * 45)
            print("       LocalYT Debug Tool")
            print("=" * 45)
            print(" 1.  Return LocalYT Stats")
            print(" 2.  Return Total Storage Size of a Channel")
            print(" 3.  Return Amount of Videos in a Channel")
            print(" 4.  Return Total Amount of Channels")
            print(" 5.  Return Total Amount of Users")
            print(" 6.  Return Total Amount of Media Files")
            print(" 7.  Return Total Video Length of a Channel")
            print(" 8.  Rename a Channel & Metadata")
            print(" 9.  Delete a Channel & Metadata (DANGEROUS)")
            print(" 10. Clear Database (DANGEROUS)")
            print(" 11. List & Delete Accounts")
            print(" 12. Reset User Password")
            print(" 13. Re-initiate Cache Scan")
            print(" 14. Reboot Server")
            print(" 15. Log Out All Users")
            print(" ---")
            print(" 0.  Exit")
            print("=" * 45)
            
            choice = input("Select an option: ").strip()

            if choice == '1':
                print_stats()
                input("Press Enter to return...")
            
            elif choice == '2':
                ch = input("Enter channel name: ")
                print(f"\nTotal Size: {format_size(get_channel_size(ch))}\n")
                input("Press Enter to return...")
            
            elif choice == '3':
                ch = input("Enter channel name: ")
                print(f"\nTotal Videos: {get_channel_video_count(ch)}\n")
                input("Press Enter to return...")
            
            elif choice == '4':
                print(f"\nTotal Channels: {get_total_channels()}\n")
                input("Press Enter to return...")
            
            elif choice == '5':
                print(f"\nTotal Users: {get_total_users()}\n")
                input("Press Enter to return...")
            
            elif choice == '6':
                print(f"\nTotal Media Files: {get_total_media_files()}\n")
                input("Press Enter to return...")
            
            elif choice == '7':
                ch = input("Enter channel name: ")
                secs = get_channel_length(ch)
                print(f"\nTotal Length: {format_time(secs)} ({int(secs)} seconds)\n")
                input("Press Enter to return...")
            
            elif choice == '8':
                old = input("Enter CURRENT channel name: ")
                new = input("Enter NEW channel name: ")
                if old and new and old != new:
                    rename_channel(old, new)
                else:
                    print("\n[-] Invalid input.\n")
                input("Press Enter to return...")
            
            elif choice == '9':
                ch = input("Enter channel name to DELETE: ")
                if ch:
                    # Show channel info before deletion
                    size = get_channel_size(ch)
                    vid_count = get_channel_video_count(ch)
                    print(f"\n--- CHANNEL TO BE DELETED ---")
                    print(f" Channel: {ch}")
                    print(f" Videos:  {vid_count}")
                    print(f" Size:    {format_size(size)}")
                    print("-------------------------------")
                    try:
                        confirm = input("Type the channel name to confirm deletion: ")
                    except:
                        print("\nCancelled.\n")
                        input("Press Enter to return...")
                        continue
                    if confirm == ch:
                        delete_channel(ch)
                    else:
                        print("\n[-] Confirmation failed. Channel not deleted.\n")
                else:
                    print("\n[-] Invalid input.\n")
                input("Press Enter to return...")
            
            elif choice == '10':
                clear_database()
                input("Press Enter to return...")
            
            elif choice == '11':
                manage_accounts()
                input("Press Enter to return...")
            
            elif choice == '12':
                reset_user_password()
                input("Press Enter to return...")
            
            elif choice == '13':
                reinitiate_cache_scan()
                input("Press Enter to return...")
            
            elif choice == '14':
                reboot_server()
                input("Press Enter to return...")
            
            elif choice == '15':
                logout_all_users()
                input("Press Enter to return...")
            
            elif choice == '0':
                print("Exiting..."); break
            
            else:
                input("[-] Invalid choice. Press Enter to return...")
        except KeyboardInterrupt:
            print("\nExiting..."); break
        except:
            pass # Silently ignore any other unexpected errors

if __name__ == "__main__":
    main_menu()