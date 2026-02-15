import os
import re

def check_and_create_subcount_files(videos_dir="./videos", subcount_dir="./subcount"):
    """
    Analyze folders in /videos and ensure corresponding .txt files exist in /subcount.
    Creates missing files with default content "10,000".
    """
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"ERROR: Videos directory not found: {videos_dir}")
        return
    
    # Ensure the subcount directory exists
    os.makedirs(subcount_dir, exist_ok=True)
    
    # Get all folders in the videos directory
    print(f"Scanning for channel folders in {videos_dir}...")
    
    try:
        channel_folders = [
            d for d in os.listdir(videos_dir) 
            if os.path.isdir(os.path.join(videos_dir, d))
        ]
    except FileNotFoundError:
        print(f"No channel folders found in {videos_dir}")
        return
    
    channel_count = len(channel_folders)
    
    if channel_count == 0:
        print(f"No channel folders found in {videos_dir}")
        return
    
    print(f"Found {channel_count} channel folder(s): {', '.join(channel_folders)}")
    print("\nChecking for corresponding subcount files...")
    
    # Track results
    existing_files = []
    created_files = []
    
    # Check each channel folder
    for channel in channel_folders:
        # Create the expected txt filename (channel name + .txt)
        txt_filename = f"{channel}.txt"
        txt_file_path = os.path.join(subcount_dir, txt_filename)
        
        # Check if the txt file already exists
        if os.path.exists(txt_file_path):
            # File exists, read its content
            try:
                with open(txt_file_path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                
                # Try to parse the number to check format
                # Remove commas and convert to int if possible
                clean_content = content.replace(',', '')
                if clean_content.isdigit():
                    existing_files.append(f"{channel}: {content}")
                else:
                    existing_files.append(f"{channel}: '{content}' (non-numeric)")
            except Exception as e:
                existing_files.append(f"{channel}: Error reading file ({str(e)})")
        else:
            # File doesn't exist, create it with default content
            default_content = "10,000"
            try:
                with open(txt_file_path, 'w', encoding='utf-8') as f:
                    f.write(default_content)
                created_files.append(f"{channel}: Created with '{default_content}'")
            except Exception as e:
                print(f"  ✗ Error creating {txt_filename}: {str(e)}")
    
    # Print summary
    print(f"\n--- Summary ---")
    
    if existing_files:
        print(f"Existing subcount files ({len(existing_files)}):")
        for file_info in existing_files:
            print(f"  ✓ {file_info}")
    
    if created_files:
        print(f"\nCreated new subcount files ({len(created_files)}):")
        for file_info in created_files:
            print(f"  + {file_info}")
    
    if not existing_files and not created_files:
        print("No subcount files were processed.")
    
    print(f"\nTotal channel folders: {channel_count}")
    print(f"Total subcount files now exist: {len(existing_files) + len(created_files)}")
    print(f"Output directory: {subcount_dir}")
    
    # List all subcount files for verification
    try:
        subcount_files = [
            f for f in os.listdir(subcount_dir) 
            if f.endswith('.txt') and os.path.isfile(os.path.join(subcount_dir, f))
        ]
        
        if subcount_files:
            print(f"\nAll subcount files in directory ({len(subcount_files)}):")
            for filename in sorted(subcount_files):
                filepath = os.path.join(subcount_dir, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                    print(f"  {filename}: '{content}'")
                except:
                    print(f"  {filename}: [Error reading content]")
    except FileNotFoundError:
        pass

def validate_subcount_format(subcount_dir="./subcount"):
    """
    Optional: Validate that all subcount files contain properly formatted numbers.
    """
    print(f"\n--- Validating Subcount File Formats ---")
    
    if not os.path.exists(subcount_dir):
        print(f"Subcount directory not found: {subcount_dir}")
        return
    
    try:
        subcount_files = [
            f for f in os.listdir(subcount_dir) 
            if f.endswith('.txt') and os.path.isfile(os.path.join(subcount_dir, f))
        ]
    except FileNotFoundError:
        return
    
    if not subcount_files:
        print("No subcount files found to validate.")
        return
    
    valid_files = 0
    invalid_files = []
    
    for filename in subcount_files:
        filepath = os.path.join(subcount_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            # Remove commas and check if it's a valid number
            clean_content = content.replace(',', '')
            
            if clean_content.isdigit():
                # Convert to int to verify it's a valid integer
                number = int(clean_content)
                valid_files += 1
            else:
                invalid_files.append((filename, content))
                
        except Exception as e:
            invalid_files.append((filename, f"Error: {str(e)}"))
    
    print(f"Valid files: {valid_files}/{len(subcount_files)}")
    
    if invalid_files:
        print(f"Invalid or problematic files ({len(invalid_files)}):")
        for filename, content in invalid_files:
            print(f"  ✗ {filename}: '{content}'")

if __name__ == '__main__':
    # Set your directories here
    videos_directory = "./videos"
    subcount_directory = "./subcount"
    
    # Run the main function
    check_and_create_subcount_files(videos_directory, subcount_directory)
    
    # Optional: Run validation
    validate_subcount_format(subcount_directory)
    
    print("\nDone!")