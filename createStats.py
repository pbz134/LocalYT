import os
import random

def generate_like_dislike_counts(video_name, subscriber_count):
    # Calculate likes and dislikes based on subscriber count with more randomness
    likes = int(subscriber_count * 0.04) + random.randint(-int(subscriber_count * 0.01), int(subscriber_count * 0.01))
    dislikes = int(subscriber_count * 0.001) + random.randint(-int(subscriber_count * 0.001), int(subscriber_count * 0.001))
    return f"{likes},{dislikes}"

def scan_videos_directory(videos_dir, videostats_dir, subcount_dir):
    print("Scanning videos directory...")

    # Ensure the videostats directory exists
    if not os.path.exists(videostats_dir):
        os.makedirs(videostats_dir)

    # Get only first-level directories (channels) in videos_dir
    for channel_dir in os.listdir(videos_dir):
        channel_path = os.path.join(videos_dir, channel_dir)
        
        # Skip if it's not a directory
        if not os.path.isdir(channel_path):
            continue
            
        # Read the subscriber count for the channel
        subcount_file_path = os.path.join(subcount_dir, f"{channel_dir}.txt")
        if not os.path.exists(subcount_file_path):
            print(f"Subscriber count file not found for channel: {channel_dir}")
            continue

        try:
            with open(subcount_file_path, 'r', encoding='utf-8') as subcount_file:
                subscriber_count_str = subcount_file.read().strip().replace(',', '')
                subscriber_count = int(subscriber_count_str)
        except ValueError:
            print(f"Could not read subscriber count for channel: {channel_dir}")
            continue

        # Recursively scan all .mp4 and .mp3 files within this channel directory
        for root, _, files in os.walk(channel_path):
            for filename in files:
                if filename.endswith(('.mp4', '.mp3')):
                    try:
                        video_name = os.path.splitext(filename)[0]
                        
                        # Get the relative path from the channel directory
                        relative_path = os.path.relpath(root, channel_path)
                        
                        # Create corresponding subdirectories in the videostats directory
                        if relative_path == '.':
                            # Video is directly in the channel folder
                            videostats_subdir = os.path.join(videostats_dir, channel_dir)
                        else:
                            # Video is in a subfolder (playlist) within the channel
                            videostats_subdir = os.path.join(videostats_dir, channel_dir, relative_path)
                        
                        # Ensure the directory exists
                        if not os.path.exists(videostats_subdir):
                            os.makedirs(videostats_subdir)

                        # Write the like/dislike counts to a text file
                        txt_filename = f"{video_name}.txt"
                        txt_file_path = os.path.join(videostats_subdir, txt_filename)
                        
                        with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                            txt_file.write(generate_like_dislike_counts(video_name, subscriber_count))
                            
                    except Exception as e:
                        # If any error occurs with this specific file, log it and continue
                        print(f"Error processing file '{filename}': {e}")
                        continue

if __name__ == "__main__":
    videos_dir = './videos'
    videostats_dir = './videostats'
    subcount_dir = './subcount'
    scan_videos_directory(videos_dir, videostats_dir, subcount_dir)