import os
import json
import openai
import time
import re

# Configuration
KOBOLDCPP_API_URL = "http://localhost:5001/v1"  # Replace with your koboldcpp API endpoint
media_list = "media_list.txt"  # Path to your existing video list file

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TAGS_SUPEREXPANDED_FILE = os.path.join(SCRIPT_DIR, "tags_superexpanded.json")
AUTO_TAG_RULES_FILE = os.path.join(SCRIPT_DIR, "auto_tag_rules.json")

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
    with open(file_path, "r", encoding='utf-8') as f:
        media_files = [line.strip() for line in f.readlines()]
    return media_files

def load_tags(file_path):
    """Load the allowed tags from a .json file."""
    with open(file_path, "r", encoding='utf-8') as f:
        tags = json.load(f)
    return tags

def load_auto_tag_rules(file_path):
    """Load automatic tag rules from a JSON file."""
    if not os.path.exists(file_path):
        print(f"No auto-tag rules file found at {file_path}. Using empty rules.")
        return []
    
    with open(file_path, "r", encoding='utf-8') as f:
        rules_data = json.load(f)
    
    rules = rules_data.get("auto_tag_rules", [])
    print(f"Loaded {len(rules)} auto-tag rules from {file_path}")
    return rules

def apply_auto_tag_rules(video_name, rules):
    """
    Apply automatic tag rules to a video.
    
    Args:
        video_name: The full video path/name to match against
        rules: List of rule dictionaries from auto_tag_rules.json
    
    Returns:
        tuple: (tags_list, rule_name) if matched, (None, None) if no match
    """
    for rule in rules:
        match_type = rule.get("match_type", "contains")
        match_value = rule.get("match_value", "")
        case_sensitive = rule.get("case_sensitive", False)
        tags = rule.get("tags", [])
        rule_name = rule.get("name", "Unnamed Rule")
        
        # Skip rules with no tags defined
        if not tags:
            continue
        
        # Prepare strings for matching
        video_name_for_match = video_name if case_sensitive else video_name.lower()
        match_value_for_match = match_value if case_sensitive else match_value.lower()
        
        matched = False
        
        if match_type == "contains":
            matched = match_value_for_match in video_name_for_match
        
        elif match_type == "extension":
            matched = video_name_for_match.endswith(match_value_for_match)
        
        elif match_type == "starts_with":
            matched = video_name_for_match.startswith(match_value_for_match)
        
        elif match_type == "ends_with":
            matched = video_name_for_match.endswith(match_value_for_match)
        
        elif match_type == "regex":
            flags = 0 if case_sensitive else re.IGNORECASE
            try:
                matched = bool(re.search(match_value, video_name, flags))
            except re.error as e:
                print(f"  Warning: Invalid regex in rule '{rule_name}': {e}")
                matched = False
        
        else:
            print(f"  Warning: Unknown match_type '{match_type}' in rule '{rule_name}'")
            continue
        
        if matched:
            return tags, rule_name
    
    return None, None

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

