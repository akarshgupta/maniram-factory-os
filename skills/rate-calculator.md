# Maniram Industries — Box Rate Calculator Skill

## Purpose
Calculate corrugated box weight and rate given box dimensions, ply, GSM, and paper rate.

## Inputs Required
- Box Size: L × W × H (inches)
- Ply: 3, 5, or 7
- GSM per layer (can be same or different per layer)
- BF (Bursting Factor) — typically 18
- Paper Rate (₹/kg) — current market rate
- Margin preference: with 0.5" margin or without

## Sheet Size Formula (CORRECT)
```
Sheet Length = (L + W) × 2 + 2        [edge margin always added]
Sheet Width  = W + H + 0.5            [with margin]
           OR = W + H                  [without margin — sometimes]
Area (sqm)   = (Sheet_L × Sheet_W) / 1550
```

## Weight Calculation per Layer
```
Flat layer (liner):  Weight = GSM × Area_sqm   [grams]
Flute layer (medium): Weight = GSM × Area_sqm × Flute_Factor
```

## Flute Factors
- B-flute: 1.5
- C-flute: 1.4  [to be confirmed]
- E-flute: 1.25 [to be confirmed]

## Ply Layer Structure
- 3-ply: Liner | Flute | Liner           (2 flat + 1 flute)
- 5-ply: Liner | Flute | Liner | Flute | Liner  (3 flat + 2 flute)
- 7-ply: Liner | Flute | Liner | Flute | Liner | Flute | Liner (4 flat + 3 flute)

## Rate Formula
```
Total Weight (kg) = sum of all layer weights / 1000
Amount (₹/box)   = Total Weight (kg) × Paper Rate (₹/kg)
Inc GST (18%)    = Amount × 1.18
```

## Example — 20×14×28", 3-ply, 100 GSM, BF 18
```
Sheet L = (20+14)×2 + 2 = 70"
Sheet W = 14+28+0.5     = 42.5"  (with margin)
Area    = 70×42.5/1550  = 1.919 sqm

Liner 1 = 100 × 1.919        = 191.9 gm
Flute   = 100 × 1.919 × 1.5  = 287.9 gm
Liner 2 = 100 × 1.919        = 191.9 gm
Total   = 671.8 gm (0.672 kg)

@ ₹56/kg → ₹37.62/box → ₹44.39 inc GST
```

## Known Corrections / Learnings
- ❌ WRONG formula: Sheet L = L+H, Sheet W = W+H (old mistake)
- ✅ CORRECT: Sheet L = (L+W)×2 + 2, Sheet W = W+H (+0.5 optional)
- Flute factor 1.5 confirmed for standard flute used at Maniram Industries

## To Learn / Confirm Over Time
- [ ] Exact flute factor for each flute type (B, C, E)
- [ ] GSM combinations for 5-ply and 7-ply standard boxes
- [ ] Printing cost addition (when coloured print)
- [ ] Wastage factor (if any added to weight)
- [ ] Actual paper rates Maniram Industries buys at (current)
- [ ] Whether margin (0.5") is standard or case-by-case
