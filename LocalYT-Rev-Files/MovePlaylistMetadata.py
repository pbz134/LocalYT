import os
import shutil
from pathlib import Path
import re

def organize_txt_files():
    # Get the script directory and navigate to videos directory
    script_dir = Path(__file__).parent
    videos_base = script_dir.parent / "videos"
    
    # Define the target directories
    target_dirs = {
        "videostats": script_dir.parent / "videostats",
        "filenames": script_dir.parent / "filenames", 
        "viewcounts": script_dir.parent / "viewcounts"
    }
    
    print(f"Scanning videos directory: {videos_base}")
    
    # Check if videos directory exists
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    # Check if target directories exist
    for name, path in target_dirs.items():
        if not path.exists():
            print(f"Warning: {name} directory not found at {path}")
    
    # Recursively scan the videos directory
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        
        # Check if we're in a channel subfolder (one level below videos)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:  # At least a channel folder
            channel = path_parts[0]
            
            # Get playlist folder if it exists (second level)
            playlist = path_parts[1] if len(path_parts) >= 2 else None
            
            print(f"\nProcessing: {root_path}")
            print(f"  Channel: {channel}")
            print(f"  Playlist: {playlist if playlist else 'N/A'}")
            
            # Process .txt files in the current directory
            txt_files = [f for f in files if f.endswith('.txt')]
            
            for txt_file in txt_files:
                # Get the base name without extension
                base_name = os.path.splitext(txt_file)[0]
                
                print(f"  Processing text file: {txt_file}")
                print(f"    Base name: {base_name}")
                
                # Check each target directory
                for target_name, target_base in target_dirs.items():
                    # Check if target directory exists
                    if not target_base.exists():
                        continue
                    
                    # Look for matching .txt files in target directory
                    target_channel_dir = target_base / channel
                    
                    if target_channel_dir.exists():
                        # Look for files with the same base name in the channel folder
                        for target_file in target_channel_dir.glob("*.txt"):
                            if os.path.splitext(target_file.name)[0] == base_name:
                                print(f"    Found match in {target_name}/{channel}")
                                
                                # Determine destination path
                                if playlist:
                                    # Create playlist subfolder if it doesn't exist
                                    dest_dir = target_channel_dir / playlist
                                    dest_dir.mkdir(exist_ok=True)
                                    dest_path = dest_dir / target_file.name
                                else:
                                    # Keep in channel folder
                                    dest_path = target_channel_dir / target_file.name
                                
                                # Only move if not already in correct location
                                if target_file != dest_path:
                                    print(f"      Moving to: {dest_path}")
                                    shutil.move(str(target_file), str(dest_path))
                                else:
                                    print(f"      Already in correct location")
                                
                                break  # Found the match, move to next target directory

def main():
    print("Starting organization of text files...")
    print("=" * 60)
    
    try:
        organize_txt_files()
        print("\n" + "=" * 60)
        print("Organization completed successfully!")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()