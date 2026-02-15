from PIL import Image, ImageDraw, ImageFont
import os
import datetime

def add_text_to_image(input_text):
    # Open the image
    image_path = "Logo_Original.png"
    try:
        original_image = Image.open(image_path)
    except FileNotFoundError:
        print(f"Error: Could not open {image_path}")
        return
    
    # Try to load font
    font_size = 60  # Large font size
    font = None
    
    # List of fonts to try
    font_paths = [
        "Roboto-Regular.ttf",
    ]
    
    for font_path in font_paths:
        try:
            font = ImageFont.truetype(font_path, font_size)
            print(f"Using font: {font_path} (size: {font_size})")
            break
        except:
            continue
    
    if font is None:
        font = ImageFont.load_default()
        print("Using default font")
    
    # Create a temporary drawing object to calculate text size
    temp_draw = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    text_bbox = temp_draw.textbbox((0, 0), input_text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    print(f"Original image: {original_image.width}x{original_image.height}")
    print(f"Text size: {text_width}x{text_height}")
    
    # Add space to the RIGHT of the logo for text
    right_padding = text_width + 20  # Text width plus 20px margin
    
    # New width: original width + right padding
    new_width = original_image.width + right_padding
    # Height remains the same
    new_height = original_image.height
    
    # Create new transparent canvas
    if original_image.mode == 'RGBA':
        new_image = Image.new('RGBA', (new_width, new_height), (255, 255, 255, 0))
    else:
        new_image = Image.new('RGB', (new_width, new_height), (255, 255, 255))
    
    # Paste original image at the LEFT (original position)
    new_image.paste(original_image, (0, 0))
    
    # Create drawing object for new image
    draw = ImageDraw.Draw(new_image)
    
    # Position text in the RIGHT padding area (to the right of the logo)
    x_position = original_image.width + 10  # Start 10px right of the logo
    y_position = 2  # 2px from top edge
    
    # Light grey color
    light_grey = (200, 200, 200)
    
    # Add text to the RIGHT of the logo
    draw.text((x_position, y_position), input_text, font=font, fill=light_grey)
    
    # Create output filename
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"Logo_with_text_{timestamp}.png"
    
    # Save the new image
    new_image.save(output_filename)
    print(f"✓ Image saved as: {output_filename}")
    print(f"✓ New image size: {new_width}x{new_height}")
    print(f"✓ Logo position: (0, 0) - unchanged")
    print(f"✓ Text position: ({x_position}, {y_position}) - to the RIGHT of logo")
    print(f"✓ Text added: '{input_text}'")

def main():
    print("=" * 50)
    print("Logo Text Adder - Text on Right Side")
    print("=" * 50)
    
    if not os.path.exists("Logo.png"):
        print("Error: 'Logo.png' not found!")
        return
    
    input_text = input("Enter version/text to add to logo: ").strip()
    
    if not input_text:
        print("No text entered. Exiting.")
        return
    
    add_text_to_image(input_text)
    print("\nDone!")

if __name__ == "__main__":
    main()