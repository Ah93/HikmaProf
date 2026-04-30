#!/bin/bash

echo "==================================="
echo "AI Avatar Presentation Setup Script"
echo "==================================="

echo ""
echo "Step 1: Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    libreoffice \
    ffmpeg \
    poppler-utils \
    python3-pip \
    python3-dev \
    build-essential \
    git

echo ""
echo "Step 2: Creating Conda virtual environment..."
conda create -n ppt_to_video python=3.12 -y

echo ""
echo "Step 3: Installing Python dependencies..."
conda run -n ppt_to_video pip install --upgrade pip
conda run -n ppt_to_video pip install --upgrade setuptools wheel
conda run -n ppt_to_video pip install -r requirements.txt

echo ""
echo "Step 4: Creating directory structure..."
mkdir -p uploads outputs/slides outputs/audio outputs/avatar_videos outputs/final avatars external

echo ""
echo "Step 5: Downloading sample avatar images..."
cd avatars
wget -O avatar1.png "https://this-person-does-not-exist.com/img/avatar-gen112c78e6e1e94fefbdfe5396e9df0c5e.jpg" 2>/dev/null || echo "Skipping avatar download - will use placeholders"
wget -O avatar2.png "https://this-person-does-not-exist.com/img/avatar-gen117c18e2a89e438ebb8e8f67e6d15ce8.jpg" 2>/dev/null || echo "Skipping avatar download - will use placeholders"
wget -O avatar3.png "https://this-person-does-not-exist.com/img/avatar-gen11b3e7e4d7a244d1863c756e93c664d2.jpg" 2>/dev/null || echo "Skipping avatar download - will use placeholders"
cd ..

echo ""
echo "Step 6: Setting up Wav2Lip (optional - for advanced avatar animation)..."
read -p "Do you want to install Wav2Lip? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    cd external
    if [ ! -d "Wav2Lip" ]; then
        git clone https://github.com/Rudrabha/Wav2Lip.git
        cd Wav2Lip
        conda run -n ppt_to_video pip install -r requirements.txt
        echo ""
        echo "NOTE: You need to download Wav2Lip checkpoint files manually:"
        echo "1. Download wav2lip_gan.pth from: https://github.com/Rudrabha/Wav2Lip#getting-the-weights"
        echo "2. Place it in: external/Wav2Lip/checkpoints/"
        cd ../..
    else
        echo "Wav2Lip already installed"
        cd ..
    fi
fi

echo ""
echo "Step 7: Setting up SadTalker (optional - alternative avatar animation)..."
read -p "Do you want to install SadTalker? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    cd external
    if [ ! -d "SadTalker" ]; then
        git clone https://github.com/OpenTalker/SadTalker.git
        cd SadTalker
        conda run -n ppt_to_video pip install -r requirements.txt
        echo ""
        echo "NOTE: Follow SadTalker setup instructions to download checkpoints"
        cd ../..
    else
        echo "SadTalker already installed"
        cd ..
    fi
fi

echo ""
echo "==================================="
echo "Setup Complete!"
echo "==================================="
echo ""
echo "To run the application:"
echo "1. Activate virtual environment: conda activate ppt_to_video"
echo "2. Run the Flask app: conda run -n ppt_to_video python app.py"
echo "3. Open browser to: http://localhost:5000"
echo ""
echo "Note: If you installed Wav2Lip or SadTalker, make sure to download their checkpoint files"
echo ""
