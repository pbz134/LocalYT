import os
from collections import Counter
from tqdm import tqdm

def generate_channel_tags():
    # Determine paths dynamically based on the script's location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    server_root = os.path.dirname(script_dir)
    videos_dir = os.path.join(server_root, 'videos')
    channeltags_dir = os.path.join(server_root, 'channeltags')

    # Ensure the channeltags directory exists
    os.makedirs(channeltags_dir, exist_ok=True)

    if not os.path.exists(videos_dir):
        return

    # Get a list of all channel directories first so tqdm knows the total count
    channels = [d for d in os.listdir(videos_dir) if os.path.isdir(os.path.join(videos_dir, d))]

    # Process each channel with a single-line progress bar
    for channel_name in tqdm(channels, desc="Processing channels", unit="channel", leave=True):
        output_file = os.path.join(channeltags_dir, f"{channel_name}.txt")
        
        # Skip if the channel has already been processed
        if os.path.exists(output_file):
            continue
            
        channel_path = os.path.join(videos_dir, channel_name)
        tag_counter = Counter()
        
        # Recursively scan the channel folder for .txt files
        for root, _, files in os.walk(channel_path):
            for file in files:
                if file.endswith('.txt'):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read().strip()
                            
                        if not content:
                            continue
                            
                        # Split by comma and strip whitespace
                        tags = [tag.strip() for tag in content.split(',')]
                        
                        # Remove the last tag (the channel name)
                        if tags:
                            tags = tags[:-1]
                            
                        # Filter out any accidental exact matches to the channel name
                        tags = [tag for tag in tags if tag.lower() != channel_name.lower()]
                        
                        # Update the counter
                        tag_counter.update(tags)
                        
                    except Exception:
                        # Suppress errors to ensure the tqdm output stays clean on a single line
                        pass
        
        # Extract the 2 most common tags
        top_tags = [tag for tag, count in tag_counter.most_common(2)]
        
        # Write the top tags to the channeltags folder
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(", ".join(top_tags))

if __name__ == "__main__":
    generate_channel_tags()