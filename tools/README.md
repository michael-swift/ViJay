# Tools

Utilities for SVG generation and video creation.

## Key Learning: Programmatic > Hand-Crafted

When working with Claude Code on visual art, **writing generator scripts beats hand-crafting SVG** for anything involving:
- Dense patterns (noise, static, particles)
- Repetitive elements
- Animation frames
- Precise randomness

### Why?

Hand-crafting SVG elements is:
- Slow (one element at a time)
- Sparse (hard to achieve density)
- Non-reproducible (random each time)

Programmatic generation is:
- Fast (thousands of elements instantly)
- Dense (loop over every pixel if needed)
- Reproducible (seeded PRNG for consistent animation frames)

## Tools

### convert.js
Converts SVG to PNG using sharp.

```bash
node tools/convert.js input.svg output.png
```

### make-video.sh
Creates video from PNG frames using ffmpeg.

```bash
./tools/make-video.sh frames/ output.mp4
```

### noise-generator.js
Template for generating dense noise fields with carved shapes. Uses seeded PRNG for reproducible randomness.

```bash
# Generate with specific seed
node tools/noise-generator.js 1234 > output.svg

# Generate animation frames
for i in $(seq 1 60); do
  node tools/noise-generator.js $i > frames/frame-$(printf '%03d' $i).svg
done
```

Key concepts in the generator:
- **Seeded PRNG** (`mulberry32`) - same seed = same output
- **Distance functions** - define shapes mathematically
- **Carving** - form defined by absence (sparse inside, dense outside)

## Spotify Canvas Specs

For Spotify Canvas videos:
- Aspect ratio: **9:16** (720x1280 recommended)
- Duration: **>4 seconds**
- Format: MP4
- Must have `sample_aspect_ratio=1:1` and `display_aspect_ratio=9:16`

```bash
ffmpeg -framerate 30 -i frames/frame-%03d.png \
  -vf "scale=720:1280:force_original_aspect_ratio=disable,setsar=1:1" \
  -c:v libx264 -pix_fmt yuv420p -crf 28 \
  output.mp4
```
