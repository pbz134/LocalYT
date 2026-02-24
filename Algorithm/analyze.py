import os
import json
import openai
import time

# Configuration
KOBOLDCPP_API_URL = "http://localhost:5001/v1"  # Replace with your koboldcpp API endpoint
media_list = "media_list.txt"  # Path to your existing video list file

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TAGS_SUPEREXPANDED_FILE = os.path.join(SCRIPT_DIR, "tags_superexpanded.json")

# Updated output directory - go up one level from script directory and then into "videos"
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PARENT_DIR, "videos")
DESCRIPTIONS_DIR = os.path.join(PARENT_DIR, "descriptions")  # Descriptions directory

DEFAULT_TAG = "Uncategorized"  # Default tag if the model fails to choose one

# Set up the OpenAI client for koboldcpp
openai.api_base = KOBOLDCPP_API_URL
openai.api_key = "dummy-key"  # API key is not required for local koboldcpp

# Increase timeout settings
openai.request_timeout = 30  # Set timeout to 30 seconds

def read_media_list(file_path):
    """Read the list of media filenames from a .txt file."""
    # Added encoding='utf-8' to handle Unicode characters in file paths
    with open(file_path, "r", encoding='utf-8') as f:
        media_files = [line.strip() for line in f.readlines()]
    return media_files

def load_tags(file_path):
    """Load the allowed tags from a .json file."""
    # Added encoding='utf-8' to handle Unicode characters in tag names
    with open(file_path, "r", encoding='utf-8') as f:
        tags = json.load(f)
    return tags

def get_video_description(video_name):
    """Get the description for a video if it exists."""
    try:
        # Remove extension if present
        video_name_without_ext = os.path.splitext(video_name)[0]
        
        # Split the video path to get channel and video name
        parts = video_name_without_ext.split(os.path.sep)
        
        if len(parts) >= 2:
            channel = parts[0]
            video_file = parts[-1]
            
            # Build the description file path
            description_path = os.path.join(DESCRIPTIONS_DIR, channel, f"{video_file}.txt")
            
            if os.path.exists(description_path):
                # Already using utf-8 for reading descriptions
                with open(description_path, "r", encoding="utf-8") as f:
                    description = f.read().strip()
                
                # Limit description length to avoid overwhelming the prompt
                if len(description) > 1000:
                    description = description[:1000] + "... [truncated]"
                
                return description
            else:
                return None
        else:
            # Video is in root directory
            description_path = os.path.join(DESCRIPTIONS_DIR, "Root", f"{video_name_without_ext}.txt")
            
            if os.path.exists(description_path):
                with open(description_path, "r", encoding="utf-8") as f:
                    description = f.read().strip()
                
                if len(description) > 1000:
                    description = description[:1000] + "... [truncated]"
                
                return description
            else:
                return None
                
    except Exception as e:
        print(f"Error reading description for {video_name}: {e}")
        return None

def generate_tags_for_video(video_name, allowed_tags):
    """Use the koboldcpp API to choose two tags from the allowed pool for a video."""
    
    # Extract channel name from the video path
    parts = video_name.split(os.path.sep)
    channel_name = parts[0] if len(parts) >= 2 else "Unknown"
    
    # Check if it's an MP3 file (case-insensitive)
    is_mp3 = video_name.lower().endswith('.mp3')
    
    # Check if "ASMR" is in the filename (case-insensitive)
    has_asmr = 'asmr' in video_name.lower()
    
    # Rule 1: Any file with "ASMR" in the name gets "ASMR, [channelname]"
    if has_asmr:
        tags = ["ASMR", channel_name]
        print(f"  Auto-tagged with ASMR rule: {tags[0]}, {tags[1]}")
        return tags[:2]
    
    # Rule 2: MP3 files without ASMR get "Music, [channelname]"
    if is_mp3:
        tags = ["Music", channel_name]
        print(f"  Auto-tagged as music file: {tags[0]}, {tags[1]}")
        return tags[:2]
    
    # For non-ASMR video files (mp4, mkv), use the LLM
    print(f"  Using LLM for video file: {video_name}")
    
    # Get video description if available
    description = get_video_description(video_name)
    
    # Map abbreviations or alternative names to their full forms
    abbreviation_map = {
        "GTA": "Grand Theft Auto",
        "CoD": "Call of Duty",
        "AC": "Assassin's Creed",
        "PS1": "Playstation 1",
        "PS2": "Playstation 2",
        "PS3": "Playstation 3",
        "PS4": "Playstation 4",
        "PS5": "Playstation 5",
        # Add more mappings as needed
    }

    # Replace abbreviations in the video name with their full forms
    for abbrev, full_name in abbreviation_map.items():
        video_name = video_name.replace(abbrev, full_name)

    # Split the allowed tags into smaller chunks (e.g., 50 tags per chunk)
    chunk_size = 50
    tag_chunks = [allowed_tags[i:i + chunk_size] for i in range(0, len(allowed_tags), chunk_size)]

    # Initialize a list to store valid tags
    valid_tags = []

    # Build the base prompt parts
    title_part = f"Video Title: {video_name}\n\n"
    description_part = ""
    if description:
        description_part = f"Video Description:\n{description}\n\n"
    
    # Process each chunk of tags
    for chunk in tag_chunks:
        # Customize the prompt with description if available
        prompt = (
            f"Analyze the following video title and description (if available). "
            f"Choose exactly two tags from the list below to categorize it. "
            f"Your response must be exactly two words from the provided list, separated by a comma. "
            f"Do not add any extra text or explanations. "
            f"If a console, brand, person, character or game is mentioned, prefer their respective tag.\n\n"
            f"{title_part}"
            f"{description_part}"
            f"Allowed Tags: {', '.join(chunk)}\n\n"
            f"Chosen Tags: "
        )

        try:
            # Send the request to the koboldcpp API with timeout handling
            response = openai.Completion.create(
                model="koboldcpp",  # Model name (can be anything for koboldcpp)
                prompt=prompt,
                max_tokens=30,
                stop=["\n"],
                temperature=0.7,  # Adjust for creativity
                timeout=30  # Add timeout parameter here too
            )

            # Extract the chosen tags
            chosen_tags = response["choices"][0]["text"].strip()

            # Split the response into two tags
            tags = [tag.strip() for tag in chosen_tags.split(",")][:2]  # Ensure only two tags are taken

            # Validate the tags and add them to the valid_tags list
            for tag in tags:
                if tag in allowed_tags and tag not in valid_tags:
                    valid_tags.append(tag)

            # Stop if we have two valid tags
            if len(valid_tags) >= 2:
                break

        except Exception as e:
            print(f"Error generating tags: {e}")
            print("Will retry with smaller tag chunks or use default tags")
            continue

    # If fewer than two valid tags were found, use the default tag
    while len(valid_tags) < 2:
        valid_tags.append(DEFAULT_TAG)

    return valid_tags[:2]  # Ensure only two tags are returned

