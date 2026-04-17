#!/usr/bin/env python3
"""
Thumbnail Processor - Scans for thumbnails and:
- Adds left/right black bars to ALL 640x480 and 960x720 thumbnails to make them 16:9
- For 480x360 thumbnails: crops if top/bottom black bars detected, otherwise adds side borders
- For 320x240 thumbnails: crops to 320x180 if top/bottom black bars detected, otherwise skips
- Adds borders to 1:1 thumbnails to make them 16:9 using the most common color
- NEW: Adds black borders to portrait thumbnails with aspect ratio ~0.56 (e.g., 480x854, 720x1280)
"""

import os
import argparse
from pathlib import Path
from PIL import Image, ImageOps
import numpy as np
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

# Valid dimensions and their aspect ratios
VALID_DIMENSIONS = {
    (640, 480): "4:3 (will add black borders to make 16:9)",
    (960, 720): "4:3 (will add black borders to make 16:9)",
    (480, 360): "4:3 (will crop or add borders to make 16:9)",
    (320, 240): "4:3 (will crop to 320x180 if black bars detected)",
    (1, 1): "1:1 (square - will add borders to make 16:9 using most common color)"
}

# Portrait dimensions with aspect ratio around 0.56 (9:16 portrait)
PORTRAIT_ASPECT_RATIO_TARGET = 0.56  # 9/16 = 0.5625
PORTRAIT_ASPECT_TOLERANCE = 0.02  # Accept ratios between 0.54 and 0.58

