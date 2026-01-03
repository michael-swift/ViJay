# v5-latent: Forms Emerging from Static

## Concept

Subtractive sculpting from noise. Rather than drawing forms onto a canvas, we generate dense TV static and **carve absence** - the form is defined by what's *missing* from the chaos.

> "there should be more noise than black and we're carving something out of that"

## Process

1. **Failed approach**: Hand-crafted sparse noise particles (too sparse, too controlled)
2. **Breakthrough**: Programmatic generation with dense particle fields (~90% coverage)
3. **Evolution**: Shape functions define "carved regions" where noise is suppressed
4. **Refinement**: Seeded PRNG allows reproducible variations - same shape, different static patterns

## Technical Details

### Generator Script: `generate-noise.js`

```javascript
// Seeded random for reproducible variations
function mulberry32(seed) { ... }

// Shape carved by distance functions
function getCarveDistance(x, y) {
  // Returns < 1 if inside carved region
  // Uses ellipse math with sine-wave wobble for organic edges
}

// Particle generation
for each pixel:
  if (inCarvedRegion) → sparse, dark particles
  else → dense, bright particles
```

### Key Parameters
- Canvas: 450x800 (9:16 vertical)
- Particle density: ~2px spacing
- Noise coverage: ~90% outside carved region
- Carved region: ~8-15% particle density
- Grayscale range: #02-#fe

## Files

| File | Description |
|------|-------------|
| `011-overflow.svg` | Proof of concept - rectangular carved void |
| `012-emergence.svg` | Organic keyhole shape with sine wobble |
| `013-figure.svg` | Head/neck/body structure |
| `014-sculpt.svg` | Asymmetric shoulders, internal texture |
| `015-seed-[a,b,c].svg` | Same shape, different noise seeds |

## Future Directions

- **Animation**: Generate 30+ seeds as frames for flickering static effect
- **Layering**: Composite multiple seeds with varying opacity
- **Shape Evolution**: Morph carved region across frames
- **Color**: Introduce subtle color shifts in noise field
