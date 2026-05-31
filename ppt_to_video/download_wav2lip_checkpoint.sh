#!/bin/bash

echo "Downloading Wav2Lip Checkpoint..."
echo "================================="

cd /home/ushah/ppt_to_video/external/Wav2Lip/checkpoints

# Try multiple sources for the checkpoint

echo "Attempting download from alternative source..."
wget -O wav2lip_gan.pth "https://huggingface.co/spaces/akhaliq/Wav2Lip/resolve/main/checkpoints/wav2lip_gan.pth" 2>&1 | tail -20

if [ -f "wav2lip_gan.pth" ]; then
    FILE_SIZE=$(stat -f%z "wav2lip_gan.pth" 2>/dev/null || stat -c%s "wav2lip_gan.pth" 2>/dev/null)
    if [ "$FILE_SIZE" -gt 100000000 ]; then
        echo ""
        echo "✓ Wav2Lip checkpoint downloaded successfully!"
        echo "File size: $(du -h wav2lip_gan.pth | cut -f1)"
        exit 0
    else
        echo "Downloaded file is too small, might be an error page"
        rm wav2lip_gan.pth
    fi
fi

echo ""
echo "Automatic download failed."
echo ""
echo "Please download the checkpoint manually:"
echo ""
echo "1. Visit: https://github.com/Rudrabha/Wav2Lip"
echo "2. Go to the 'Getting the weights' section"
echo "3. Download wav2lip_gan.pth (or wav2lip.pth for non-GAN version)"
echo "4. Place it in: /home/ushah/ppt_to_video/external/Wav2Lip/checkpoints/"
echo ""
echo "Alternative sources:"
echo "- https://huggingface.co/spaces/akhaliq/Wav2Lip/tree/main/checkpoints"
echo "- Check the official Wav2Lip repository README"
echo ""

exit 1
