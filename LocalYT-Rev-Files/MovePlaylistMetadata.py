import os
import shutil
from pathlib import Path
from tqdm import tqdm


def organize_txt_files():
    script_dir = Path(__file__).parent
    videos_base = script_dir.parent / "videos"
    
    target_dirs = {
        "filenames": script_dir.parent / "filenames", 
        "viewcounts": script_dir.parent / "viewcounts"
    }
    
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    # PRE-BUILD LOOKUP: Scan target directories ONCE into hash maps
    # Structure: {target_name: {channel: {base_name: file_path}}}
    target_lookups = {}
    total_target_files = 0
    
    for target_name, target_base in target_dirs.items():
        if not target_base.exists():
            print(f"Warning: {target_name} directory not found at {target_base}")
            continue
        
        target_lookups[target_name] = {}
        
        for channel_dir in target_base.iterdir():
            if not channel_dir.is_dir():
                continue
            
            channel_name = channel_dir.name
            target_lookups[target_name][channel_name] = {}
            
            # Single scan of this channel directory
            for txt_file in channel_dir.glob("*.txt"):
                base_name = txt_file.stem
                target_lookups[target_name][channel_name][base_name] = txt_file
                total_target_files += 1
    
    print(f"\nIndexed {total_target_files} target files for O(1) lookup")
    
    # Collect directories to process
    dirs_to_process = []
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:
            txt_files = [f for f in files if f.endswith('.txt')]
            if txt_files:
                dirs_to_process.append((root_path, path_parts, txt_files))
    
    print(f"Found {len(dirs_to_process)} directories with text files")
    
    # Process with instant lookups
    moves_made = 0
    with tqdm(total=len(dirs_to_process), desc="Processing text files", unit="dir") as pbar:
        for root_path, path_parts, txt_files in dirs_to_process:
            channel = path_parts[0]
            playlist = path_parts[1] if len(path_parts) >= 2 else None
            
            pbar.set_postfix_str(f"{channel}/{playlist or 'root'}")
            
            for txt_file in txt_files:
                base_name = Path(txt_file).stem
                
                # O(1) lookup in each target directory
                for target_name, channel_lookup in target_lookups.items():
                    if channel not in channel_lookup:
                        continue
                    if base_name not in channel_lookup[channel]:
                        continue
                    
                    target_file = channel_lookup[channel][base_name]
                    
                    # Handle case where file was already moved by another playlist
                    if not target_file.exists():
                        del channel_lookup[channel][base_name]
                        continue
                    
                    # Determine destination
                    if playlist:
                        dest_dir = target_file.parent / playlist
                        dest_dir.mkdir(exist_ok=True)
                        dest_path = dest_dir / target_file.name
                    else:
                        dest_path = target_file
                    
                    if target_file != dest_path:
                        # OVERWRITE: Remove existing file at destination if it exists
                        if dest_path.exists():
                            dest_path.unlink()
                        shutil.move(str(target_file), str(dest_path))
                        moves_made += 1
                    
                    # Remove from lookup to prevent duplicate moves
                    del channel_lookup[channel][base_name]
            
            pbar.update(1)
    
    print(f"Moved {moves_made} text files")


def organize_thumbnail_files():
    script_dir = Path(__file__).parent
    videos_base = script_dir.parent / "videos"
    thumbnails_base = script_dir.parent / "thumbnails"
    
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    if not thumbnails_base.exists():
        print(f"Error: Thumbnails directory not found at {thumbnails_base}")
        return
    
    # PRE-BUILD LOOKUP: Scan all thumbnails ONCE into hash map
    # Structure: {channel: {base_name: file_path}}
    thumbnail_lookup = {}
    total_thumbnails = 0
    
    for channel_dir in thumbnails_base.iterdir():
        if not channel_dir.is_dir():
            continue
        
        channel_name = channel_dir.name
        thumbnail_lookup[channel_name] = {}
        
        # Single scan - no more repeated exists() checks
        for image_file in channel_dir.glob("*.jpg"):
            base_name = image_file.stem
            thumbnail_lookup[channel_name][base_name] = image_file
            total_thumbnails += 1
    
    print(f"\nIndexed {total_thumbnails} thumbnails for O(1) lookup")
    
    # Collect all videos to process
    videos_to_process = []
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:
            video_files = [f for f in files if f.endswith(('.mp4', '.mkv', '.mp3'))]
            if video_files:
                channel = path_parts[0]
                playlist = path_parts[1] if len(path_parts) >= 2 else None
                for video_file in video_files:
                    base_name = Path(video_file).stem
                    videos_to_process.append((channel, playlist, base_name))
    
    print(f"Found {len(videos_to_process)} videos to match against")
    
    # Process with instant lookups
    moves_made = 0
    with tqdm(total=len(videos_to_process), desc="Processing thumbnails", unit="video") as pbar:
        for channel, playlist, base_name in videos_to_process:
            # O(1) lookup - no file system access needed
            if channel not in thumbnail_lookup:
                pbar.update(1)
                continue
            if base_name not in thumbnail_lookup[channel]:
                pbar.update(1)
                continue
            
            thumbnail_file = thumbnail_lookup[channel][base_name]
            
            # Handle already-moved files
            if not thumbnail_file.exists():
                del thumbnail_lookup[channel][base_name]
                pbar.update(1)
                continue
            
            # Determine destination
            if playlist:
                dest_dir = thumbnail_file.parent / playlist
                dest_dir.mkdir(exist_ok=True)
                dest_path = dest_dir / thumbnail_file.name
            else:
                dest_path = thumbnail_file
            
            if thumbnail_file != dest_path:
                # OVERWRITE: Remove existing file at destination if it exists
                if dest_path.exists():
                    dest_path.unlink()
                shutil.move(str(thumbnail_file), str(dest_path))
                moves_made += 1
            
            # Remove to prevent duplicate moves
            del thumbnail_lookup[channel][base_name]
            
            pbar.update(1)
    
    print(f"Moved {moves_made} thumbnails")


