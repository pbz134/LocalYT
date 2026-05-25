import os
import random
from pathlib import Path

def generate_fuzzy_count(count_str: str) -> str:
    """
    Takes a subscriber count string and randomizes the trailing zeroes.
    Ensures the number does not decrease and preserves magnitude.
    """
    count_str = count_str.strip()
    
    if not count_str:
        return count_str
        
    clean_num = count_str.replace(",", "")
    
    try:
        num = int(clean_num)
    except ValueError:
        return count_str

    num_str = str(num)
    
    # Find where the trailing zeroes start
    first_zero_idx = None
    for i, char in enumerate(num_str):
        if char == '0':
            first_zero_idx = i
            break
            
    # If no trailing zeroes found, return original formatted
    if first_zero_idx is None:
        return f"{num:,}"
        
    # Split into Significant Part (non-zeros) and Zero Part (trailing zeros)
    # e.g., 1,360,000 -> sig="136", zeros="000"
    # e.g., 33,500,000 -> sig="335", zeros="0000"
    significant_part = num_str[:first_zero_idx]
    zero_count = len(num_str) - first_zero_idx
    
    # Determine how many digits we MUST preserve to keep the number realistic
    # We look at the length of the significant part.
    sig_len = len(significant_part)
    
    digits_to_preserve = sig_len # Default: keep all significant digits
    
    # Special Rules based on Magnitude:
    # If the number is huge but has few significant digits (e.g., 10,000), 
    # we might want to lock it down more, or just let it run.
    # Based on your requirements:
    # > 1M: Keep at least 1st digit. 
    # > 100k: Keep at least 1st 2 digits.
    
    if num >= 1_000_000:
        # For millions, ensure we keep AT LEAST the 1st digit.
        # If input is 33,500,000 (sig_len=3), we keep 3 digits (33x).
        # If input is 1,200,000 (sig_len=2), we keep 2 digits (12x).
        # This prevents 33M from becoming 39M.
        digits_to_preserve = max(1, sig_len) 
        
    elif num >= 100_000:
        # For 100k+, ensure we keep AT LEAST the 1st 2 digits.
        # Input 163,000 (sig_len=3) -> keep 3 (163).
        # Input 99,000 (sig_len=2) -> keep 2 (99).
        digits_to_preserve = max(2, sig_len)

    # --- Calculate Bounds ---
    
    # The Fixed Prefix (what stays constant)
    prefix = significant_part[:digits_to_preserve]
    
    # The Maximum Cap
    # We create a number consisting of the Prefix followed by all 9s.
    # Example: 33,500,000 -> Prefix "335" -> Max "33,599,999"
    total_length = len(num_str)
    max_cap_str = prefix.ljust(total_length, '9')
    max_cap = int(max_cap_str)
    
    # Generate Random Number
    # Range is [Original Number, Max Cap]
    new_num = random.randint(num, max_cap)
    
    return f"{new_num:,}"

def main():
    script_dir = Path(__file__).resolve().parent
    subcount_dir = script_dir.parent / "subcount"
    fuzzy_dir = subcount_dir / "fuzzy"
    
    fuzzy_dir.mkdir(parents=True, exist_ok=True)
    
    if not subcount_dir.exists():
        print(f"Error: Source directory not found at {subcount_dir}")
        return

    txt_files = list(subcount_dir.glob("*.txt"))
    
    if not txt_files:
        print("No .txt files found in the subcount directory.")
        return

    print(f"Found {len(txt_files)} files to process...")
    
    for file_path in txt_files:
        output_path = fuzzy_dir / file_path.name
        
        if output_path.exists():
            # Optional: Comment this out if you want to re-process files
            # print(f"Skipped: {file_path.name} (already processed)")
            # continue
            pass

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_count = f.read()
                
            fuzzy_count = generate_fuzzy_count(original_count)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(fuzzy_count)
                
            print(f"Processed: {file_path.name} -> {original_count.strip()} | {fuzzy_count}")
            
        except Exception as e:
            print(f"Error processing {file_path.name}: {e}")

if __name__ == "__main__":
    main()