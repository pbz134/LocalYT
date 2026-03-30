import os
import re
import unicodedata

def contains_problematic_chars(text):
    """Check if a string contains any characters that might cause filesystem issues."""
    # Check for emojis and Windows-invalid characters
    problematic_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        u"\U0001f926-\U0001f937"
        u"\U00010000-\U0010ffff"
        u"\u2600-\u2B55"
        u"\u200d"
        u"\u23cf"
        u"\u23e9"
        u"\u231a"
        u"\ufe0f"  # variation selector
        u"\u3030"
        u"\u2018-\u201F"  # Various quotation marks and dashes
        u"\u2032-\u2037"  # Primes
        u"\u00AB-\u00BB"  # Angle quotes
        u"\u02BB-\u02BD"  # Modifier letters
        u"\uFF01-\uFF5E"  # Fullwidth forms (！-～)
        "]+", flags=re.UNICODE)
    
    # Also check for Windows-invalid characters
    windows_invalid = '<>:"/\\|?*'
    for char in text:
        if char in windows_invalid:
            return True
    
    return bool(problematic_pattern.search(text))

def sanitize_filename(text):
    """
    Remove emojis and replace problematic Unicode characters according to rules:
    - / \ ⧸ ⧹ * ＊ " ＂ | ｜ should be replaced with space
    - : ? ？ should be removed
    """
    # First, normalize the text
    text = unicodedata.normalize('NFKD', text)
    
    # Characters to replace with space
    space_replacements = {
        # Standard ASCII characters
        '/': ' ',
        '\\': ' ',
        '*': ' ',
        '"': ' ',
        '|': ' ',
        
        # Fullwidth variants
        '\uFF0F': ' ',  # Fullwidth solidus (/)
        '\uFF3C': ' ',  # Fullwidth reverse solidus (\)
        '\uFF0A': ' ',  # Fullwidth asterisk (*)
        '\uFF02': ' ',  # Fullwidth quotation mark (")
        '\uFF5C': ' ',  # Fullwidth vertical line (|)
        
        # Special slash variants
        '\u29F8': ' ',  # Big solidus (⧸)
        '\u29F9': ' ',  # Big reverse solidus (⧹)
        
        # Other quotation mark variants
        '\u201C': ' ',  # Left double quote
        '\u201D': ' ',  # Right double quote
        '\u201E': ' ',  # Double low-9 quote
        '\u201F': ' ',  # Double high-reversed-9 quote
        '\u00AB': ' ',  # Left-pointing double angle quote
        '\u00BB': ' ',  # Right-pointing double angle quote
    }
    
    # Characters to remove completely
    remove_chars = {
        # Standard ASCII
        ':': '',
        '?': '',
        
        # Fullwidth variants
        '\uFF1A': '',  # Fullwidth colon (：)
        '\uFF1F': '',  # Fullwidth question mark (？)
        
        # Other variants
        '\u055E': '',  # Armenian question mark
        '\u061F': '',  # Arabic question mark
        '\u203D': '',  # Interrobang
        '\u2E2E': '',  # Reversed question mark
    }
    
    # Apply space replacements
    for old, new in space_replacements.items():
        if isinstance(old, str):
            text = text.replace(old, new)
    
    # Apply character removals
    for old, new in remove_chars.items():
        if isinstance(old, str):
            text = text.replace(old, new)
    
    # Remove emojis (everything in the Unicode emoji ranges)
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        u"\U0001f926-\U0001f937"
        u"\U00010000-\U0010ffff"
        u"\u2600-\u2B55"
        u"\u200d"
        u"\u23cf"
        u"\u23e9"
        u"\u231a"
        u"\ufe0f"  # variation selector
        u"\u3030"
        "]+", flags=re.UNICODE)
    
    text = emoji_pattern.sub(r'', text)
    
    # Replace multiple consecutive spaces with a single space
    text = re.sub(r' +', ' ', text)
    
    # Remove any remaining non-printable characters
    text = ''.join(char for char in text if char.isprintable())
    
    # Remove leading/trailing spaces and dots (Windows doesn't like these at ends)
    text = text.strip('. ')
    
    # Ensure the filename isn't empty after sanitization
    if not text:
        text = "unnamed"
    
    # Also ensure the filename doesn't end with a space or period
    while text.endswith(' ') or text.endswith('.'):
        text = text[:-1]
    
    # Ensure filename doesn't start with a space
    text = text.lstrip()
    
    return text

def safe_rename_with_fallback(src, dst):
    """
    Attempt to rename a file, with fallback strategies if it fails.
    """
    try:
        os.rename(src, dst)
        return True
    except Exception as e:
        # If direct rename fails, try a two-step process
        try:
            # First, rename to a temporary name
            dirname = os.path.dirname(dst)
            temp_name = os.path.join(dirname, f"_temp_{os.path.basename(dst)}")
            os.rename(src, temp_name)
            # Then rename to the final name
            os.rename(temp_name, dst)
            return True
        except:
            return False

