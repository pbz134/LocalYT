import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random

def generate_random_color():
    """Generate a random RGB color."""
    return (
        random.randint(0, 255),
        random.randint(0, 255),
        random.randint(0, 255)
    )

def find_system_font():
    """Find and return a system font that exists."""
    # Common font paths for different operating systems
    font_paths = [
        # Windows
        "C:/Windows/Fonts/Arial.ttf",
        "C:/Windows/Fonts/Arialbd.ttf",  # Arial Bold
        "C:/Windows/Fonts/arialb.ttf",   # Arial Bold (alternative)
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/timesbd.ttf"  # Times New Roman Bold
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            print(f"Found font: {font_path}")
            return font_path
    
    print("No system font found, using default font")
    return None

def create_channel_pic(channel_name, output_path, size=160):
    """Create a profile picture for a channel - simplified with better centering."""
    # Create a new image with random background color
    bg_color = generate_random_color()
    img = Image.new('RGB', (size, size), color=bg_color)
    
    # Get the first letter of the channel name (uppercase)
    first_letter = channel_name[0].upper() if channel_name else "?"
    
    # Create drawing context
    draw = ImageDraw.Draw(img)
    
    # Load font
    font_size = 100
    
    # Try to find and load a system font
    font_path = find_system_font()
    
    if font_path:
        try:
            # For .ttc files (TrueType Collection), we need to specify index
            if font_path.endswith('.ttc'):
                font = ImageFont.truetype(font_path, size=font_size, index=0)
            else:
                font = ImageFont.truetype(font_path, size=font_size)
        except Exception as e:
            print(f"  Warning: Could not load font '{font_path}': {e}")
            font = ImageFont.load_default()
            font_size = 80
    else:
        font = ImageFont.load_default()
        font_size = 80
    
    # SIMPLE AND EFFECTIVE: Use anchor parameter for perfect centering
    x = size // 2
    y = size // 2
    
    # 'mm' anchor means the text is centered both horizontally and vertically
    draw.text((x, y), first_letter, font=font, fill=(255, 255, 255), anchor='mm')
    
    # Save the image
    img.save(output_path, 'JPEG', quality=95)
    print(f"Created profile picture for channel: {channel_name}")

def main():
    # Define paths - adjust these as needed
    videos_path = "./videos"  # Change this to your actual videos path
    channelpic_path = "./channelpic"  # Change this to your actual channelpic path
    
    # Convert to Path objects for easier handling
    videos_dir = Path(videos_path)
    channelpic_dir = Path(channelpic_path)
    
    # Ensure directories exist
    if not videos_dir.exists():
        print(f"Error: Videos directory '{videos_path}' does not exist.")
        return
    
    if not channelpic_dir.exists():
        print(f"Creating channelpic directory '{channelpic_path}'...")
        channelpic_dir.mkdir(parents=True, exist_ok=True)
    
    # Get all channel subfolders (direct children of videos directory)
    channels = []
    for item in videos_dir.iterdir():
        if item.is_dir():
            channels.append(item.name)
    
    print(f"Found {len(channels)} channels:")
    for channel in channels:
        print(f"  - {channel}")
    
    # Check for missing profile pictures
    missing_pics = []
    
    for channel in channels:
        # Expected profile picture filename
        expected_pic = channelpic_dir / f"{channel}.jpg"
        
        if not expected_pic.exists():
            missing_pics.append(channel)
    
    print(f"\nMissing profile pictures: {len(missing_pics)} channels")
    
    # Create missing profile pictures
    for channel in missing_pics:
        output_file = channelpic_dir / f"{channel}.jpg"
        print(f"\nCreating profile picture for: {channel}")
        try:
            create_channel_pic(channel, output_file)
            print(f"  -> Created: {output_file}")
        except Exception as e:
            print(f"  -> Error creating profile picture for {channel}: {e}")
    
    print(f"\nSummary:")
    print(f"  Total channels: {len(channels)}")
    print(f"  Created profile pictures: {len(missing_pics)}")
    
    # List all created files
    if missing_pics:
        print(f"\nCreated files:")
        for channel in missing_pics:
            print(f"  - {channel}.jpg")

if __name__ == "__main__":
    main()