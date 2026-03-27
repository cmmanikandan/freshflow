# FreshFlow Brand Guidelines

This branding system is built from the uploaded FreshFlow logo direction: modern, clean, minimal, and premium with soft green-orange gradients.

## 1. Core Brand Direction

- Personality: Fresh, reliable, smart, warm.
- Tone: Helpful and confident, never loud.
- Visual language: Flat vector shapes with subtle depth via soft shadows and layered gradients.

## 2. Logo System

Primary deliverables in `public/brand`:

- `app-icon.svg`: Mobile app icon (rounded square, high contrast, icon only).
- `favicon.svg`: Simplified small-size icon for browser tabs.
- `splash-screen.svg`: Center logo + tagline with premium gradient backdrop.
- `logo-dark.svg`: Optimized for dark backgrounds.
- `logo-mono-black.svg`: Monochrome print/document use.
- `logo-mono-white.svg`: Reverse monochrome for dark/photographic backgrounds.

Logo rules:

- Keep clear space around logo equal to the cart-wheel diameter.
- Do not stretch, skew, rotate, or recolor outside approved palette.
- For tiny placements under 32px, use icon-only versions.

## 3. Color Palette

Primary

- Fresh Green 600: `#0A9A5D`
- Fresh Green 500: `#33BE5D`
- Fresh Green 300: `#7CE96A`

Accent

- Citrus Orange 500: `#F5841F`
- Citrus Orange 400: `#FFAF3F`

Supporting

- Tomato Red 500: `#EF624B`
- Mint Mist 100: `#E8F6EC`
- Cloud 0: `#FFFFFF`
- Ink 900: `#111111`
- Slate 500: `#5F6670`

Recommended gradients

- Primary gradient: `linear-gradient(135deg, #7CE96A 0%, #0A9A5D 100%)`
- Highlight gradient: `linear-gradient(120deg, #33BE5D 0%, #F5841F 100%)`

## 4. Typography

Preferred families:

- Headlines and logo-support text: Poppins
- Body/UI/system copy: Inter

Fallback stack:

- `"Poppins", "Inter", Arial, sans-serif`

Type scale

- Display: 64/72, weight 700
- H1: 48/56, weight 700
- H2: 36/44, weight 700
- H3: 28/36, weight 600
- Body Large: 18/28, weight 400-500
- Body: 16/24, weight 400
- Caption: 13/18, weight 500

## 5. Spacing System

Base unit: 8px

- `space-1` = 8
- `space-2` = 16
- `space-3` = 24
- `space-4` = 32
- `space-5` = 40
- `space-6` = 48

Corner radius

- Cards: 16-24px
- Inputs/buttons: 12-16px
- App icon: 20-24% of side length

## 6. Icon Style

- Geometric, rounded, and minimal.
- Stroke-first iconography with 2px or 2.5px line weight in UI.
- Use filled accents only for category highlights or status cues.
- Keep perspective flat; use one subtle shadow layer for premium depth.

## 7. Social Media Kit Assets

In `public/brand/social`:

- `instagram-post-template.svg` (1080x1080)
- `banner.svg` (1600x600)
- `app-promotion-layout.svg` (1080x1350)

Usage notes:

- Keep CTA button in Fresh Green gradient.
- Maintain 8-12% edge margins for safe crop zones.
- Do not place body copy over high-contrast pattern areas.

## 8. Loading Screen / Motion Pattern

Use `public/brand/loading-screen.html` as reference prototype:

- Cart glides horizontally in a smooth loop.
- Vegetables pop with staggered timing.
- Progress bar animates continuously with brand gradient.

Animation settings:

- Duration: 1.4s (vegetables), 2.8s (cart/progress)
- Easing: `ease-in-out`
- Motion style: calm and minimal (no abrupt jumps)

## 9. Implementation Notes

- For web: use `favicon.svg` in HTML head and `app-icon.svg` for PWA icon pipeline.
- For iOS/Android export: convert `app-icon.svg` to required PNG sizes via design/dev pipeline.
- For dark UI: use `logo-dark.svg` and ensure minimum contrast ratio of 4.5:1 for text elements.
