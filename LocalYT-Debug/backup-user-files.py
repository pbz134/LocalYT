import os
import shutil

# Define the files to back up
FILES_TO_BACKUP = [
    "login_attempts.json",
    "shortlinks.json",
    "subscriptions.json",
    "user-playlists.json",
    "userPreferences.json",
    "users.json",
    "watchHistory.json",
    "likes.json"
]

# Define the directories to back up
DIRS_TO_BACKUP = [
    "temp-uploads",
    "sessions",
    "user-profiles"
]

def main():
    # Get the folder the script is currently in (E:\LocalYT\LocalYT-Debug)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Set the server root to the parent folder (E:\LocalYT)
    server_root = os.path.dirname(script_dir) + os.sep
    
    print("=" * 45)
    print("LocalYT User File Backup Tool")
    print("=" * 45)
    
    while True:
        dest_path = input("\nEnter the full path where you want to back up the files: ").strip()
        dest_path = dest_path.rstrip(os.sep)
        
        if not os.path.exists(dest_path):
            create = input(f"The directory '{dest_path}' does not exist. Create it? (y/n): ").strip().lower()
            if create == 'y':
                try:
                    os.makedirs(dest_path)
                    print(f"Directory created: {dest_path}")
                    break
                except OSError as e:
                    print(f"Error: Failed to create directory. {e}")
                    print("Please try a different path.")
            else:
                print("Please provide a valid path.")
        else:
            if os.path.isdir(dest_path):
                break
            else:
                print(f"Error: '{dest_path}' exists but is a file, not a directory. Please try again.")

    print("\nStarting backup...")
    success_count = 0
    skip_count = 0

    # --- Backup Files ---
    for filename in FILES_TO_BACKUP:
        source_file = os.path.join(server_root, filename)
        dest_file = os.path.join(dest_path, filename)
        
        if os.path.exists(source_file):
            try:
                shutil.copy2(source_file, dest_file)
                print(f"[OK] Backed up file: {filename}")
                success_count += 1
            except Exception as e:
                print(f"[FAIL] Error copying {filename}: {e}")
        else:
            print(f"[SKIP] File not found at root: {filename}")
            skip_count += 1

    # --- Backup Directories ---
    for dirname in DIRS_TO_BACKUP:
        source_dir = os.path.join(server_root, dirname)
        dest_dir = os.path.join(dest_path, dirname)
        
        if os.path.exists(source_dir):
            try:
                # dirs_exist_ok=True allows the backup to proceed even if the folder 
                # already exists in the destination (it will just merge/overwrite the contents)
                shutil.copytree(source_dir, dest_dir, dirs_exist_ok=True)
                print(f"[OK] Backed up folder: {dirname}")
                success_count += 1
            except Exception as e:
                print(f"[FAIL] Error copying folder {dirname}: {e}")
        else:
            print(f"[SKIP] Folder not found at root: {dirname}")
            skip_count += 1

    print("\n--- Backup Complete ---")
    print(f"Successfully backed up: {success_count} item(s)")
    if skip_count > 0:
        print(f"Skipped (not found):   {skip_count} item(s)")

if __name__ == "__main__":
    main()