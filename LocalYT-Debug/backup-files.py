import os
import shutil
import zipfile
import json
import argparse
from datetime import datetime

# Define the files to back up
FILES_TO_BACKUP = [
    "login_attempts.json",
    "shortlinks.json",
    "playlist_shortlinks.json",
    "subscriptions.json",
    "user-playlists.json",
    "userPreferences.json",
    "userCommentLikes.json",
    "userSearchHistory.json",
    "userSettings.json",
    "users.json",
    "watchHistory.json",
    "likes.json",
    "dislikes.json"
]

# Define the directories to back up
DIRS_TO_BACKUP = [
    "temp-uploads",
    "sessions",
    "user-profiles"
]

# Define metadata file extensions to scan for
METADATA_EXTENSIONS = {'.png', '.txt', '.jpg', '.json'}

# Directory names to exclude from scanning (at any level)
EXCLUDED_DIRS = {'node_modules', 'venv'}


def get_config_path():
    """Get the path to the external config file (stored next to the script)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, "backup_config.json")


def load_config():
    """Load the configuration file, returning None if it doesn't exist yet."""
    config_path = get_config_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_config(config):
    """Save the configuration dictionary to the external config file."""
    config_path = get_config_path()
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        return True
    except IOError as e:
        print(f"[ERROR] Failed to save config file: {e}")
        return False


