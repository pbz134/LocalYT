import os
import json
import openai
import time
import re
from difflib import get_close_matches

# Configuration
KOBOLDCPP_API_URL = "http://localhost:5001/v1"
media_list = "media_list.txt"

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TAGS_SUPEREXPANDED_FILE = os.path.join(SCRIPT_DIR, "tags_superexpanded.json")
AUTO_TAG_RULES_FILE = os.path.join(SCRIPT_DIR, "auto_tag_rules.json")

# Updated output directory - go up one level from script directory and then into "videos"
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PARENT_DIR, "videos")
DESCRIPTIONS_DIR = os.path.join(PARENT_DIR, "descriptions")  # Descriptions directory

DEFAULT_TAG = "Uncategorized"  # Default tag if the model fails to choose one
MAX_LLM_RETRIES = 3           # How many times to retry if the LLM gives invalid tags

# Set up the OpenAI client for koboldcpp (Legacy v0.28 syntax)
openai.api_base = KOBOLDCPP_API_URL
openai.api_key = "dummy-key"  # API key is not required for local koboldcpp
openai.request_timeout = 90   # Increased timeout for the full tag list and retries

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
        
        # Normalize match_value to a list for multi-value matching
        if isinstance(match_value, str):
            match_values = [match_value]
        elif isinstance(match_value, list):
            match_values = match_value
        else:
            continue
        
        # Prepare the video name for matching (do this once per rule, not per value)
        video_name_for_match = video_name if case_sensitive else video_name.lower()
        
        matched = False
        
        # Loop through all values in the match_values list
        for current_match_value in match_values:
            # Skip empty values in the list
            if not current_match_value:
                continue
                
            match_value_for_match = current_match_value if case_sensitive else current_match_value.lower()
            
            if match_type == "contains":
                if match_value_for_match in video_name_for_match:
                    matched = True
                    break
            
            elif match_type == "extension":
                if video_name_for_match.endswith(match_value_for_match):
                    matched = True
                    break
            
            elif match_type == "starts_with":
                if video_name_for_match.startswith(match_value_for_match):
                    matched = True
                    break
            
            elif match_type == "ends_with":
                if video_name_for_match.endswith(match_value_for_match):
                    matched = True
                    break
            
            elif match_type == "regex":
                flags = 0 if case_sensitive else re.IGNORECASE
                try:
                    if re.search(current_match_value, video_name, flags):
                        matched = True
                        break
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

def validate_tag(tag, allowed_tags):
    """
    Validate a tag. If it's not perfectly in the list, 
    try fuzzy matching to correct minor LLM hallucinations/typos.
    """
    tag = tag.strip()
    if tag in allowed_tags:
        return tag
    
    # Fuzzy match: find the closest tag with at least 80% similarity
    matches = get_close_matches(tag, allowed_tags, n=1, cutoff=0.8)
    if matches:
        return matches[0]
    
    return None