def save_tags_to_file(video_name, tags, output_dir):
    """Save the chosen tags to a .txt file in the specified output directory, preserving the original file structure."""
    # Extract the subfolder name (if any)
    subfolder_name = os.path.dirname(video_name)
    
    # Create the output path by joining output_dir with the video_name's directory structure
    output_path = os.path.join(output_dir, os.path.dirname(video_name))
    
    # Create the directory if it doesn't exist
    if not os.path.exists(output_path):
        os.makedirs(output_path)
    
    # Create the output file name (without extension)
    base_name = os.path.splitext(os.path.basename(video_name))[0]
    
    # Add the subfolder name to the tags
    if subfolder_name:  # Only add if there's a subfolder
        tags_with_subfolder = tags + [subfolder_name]
    else:
        tags_with_subfolder = tags + ["Root"]  # Or some default for root-level videos
    
    # Create the output file path
    tag_file = os.path.join(output_path, f"{base_name}.txt")
    
    # Write the tags to the file - Added encoding='utf-8' to handle Unicode
    with open(tag_file, "w", encoding='utf-8') as f:
        f.write(f"{tags_with_subfolder[0]}, {tags_with_subfolder[1]}, {tags_with_subfolder[2]}\n")

def main():
    # Step 1: Always load the super expanded tag list
    print(f"Loading tags from: {TAGS_SUPEREXPANDED_FILE}")
    allowed_tags = load_tags(TAGS_SUPEREXPANDED_FILE)
    print(f"Loaded {len(allowed_tags)} allowed tags from {TAGS_SUPEREXPANDED_FILE}.")
    print(f"Using super accurate and slow tag list (tags_superexpanded.json)")
    print(f"Timeout set to 30 seconds for model loading and responses")
    
    # Display descriptions directory
    print(f"Looking for descriptions in: {DESCRIPTIONS_DIR}")

    # Step 2: Read the existing media list
    # Make media_list.txt path relative to script directory
    media_list_path = os.path.join(SCRIPT_DIR, media_list)
    print(f"Looking for media list at: {media_list_path}")
    media_files = read_media_list(media_list_path)
    print(f"Found {len(media_files)} media files in the list.")
    
    # Display the output directory
    print(f"Output will be saved to: {OUTPUT_DIR}")
    
    # Check if there are media files to process
    if not media_files:
        print("No media files to process. Exiting.")
        return

    # Step 3: Process each media file
    asmr_count = 0
    music_count = 0
    llm_count = 0
    
    for index, media_name in enumerate(media_files, 1):
        print(f"\nProcessing {index}/{len(media_files)}: {media_name}")
        
        # Check if description exists (for video files)
        description = get_video_description(media_name)
        if description:
            print(f"Found description ({len(description)} chars)")
        else:
            print("No description found")
            
        try:
            tags = generate_tags_for_video(media_name, allowed_tags)
            print(f"Chosen Tags: {tags[0]}, {tags[1]}")
            save_tags_to_file(media_name, tags, OUTPUT_DIR)
            print(f"Tags saved for {media_name} in {OUTPUT_DIR}.")
            
            # Count by processing method
            if 'asmr' in media_name.lower():
                asmr_count += 1
            elif media_name.lower().endswith('.mp3'):
                music_count += 1
            else:
                llm_count += 1
                
        except Exception as e:
            print(f"Error processing {media_name}: {e}")
            print(f"Using default tags for {media_name}")
            tags = [DEFAULT_TAG, DEFAULT_TAG]
            save_tags_to_file(media_name, tags, OUTPUT_DIR)

    print(f"\n{'='*50}")
    print(f"COMPLETED! Processed {len(media_files)} media files:")
    print(f"  - ASMR auto-tagged: {asmr_count}")
    print(f"  - Music auto-tagged: {music_count}")
    print(f"  - LLM-processed videos: {llm_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()