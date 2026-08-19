import os
import re
import sys
import unicodedata
from pathlib import Path

def get_progress_bar(current, total, width=20):
    """Generate a simple progress bar string."""
    if total == 0:
        return "[" + " " * width + "]"
    
    filled = int((current / total) * width)
    bar = "=" * filled + " " * (width - filled)
    return f"[{bar}]"

def contains_problematic_chars(text):
    """Check if a string contains any characters that might cause filesystem issues."""
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
    text = unicodedata.normalize('NFKD', text)
    
    space_replacements = {
        '/': ' ',
        '\\': ' ',
        '*': ' ',
        '"': ' ',
        '|': ' ',
        '\uFF0F': ' ',  # Fullwidth solidus
        '\uFF3C': ' ',  # Fullwidth reverse solidus
        '\uFF0A': ' ',  # Fullwidth asterisk
        '\uFF02': ' ',  # Fullwidth quotation mark
        '\uFF5C': ' ',  # Fullwidth vertical line
        '\u29F8': ' ',  # Big solidus (⧸)
        '\u29F9': ' ',  # Big reverse solidus (⧹)
        '\u201C': ' ',  # Left double quote
        '\u201D': ' ',  # Right double quote
        '\u201E': ' ',  # Double low-9 quote
        '\u201F': ' ',  # Double high-reversed-9 quote
        '\u00AB': ' ',  # Left-pointing double angle quote
        '\u00BB': ' ',  # Right-pointing double angle quote
    }
    
    remove_chars = {
        ':': '',
        '?': '',
        '\uFF1A': '',  # Fullwidth colon
        '\uFF1F': '',  # Fullwidth question mark
        '\u055E': '',  # Armenian question mark
        '\u061F': '',  # Arabic question mark
        '\u203D': '',  # Interrobang
        '\u2E2E': '',  # Reversed question mark
    }
    
    for old, new in space_replacements.items():
        if isinstance(old, str):
            text = text.replace(old, new)
    
    for old, new in remove_chars.items():
        if isinstance(old, str):
            text = text.replace(old, new)
    
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"
        u"\U0001F300-\U0001F5FF"
        u"\U0001F680-\U0001F6FF"
        u"\U0001F1E0-\U0001F1FF"
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        u"\U0001f926-\U0001f937"
        u"\U00010000-\U0010ffff"
        u"\u2600-\u2B55"
        u"\u200d"
        u"\u23cf"
        u"\u23e9"
        u"\u231a"
        u"\ufe0f"
        u"\u3030"
        "]+", flags=re.UNICODE)
    
    text = emoji_pattern.sub(r'', text)
    text = re.sub(r' +', ' ', text)
    text = ''.join(char for char in text if char.isprintable())
    text = text.strip('. ')
    
    if not text:
        text = "unnamed"
    
    while text.endswith(' ') or text.endswith('.'):
        text = text[:-1]
    
    text = text.lstrip()
    
    return text

def safe_rename_with_overwrite(src, dst):
    """
    Attempt to rename a file/directory, overwriting if destination exists.
    """
    try:
        # If destination exists and is a file, remove it first
        if os.path.exists(dst):
            if os.path.isfile(dst):
                os.remove(dst)
            elif os.path.isdir(dst):
                # For directories, we need to handle differently
                # Remove the destination directory if it's empty or merge
                try:
                    shutil.rmtree(dst)
                except:
                    return False
        
        os.rename(src, dst)
        return True
    except Exception:
        # Try two-step rename as fallback
        try:
            dirname = os.path.dirname(dst)
            temp_name = os.path.join(dirname, f"_temp_rename_{os.path.basename(dst)}")
            
            # Clean up temp if it exists
            if os.path.exists(temp_name):
                if os.path.isfile(temp_name):
                    os.remove(temp_name)
                else:
                    shutil.rmtree(temp_name)
            
            os.rename(src, temp_name)
            
            # Remove destination if it still exists after first rename
            if os.path.exists(dst):
                if os.path.isfile(dst):
                    os.remove(dst)
                else:
                    shutil.rmtree(dst)
            
            os.rename(temp_name, dst)
            return True
        except:
            return False

def collect_items_to_process(directory):
    """
    Pre-scan directory to collect all files and dirs that need sanitization.
    Returns list of (path, name, is_dir) tuples.
    """
    items = []
    
    # Collect all files first
    for root, dirs, files in os.walk(directory, topdown=False):
        for filename in files:
            if contains_problematic_chars(filename):
                items.append((os.path.join(root, filename), filename, False))
        
        for dirname in dirs:
            if contains_problematic_chars(dirname):
                items.append((os.path.join(root, dirname), dirname, True))
    
    return items

def remove_special_chars_from_filenames(directory):
    """
    Recursively scan a directory and remove emojis and fix problematic characters
    in all filenames. Overwrites existing files if destination exists.
    """
    # Pre-scan to get count
    items_to_process = collect_items_to_process(directory)
    total_items = len(items_to_process)
    
    renamed_count = 0
    error_count = 0
    
    for i, (item_path, original_name, is_dir) in enumerate(items_to_process, 1):
        # Build status message with progress bar
        progress_bar = get_progress_bar(i, total_items)
        status_msg = f"{progress_bar} {i}/{total_items} (Fixed: {renamed_count})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        new_name = sanitize_filename(original_name)
        
        if new_name and new_name != original_name:
            parent_dir = os.path.dirname(item_path)
            new_path = os.path.join(parent_dir, new_name)
            
            if safe_rename_with_overwrite(item_path, new_path):
                renamed_count += 1
            else:
                error_count += 1
                print(f"\nError renaming '{original_name}'")
                sys.stdout.write(status_msg.ljust(70) + "\r")
                sys.stdout.flush()
    
    return renamed_count, error_count, len(items_to_process)

def main():
    import shutil
    
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    
    directories = [
        'comments',
        'livechats',
        'videos',
        'videolengths', 
        'thumbnails',
        'thumbnails-small',
        'filedates',
        'descriptions',
        'videostats',
        'viewcounts',
        'videoresolutions',
        'filenames',
        'subtitles'
    ]
    
    # Pre-scan all directories for total count
    sys.stdout.write("Scanning filenames...".ljust(70) + "\r")
    sys.stdout.flush()
    
    total_items_all = 0
    dirs_to_process = []
    
    for directory in directories:
        dir_path = root_dir / directory
        if dir_path.exists() and dir_path.is_dir():
            items = collect_items_to_process(str(dir_path))
            if items:
                dirs_to_process.append((str(dir_path), directory, len(items)))
                total_items_all += len(items)
    
    if total_items_all == 0:
        print("No problematic filenames found.                            ")
        return
    
    print("Filename Sanitizer - Removes emojis & fixes special chars")
    print(f"Rules: /\\*\"| → space, :? → removed | Overwrite: ON")
    
    total_renamed = 0
    total_errors = 0
    
    for dir_path, dir_name, item_count in dirs_to_process:
        renamed, errors, scanned = remove_special_chars_from_filenames(dir_path)
        total_renamed += renamed
        total_errors += errors

    # Clear status line and print final summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    print(f"Filename Sanitization Complete:")
    print(f"  Total Items Scanned:   {total_items_all}")
    print(f"  Items Fixed:           {total_renamed}")
    
    if total_errors > 0:
        print(f"  Errors:                 {total_errors} (Check warnings above)")

if __name__ == "__main__":
    main()