def get_script_and_root_paths():
    """Get the script directory and server root (parent directory)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    server_root = os.path.dirname(script_dir)
    return script_dir, server_root


def prompt_for_new_path():
    """The original logic: ask user for an output directory path, create if needed."""
    while True:
        dest_path = input("\nEnter the full path where you want to save the backup: ").strip()
        dest_path = dest_path.rstrip(os.sep)
        
        if not dest_path:
            print("Error: Path cannot be empty. Please try again.")
            continue
            
        if not os.path.exists(dest_path):
            create = input(f"The directory '{dest_path}' does not exist. Create it? (y/n): ").strip().lower()
            if create == 'y':
                try:
                    os.makedirs(dest_path)
                    print(f"Directory created: {dest_path}")
                    return dest_path
                except OSError as e:
                    print(f"Error: Failed to create directory. {e}")
                    print("Please try a different path.")
            else:
                print("Please provide a valid path.")
        else:
            if os.path.isdir(dest_path):
                return dest_path
            else:
                print(f"Error: '{dest_path}' exists but is a file, not a directory. Please try again.")


def get_output_directory(auto_path=None):
    """
    Determine output path.
    If auto_path is provided (via CMD), use it directly.
    Otherwise, use config or ask manually.
    """
    
    # --- AUTOMATION MODE ---
    # If a path was provided via command line argument
    if auto_path:
        auto_path = auto_path.rstrip(os.sep)
        
        # Validate existence
        if not os.path.exists(auto_path):
            print(f"[AUTO] Directory '{auto_path}' does not exist. Creating it...")
            try:
                os.makedirs(auto_path)
                print(f"[AUTO] Directory created.")
            except OSError as e:
                print(f"[ERROR] Failed to create directory '{auto_path}': {e}")
                return None, False
        
        if os.path.isdir(auto_path):
            return auto_path, False 
        else:
            print(f"[ERROR] Path '{auto_path}' exists but is not a directory.")
            return None, False

    # --- INTERACTIVE MODE ---
    config = load_config()
    
    # If config doesn't exist, fallback to the original manual prompt
    if not config:
        return prompt_for_new_path(), False
    
    saved_paths = config.get("saved_paths", [])
    
    if not saved_paths:
        return prompt_for_new_path(), False

    while True:
        print("\n--- Select Output Directory ---")
        print("Saved paths (or press 'N' to enter a new path manually):")
        for i, path in enumerate(saved_paths, 1):
            exists_tag = "[Exists]" if os.path.exists(path) else "[Missing]"
            print(f"  {i}. {path} {exists_tag}")
        
        choice = input("\nChoose an option: ").strip().lower()
        
        if choice == 'n':
            return prompt_for_new_path(), False
            
        if choice.isdigit():
            index = int(choice) - 1
            if 0 <= index < len(saved_paths):
                return saved_paths[index], True
            else:
                print("Invalid selection. Please try again.")
        else:
            print("Invalid input. Please enter a number or 'N'.")


def get_input_file(auto_path=None):
    """Ask user for an input zip file path OR use automated path."""
    
    # --- AUTOMATION MODE ---
    if auto_path:
        if not os.path.exists(auto_path):
            print(f"[ERROR] File '{auto_path}' does not exist.")
            return None
        if not os.path.isfile(auto_path):
            print(f"[ERROR] '{auto_path}' is not a file.")
            return None
        return auto_path

    # --- INTERACTIVE MODE ---
    while True:
        file_path = input("\nEnter the full path to the backup ZIP file: ").strip()
        
        if not file_path:
            print("Error: Path cannot be empty. Please try again.")
            continue
            
        if not os.path.exists(file_path):
            print(f"Error: File '{file_path}' does not exist. Please try again.")
            continue
            
        if not os.path.isfile(file_path):
            print(f"Error: '{file_path}' is not a file. Please try again.")
            continue
            
        if not file_path.lower().endswith('.zip'):
            print("Warning: File does not have .zip extension. Proceeding anyway...")
            
        return file_path


def backup_user_files(server_root, dest_path):
    """Backup specific user data files and directories."""
    print("\nStarting User Files Backup...")
    success_count = 0
    skip_count = 0

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

    for dirname in DIRS_TO_BACKUP:
        source_dir = os.path.join(server_root, dirname)
        dest_dir = os.path.join(dest_path, dirname)
        
        if os.path.exists(source_dir):
            try:
                shutil.copytree(source_dir, dest_dir, dirs_exist_ok=True)
                print(f"[OK] Backed up folder: {dirname}/")
                success_count += 1
            except Exception as e:
                print(f"[FAIL] Error copying folder {dirname}: {e}")
        else:
            print(f"[SKIP] Folder not found at root: {dirname}/")
            skip_count += 1

    print(f"\n--- User Files Backup Complete ---")
    print(f"Successfully backed up: {success_count} item(s)")
    if skip_count > 0:
        print(f"Skipped (not found):   {skip_count} item(s)")


def backup_metadata_files(server_root, dest_path):
    """Recursively scan server root for metadata files and create a ZIP preserving folder structure."""
    server_root_norm = os.path.normpath(server_root)
    
    print(f"\nScanning for metadata files in: {server_root_norm}")
    print("Looking for: .png, .txt, .jpg, .json files (inside folders only)")
    print("Excluding: node_modules, venv folders")
    
    found_files = []
    skipped_root_files = []
    
    for current_root, dirs, files in os.walk(server_root_norm):
        is_root_level = (os.path.normpath(current_root) == server_root_norm)
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        
        for filename in files:
            _, ext = os.path.splitext(filename)
            
            if ext.lower() in METADATA_EXTENSIONS:
                full_path = os.path.join(current_root, filename)
                
                if is_root_level:
                    skipped_root_files.append(filename)
                    continue
                
                rel_path = os.path.relpath(full_path, server_root_norm)
                found_files.append((full_path, rel_path))
    
    if skipped_root_files:
        print(f"\n[INFO] Skipped {len(skipped_root_files)} base-level file(s):")
        for f in sorted(skipped_root_files):
            print(f"         - {f}")
    
    if not found_files:
        print("\n[WARN] No metadata files found inside subdirectories!")
        return
    
    print(f"\nFound {len(found_files)} metadata file(s) inside folders to archive.")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"metadata_backup_{timestamp}.zip"
    zip_filepath = os.path.join(dest_path, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for full_path, rel_path in found_files:
                zipf.write(full_path, rel_path)
                print(f"[OK] Added: {rel_path}")
                
        print(f"\n--- Metadata Backup Complete ---")
        print(f"Created ZIP archive: {zip_filepath}")
        print(f"Total files archived: {len(found_files)}")
        
    except Exception as e:
        print(f"\n[FAIL] Error creating ZIP archive: {e}")


def reapply_backup_zip(server_root, zip_filepath, auto_mode=False):
    """Extract a backup ZIP file to the server root, preserving structure."""
    server_root_norm = os.path.normpath(server_root)
    
    print(f"\nReapplying backup from: {zip_filepath}")
    print(f"Target directory: {server_root_norm}")
    
    try:
        with zipfile.ZipFile(zip_filepath, 'r') as zipf:
            file_list = zipf.namelist()
            print(f"\nZIP contains {len(file_list)} item(s).")
            
            # In auto mode, we skip confirmation and just list preview then run
            if not auto_mode:
                preview_count = min(10, len(file_list))
                for i in range(preview_count):
                    print(f"  - {file_list[i]}")
                if len(file_list) > preview_count:
                    print(f"  ... and {len(file_list) - preview_count} more item(s)")
                
                confirm = input(f"\nExtract {len(file_list)} item(s) to {server_root_norm}? (y/n): ").strip().lower()
                
                if confirm != 'y':
                    print("Operation cancelled by user.")
                    return
            else:
                print("[AUTO] Auto-confirming restore...")
            
            print("\nExtracting...")
            success_count = 0
            error_count = 0
            
            for item in file_list:
                try:
                    zipf.extract(item, server_root_norm)
                    success_count += 1
                except Exception as e:
                    print(f"[FAIL] Error extracting {item}: {e}")
                    error_count += 1
            
            print(f"\n--- Restore Complete ---")
            print(f"Successfully extracted: {success_count} item(s)")
            if error_count > 0:
                print(f"Errors:                 {error_count} item(s)")
                
    except zipfile.BadZipFile:
        print("[FAIL] Error: Invalid or corrupted ZIP file.")
    except Exception as e:
        print(f"[FAIL] Error reading ZIP file: {e}")


def main():
    # Setup Argument Parser using subparsers for specific commands
    parser = argparse.ArgumentParser(description="LocalYT Backup & Restore Tool")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Command: backup-user
    parser_user = subparsers.add_parser('backup-user', help='Backup User Data (JSON + Folders)')
    parser_user.add_argument('path', help='Destination directory path')

    # Command: backup-meta
    parser_meta = subparsers.add_parser('backup-meta', help='Backup Metadata (Images/Text -> ZIP)')
    parser_meta.add_argument('path', help='Destination directory path')

    # Command: restore
    parser_restore = subparsers.add_parser('restore', help='Restore from backup ZIP')
    parser_restore.add_argument('path', help='Path to the backup ZIP file')

    args = parser.parse_args()

    script_dir, server_root = get_script_and_root_paths()
    
    print("=" * 50)
    print("   LocalYT Backup & Restore Tool")
    print("=" * 50)
    print(f"\nScript location : {script_dir}")
    print(f"Server root     : {server_root}")

    # --- AUTOMATION HANDLING ---
    
    if args.command == 'backup-user':
        print("\n[AUTO MODE] Running User Data Backup...")
        dest_path, _ = get_output_directory(auto_path=args.path)
        if dest_path:
            backup_user_files(server_root, dest_path)
            print("\n[AUTO MODE] Finished.")
        return

    elif args.command == 'backup-meta':
        print("\n[AUTO MODE] Running Metadata Backup...")
        dest_path, _ = get_output_directory(auto_path=args.path)
        if dest_path:
            backup_metadata_files(server_root, dest_path)
            print("\n[AUTO MODE] Finished.")
        return

    elif args.command == 'restore':
        print("\n[AUTO MODE] Running Restore...")
        zip_filepath = get_input_file(auto_path=args.path)
        if zip_filepath:
            reapply_backup_zip(server_root, zip_filepath, auto_mode=True)
            print("\n[AUTO MODE] Finished.")
        return

    # --- INTERACTIVE MODE (Default) ---
    print("\n" + "-" * 50)
    print("Select an option:")
    print("  1. Back up User Files (JSON data + folders)")
    print("  2. Back up Metadata Files (.png/.txt/.jpg/.json -> ZIP)")
    print("  3. Reapply/Restore from a backup ZIP")
    print("  0. Exit")
    print("-" * 50)
    
    while True:
        choice = input("\nEnter your choice (0-3): ").strip()
        
        if choice == '0':
            print("Goodbye!")
            break
            
        elif choice in ['1', '2']:
            # Get path and a flag indicating if it was fetched from an existing config
            dest_path, was_from_config = get_output_directory()
            
            if not dest_path:
                continue 

            if choice == '1':
                backup_user_files(server_root, dest_path)
            else:
                backup_metadata_files(server_root, dest_path)
            
            # Post-backup logic: Ask to save the path ONLY if it wasn't already loaded from config
            if not was_from_config:
                save_it = input(f"\nSave '{dest_path}' to config for future quick access? (y/n): ").strip().lower()
                if save_it == 'y':
                    new_config = {"saved_paths": [dest_path]}
                    if save_config(new_config):
                        print("Path saved! Future backups will offer this path automatically.")
                        
            break
            
        elif choice == '3':
            zip_filepath = get_input_file()
            if zip_filepath:
                reapply_backup_zip(server_root, zip_filepath)
            break
            
        else:
            print("Invalid choice. Please enter 0, 1, 2, or 3.")


if __name__ == "__main__":
    main()