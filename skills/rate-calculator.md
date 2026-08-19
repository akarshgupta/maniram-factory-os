# Maniram Industries — Box Rate Calculator Skill
## Version: 2.1 (two-part rule + GST 5%)

## Purpose
Calculate corrugated box weight and rate. Also powers webapp Rate Calculator + Quotations feature.

## Inputs Required
- Box Size: L × W × H (inches)
- Ply: 3 or 5
- GSM per layer (each layer separately)
- BF (Bursting Factor) — typically 18
- Paper Rate (₹/kg)
- Margin: with 0.5" or without

## Sheet Size Formula ✅ CORRECT
```
Sheet Length = (L + W) × 2 + 2        [single piece — 2" edge margin]
Sheet Width  = W + H + 0.5            [with margin — default]
           OR = W + H                  [without margin — sometimes]
Area (sqm)   = (Sheet_L × Sheet_W) / 1550
```
⚠️ WRONG (old mistake): Sheet L = L+H, Sheet W = W+H

## Two-Part / Pasting Machine Rule ✅ (machine width = 82")
```
5/7/9-ply: single-piece Sheet Length limit = 76"
  → agar (L+W)×2+2 > 76 → box TWO PARTS mein banega
  → stitching margin 2" DO baar → Sheet Length = (L+W)×2 + 4
3-ply: single-piece up to 80" normal; 80–82" special case (tight, machine max)
```
Example: 26.5×18×16 (7-ply) → single = 91" > 76" → two-part → 93"

## Notation Standard
Sheet size ALWAYS reel-size (width) first: **34.5 × 93**, never 93×34.5.

## Reel Size Relationship — two DIFFERENT widths, don't conflate them ⚠️
There are two distinct numbers that both get called "reel size," and mixing
them up is the single most common mistake in this codebase's history:

1. **Required width** (`reqWidth = W + H + 0.5`) — the box's OWN sheet
   width. This is what the weight/area formula ALWAYS uses, no matter what
   physical reel the box ends up cut from. A box's paper consumption per
   piece cannot depend on how many other copies happen to share the reel.
2. **Practical reel width** — the actual stocked reel width Maniram will
   buy/load to cut this box from. Almost always ≥ reqWidth, often much
   wider, because…

## Reel Substitutes — Multi-Up Cutting ✅ (corrugator capacity ≈ 48–50")
Maniram doesn't stock a reel for every fractional box width. A narrow
required width is normally cut **multi-up** — n boxes side by side — from a
wider stocked reel instead, up to the corrugator's width capacity (machine
ceiling 50", but in practice the widest reels actually stocked/used top out
around 48" — both figures matter: search up to 50", but real stock rarely
exceeds 48" anyway).

The raw per-box width without its own 0.5" trim margin is:
```
rawWidth = reqWidth − 0.5
```
A stocked reel of width R fits `n = floor(R / rawWidth)` boxes across, and
is a valid candidate whenever that leaves at least a 0.5" trim margin:
```
margin = R − (n × rawWidth)      → valid when margin ≥ 0.5"
wastePct = margin / R
```
Among all valid candidates (any n ≥ 1), **pick the one with the lowest
wastePct** — not just the narrowest reel that happens to fit. Picking
"narrowest that fits ≥ reqWidth" (i.e. always n=1) is the old, wrong
behavior: it ignores multi-up options that waste far less paper per box.

Example — 15.5" required (rawWidth = 15"):
```
Reel 30.5" → n = floor(30.5/15) = 2 → margin 0.5"  → 2-up, waste 1.6%
Reel 46"   → n = floor(46/15)   = 3 → margin 1.0"  → 3-up, waste 2.2%
```
Both valid; rank by waste% and prefer whichever real stock actually has.

Example — 20.5" required (rawWidth = 20"), against standard sizes:
```
Reel 42" → n = floor(42/20) = 2 → margin 2.0" → 2-up, waste 4.8% ← lowest, picked
Reel 30" → n = 1 → margin 10" → waste 33% (single-up, technically valid, much worse)
```

**Weight still uses reqWidth (20.5"), never the picked 42" reel** — same
box, same paper, regardless of which reel cuts it.

Implemented in two places, same algorithm:
- `findSubstitutes()` (`js/orders.js`) — Orders page stock-check, when an
  order's exact reel size shows no stock.
- `_bestMultiUpReel()` (`js/clients.js`), used by `suggestWeightAndReel()` —
  the Product Master's "Suggest Weight & Reel Size" button suggests the
  practical reel this way, while area/weight always uses reqWidth.

Both search actual `reelData` stock (not a hardcoded size list, though
`DECKLE_FALLBACK_SIZES` / `js/deckle.js` back it when live stock hasn't
loaded), capped at `CORRUGATOR_MAX_WIDTH` (50", `config.js`).

## Layer Structure
- 3-ply: L1(flat) | F1(flute×1.5) | L2(flat)
- 5-ply: L1(flat) | F1(flute×1.5) | L2(flat) | F2(flute×1.5) | L3(flat)
- 7-ply: L1 | F1 | L2 | F2 | L3 | F3 | L4

## Weight Formula per Layer
```
Flat layer  = GSM × Area_sqm          [grams]
Flute layer = GSM × Area_sqm × 1.5   [flute factor confirmed 1.5]
Total Weight = sum of all layers      [grams]
```

## Rate Formula
```
Amount (₹/box)  = (Total Weight / 1000) × Paper Rate
Inc GST (5%)    = Amount × 1.05   [Maniram standard — corrugated boxes]
```

## Example — 20×14×28", 3-ply, 100 GSM all layers
```
Sheet L = (20+14)×2+2 = 70"
Sheet W = 14+28+0.5   = 42.5"
Area    = 70×42.5/1550 = 1.919 sqm

Liner 1 = 100×1.919     = 191.9 gm
Flute   = 100×1.919×1.5 = 287.9 gm
Liner 2 = 100×1.919     = 191.9 gm
Total   = 671.8 gm

@ ₹56/kg → ₹37.62/box → ₹39.50 inc GST (5%)
```

## Webapp Feature (quotations.js)
- Rate Calculator tab → calculate → save as QT001/QT002...
- Quotation → Convert to Order (pre-fills order form)
- Quotation → Add to Client (adds as product in client master)
- Quotation → Reject

## To Confirm / Learn Over Time
- [ ] C-flute and E-flute factors
- [ ] GSM combinations for standard 5-ply boxes
- [ ] Printing surcharge formula
- [ ] Wastage factor if any
- [ ] Current paper rates Maniram buys at
