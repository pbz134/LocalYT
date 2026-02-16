#!/usr/bin/env python3
"""
Thumbnail Processor - Scans for thumbnails and:
- Crops 640x480 thumbnails with black bars to 16:9 aspect ratio
- Crops 480x360 thumbnails with black bars to 16:9 aspect ratio
- Adds borders to 1:1 thumbnails to make them 16:9 using the most common color
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
    (640, 480): "4:3 (needs cropping to 16:9)",
    (480, 360): "4:3 (needs cropping to 16:9)",
    (1, 1): "1:1 (square - will add borders to make 16:9)"  # Special case for square
}

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
        print(f"  Warning: Image is not square ({width}x{height}), skipping border addition")
        return image
    
    # Calculate target width for 16:9 aspect ratio
    target_width = int(height * 16 / 9)
    
    if target_width <= width:
        print(f"  Warning: Target width ({target_width}) <= original width ({width}), skipping border addition")
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

def detect_black_bars(image, threshold=30, sample_ratio=0.1):
    """
    Detect if the image has black bars at top and bottom.
    
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
            if 0 <= y < height and x < width:
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
        print(f"  Warning: Target height ({target_height}) >= original height ({height}), skipping crop")
        return image
    
    # Calculate pixels to remove from top and bottom
    total_remove = height - target_height
    remove_top = total_remove // 2
    remove_bottom = total_remove - remove_top
    
    # Crop the image
    cropped = image.crop((0, remove_top, width, height - remove_bottom))
    return cropped

