import os
import json
import shutil

# --- PATH CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL_FOLDERS = ['videos', 'subtitles', 'thumbnails', 'videolengths', 'videostats', 'viewcounts', 'descriptions', 'filedates', 'filenames']
CHANNEL_FILES = ['channelbanner', 'channelpic']
MEDIA_EXTENSIONS = ('.mp4', '.mp3', '.mkv')
JSON_FILES = ['users.json', 'userPreferences.json', 'subscriptions.json', 'watchHistory.json', 'likes.json', 'dislikes.json', 'recommendation_index.json', 'video_cache.json', 'shortlinks.json']

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

def rename_channel(old_name, new_name):
    print(f"\n[*] Attempting to rename '{old_name}' to '{new_name}'...")
    for folder in CHANNEL_FOLDERS:
        try:
            old_path = os.path.join(BASE_DIR, folder, old_name)
            new_path = os.path.join(BASE_DIR, folder, new_name)
            if os.path.exists(old_path):
                os.rename(old_path, new_path)
                print(f"  [+] Renamed folder: {folder}/{old_name}")
        except: pass

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
    
    for json_file in ['video_cache.json', 'recommendation_index.json']:
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

    print("[*] Channel rename complete!\n")

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

    for j_file in JSON_FILES:
        try:
            j_path = os.path.join(BASE_DIR, j_file)
            with open(j_path, 'w', encoding='utf-8') as f:
                if j_file in ['users.json', 'userPreferences.json', 'subscriptions.json', 'recommendation_index.json']:
                    json.dump({}, f)
                else:
                    json.dump([], f)
            print(f"  [+] Emptied: {j_file}")
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
        print("[*] Account deleted.\n")
    else:
        print("[-] Username not found.\n")

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
    print("=" * 45 + "\n")

def main_menu():
    while True:
        try:
            clear_screen()
            print("=" * 45)
            print("       LocalYT Debug Tool")
            print("=" * 45)
            print(" 1. Return LocalYT Stats")
            print(" 2. Return Total Storage Size of a Channel")
            print(" 3. Return Amount of Videos in a Channel")
            print(" 4. Return Total Amount of Channels")
            print(" 5. Return Total Amount of Users")
            print(" 6. Return Total Amount of Media Files")
            print(" 7. Return Total Video Length of a Channel")
            print(" 8. Rename a Channel & Metadata")
            print(" 9. Clear Database (DANGEROUS)")
            print(" 10. List & Delete Accounts")
            print(" 0. Exit")
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
                clear_database()
                input("Press Enter to return...")
            
            elif choice == '10':
                manage_accounts()
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