def remove_special_chars_from_filenames(directory):
    """
    Recursively scan a directory and remove emojis and fix problematic characters
    in all filenames.
    
    Args:
        directory (str): Path to the directory to process
    """
    renamed_count = 0
    error_count = 0
    skipped_count = 0
    
    # Walk through all directories and files
    for root, dirs, files in os.walk(directory, topdown=False):
        # First, rename files
        for filename in files:
            file_path = os.path.join(root, filename)
            
            # Check if filename contains problematic characters
            if contains_problematic_chars(filename):
                new_filename = sanitize_filename(filename)
                
                # Only rename if the new filename is different and not empty
                if new_filename and new_filename != filename:
                    new_file_path = os.path.join(root, new_filename)
                    
                    # Handle case where new filename already exists
                    if os.path.exists(new_file_path):
                        base, ext = os.path.splitext(new_filename)
                        counter = 1
                        while os.path.exists(os.path.join(root, f"{base}_{counter}{ext}")):
                            counter += 1
                        new_file_path = os.path.join(root, f"{base}_{counter}{ext}")
                    
                    try:
                        # Print debug info
                        print(f"Original: {filename}")
                        print(f"Sanitized: {new_filename}")
                        
                        if safe_rename_with_fallback(file_path, new_file_path):
                            print(f"✓ Renamed: {filename} -> {os.path.basename(new_file_path)}")
                            renamed_count += 1
                        else:
                            print(f"✗ Failed to rename: {filename}")
                            error_count += 1
                    except Exception as e:
                        print(f"✗ Error renaming {filename}: {e}")
                        print(f"  Problematic characters: {repr(filename)}")
                        error_count += 1
                else:
                    skipped_count += 1
        
        # Then, rename directories (after processing their contents)
        for dirname in dirs:
            dir_path = os.path.join(root, dirname)
            
            # Check if directory name contains problematic characters
            if contains_problematic_chars(dirname):
                new_dirname = sanitize_filename(dirname)
                
                # Only rename if the new dirname is different and not empty
                if new_dirname and new_dirname != dirname:
                    new_dir_path = os.path.join(root, new_dirname)
                    
                    # Handle case where new directory name already exists
                    if os.path.exists(new_dir_path):
                        counter = 1
                        while os.path.exists(os.path.join(root, f"{new_dirname}_{counter}")):
                            counter += 1
                        new_dir_path = os.path.join(root, f"{new_dirname}_{counter}")
                    
                    try:
                        print(f"Original dir: {dirname}")
                        print(f"Sanitized dir: {new_dirname}")
                        
                        if safe_rename_with_fallback(dir_path, new_dir_path):
                            print(f"✓ Renamed directory: {dirname} -> {os.path.basename(new_dir_path)}")
                            renamed_count += 1
                        else:
                            print(f"✗ Failed to rename directory: {dirname}")
                            error_count += 1
                    except Exception as e:
                        print(f"✗ Error renaming directory {dirname}: {e}")
                        print(f"  Problematic characters: {repr(dirname)}")
                        error_count += 1
                else:
                    skipped_count += 1
    
    return renamed_count, error_count, skipped_count

def main():
    # List of directories to process
    directories = [
        "comments",
        "descriptions",
        "filedates",
        "ratings",
        "thumbnails",
        "videos",
        "videolengths",
        "videostats",
        "viewcounts"
    ]
    
    total_renamed = 0
    total_errors = 0
    total_skipped = 0
    
    print("=" * 60)
    print("FILENAME SANITIZER - Removes emojis and fixes special characters")
    print("=" * 60)
    print("Rules:")
    print("  • / \\ ⧸ ⧹ * ＊ \" ＂ | ｜ → space")
    print("  • : ? ？ → removed")
    print("=" * 60)
    
    # Process each directory
    for directory in directories:
        if os.path.exists(directory) and os.path.isdir(directory):
            print(f"\n📁 Processing directory: {directory}")
            print("-" * 40)
            renamed, errors, skipped = remove_special_chars_from_filenames(directory)
            total_renamed += renamed
            total_errors += errors
            total_skipped += skipped
            print(f"📊 Renamed: {renamed}, Errors: {errors}, Skipped: {skipped} in {directory}")
        else:
            print(f"\n⚠️  Directory '{directory}' does not exist, skipping...")
    
    print("\n" + "=" * 60)
    print(f"✅ COMPLETE!")
    print(f"   Total items renamed: {total_renamed}")
    print(f"   Total errors: {total_errors}")
    print(f"   Total skipped: {total_skipped}")
    print("=" * 60)

if __name__ == "__main__":
    main()