def clean_llm_output(raw_text):
    """
    Removes <think...>...</think > blocks, ziali tags, and extracts
    the last meaningful line (the actual answer) from LLM responses.
    """
    # Remove <think...>...</think > or <ziali...>...</ziali > blocks
    cleaned = re.sub(r'<think.*?>.*?</think\s*>', '', raw_text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<ziali.*?>.*?</ziali\s*>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove any remaining XML-like tags just in case
    cleaned = re.sub(r'<[^>]+>', '', cleaned)
    
    # Split into lines and find the last non-empty line (the actual answer)
    lines = [line.strip() for line in cleaned.split('\n') if line.strip()]
    
    if lines:
        return lines[-1]
    return cleaned.strip()

def generate_tags_for_video(video_name, allowed_tags, auto_tag_rules):
    """Use the koboldcpp API to choose two tags from the allowed pool for a video.
    Returns None if the LLM fails to produce 2 valid tags after MAX_LLM_RETRIES attempts.
    When None is returned, the caller should NOT create a .txt tag file.
    """
    
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
    }

    # Replace abbreviations in the video name with their full forms
    video_name_processed = video_name
    for abbrev, full_name in abbreviation_map.items():
        video_name_processed = video_name_processed.replace(abbrev, full_name)

    # Build the user prompt content with the FULL tag list
    user_content = f"Video Title: {video_name_processed}\n\n"
    if description:
        user_content += f"Video Description:\n{description}\n\n"
    user_content += f"Allowed Tags: {', '.join(allowed_tags)}\n\n"

    valid_tags = []
    attempts = 0
    llm_call_failed = False  # Track if all LLM attempts exhausted without success

    # Retry loop if the LLM outputs invalid tags
    while len(valid_tags) < 2 and attempts < MAX_LLM_RETRIES:
        attempts += 1
        if attempts > 1:
            print(f"  Retry attempt {attempts}/{MAX_LLM_RETRIES}...")
            time.sleep(1) # Brief pause before retrying

        try:
            # Send the request using the legacy openai v0.28 Chat syntax
            response = openai.ChatCompletion.create(
                model="kcpp",  # Updated to match KoboldCPP API docs
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful video categorization assistant. "
                            "Your task is to choose exactly two tags from the provided 'Allowed Tags' list to categorize the video. "
                            "Your response must be exactly two tags from the list, separated by a comma. "
                            "Do not add any extra text, explanations, or file names. "
                            "If a console, brand, person, character, or game is mentioned, prefer their respective tag."
                        )
                    },
                    {
                        "role": "user",
                        "content": user_content
                    }
                ],
                max_tokens=50,      # Increased slightly to allow for thinking tags
                temperature=0.2,    # Bumped slightly from 0.1 to give it a tiny bit of flexibility on retries
                timeout=90,
                # =====================================================================
                # SOLUTION 1: Pass kwargs to the Jinja template parser to disable 
                # thinking natively at the server level before generation begins.
                # =====================================================================
                extra_body={
                    "chat_template_kwargs": {
                        "enable_thinking": False
                    }
                }
            )

            # Extract the chosen tags (legacy dictionary access)
            raw_text = response["choices"][0]["message"]["content"].strip()
            
            # Clean out thinking blocks and extract the final line
            # (Still keeping this as a fallback safety net in case of edge cases)
            cleaned_tags = clean_llm_output(raw_text)
            
            if attempts == 1 and raw_text != cleaned_tags:
                print(f"  (Cleaned LLM thinking blocks from output)")

            # Split the response into two tags
            raw_tags = [tag.strip() for tag in cleaned_tags.split(",")][:2]

            # Validate the tags with fuzzy matching
            current_valid = []
            for tag in raw_tags:
                validated_tag = validate_tag(tag, allowed_tags)
                if validated_tag and validated_tag not in valid_tags and validated_tag not in current_valid:
                    current_valid.append(validated_tag)
            
            valid_tags.extend(current_valid)

        except Exception as e:
            print(f"Error generating tags: {e}")
            print("Will retry or skip video.")

    # If fewer than two valid tags were found after all retries,
    # the LLM has failed - return None so NO .txt tag file is created
    if len(valid_tags) < 2:
        llm_call_failed = True
        print(f"  LLM failed to produce valid tags after {MAX_LLM_RETRIES} attempts. No .txt file will be created.")
        return None

    return valid_tags[:2]

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
        raise

def main():
    # Step 1: Always load the super expanded tag list
    print(f"Loading tags from: {TAGS_SUPEREXPANDED_FILE}")
    allowed_tags = load_tags(TAGS_SUPEREXPANDED_FILE)
    print(f"Loaded {len(allowed_tags)} allowed tags from {TAGS_SUPEREXPANDED_FILE}.")
    print(f"Using full tag list directly (no chunking).")
    
    # Step 1.5: Load auto-tag rules
    auto_tag_rules = load_auto_tag_rules(AUTO_TAG_RULES_FILE)
    
    # Display descriptions directory
    print(f"Looking for descriptions in: {DESCRIPTIONS_DIR}")

    # Step 2: Read the existing media list
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
    llm_failed_count = 0  # Track videos skipped due to LLM failure
    
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
            
            # If the LLM failed after MAX_LLM_RETRIES, tags will be None.
            # Do NOT create a .txt tag file for this video.
            if tags is None:
                print(f"  Skipping {media_name} - no .txt file will be created due to LLM failure.")
                llm_failed_count += 1
                continue
                
            print(f"  Chosen Tags: {tags[0]}, {tags[1]}")
            save_tags_to_file(media_name, tags, OUTPUT_DIR)
            
            # Determine if it was auto-tagged or LLM-processed
            # (re-check rules to classify for statistics; tags is guaranteed non-None here)
            _, rule_name = apply_auto_tag_rules(media_name, auto_tag_rules)
            if rule_name is not None:
                auto_tag_count += 1
                rule_match_counts[rule_name] = rule_match_counts.get(rule_name, 0) + 1
            else:
                llm_count += 1
                
        except Exception as e:
            print(f"  Error processing {media_name}: {e}")
            print(f"  Skipping {media_name} - no .txt file will be created.")
            llm_failed_count += 1

    print(f"\n{'='*50}")
    print(f"COMPLETED! Processed {len(media_files)} media files:")
    print(f"  - Auto-tagged (rules): {auto_tag_count}")
    if rule_match_counts:
        print(f"    Rule breakdown:")
        for rule_name, count in sorted(rule_match_counts.items(), key=lambda x: -x[1]):
            print(f"      - {rule_name}: {count}")
    print(f"  - LLM-processed (success): {llm_count}")
    print(f"  - LLM failed (no file created): {llm_failed_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()