def organize_comment_files():
    """
    Organizes comment JSON files based on video structure.
    """
    script_dir = Path(__file__).parent
    videos_base = script_dir.parent / "videos"
    comments_base = script_dir.parent / "comments"
    
    if not videos_base.exists():
        print(f"Error: Videos directory not found at {videos_base}")
        return
    
    if not comments_base.exists():
        print(f"Error: Comments directory not found at {comments_base}")
        return
    
    # PRE-BUILD LOOKUP: Scan all comments ONCE into hash map
    # Structure: {channel: {base_name: file_path}}
    comment_lookup = {}
    total_comments = 0
    
    for channel_dir in comments_base.iterdir():
        if not channel_dir.is_dir():
            continue
        
        channel_name = channel_dir.name
        comment_lookup[channel_name] = {}
        
        # Scan for .json files
        for json_file in channel_dir.glob("*.json"):
            base_name = json_file.stem
            comment_lookup[channel_name][base_name] = json_file
            total_comments += 1
    
    print(f"\nIndexed {total_comments} comment files for O(1) lookup")
    
    # Collect all videos to process (same as thumbnails)
    videos_to_process = []
    for root, dirs, files in os.walk(videos_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(videos_base)
        path_parts = list(relative_path.parts)
        
        if len(path_parts) >= 1:
            video_files = [f for f in files if f.endswith(('.mp4', '.mkv', '.mp3'))]
            if video_files:
                channel = path_parts[0]
                playlist = path_parts[1] if len(path_parts) >= 2 else None
                for video_file in video_files:
                    base_name = Path(video_file).stem
                    videos_to_process.append((channel, playlist, base_name))
    
    print(f"Found {len(videos_to_process)} videos to match comments against")
    
    # Process with instant lookups
    moves_made = 0
    with tqdm(total=len(videos_to_process), desc="Processing comments", unit="video") as pbar:
        for channel, playlist, base_name in videos_to_process:
            # O(1) lookup
            if channel not in comment_lookup:
                pbar.update(1)
                continue
            if base_name not in comment_lookup[channel]:
                pbar.update(1)
                continue
            
            comment_file = comment_lookup[channel][base_name]
            
            # Handle already-moved files
            if not comment_file.exists():
                del comment_lookup[channel][base_name]
                pbar.update(1)
                continue
            
            # Determine destination
            if playlist:
                dest_dir = comment_file.parent / playlist
                dest_dir.mkdir(exist_ok=True)
                dest_path = dest_dir / comment_file.name
            else:
                dest_path = comment_file
            
            if comment_file != dest_path:
                # OVERWRITE: Remove existing file at destination if it exists
                if dest_path.exists():
                    dest_path.unlink()
                shutil.move(str(comment_file), str(dest_path))
                moves_made += 1
            
            # Remove to prevent duplicate moves
            del comment_lookup[channel][base_name]
            
            pbar.update(1)
    
    print(f"Moved {moves_made} comment files")


def main():
    print("Starting organization of files...")
    print("=" * 60)
    
    try:
        print("\n--- ORGANIZING TEXT FILES ---")
        organize_txt_files()
        
        print("\n--- ORGANIZING THUMBNAIL FILES ---")
        organize_thumbnail_files()

        print("\n--- ORGANIZING COMMENT FILES ---")
        organize_comment_files()
        
        print("\n" + "=" * 60)
        print("Organization completed successfully!")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()