# Maniram Industries — Box Rate Calculator Skill
## Version: 2.0 (webapp integrated)

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
Sheet Length = (L + W) × 2 + 2        [always add 2" edge margin]
Sheet Width  = W + H + 0.5            [with margin — default]
           OR = W + H                  [without margin — sometimes]
Area (sqm)   = (Sheet_L × Sheet_W) / 1550
```
⚠️ WRONG (old mistake): Sheet L = L+H, Sheet W = W+H

## Reel Size Relationship
Sheet Width = Reel Size the box will be made from.
If reel size entered ≠ calculated sheet width → mismatch warning.

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
Inc GST (18%)   = Amount × 1.18
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

@ ₹56/kg → ₹37.62/box → ₹44.39 inc GST
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
