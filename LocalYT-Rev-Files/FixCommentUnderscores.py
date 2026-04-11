import os

def get_corresponding_video_dir(comments_dir):
    """
    Determines the path to the 'videos' directory assuming it mirrors 
    the 'comments' directory structure one level up.
    """
    # E.g., E:\LocalYT\comments -> E:\LocalYT\videos
    parent_dir = os.path.dirname(comments_dir)
    return os.path.join(parent_dir, "videos")

def remove_underscores_from_json(root_dir):
    """
    Recursively scans root_dir and removes underscores from .json filenames,
    ONLY IF no corresponding video file (.mp4, .mp3, .mkv) with the original name exists.
    """
    if not os.path.exists(root_dir):
        print(f"Error: Directory '{root_dir}' not found.")
        print(f"Absolute path checked: {os.path.abspath(root_dir)}")
        return

    videos_root = get_corresponding_video_dir(root_dir)
    video_extensions = (".mp4", ".mp3", ".mkv")
    count = 0
    
    # Walk through the directory tree
    for current_dir, dirs, files in os.walk(root_dir):
        for filename in files:
            # Check if file is a JSON file AND contains an underscore
            if filename.endswith(".json") and "_" in filename:
                
                old_path = os.path.join(current_dir, filename)
                
                # Get the name without the .json extension
                base_name = os.path.splitext(filename)[0]
                
                # Determine the expected video directory for this specific channel
                # E.g., E:\LocalYT\comments\MaSiRo -> E:\LocalYT\videos\MaSiRo
                relative_path = os.path.relpath(current_dir, root_dir)
                if relative_path == ".":
                    channel_video_dir = videos_root
                else:
                    channel_video_dir = os.path.join(videos_root, relative_path)
                
                # Check if any video file exists with the EXACT original base name
                video_exists = False
                if os.path.isdir(channel_video_dir):
                    for ext in video_extensions:
                        expected_video_path = os.path.join(channel_video_dir, base_name + ext)
                        if os.path.exists(expected_video_path):
                            video_exists = True
                            break
                
                # Only rename if NO matching video file was found
                if not video_exists:
                    new_filename = filename.replace("_", "")
                    new_path = os.path.join(current_dir, new_filename)

                    try:
                        os.rename(old_path, new_path)
                        print(f"Renamed: '{filename}' -> '{new_filename}'")
                        count += 1
                    except OSError as e:
                        print(f"Error renaming '{filename}': {e}")
                else:
                    print(f"Skipped:  '{filename}' (Matching video file found)")

    print(f"\nOperation complete. {count} files renamed.")

if __name__ == "__main__":
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Go one level up from the script dir, then into 'comments'
    # Script: E:\LocalYT\LocalYT-Rev-Files\script.py
    # Target: E:\LocalYT\comments
    target_directory = os.path.join(os.path.dirname(script_dir), "comments")
    
    print(f"Scanning: {target_directory}")
    print(f"Comparing against: {get_corresponding_video_dir(target_directory)}\n")
    remove_underscores_from_json(target_directory)