def get_most_common_color(image, sampling_ratio=0.1):
    """
    Find the most common color in the image by sampling pixels.
    
    Args:
        image: PIL Image object
        sampling_ratio: Ratio of pixels to sample (0.1 = 10%)
    
    Returns:
        tuple: RGB color tuple of the most common color
    """
    # Convert to RGB if necessary
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Get image dimensions
    width, height = image.size
    total_pixels = width * height
    
    # Calculate number of pixels to sample
    sample_size = max(1, int(total_pixels * sampling_ratio))
    
    # Generate random sampling positions
    np.random.seed(42)  # For reproducibility
    x_samples = np.random.randint(0, width, sample_size)
    y_samples = np.random.randint(0, height, sample_size)
    
    # Sample pixels
    pixels = []
    for x, y in zip(x_samples, y_samples):
        r, g, b = image.getpixel((x, y))
        # Quantize colors to reduce variations (group similar colors)
        r = (r // 10) * 10
        g = (g // 10) * 10
        b = (b // 10) * 10
        pixels.append((r, g, b))
    
    # Find most common color
    color_counter = Counter(pixels)
    most_common = color_counter.most_common(1)[0][0]
    
    # Restore original color values (add 5 to get back to middle of range)
    most_common = (most_common[0] + 5, most_common[1] + 5, most_common[2] + 5)
    
    return most_common

def add_border_to_16_9(image):
    """
    Add borders to a square image to make it 16:9 aspect ratio.
    Uses the most common color in the image for the borders.
    
    Args:
        image: PIL Image object (assumed to be square)
    
    Returns:
        PIL Image object with borders added to achieve 16:9
    """
    width, height = image.size
    
    # Ensure image is square
    if width != height:
        return image
    
    # Calculate target width for 16:9 aspect ratio
    target_width = int(height * 16 / 9)
    
    if target_width <= width:
        return image
    
    # Get most common color for borders
    border_color = get_most_common_color(image)
    
    # Calculate border width (add equally to both sides)
    total_border = target_width - width
    left_border = total_border // 2
    right_border = total_border - left_border
    
    # Add borders
    bordered_image = ImageOps.expand(
        image, 
        border=(left_border, 0, right_border, 0), 
        fill=border_color
    )
    
    return bordered_image

def add_black_bars_to_4_3(image):
    """
    Add black bars to the sides of a 4:3 image (640x480, 960x720, etc.) to make it 16:9.
    
    Args:
        image: PIL Image object (assumed to be 4:3 aspect ratio)
    
    Returns:
        PIL Image object with black bars added to achieve 16:9
    """
    width, height = image.size
    
    # Verify aspect ratio is roughly 4:3
    if abs(width/height - 4/3) > 0.01:
        return image
    
    # Calculate target width for 16:9 aspect ratio (keeping height the same)
    target_width = int(height * 16 / 9)
    
    if target_width <= width:
        return image
    
    # Calculate border width to add (black bars)
    total_border = target_width - width
    left_border = total_border // 2
    right_border = total_border - left_border
    
    # Add black borders
    bordered_image = ImageOps.expand(
        image, 
        border=(left_border, 0, right_border, 0), 
        fill=(0, 0, 0)  # Black
    )
    
    return bordered_image

def add_black_bars_to_portrait(image):
    """
    Add black bars to the sides of a portrait image (aspect ratio ~0.56) to make it 16:9 landscape.
    
    Args:
        image: PIL Image object (assumed to be portrait with aspect ratio ~0.56)
    
    Returns:
        PIL Image object with black bars added to achieve 16:9 landscape
    """
    width, height = image.size
    
    # Calculate target dimensions for 16:9 landscape
    # We'll keep the height and expand the width
    target_width = int(height * 16 / 9)
    
    if target_width <= width:
        return image
    
    # Calculate border width to add (black bars on sides)
    total_border = target_width - width
    left_border = total_border // 2
    right_border = total_border - left_border
    
    # Add black borders
    bordered_image = ImageOps.expand(
        image, 
        border=(left_border, 0, right_border, 0), 
        fill=(0, 0, 0)  # Black
    )
    
    return bordered_image

def detect_black_bars(image, threshold=30, sample_ratio=0.1):
    """
    Detect if the image has black bars at top and bottom (for 480x360 and 320x240 images).
    
    Args:
        image: PIL Image object
        threshold: Pixel value threshold for considering a pixel as black (0-255)
        sample_ratio: Ratio of width to sample for checking black bars
    
    Returns:
        tuple: (has_top_black_bar, has_bottom_black_bar, top_bar_height, bottom_bar_height)
    """
    # Convert to numpy array for faster processing
    img_array = np.array(image.convert('RGB'))
    height, width = img_array.shape[:2]
    
    # Calculate sample step to check only a portion of the width
    sample_step = max(1, int(width * (1 - sample_ratio)))
    sample_indices = range(0, width, sample_step)
    
    # Check top rows (first 20% of image for potential black bars)
    top_check_height = min(50, height // 5)
    top_black_count = 0
    top_pixel_count = 0
    
    for y in range(top_check_height):
        for x in sample_indices:
            if y < height and x < width:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    top_black_count += 1
                top_pixel_count += 1
    
    # Check bottom rows (last 20% of image for potential black bars)
    bottom_check_height = min(50, height // 5)
    bottom_black_count = 0
    bottom_pixel_count = 0
    
    for y in range(height - bottom_check_height, height):
        for x in sample_indices:
            if 0 <= y < height:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    bottom_black_count += 1
                bottom_pixel_count += 1
    
    # Calculate black pixel ratios
    top_black_ratio = top_black_count / top_pixel_count if top_pixel_count > 0 else 0
    bottom_black_ratio = bottom_black_count / bottom_pixel_count if bottom_pixel_count > 0 else 0
    
    # Determine if bars exist (at least 80% black pixels in the checked region)
    has_top_bar = top_black_ratio > 0.8
    has_bottom_bar = bottom_black_ratio > 0.8
    
    # Estimate bar heights (simplified - assume uniform bars)
    top_bar_height = 0
    bottom_bar_height = 0
    
    if has_top_bar:
        # Find where top bar ends
        for y in range(top_check_height, height):
            black_pixels = 0
            for x in sample_indices:
                if x < width and y < height:
                    r, g, b = img_array[y, x]
                    if r < threshold and g < threshold and b < threshold:
                        black_pixels += 1
            if black_pixels / len(sample_indices) < 0.5:  # Less than 50% black pixels
                top_bar_height = y
                break
        else:
            top_bar_height = top_check_height
    
    if has_bottom_bar:
        # Find where bottom bar starts (scanning from bottom up)
        for y in range(height - bottom_check_height - 1, -1, -1):
            black_pixels = 0
            for x in sample_indices:
                if x < width:
                    r, g, b = img_array[y, x]
                    if r < threshold and g < threshold and b < threshold:
                        black_pixels += 1
            if black_pixels / len(sample_indices) < 0.5:  # Less than 50% black pixels
                bottom_bar_height = height - y - 1
                break
        else:
            bottom_bar_height = bottom_check_height
    
    return has_top_bar, has_bottom_bar, top_bar_height, bottom_bar_height

def crop_to_16_9(image):
    """
    Crop image to 16:9 aspect ratio by removing equal amounts from top and bottom.
    
    Args:
        image: PIL Image object
    
    Returns:
        PIL Image object cropped to 16:9
    """
    width, height = image.size
    
    # Calculate target height for 16:9 aspect ratio
    target_height = int(width * 9 / 16)
    
    if target_height >= height:
        return image
    
    # Calculate pixels to remove from top and bottom
    total_remove = height - target_height
    remove_top = total_remove // 2
    remove_bottom = total_remove - remove_top
    
    # Crop the image
    cropped = image.crop((0, remove_top, width, height - remove_bottom))
    return cropped

def is_portrait_aspect_ratio(dimensions):
    """
    Check if the image dimensions have an aspect ratio around 0.56 (portrait 9:16).
    
    Args:
        dimensions: tuple (width, height)
    
    Returns:
        bool: True if aspect ratio is around 0.56
    """
    width, height = dimensions
    
    # Skip if it's a known dimension that's handled elsewhere
    if dimensions in [(640, 480), (960, 720), (480, 360), (320, 240)] or width == height:
        return False
    
    # Calculate aspect ratio (width/height)
    aspect_ratio = width / height
    
    # Check if it's close to 0.56 (portrait 9:16)
    return abs(aspect_ratio - PORTRAIT_ASPECT_RATIO_TARGET) <= PORTRAIT_ASPECT_TOLERANCE

def process_image(filepath, dry_run=False, backup=False, force=False):
    """
    Process a single image file.
    
    Args:
        filepath: Path to the image file
        dry_run: If True, only simulate the operation
        backup: If True, create a backup before cropping
        force: If True, process 480x360 images even without black bars
    
    Returns:
        dict: Result information
    """
    result = {
        'path': str(filepath),
        'status': 'skipped',
        'message': ''
    }
    
    try:
        # Open image
        with Image.open(filepath) as img:
            dimensions = img.size
            
            # Check if dimensions are square (any size)
            if dimensions[0] == dimensions[1]:
                # Process square images
                if dry_run:
                    target_width = int(dimensions[0] * 16 / 9)
                    result['status'] = 'would_add_border'
                    result['message'] = f"Square {dimensions[0]}x{dimensions[1]} -> Would add borders to make {target_width}x{dimensions[0]}"
                    return result
                
                # Add borders to make 16:9
                bordered_image = add_border_to_16_9(img)
                
                if bordered_image != img:  # Only save if changes were made
                    # Create backup if requested
                    if backup:
                        backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                        img.save(backup_path)
                    
                    # Save bordered image
                    bordered_image.save(filepath)
                    
                    new_dimensions = bordered_image.size
                    result['status'] = 'bordered_square'
                    result['message'] = f"Square {dimensions} -> {new_dimensions}"
                else:
                    result['message'] = f"Square image but couldn't add borders"
                
                return result
            
            # Handle 640x480 and 960x720 images - ALWAYS add black bars to make 16:9
            if dimensions == (640, 480) or dimensions == (960, 720):
                target_width = int(dimensions[1] * 16 / 9)  # height * 16/9
                
                if dry_run:
                    result['status'] = 'would_add_border_640'
                    result['message'] = f"{dimensions[0]}x{dimensions[1]} -> Would add black borders to make {target_width}x{dimensions[1]}"
                    return result
                
                # Create backup if requested
                if backup:
                    backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                    img.save(backup_path)
                
                # Add black borders to make 16:9
                bordered_image = add_black_bars_to_4_3(img)
                
                if bordered_image != img:
                    # Save bordered image
                    bordered_image.save(filepath)
                    new_dimensions = bordered_image.size
                    result['status'] = 'bordered_640'
                    result['message'] = f"{dimensions} -> {new_dimensions}"
                else:
                    result['message'] = f"{dimensions} - Could not add borders"
                
                return result
            
            # Handle 480x360 images - crop if top/bottom black bars detected, otherwise add side borders
            if dimensions == (480, 360):
                # Detect black bars
                has_top, has_bottom, top_height, bottom_height = detect_black_bars(img)
                
                # Get dimensions
                width, height = img.size
                
                if has_top and has_bottom:
                    # Has top/bottom black bars - crop to 16:9
                    target_height = int(width * 9 / 16)  # 480*9/16=270
                    
                    if target_height >= height:
                        result['message'] = f"480x360 - Target height ({target_height}) >= original height ({height})"
                        return result
                    
                    if dry_run:
                        result['status'] = 'would_crop_480'
                        result['message'] = f"480x360 -> Would crop to {width}x{target_height}"
                        return result
                    
                    # Create backup if requested
                    if backup:
                        backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                        img.save(backup_path)
                    
                    # Crop to 16:9
                    cropped = crop_to_16_9(img)
                    
                    # Save cropped image
                    cropped.save(filepath)
                    
                    result['status'] = 'cropped_480'
                    result['message'] = f"480x360 -> Cropped to {cropped.size}"
                    
                else:
                    # No black bars - add side borders to make 16:9
                    target_width = int(360 * 16 / 9)  # 640
                    
                    if dry_run:
                        result['status'] = 'would_add_border_480'
                        result['message'] = f"480x360 -> Would add black borders to make {target_width}x360"
                        return result
                    
                    # Create backup if requested
                    if backup:
                        backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                        img.save(backup_path)
                    
                    # Calculate border width to add (black bars)
                    total_border = target_width - width
                    left_border = total_border // 2
                    right_border = total_border - left_border
                    
                    # Add black borders
                    bordered_image = ImageOps.expand(
                        img, 
                        border=(left_border, 0, right_border, 0), 
                        fill=(0, 0, 0)  # Black
                    )
                    
                    # Save bordered image
                    bordered_image.save(filepath)
                    
                    new_dimensions = bordered_image.size
                    result['status'] = 'bordered_480'
                    result['message'] = f"480x360 -> Added borders -> {new_dimensions}"
                
                return result
            
            # Handle 320x240 images - crop to 320x180 ONLY if top/bottom black bars detected
            if dimensions == (320, 240):
                # Detect black bars
                has_top, has_bottom, top_height, bottom_height = detect_black_bars(img)
                
                if has_top and has_bottom:
                    target_height = 180  # 320x180 is exactly 16:9
                    
                    if dry_run:
                        result['status'] = 'would_crop_320'
                        result['message'] = f"320x240 -> Would crop to 320x180"
                        return result
                    
                    # Create backup if requested
                    if backup:
                        backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                        img.save(backup_path)
                    
                    # Crop to 16:9
                    cropped = crop_to_16_9(img)
                    
                    # Save cropped image
                    cropped.save(filepath)
                    
                    result['status'] = 'cropped_320'
                    result['message'] = f"320x240 -> Cropped to 320x180"
                else:
                    result['message'] = f"320x240 - No black bars detected"
                
                return result
            
            # NEW: Handle portrait images with aspect ratio around 0.56
            if is_portrait_aspect_ratio(dimensions):
                width, height = dimensions
                target_width = int(height * 16 / 9)
                
                if dry_run:
                    result['status'] = 'would_add_border_portrait'
                    result['message'] = f"Portrait {width}x{height} -> Would add black borders to make {target_width}x{height}"
                    return result
                
                # Create backup if requested
                if backup:
                    backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                    img.save(backup_path)
                
                # Add black borders to make 16:9 landscape
                bordered_image = add_black_bars_to_portrait(img)
                
                if bordered_image != img:
                    # Save bordered image
                    bordered_image.save(filepath)
                    new_dimensions = bordered_image.size
                    result['status'] = 'bordered_portrait'
                    result['message'] = f"Portrait {width}x{height} -> {new_dimensions}"
                else:
                    result['message'] = f"Portrait {width}x{height} - Could not add borders"
                
                return result
            
            # If we get here, dimensions are not handled
            result['message'] = f"Dimensions {dimensions} not processed"
            
    except Exception as e:
        result['status'] = 'error'
        result['message'] = f"Error: {str(e)}"
    
    return result

def main():
    parser = argparse.ArgumentParser(description='Process thumbnails to 16:9 aspect ratio')
    parser.add_argument('directory', nargs='?', default='./thumbnails',
                       help='Root directory to scan (default: ./thumbnails)')
    parser.add_argument('--dry-run', '-n', action='store_true',
                       help='Simulate operations without actually modifying files')
    parser.add_argument('--backup', '-b', action='store_true',
                       help='Create backup of original files before modifying')
    parser.add_argument('--force', '-f', action='store_true',
                       help='Force crop 480x360 images even without black bars')
    parser.add_argument('--threads', '-t', type=int, default=4,
                       help='Number of threads for parallel processing (default: 4)')
    parser.add_argument('--recursive', '-r', action='store_true', default=True,
                       help='Scan recursively (default: True)')
    parser.add_argument('--portrait-tolerance', type=float, default=0.02,
                       help='Tolerance for portrait aspect ratio detection (default: 0.02)')
    
    args = parser.parse_args()
    
    # Update global tolerance if specified
    global PORTRAIT_ASPECT_TOLERANCE
    PORTRAIT_ASPECT_TOLERANCE = args.portrait_tolerance
    
    # Validate directory
    root_dir = Path(args.directory)
    if not root_dir.exists():
        print(f"Error: Directory '{root_dir}' does not exist")
        sys.exit(1)
    
    if not root_dir.is_dir():
        print(f"Error: '{root_dir}' is not a directory")
        sys.exit(1)
    
    # Find all image files
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}
    
    if args.recursive:
        files = [f for f in root_dir.rglob('*') if f.suffix.lower() in image_extensions]
    else:
        files = [f for f in root_dir.glob('*') if f.is_file() and f.suffix.lower() in image_extensions]
    
    total_files = len(files)
    
    if total_files == 0:
        print("No image files found to process.")
        return

    print("Scanning for thumbnails...", end="\r")
    
    # Initialize counters
    created_count = 0
    error_count = 0
    
    # Process files in parallel
    results_list = []
    
    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = {executor.submit(process_image, f, args.dry_run, args.backup, args.force): f for f in files}
        
        completed_count = 0
        
        for future in as_completed(futures):
            result = future.result()
            completed_count += 1
            results_list.append(result)
            
            # Update status line (overwrite in place)
            status_msg = f"Processing file #{completed_count}/{total_files}... (Processed: {created_count})"
            sys.stdout.write(status_msg.ljust(70) + "\r")
            sys.stdout.flush()
            
            # Count successes and errors silently
            if result['status'] in ['bordered_640', 'bordered_480', 'cropped_480', 'cropped_320', 
                                     'bordered_square', 'bordered_portrait']:
                created_count += 1
            elif result['status'] == 'error':
                error_count += 1
    
    # Clear line and print summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    # Print final summary (matching style of 2nd script)
    print(f"Thumbnail Processing Complete:")
    print(f"  Total Files Scanned:   {total_files}")
    print(f"  Thumbnails Processed:  {created_count}")
    
    if error_count > 0:
        print(f"  Errors:                {error_count}")

if __name__ == "__main__":
    main()