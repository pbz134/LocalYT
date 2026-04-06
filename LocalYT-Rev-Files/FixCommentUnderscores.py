import os

def remove_underscores_from_json(root_dir):
    """
    Recursively scans root_dir and removes underscores from .json filenames.
    """
    # Check if directory exists
    if not os.path.exists(root_dir):
        print(f"Error: Directory '{root_dir}' not found.")
        print(f"Absolute path checked: {os.path.abspath(root_dir)}")
        return

    count = 0
    
    # Walk through the directory tree
    for current_dir, dirs, files in os.walk(root_dir):
        for filename in files:
            # Check if file is a JSON file AND contains an underscore
            if filename.endswith(".json") and "_" in filename:
                
                # Construct full file path
                old_path = os.path.join(current_dir, filename)
                
                # Create new filename by replacing underscores with empty string
                new_filename = filename.replace("_", "")
                new_path = os.path.join(current_dir, new_filename)

                try:
                    # Rename the file
                    os.rename(old_path, new_path)
                    print(f"Renamed: '{filename}' -> '{new_filename}'")
                    count += 1
                except OSError as e:
                    print(f"Error renaming '{filename}': {e}")

    print(f"\nOperation complete. {count} files renamed.")

if __name__ == "__main__":
    # --- FIX IS HERE ---
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Go one level up from the script dir, then into 'comments'
    # Script: E:\LocalYT\LocalYT-Rev-Files\script.py
    # Target: E:\LocalYT\comments
    target_directory = os.path.join(os.path.dirname(script_dir), "comments")
    
    print(f"Scanning: {target_directory}")
    remove_underscores_from_json(target_directory)