import os
import json

# Get the directory where this script is located (LocalYT-Rev-Files)
script_dir = os.path.dirname(os.path.abspath(__file__))
# The parent directory is where the 'filedates' folder and the root files are located
root_dir = os.path.dirname(script_dir)

filedates_dir = os.path.join(root_dir, 'filedates')
output_file = os.path.join(root_dir, 'video_date_cache.json')

date_cache = {}

if os.path.exists(filedates_dir):
    print("Scanning filedates directory...", end="", flush=True)
    count = 0

    for entry in os.scandir(filedates_dir):
        if entry.is_dir(follow_symlinks=False):
            for sub_entry in os.scandir(entry.path):
                if sub_entry.is_file(follow_symlinks=False) and sub_entry.name.endswith('.txt'):
                    # Split the name and extension, and ONLY take the name.
                    # This safely removes BOTH .txt AND the hidden .mp4, resulting in just "Video Name"
                    video_name = os.path.splitext(sub_entry.name)[0]
                    video_path = f"{entry.name}/{video_name}"
                    
                    try:
                        with open(sub_entry, 'r', encoding='utf-8') as f:
                            date_str = f.read().strip()
                            if date_str:
                                date_cache[video_path] = date_str
                                count += 1
                                print(f"\rScanning filedates directory... ({count} files processed)", end="", flush=True)
                    except Exception:
                        pass
                        
        elif entry.is_file(follow_symlinks=False) and entry.name.endswith('.txt'):
            video_name = os.path.splitext(entry.name)[0]
            try:
                with open(entry, 'r', encoding='utf-8') as f:
                    date_str = f.read().strip()
                    if date_str:
                        date_cache[video_name] = date_str
                        count += 1
                        print(f"\rScanning filedates directory... ({count} files processed)", end="", flush=True)
            except Exception:
                pass

    print() # Move to a new line after scanning finishes

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(date_cache, f, indent=4)
        print(f"Successfully generated {output_file} with {count} entries.")
    except Exception as e:
        print(f"Error writing output file: {e}")
else:
    print(f"Error: Could not find the filedates directory at {filedates_dir}")