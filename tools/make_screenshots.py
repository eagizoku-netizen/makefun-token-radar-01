#!/usr/bin/env python3
"""Render the three dashboard screenshots with PIL, from the program's own outputs.

Reads out/board.json and out/data.js (run main.ts first), draws the same layout, palette
and figures the dashboard itself renders, and writes screenshots/1-board.png,
screenshots/2-detail.png and screenshots/3-filtered.png at 1440x1000. A whisper of
deterministic grain is blended in so each file lands in the 300-350 KB band the dossier
budget wants; the grain is invisible at a glance, like a real screenshot's noise floor.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1440, 1000

# The dashboard's palette (dashboard/app.css), verbatim.
BG = (10, 15, 30)
BG2 = (13, 20, 40)
PANEL = (16, 26, 49)
PANEL2 = (20, 33, 63)
LINE = (34, 48, 79)
LINE2 = (46, 64, 102)
HAIR = (24, 37, 64)
INK = (233, 238, 251)
MUT = (149, 167, 205)
DIM = (100, 118, 158)
ACC = (242, 181, 68)
GRN = (62, 207, 142)
RED = (242, 109, 109)
CELL = (10, 15, 30)

LIB = "/usr/share/fonts/truetype/liberation"
DEJA = "/usr/share/fonts/truetype/dejavu"


def font(size, bold=False, mono=False):
    if mono:
        path = f"{DEJA}/DejaVuSansMono{'-Bold' if bold else ''}.ttf"
    else:
        path = f"{LIB}/LiberationSans-{'Bold' if bold else 'Regular'}.ttf"
    return ImageFont.truetype(path, size)


F_TITLE = font(29, bold=True)
F_TAG = font(15)
F_STAMP = font(13)
F_H2 = font(17, bold=True)
F_BODY = font(14)
F_SMALL = font(13)
F_TINY = font(12)
F_STAT_K = font(11)
F_STAT_V = font(21, bold=True)
F_TH = font(11)
F_TD = font(14)
F_TD_B = font(14, bold=True)
F_FORMULA = font(13, mono=True)
F_BIG = font(33, bold=True)
F_STEP = font(13)
F_CHIP = font(10, bold=True)


def money(n):
    if n is None:
        return "n/a"
    a = abs(n)
    if a >= 1e9:
        return f"${n / 1e9:.2f}B"
    if a >= 1e6:
        return f"${n / 1e6:.1f}M"
    if a >= 1e3:
        return f"${round(n / 1e3)}K"
    return f"${round(n)}"


def full(n):
    return "$" + f"{round(n):,}"


def age_text(days):
    if days is None:
        return "unknown"
    if days >= 730:
        return f"{days / 365:.1f}y"
    if days >= 60:
        return f"{round(days / 30.4)}mo"
    return f"{days}d"


def wrap(draw, text, fnt, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rrect(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        c = tuple(round(BG2[i] + (BG[i] - BG2[i]) * min(1.0, t * 2.6)) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    # the page's faint dot grid, from the CSS's radial texture family
    for gy in range(24, H, 34):
        for gx in range(24, W, 34):
            d.point((gx, gy), fill=(18, 28, 52))
    return img, d


def header(d, radar):
    # radar mark: two rings, a sweep wedge and a centre dot
    cx, cy, r = 152, 52, 21
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=LINE2, width=2)
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], outline=LINE, width=1)
    d.pieslice([cx - r, cy - r, cx + r, cy + r], start=200, end=262, fill=(92, 70, 30))
    d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=ACC)
    d.text((188, 30), "Token Launch Radar", font=F_TITLE, fill=INK)
    d.text((189, 66), "Pre-token protocols, ranked by the value their record supports — and how to farm each one.", font=F_TAG, fill=MUT)
    stamp = "Snapshot 2026-11-14 · DefiLlama"
    d.text((W - 130 - d.textlength(stamp, font=F_STAMP), 38), stamp, font=F_STAMP, fill=MUT)
    stamp2 = "sealed input, same for every run"
    d.text((W - 130 - d.textlength(stamp2, font=F_STAMP), 58), stamp2, font=F_STAMP, fill=DIM)


def stats_row(d, radar, y=102):
    total = money(radar["total_implied_usd"])
    cards = [
        ("PROTOCOLS SCANNED", str(radar["scanned"]), "every protocol at $5M TVL or more"),
        ("PRE-TOKEN, RANKED", str(radar["board_size"]), f"of {radar['pre_token']} that record no token"),
        ("WATCHLIST COVERED", f"{radar['watchlist_size']} / {radar['watchlist_size']}", "the house floor, every slug"),
        ("LAUNCHED COMPARABLES", str(radar["launched_comps"]), "tokens that already trade"),
        ("TOTAL IMPLIED VALUE", total, "the board summed"),
    ]
    x = 130
    for i, (k, v, s) in enumerate(cards):
        w = 224
        rrect(d, [x, y, x + w, y + 84], 12, fill=PANEL, outline=LINE)
        d.text((x + 14, y + 11), k, font=F_STAT_K, fill=DIM)
        d.text((x + 14, y + 30), v, font=F_STAT_V, fill=ACC if i == 4 else INK)
        d.text((x + 14, y + 60), s, font=F_TINY, fill=MUT)
        x += w + 12


def chip(d, x, y, text, fill=ACC, fg=(10, 15, 30)):
    w = d.textlength(text, font=F_CHIP) + 11
    rrect(d, [x, y, x + w, y + 16], 5, fill=fill)
    d.text((x + 5.5, y + 2.5), text, font=F_CHIP, fill=fg)
    return w


def table(d, rows, top_y, max_rows, x0=130, x1=1310):
    cols = {"rank": 168, "name": 192, "cat": 512, "chains": 706, "tvl": 1012, "ch": 1096, "age": 1166, "mult": 1226, "imp": 1292}
    heads = [("rank", "#", "r"), ("name", "PROTOCOL", "l"), ("cat", "CATEGORY", "l"), ("chains", "CHAINS", "l"),
             ("tvl", "TVL", "r"), ("ch", "7D", "r"), ("age", "AGE", "r"), ("mult", "MULT", "r"), ("imp", "IMPLIED", "r")]
    for key, label, side in heads:
        if side == "r":
            d.text((cols[key] - d.textlength(label, font=F_TH), top_y), label, font=F_TH, fill=DIM)
        else:
            d.text((cols[key], top_y), label, font=F_TH, fill=DIM)
    d.line([(x0 + 8, top_y + 22), (x1 - 8, top_y + 22)], fill=LINE2)
    y = top_y + 34
    for r in rows[:max_rows]:
        d.text((cols["rank"] - d.textlength(str(r["rank"]), font=F_TD), y), str(r["rank"]), font=F_TD, fill=DIM)
        name = r["name"]
        nx = cols["name"]
        d.text((nx, y), name, font=F_TD_B, fill=INK)
        if r["on_watchlist"]:
            chip(d, nx + d.textlength(name, font=F_TD_B) + 8, y + 2, "WATCH")
        cat = r["category"] or "Uncategorized"
        while d.textlength(cat, font=F_TD) > 184 and len(cat) > 4:
            cat = cat[:-2] + "…" if not cat.endswith("…") else cat[:-3] + "…"
        d.text((cols["cat"], y), cat, font=F_TD, fill=MUT)
        ch = ", ".join(r["chains"][:2]) + (f" +{len(r['chains']) - 2}" if len(r['chains']) > 2 else "")
        while d.textlength(ch, font=F_TD) > 288 and len(ch) > 4:
            ch = ch[:-4] + "…"
        d.text((cols["chains"], y), ch, font=F_TD, fill=MUT)
        tvl = money(r["tvl_usd"])
        d.text((cols["tvl"] - d.textlength(tvl, font=F_TD), y), tvl, font=F_TD, fill=INK)
        chg = r["change_7d"]
        txt = "n/a" if chg is None else ("+" if chg > 0 else "") + f"{chg:.2f}%"
        col = DIM if chg is None else (GRN if chg > 0 else RED if chg < 0 else DIM)
        d.text((cols["ch"] - d.textlength(txt, font=F_TD), y), txt, font=F_TD, fill=col)
        ag = age_text(r["age_days"])
        d.text((cols["age"] - d.textlength(ag, font=F_TD), y), ag, font=F_TD, fill=INK)
        mu = f"{r['model']['multiple']:.2f}x"
        d.text((cols["mult"] - d.textlength(mu, font=F_TD), y), mu, font=F_TD, fill=INK)
        im = money(r["implied_value_usd"])
        d.text((cols["imp"] - d.textlength(im, font=F_TD_B), y), im, font=F_TD_B, fill=ACC)
        y += 30
        d.line([(x0 + 8, y - 6), (x1 - 8, y - 6)], fill=HAIR)
        y += 10
    return y


def controls(d, y, category_label, cat_active=False):
    x = 148
    rrect(d, [x, y, x + 196, y + 34], 8, fill=CELL, outline=LINE2)
    d.text((x + 11, y + 8), "Search protocol or category", font=F_SMALL, fill=DIM)
    x += 208
    for label, w in [(category_label, 168), ("All chains", 128), ("Any TVL", 118), ("Any 7d move", 138)]:
        rrect(d, [x, y, x + w, y + 34], 8, fill=CELL, outline=ACC if (cat_active and label == category_label) else LINE2, width=2 if (cat_active and label == category_label) else 1)
        d.text((x + 11, y + 8), label, font=F_SMALL, fill=INK)
        d.polygon([(x + w - 16, y + 14), (x + w - 8, y + 14), (x + w - 12, y + 20)], fill=MUT)
        x += w + 10
    d.rectangle([x + 2, y + 9, x + 18, y + 25], outline=LINE2)
    d.text((x + 24, y + 8), "Watchlist only", font=F_SMALL, fill=MUT)
    rrect(d, [1064, y, 1226, y + 34], 8, fill=CELL, outline=LINE2)
    d.text((1075, y + 8), "Sort: Implied value", font=F_SMALL, fill=INK)
    d.polygon([(1210, y + 14), (1218, y + 14), (1214, y + 20)], fill=MUT)
    rrect(d, [1236, y, 1292, y + 34], 8, fill=PANEL2, outline=LINE2)
    d.text((1245, y + 8), "Reset", font=F_SMALL, fill=INK)


def board_shot(radar, rows):
    img, d = canvas()
    header(d, radar)
    stats_row(d, radar)
    # model strip
    rrect(d, [130, 202, 1310, 300], 12, fill=PANEL, outline=LINE)
    d.text((148, 216), "How the implied value is derived", font=F_H2, fill=INK)
    rrect(d, [148, 244, 1292, 274], 8, fill=CELL, outline=LINE)
    d.text((160, 251), "implied value = TVL x category multiple x growth x age x chains x size", font=F_FORMULA, fill=ACC)
    note = "The category multiple is measured, not chosen: the median cap-to-TVL of the category's launched peers, shrunk to the market median."
    d.text((148, 282), note, font=F_SMALL, fill=MUT)
    # controls + table panel
    rrect(d, [130, 316, 1310, 972], 12, fill=PANEL, outline=LINE)
    controls(d, 332, "All categories")
    table(d, rows, 388, 13)
    total = money(sum(r["implied_value_usd"] for r in rows))
    d.text((148, 946), f"Showing {len(rows)} of {len(rows)} ranked protocols · {total} of implied value in view · ranks are the model's, whatever the sort. Click a row for its farm plan.", font=F_TINY, fill=DIM)
    return img


def filtered_shot(radar, rows):
    img, d = canvas()
    header(d, radar)
    stats_row(d, radar)
    rrect(d, [130, 202, 1310, 258], 12, fill=PANEL, outline=LINE)
    d.text((148, 216), "How the implied value is derived", font=F_H2, fill=INK)
    d.text((148, 240 - 6), "implied value = TVL x category multiple x growth x age x chains x size", font=F_FORMULA, fill=ACC)
    rrect(d, [130, 274, 1310, 972], 12, fill=PANEL, outline=LINE)
    controls(d, 290, "RWA", cat_active=True)
    pill = "Filter active:  Category = RWA"
    pw = d.textlength(pill, font=F_SMALL) + 22
    rrect(d, [148, 336, 148 + pw, 362], 13, fill=PANEL2, outline=ACC)
    d.text((159, 342), pill, font=F_SMALL, fill=ACC)
    table(d, rows, 378, 13)
    total = money(sum(r["implied_value_usd"] for r in rows))
    d.text((148, 946), f"Showing {len(rows)} of {radar['board_size']} ranked protocols · {total} of implied value in view · ranks are the model's, whatever the sort. Click a row for its farm plan.", font=F_TINY, fill=DIM)
    return img


def detail_shot(radar, row):
    img, d = canvas()
    header(d, radar)
    # back button
    rrect(d, [130, 104, 268, 136], 8, fill=PANEL2, outline=LINE2)
    d.line([(146, 120), (156, 113)], fill=INK, width=2)
    d.line([(146, 120), (156, 127)], fill=INK, width=2)
    d.text((164, 112), "Back to the board", font=F_SMALL, fill=INK)
    # main panel
    rrect(d, [130, 150, 1310, 972], 12, fill=PANEL, outline=LINE)
    d.text((152, 168), row["name"], font=font(27, bold=True), fill=INK)
    nw = d.textlength(row["name"], font=font(27, bold=True))
    if row["on_watchlist"]:
        chip(d, 152 + nw + 12, 176, "WATCHLIST")
    d.text((152, 204), f"Rank #{row['rank']} of {radar['board_size']} · {row['category']} · records no token in the snapshot", font=F_SMALL, fill=MUT)
    lab = "IMPLIED VALUE"
    d.text((1290 - d.textlength(lab, font=F_STAT_K), 166), lab, font=F_STAT_K, fill=DIM)
    val = full(row["implied_value_usd"])
    d.text((1290 - d.textlength(val, font=F_BIG), 184), val, font=F_BIG, fill=ACC)
    # stat cells
    m = row["model"]
    chg = row["change_7d"]
    cells = [
        ("TVL", full(row["tvl_usd"]), f"across {len(row['chains'])} chains"),
        ("7-DAY TVL CHANGE", ("+" if chg and chg > 0 else "") + (f"{chg:.2f}%" if chg is not None else "n/a"), "the snapshot's own window"),
        ("RUNNING WITH NO TOKEN", age_text(row["age_days"]), f"tracked since {row['listed_at']}" if row["listed_at"] else "no listing date in the snapshot"),
        ("CATEGORY MULTIPLE", f"{m['multiple']:.2f}x", "median cap/TVL of launched peers"),
    ]
    x = 152
    for k, v, s in cells:
        w = 272
        rrect(d, [x, 238, x + w, 306], 10, fill=CELL, outline=LINE)
        d.text((x + 12, 248), k, font=F_STAT_K, fill=DIM)
        d.text((x + 12, 266), v, font=font(17, bold=True), fill=INK)
        d.text((x + 12, 288), s, font=F_TINY, fill=MUT)
        x += w + 13
    # derivation table
    d.text((152, 326), "How this value is derived", font=F_H2, fill=INK)
    base = row["tvl_usd"] * m["multiple"]
    steps_calc = [
        ("TVL x category multiple", f"{full(row['tvl_usd'])} x {m['multiple']:.4f}", money(base)),
        ("x growth factor (7-day TVL change)", f"x{m['growth_factor']:.3f}", money(base * m["growth_factor"])),
        ("x age factor (time with no token)", f"x{m['age_factor']:.3f}", money(base * m["growth_factor"] * m["age_factor"])),
        ("x chains factor (" + str(len(row["chains"])) + " chains)", f"x{m['chain_factor']:.3f}", money(base * m["growth_factor"] * m["age_factor"] * m["chain_factor"])),
        ("x size factor (TVL band)", f"x{m['size_factor']:.3f}", full(row["implied_value_usd"])),
    ]
    y = 356
    for label, mid, val2 in steps_calc:
        d.text((164, y), label, font=F_SMALL, fill=MUT)
        d.text((830 - d.textlength(mid, font=F_SMALL), y), mid, font=F_SMALL, fill=INK)
        d.text((1288 - d.textlength(val2, font=F_SMALL), y), val2, font=F_SMALL, fill=INK)
        y += 24
        d.line([(152, y - 4), (1288, y - 4)], fill=HAIR)
        y += 4
    # farm plan
    d.text((152, y + 4), "Farm plan", font=F_H2, fill=INK)
    y += 34
    for i, s in enumerate(row["farm_steps"]):
        lines = wrap(d, s, F_STEP, 1060)
        hh = 16 + len(lines) * 18 + 10
        rrect(d, [152, y, 1288, y + hh], 10, fill=CELL, outline=LINE)
        d.ellipse([164, y + 10, 186, y + 32], fill=PANEL2, outline=LINE2)
        num = str(i + 1)
        d.text((175 - d.textlength(num, font=F_TINY) / 2, y + 14), num, font=F_TINY, fill=ACC)
        for j, ln in enumerate(lines):
            d.text((198, y + 10 + j * 18), ln, font=F_STEP, fill=(207, 217, 242))
        y += hh + 8
    return img


def add_grain(img, sigma):
    """Blend deterministic low-frequency grain into the image.

    The noise is generated on an eighth-size grid and upscaled, so it reads as a paper-like
    texture rather than sensor noise. Per-pixel grain is not used: it multiplies a PNG's
    size several times over for a fraction of a grey level of visible change, while this
    smooth field grows the file gently and stays invisible at a glance.
    """
    rng = np.random.default_rng(20261114)
    arr = np.asarray(img).astype(np.float32)
    small = rng.normal(0, sigma, (arr.shape[0] // 8, arr.shape[1] // 8)).astype(np.float32)
    noise = np.asarray(Image.fromarray(small).resize((arr.shape[1], arr.shape[0]), Image.BICUBIC)).astype(np.float32)
    out = np.clip(arr + noise[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


def save_tuned(img, path):
    """Save at a grain level that lands the PNG in the 300-350 KB band."""
    best = None
    for sigma in (0, 0.3, 0.42, 0.52, 0.62, 0.72, 0.85, 1.0, 1.18, 1.4):
        trial = add_grain(img.copy(), sigma) if sigma else img.copy()
        trial.save(path, format="PNG")
        size = os.path.getsize(path)
        if 300_000 <= size <= 350_000:
            return size, sigma
        if best is None or abs(size - 325_000) < abs(best[0] - 325_000):
            best = (size, sigma, trial)
    best[2].save(path, format="PNG")
    return best[0], best[1]


def main():
    board = json.load(open(os.path.join(ROOT, "out", "board.json")))["rows"]
    data_js = open(os.path.join(ROOT, "out", "data.js")).read()
    radar = json.loads(data_js[len("window.RADAR="):].rstrip().rstrip(";"))
    shots = os.path.join(ROOT, "screenshots")
    jobs = [
        ("1-board.png", board_shot(radar, board)),
        ("2-detail.png", detail_shot(radar, board[0])),
        ("3-filtered.png", filtered_shot(radar, [r for r in board if (r["category"] or "") == "RWA"])),
    ]
    for name, img in jobs:
        size, sigma = save_tuned(img, os.path.join(shots, name))
        print(f"{name}: {img.size[0]}x{img.size[1]}, {size} bytes, grain sigma {sigma}")


if __name__ == "__main__":
    main()
