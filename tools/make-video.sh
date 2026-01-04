#!/bin/bash

# Create video from iteration PNGs with titles
# Usage: ./make-video.sh v2|v3 [duration_per_frame]

VERSION=${1:-v2}
DURATION=${2:-2.5}
INPUT_DIR="drawings/$VERSION/png"
OUTPUT="drawings/$VERSION/evolution.mp4"
TEMP_DIR="drawings/$VERSION/temp_frames"

# Check input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Directory $INPUT_DIR not found"
    exit 1
fi

# Create temp directory for labeled frames
mkdir -p "$TEMP_DIR"

# Get sorted list of PNGs
PNGS=($(ls "$INPUT_DIR"/*.png | sort))
COUNT=${#PNGS[@]}

echo "Processing $COUNT images from $INPUT_DIR..."

# Create labeled frames
for i in "${!PNGS[@]}"; do
    PNG="${PNGS[$i]}"
    BASENAME=$(basename "$PNG" .png)
    OUTFILE="$TEMP_DIR/$(printf "%03d" $i).png"

    echo "  [$((i+1))/$COUNT] $BASENAME"

    # Add title text in bottom right with semi-transparent background
    ffmpeg -y -i "$PNG" \
        -vf "drawtext=text='$BASENAME':fontfile=/System/Library/Fonts/Menlo.ttc:fontsize=20:fontcolor=white:x=w-tw-20:y=h-th-20:box=1:boxcolor=black@0.5:boxborderw=8" \
        -q:v 2 "$OUTFILE" 2>/dev/null
done

echo "Creating video..."

# Create video from frames
# Each frame shows for $DURATION seconds, with 0.5s crossfade
ffmpeg -y -framerate 1/$DURATION -i "$TEMP_DIR/%03d.png" \
    -c:v libx264 -pix_fmt yuv420p -crf 18 \
    -vf "fps=30,format=yuv420p" \
    "$OUTPUT" 2>/dev/null

# Cleanup temp frames
rm -rf "$TEMP_DIR"

echo "Done: $OUTPUT"
echo "Duration: $(echo "$COUNT * $DURATION" | bc) seconds"