def generate_tags_for_video(video_name, allowed_tags, auto_tag_rules):
    """Use the koboldcpp API to choose two tags from the allowed pool for a video."""
    
    # Extract channel name from the video path
    parts = video_name.split(os.path.sep)
    channel_name = parts[0] if len(parts) >= 2 else "Unknown"
    
    # Try auto-tag rules first
    auto_tags, rule_name = apply_auto_tag_rules(video_name, auto_tag_rules)
    
    if auto_tags is not None:
        # Pad with channel name if fewer than 2 tags
        while len(auto_tags) < 2:
            if channel_name not in auto_tags:
                auto_tags.append(channel_name)
            else:
                auto_tags.append(DEFAULT_TAG)
        
        print(f"  Auto-tagged by rule '{rule_name}': {auto_tags[0]}, {auto_tags[1]}")
        return auto_tags[:2]
    
    # For non-matching files, use the LLM
    print(f"  Using LLM for: {video_name}")
    
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
                temperature=0.1,
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
    try:
        # Get the directory part of the video path
        video_dir = os.path.dirname(video_name)
        
        # Create the full output directory path
        if video_dir:
            output_path = os.path.join(output_dir, video_dir)
        else:
            output_path = output_dir
        
        # Create the directory if it doesn't exist
        if not os.path.exists(output_path):
            os.makedirs(output_path, exist_ok=True)
            print(f"  Created directory: {output_path}")
        
        # Create the output file name (without extension)
        base_name = os.path.splitext(os.path.basename(video_name))[0]
        
        # Get the channel name (first part of the path) for the third tag
        parts = video_name.split(os.path.sep)
        channel_name = parts[0] if len(parts) >= 2 else "Root"
        
        # Add the channel name as the third tag
        tags_with_channel = tags + [channel_name]
        
        # Create the output file path
        tag_file = os.path.join(output_path, f"{base_name}.txt")
        
        # Write the tags to the file
        with open(tag_file, "w", encoding='utf-8') as f:
            f.write(f"{tags_with_channel[0]}, {tags_with_channel[1]}, {tags_with_channel[2]}\n")
        
        print(f"  Tags saved to: {tag_file}")
        
    except Exception as e:
        print(f"  ERROR saving tags: {e}")
        print(f"  Video name: {video_name}")
        print(f"  Output directory: {output_dir}")
        print(f"  Video directory: {video_dir if 'video_dir' in locals() else 'N/A'}")
        print(f"  Output path: {output_path if 'output_path' in locals() else 'N/A'}")
        print(f"  Tag file: {tag_file if 'tag_file' in locals() else 'N/A'}")
        raise  # Re-raise the exception so the main function knows it failed

def main():
    # Step 1: Always load the super expanded tag list
    print(f"Loading tags from: {TAGS_SUPEREXPANDED_FILE}")
    allowed_tags = load_tags(TAGS_SUPEREXPANDED_FILE)
    print(f"Loaded {len(allowed_tags)} allowed tags from {TAGS_SUPEREXPANDED_FILE}.")
    print(f"Using super accurate and slow tag list (tags_superexpanded.json)")
    print(f"Timeout set to 30 seconds for model loading and responses")
    
    # Step 1.5: Load auto-tag rules
    auto_tag_rules = load_auto_tag_rules(AUTO_TAG_RULES_FILE)
    
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
    auto_tag_count = 0
    llm_count = 0
    
    # Track which rules matched
    rule_match_counts = {}
    
    for index, media_name in enumerate(media_files, 1):
        print(f"\nProcessing {index}/{len(media_files)}: {media_name}")
        
        # Check if description exists (for video files)
        description = get_video_description(media_name)
        if description:
            print(f"  Found description ({len(description)} chars)")
        else:
            print("  No description found")
            
        try:
            tags = generate_tags_for_video(media_name, allowed_tags, auto_tag_rules)
            print(f"  Chosen Tags: {tags[0]}, {tags[1]}")
            save_tags_to_file(media_name, tags, OUTPUT_DIR)
            
            # Check if it was auto-tagged or LLM-processed
            _, rule_name = apply_auto_tag_rules(media_name, auto_tag_rules)
            if rule_name is not None:
                auto_tag_count += 1
                rule_match_counts[rule_name] = rule_match_counts.get(rule_name, 0) + 1
            else:
                llm_count += 1
                
        except Exception as e:
            print(f"  Error processing {media_name}: {e}")
            print(f"  Using default tags for {media_name}")
            tags = [DEFAULT_TAG, DEFAULT_TAG]
            try:
                save_tags_to_file(media_name, tags, OUTPUT_DIR)
                llm_count += 1
            except Exception as save_error:
                print(f"  CRITICAL: Could not save default tags either: {save_error}")

    print(f"\n{'='*50}")
    print(f"COMPLETED! Processed {len(media_files)} media files:")
    print(f"  - Auto-tagged (rules): {auto_tag_count}")
    if rule_match_counts:
        print(f"    Rule breakdown:")
        for rule_name, count in sorted(rule_match_counts.items(), key=lambda x: -x[1]):
            print(f"      - {rule_name}: {count}")
    print(f"  - LLM-processed: {llm_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()