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

## Reel Size Relationship
Sheet Width = Reel Size the box will be made from.
If reel size entered ≠ calculated sheet width → mismatch warning.

⚠️ Reel size = the box's own required width (`W + H + 0.5`), never rounded
up to a wider *stocked* reel — the weight formula uses this same width, so
substituting a wider reel here would overstate paper consumed per box.

## Reel Substitutes — Multi-Up Cutting ✅ (corrugator capacity = 50")
Maniram doesn't stock a reel for every fractional box width. A narrow
required width is normally cut **multi-up** — n boxes side by side — from a
wider stocked reel instead, up to the corrugator's 50" width capacity.

The order's own Reel Size already includes the single-box 0.5" margin
(`W + H + 0.5`), so the raw per-box width without that margin is:
```
rawWidth = ReelSize − 0.5
```
A stocked reel of width R fits `n = floor(R / rawWidth)` boxes across, and
is a valid substitute whenever that leaves at least a 0.5" trim margin:
```
margin = R − (n × rawWidth)      → substitute valid when margin ≥ 0.5"
```
Single-up keeps the exact 0.5" margin; multi-up can loosen up to ~0.75" per
join since the margin is shared across the extra cut(s), so a little more
slack (up to ~1" observed on real stock, e.g. the 46" case below) is normal
and just means slightly more trim waste, not an invalid substitute.

Example — 15.5" required (rawWidth = 15"):
```
Reel 30.5" → n = floor(30.5/15) = 2 → margin 0.5"  → 2-up ✅ (tight fit)
Reel 46"   → n = floor(46/15)   = 3 → margin 1.0"  → 3-up ✅ (a bit looser)
```
Implemented in `findSubstitutes()` (`js/orders.js`) — searches actual
`reelData` stock (not a hardcoded size list) so substitutes always reflect
what's really on hand, capped at `CORRUGATOR_MAX_WIDTH` (50", `config.js`).

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