def process_image(filepath, dry_run=False, backup=False, force=False):
    """
    Process a single image file.
    
    Args:
        filepath: Path to the image file
        dry_run: If True, only simulate the operation
        backup: If True, create a backup before cropping
        force: If True, process 4:3 images even without black bars
    
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
                    result['message'] = f"Square {dimensions[0]}x{dimensions[1]} - Would add borders to make {target_width}x{dimensions[0]} (16:9)"
                    return result
                
                # Get most common color for preview
                border_color = get_most_common_color(img)
                
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
                    result['status'] = 'bordered'
                    result['message'] = f"Added borders to square image: {dimensions} -> {new_dimensions} (16:9) using color {border_color}"
                else:
                    result['message'] = f"Square image but couldn't add borders"
                
                return result
            
            # Check if dimensions are 4:3 aspect ratio (640x480 or 480x360)
            is_640x480 = dimensions == (640, 480)
            is_480x360 = dimensions == (480, 360)
            
            if not (is_640x480 or is_480x360):
                result['message'] = f"Dimensions {dimensions} not processed (only 4:3 images: 640x480, 480x360, or square images)"
                return result
            
            # Handle 4:3 images (both 640x480 and 480x360 need cropping to 16:9)
            # Detect black bars
            has_top, has_bottom, top_height, bottom_height = detect_black_bars(img)
            
            if not (has_top and has_bottom) and not force:
                result['message'] = f"No black bars detected (top: {has_top}, bottom: {has_bottom})"
                return result
            
            # Calculate target crop for 16:9
            width, height = img.size
            target_height = int(width * 9 / 16)  # For 640: 640*9/16=360, For 480: 480*9/16=270
            
            if target_height >= height:
                result['message'] = f"Target height ({target_height}) >= original height ({height})"
                return result
            
            if dry_run:
                result['status'] = 'would_crop'
                result['message'] = f"Would crop {dimensions[0]}x{dimensions[1]} from {height} to {target_height} (remove {height - target_height}px) -> {width}x{target_height} (16:9)"
                return result
            
            # Create backup if requested
            if backup:
                backup_path = filepath.with_suffix(filepath.suffix + '.backup')
                img.save(backup_path)
            
            # Crop to 16:9
            cropped = crop_to_16_9(img)
            
            # Save cropped image
            cropped.save(filepath)
            
            result['status'] = 'cropped'
            result['message'] = f"Cropped {dimensions[0]}x{dimensions[1]} from {height} to {target_height}px -> {width}x{target_height} (16:9)"
            
    except Exception as e:
        result['status'] = 'error'
        result['message'] = f"Error: {str(e)}"
    
    return result

def main():
    parser = argparse.ArgumentParser(description='Process thumbnails: crop 4:3 images (640x480, 480x360) with black bars to 16:9, add borders to square images')
    parser.add_argument('directory', nargs='?', default='./thumbnails',
                       help='Root directory to scan (default: ./thumbnails)')
    parser.add_argument('--dry-run', '-n', action='store_true',
                       help='Simulate operations without actually modifying files')
    parser.add_argument('--backup', '-b', action='store_true',
                       help='Create backup of original files before modifying')
    parser.add_argument('--force', '-f', action='store_true',
                       help='Force crop 4:3 images even without black bars')
    parser.add_argument('--threads', '-t', type=int, default=4,
                       help='Number of threads for parallel processing (default: 4)')
    parser.add_argument('--recursive', '-r', action='store_true', default=True,
                       help='Scan recursively (default: True)')
    
    args = parser.parse_args()
    
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
    
    print(f"Found {len(files)} image files to check")
    print("Processing rules:")
    print("  - 640x480 (4:3): Crop to 16:9 (640x360) if black bars detected")
    print("  - 480x360 (4:3): Crop to 16:9 (480x270) if black bars detected")
    print("  - Square images: Add borders to make 16:9 using most common color")
    print("  - Other dimensions: Skip")
    
    if args.dry_run:
        print("DRY RUN MODE - No files will be modified")
    
    if args.force:
        print("FORCE MODE - Will crop 4:3 images even without black bars")
    
    # Process files in parallel
    results = {
        'cropped': [],
        'bordered': [],
        'skipped': [],
        'errors': [],
        'would_crop': [],
        'would_add_border': []
    }
    
    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = {executor.submit(process_image, f, args.dry_run, args.backup, args.force): f for f in files}
        
        for i, future in enumerate(as_completed(futures), 1):
            result = future.result()
            
            if result['status'] == 'cropped':
                results['cropped'].append(result)
                status = f"[{i}/{len(files)}] ✓ Cropped: {result['path']} - {result['message']}"
            elif result['status'] == 'bordered':
                results['bordered'].append(result)
                status = f"[{i}/{len(files)}] ▢ Bordered: {result['path']} - {result['message']}"
            elif result['status'] == 'would_crop':
                results['would_crop'].append(result)
                status = f"[{i}/{len(files)}] 🔄 Would crop: {result['path']} - {result['message']}"
            elif result['status'] == 'would_add_border':
                results['would_add_border'].append(result)
                status = f"[{i}/{len(files)}] 🔲 Would add border: {result['path']} - {result['message']}"
            elif result['status'] == 'error':
                results['errors'].append(result)
                status = f"[{i}/{len(files)}] ✗ Error: {result['path']} - {result['message']}"
            else:
                results['skipped'].append(result)
                status = f"[{i}/{len(files)}] - Skipped: {result['path']} - {result['message']}"
            
            print(status)
    
    # Print summary
    print("\n" + "="*50)
    print("SUMMARY")
    print("="*50)
    
    if args.dry_run:
        print(f"Would crop (4:3 images): {len(results['would_crop'])} files")
        print(f"Would add borders (square): {len(results['would_add_border'])} files")
    else:
        print(f"Cropped (4:3 images): {len(results['cropped'])} files")
        print(f"Borders added (square): {len(results['bordered'])} files")
    
    print(f"Skipped: {len(results['skipped'])} files")
    print(f"Errors: {len(results['errors'])} files")
    
    if results['errors']:
        print("\nErrors:")
        for error in results['errors']:
            print(f"  - {error['path']}: {error['message']}")

if __name__ == "__main__":
    main()