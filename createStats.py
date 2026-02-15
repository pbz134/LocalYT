import os
import random

def generate_like_dislike_counts(video_name, subscriber_count):
    # Calculate likes and dislikes based on subscriber count with more randomness
    likes = int(subscriber_count * 0.04) + random.randint(-int(subscriber_count * 0.01), int(subscriber_count * 0.01))
    dislikes = int(subscriber_count * 0.001) + random.randint(-int(subscriber_count * 0.001), int(subscriber_count * 0.001))
    return f"{likes},{dislikes}"

def scan_videos_directory(videos_dir, videostats_dir, subcount_dir):
    # Ensure the videostats directory exists
    if not os.path.exists(videostats_dir):
        os.makedirs(videostats_dir)

    # Recursively scan all .mp4 and .mp3 files in the videos directory
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mp3')):
                video_name = os.path.splitext(filename)[0]
                channel_name = os.path.basename(root)

                # Read the subscriber count for the channel
                subcount_file_path = os.path.join(subcount_dir, f"{channel_name}.txt")
                if not os.path.exists(subcount_file_path):
                    print(f"Subscriber count file not found for channel: {channel_name}")
                    continue

                with open(subcount_file_path, 'r') as subcount_file:
                    subscriber_count_str = subcount_file.read().strip().replace(',', '')
                    subscriber_count = int(subscriber_count_str)

                # Create corresponding subdirectories in the videostats directory
                relative_path = os.path.relpath(root, videos_dir)
                videostats_subdir = os.path.join(videostats_dir, relative_path)
                if not os.path.exists(videostats_subdir):
                    os.makedirs(videostats_subdir)

                # Write the like/dislike counts to a text file in the videostats directory
                txt_filename = f"{video_name}.txt"
                txt_file_path = os.path.join(videostats_subdir, txt_filename)
                with open(txt_file_path, 'w') as txt_file:
                    txt_file.write(generate_like_dislike_counts(video_name, subscriber_count))

if __name__ == "__main__":
    videos_dir = './videos'
    videostats_dir = './videostats'
    subcount_dir = './subcount'
    scan_videos_directory(videos_dir, videostats_dir, subcount_dir)
