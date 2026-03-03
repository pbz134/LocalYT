import os
import shutil
from pathlib import Path
import re
from tqdm import tqdm

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
    
    # Check if videos directory exists
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    # Check if target directories exist
    for name, path in target_dirs.items():
        if not path.exists():
            print(f"Warning: {name} directory not found at {path}")
    
    # First, collect all directories to process
    dirs_to_process = []
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:  # At least a channel folder
            txt_files = [f for f in files if f.endswith('.txt')]
            if txt_files:
                dirs_to_process.append((root_path, path_parts, txt_files))
    
    print(f"\nFound {len(dirs_to_process)} directories with text files to process")
    
    # Process each directory with a progress bar
    with tqdm(total=len(dirs_to_process), desc="Processing directories", unit="dir") as dir_pbar:
        for root_path, path_parts, txt_files in dirs_to_process:
            channel = path_parts[0]
            playlist = path_parts[1] if len(path_parts) >= 2 else None
            
            # Update the progress bar description with current directory
            dir_pbar.set_description(f"Processing: {channel}/{playlist if playlist else ''}")
            
            # Process text files in the current directory
            for txt_file in tqdm(txt_files, desc=f"  Files in {channel}", leave=False, unit="file"):
                base_name = os.path.splitext(txt_file)[0]
                
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
                                    shutil.move(str(target_file), str(dest_path))
                                
                                break  # Found the match, move to next target directory
            
            dir_pbar.update(1)

def organize_thumbnail_files():
    # Get the script directory and navigate to videos directory
    script_dir = Path(__file__).parent
    videos_base = script_dir.parent / "videos"
    thumbnails_base = script_dir.parent / "thumbnails"
    
    # Check if directories exist
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    if not thumbnails_base.exists():
        print(f"Error: Thumbnails directory not found at {thumbnails_base}")
        return
    
    # Define image file extensions to look for
    image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')
    
    # First, collect all directories with video files
    dirs_to_process = []
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:  # At least a channel folder
            video_files = [f for f in files if f.endswith('.mp4')]
            if video_files:
                dirs_to_process.append((root_path, path_parts, video_files))
    
    # Count total videos to process
    total_videos = sum(len(video_files) for _, _, video_files in dirs_to_process)
    
    print(f"\nFound {len(dirs_to_process)} directories with {total_videos} videos to process for thumbnails")
    
    # Create a progress bar for videos
    with tqdm(total=total_videos, desc="Processing thumbnails", unit="video") as video_pbar:
        for root_path, path_parts, video_files in dirs_to_process:
            channel = path_parts[0]
            playlist = path_parts[1] if len(path_parts) >= 2 else None
            
            # Get all video files in this directory
            for video_file in video_files:
                # Update progress bar description with current video
                video_pbar.set_description(f"Processing: {video_file[:30]}..." if len(video_file) > 30 else f"Processing: {video_file}")
                
                # Get the base name without extension
                base_name = os.path.splitext(video_file)[0]
                
                # Check thumbnails directory for matching images
                thumbnails_channel_dir = thumbnails_base / channel
                
                if thumbnails_channel_dir.exists():
                    # Look for image files with the same base name
                    for image_ext in image_extensions:
                        # Try different image extensions
                        possible_image = thumbnails_channel_dir / f"{base_name}{image_ext}"
                        
                        if possible_image.exists():
                            # Determine destination path
                            if playlist:
                                # Create playlist subfolder in thumbnails if it doesn't exist
                                dest_dir = thumbnails_channel_dir / playlist
                                dest_dir.mkdir(exist_ok=True)
                                dest_path = dest_dir / possible_image.name
                            else:
                                # Keep in channel folder
                                dest_path = thumbnails_channel_dir / possible_image.name
                            
                            # Only move if not already in correct location
                            if possible_image != dest_path:
                                shutil.move(str(possible_image), str(dest_path))
                            
                            break  # Found a matching image, move to next video
                
                video_pbar.update(1)

def main():
    print("Starting organization of files...")
    print("=" * 60)
    
    try:
        # First organize text files
        print("\n--- ORGANIZING TEXT FILES ---")
        organize_txt_files()
        
        # Then organize thumbnail files
        print("\n--- ORGANIZING THUMBNAIL FILES ---")
        organize_thumbnail_files()
        
        print("\n" + "=" * 60)
        print("Organization completed successfully!")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()