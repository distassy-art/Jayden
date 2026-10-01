#!/usr/bin/env python3
"""Turn the flat-background brand PNGs into transparent, right-sized web assets.

The source logos ship as ~500 KB opaque PNGs with the background colour baked in,
so they can only ever sit on a surface of that exact colour. Unmixing the known
background recovers an alpha channel, which lets the same mark sit on any surface.

Reads from brand-src/ and writes to public/assets/ so re-running never consumes
its own output.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand-src"
ASSETS = ROOT / "public" / "assets"

NAVY = (3, 29, 68)
PAPER = (239, 242, 247)


def unmix(image, background, edge=0.35, floor=0.09):
    """Recover per-pixel alpha assuming `pixel = background*(1-a) + colour*a`.

    Only pixels between `floor` and `edge` of the way to the furthest foreground
    colour are treated as anti-aliased and given partial alpha; anything beyond
    that is solid artwork and keeps both its original colour and full opacity.
    Scaling alpha across the whole range instead would wash out mid-brightness
    brand colours such as the cyan. The `floor` discards the JPEG ringing in the
    source backgrounds, which otherwise survives as speckle once made partly
    transparent.
    """
    image = image.convert("RGB")
    width, height = image.size
    src = image.load()
    out = Image.new("RGBA", (width, height))
    dst = out.load()

    br, bg, bb = background

    def distance(pixel):
        r, g, b = pixel
        return ((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) ** 0.5

    span = max(distance(p) for p in image.getdata()) or 1
    cutoff = span * edge
    noise = span * floor

    for y in range(height):
        for x in range(width):
            pixel = src[x, y]
            alpha = (distance(pixel) - noise) / (cutoff - noise)
            if alpha <= 0.0:
                dst[x, y] = (0, 0, 0, 0)
            elif alpha >= 1.0:
                dst[x, y] = (*pixel, 255)
            else:
                # Un-premultiply so edge pixels keep their true colour instead of
                # fading toward the background they were composited against.
                colour = tuple(
                    max(0, min(255, round(bc + (pc - bc) / alpha)))
                    for pc, bc in zip(pixel, background)
                )
                dst[x, y] = (*colour, round(alpha * 255))
    return out


def save(image, name, width, colours=64):
    height = round(image.height * width / image.width)
    resized = image.resize((width, height), Image.LANCZOS)
    if colours:
        # The artwork is flat colour, so a small palette is visually lossless and
        # cuts these from hundreds of kilobytes to a few.
        resized = resized.quantize(colors=colours, method=Image.FASTOCTREE)
    target = ASSETS / name
    resized.save(target, "PNG", optimize=True)
    print(f"{name:28} {resized.width}x{resized.height}  {target.stat().st_size / 1024:6.1f} KB")


def main():
    wordmark_dark = unmix(Image.open(SOURCE / "ss-logo-navy-v3.png"), NAVY)
    wordmark_light = unmix(Image.open(SOURCE / "ss-logo-light-v3.png"), PAPER)
    # The square mark is the most heavily compressed source, so it needs a wider
    # noise floor to stay free of speckle.
    mark = unmix(Image.open(SOURCE / "logo-mark.png"), NAVY, floor=0.16)

    save(wordmark_dark, "logo-wordmark-dark.png", 480)
    save(wordmark_dark, "logo-wordmark-dark@2x.png", 960)
    save(wordmark_light, "logo-wordmark-light.png", 480)
    save(wordmark_light, "logo-wordmark-light@2x.png", 960)
    save(mark, "logo-mark.png", 180)
    save(mark, "favicon-32.png", 32)

    # Apple touch icons must stay opaque, otherwise iOS composites them on black.
    icon = Image.new("RGB", mark.size, NAVY)
    icon.paste(mark, (0, 0), mark)
    save(icon, "apple-touch-icon.png", 180)

    # Home-screen (PWA) icons. Android's install prompt needs a 192 and a 512,
    # and a maskable variant with safe padding so a circular/rounded mask never
    # clips the mark. All opaque navy so no launcher composites them on black.
    def home_icon(size, pad_ratio=0.0):
        canvas = Image.new("RGB", (size, size), NAVY)
        inner = round(size * (1 - pad_ratio * 2))
        placed = mark.resize((inner, inner), Image.LANCZOS)
        offset = (size - inner) // 2
        canvas.paste(placed, (offset, offset), placed)
        return canvas

    save(home_icon(192), "icon-192.png", 192)
    save(home_icon(512), "icon-512.png", 512)
    save(home_icon(512, pad_ratio=0.16), "icon-maskable-512.png", 512)


if __name__ == "__main__":
    main()
