"""Fighter anatomy from freely licensed standing photos (``uv sync --extra vision``, then
``uv run python -m ufc_embedded.anatomy``).

Step 1 of the "learn from images" direction: can a pretrained pose model measure a fighter's
body proportions from photos, accurately enough to be worth a feature?

1. **Candidates.** For every active UFC fighter, freely licensed images on Wikimedia Commons:
   the full-size Wikipedia lead photo, the uncropped original of a "(cropped)" photo (often a
   full-body weigh-in or press shot), and the files in the fighter's Commons category.
2. **Download** (cached in ``data/raw/anatomy/``, never committed).
3. **Pose.** torchvision's Keypoint R-CNN (pretrained on COCO) finds every person and 17 joints.
   A photo is kept only if one person dominates it and stands upright, facing the camera,
   head to ankles in view, every joint confidently found.
4. **Measure.** Limb lengths in units of the body's height in the photo (nose to ankles), so
   the photo's scale cancels:

       arm = (|shoulder−elbow| + |elbow−wrist|) / S,   leg = (|hip−knee| + |knee−ankle|) / S,
       span = (2·arm + shoulder width) / S ≈ reach / height.

5. **Validate.** Against the truth: the measured span ratio vs each fighter's reach / height on
   UFCStats (correlation), and against itself: fighters with two good photos measured twice
   (repeatability).

Everything is logged to W&B live: counts as photos are processed, examples with the detected
skeleton drawn on, and the final tables and plots. Images stay in the private W&B workspace and
on disk; only numbers and plots go to ``docs/experiments``.
"""

import argparse
import hashlib
import json
import math
import re
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from ufc_embedded.data import PROCESSED_DIR, RAW_DIR, active_fighters, load_fights, load_raw  # noqa: E402
from ufc_embedded.features import appearances  # noqa: E402
from ufc_embedded.tracking import Tracker  # noqa: E402
from ufc_embedded.wikipedia import PHOTO_CACHE, USER_AGENT  # noqa: E402

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
IMAGE_DIR = RAW_DIR / "anatomy"
CANDIDATES = PROCESSED_DIR / "anatomy_candidates.json"
POSES = PROCESSED_DIR / "anatomy_poses.json"
OUT = Path(__file__).resolve().parents[2] / "docs" / "experiments"
PAUSE_S = 0.4  # between API calls (Wikimedia etiquette: serial, identified, polite)
WIDTH = 1000  # download size (px, longest side about this)
MAX_PER_FIGHTER = 8
PERSON_MIN = 0.85  # detection confidence for a person
KP_MIN = 2.0  # keypoint confidence (Keypoint R-CNN logit) for every joint used
DOMINANCE = 2.5  # the fighter's box must be this many times bigger than anyone else's
MAX_TILT_DEG = 12.0  # body axis vs vertical
MIN_FRONTAL = 0.40  # shoulder width / torso length: lower means a side view
MIN_BODY_FRAC = 0.40  # body (nose to ankles) at least this share of the image height

# COCO keypoints.
NOSE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN = (
    0,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
)
BODY = [NOSE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN]
SKELETON = [
    (L_SH, R_SH),
    (L_SH, L_EL),
    (L_EL, L_WR),
    (R_SH, R_EL),
    (R_EL, R_WR),
    (L_SH, L_HIP),
    (R_SH, R_HIP),
    (L_HIP, R_HIP),
    (L_HIP, L_KN),
    (L_KN, L_AN),
    (R_HIP, R_KN),
    (R_KN, R_AN),
]
MEASURES = ["arm", "leg", "shoulder", "hip", "torso", "span", "arm_leg"]


# --- 1. Candidates on Wikimedia Commons -------------------------------------------------


def commons_get(params: dict[str, Any], retries: int = 5) -> dict[str, Any]:
    url = f"{COMMONS_API}?{urlencode({**params, 'format': 'json', 'formatversion': 2})}"
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as r:
                time.sleep(PAUSE_S)
                data: dict[str, Any] = json.load(r)
                return data
        except (HTTPError, URLError, TimeoutError):
            time.sleep(2**attempt)
    return {}


def file_title(credit_url: str) -> str | None:
    """'File:…' from a Commons file page URL (None for English-Wikipedia-only files)."""
    if "commons.wikimedia.org/wiki/File:" not in credit_url:
        return None
    return "File:" + unquote(credit_url.split("/wiki/File:")[1]).replace("_", " ")


def uncropped(title: str) -> str | None:
    """The original a '(cropped)' file was cut from, by Commons' naming convention."""
    if "cropped" not in title.lower():
        return None
    return re.sub(r"\s*\((?:cropped|Cropped)\)", "", title)


def category_files(category: str, limit: int = 20) -> list[str]:
    data = commons_get(
        {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "file",
            "cmlimit": limit,
        }
    )
    return [m["title"] for m in data.get("query", {}).get("categorymembers", [])]


def person_categories(title: str, name: str) -> list[str]:
    """The categories of a file that look like they're about this fighter (contain the
    surname), e.g. 'Category:Alex Pereira (fighter)'."""
    surname = name.split()[-1].lower()
    data = commons_get({"action": "query", "prop": "categories", "titles": title, "cllimit": 50})
    pages = data.get("query", {}).get("pages", [])
    cats = [c["title"] for p in pages for c in p.get("categories", [])]
    return [c for c in cats if surname in c.lower() and not re.search(r"\d{4}", c)]


def image_info(titles: list[str]) -> dict[str, dict[str, Any]]:
    """Download URL (resized to ``WIDTH``), size and type of up to 50 files."""
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(titles), 50):
        data = commons_get(
            {
                "action": "query",
                "prop": "imageinfo",
                "titles": "|".join(titles[i : i + 50]),
                "iiprop": "url|size|mime",
                "iiurlwidth": WIDTH,
            }
        )
        for page in data.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [{}])[0]
            if info.get("mime") in ("image/jpeg", "image/png") and "thumburl" in info:
                out[page["title"]] = {
                    "url": info["thumburl"],
                    "width": info.get("width"),
                    "height": info.get("height"),
                    "page": info.get("descriptionurl"),
                }
    return out


def gather_candidates(names: list[str], tracker: Tracker) -> dict[str, list[dict[str, Any]]]:
    """Candidate images per fighter, cached in ``CANDIDATES`` (delete it to look again)."""
    cache: dict[str, list[dict[str, Any]]] = (
        json.loads(CANDIDATES.read_text()) if CANDIDATES.exists() else {}
    )
    photos = json.loads(PHOTO_CACHE.read_text()) if PHOTO_CACHE.exists() else {}
    todo = [n for n in names if n not in cache]
    for k, name in enumerate(todo, 1):
        titles: list[str] = []
        lead = file_title((photos.get(name) or {}).get("credit_url", ""))
        crop_of: dict[str, str] = {}
        if lead:
            titles.append(lead)
            if orig := uncropped(lead):
                titles.append(orig)
                crop_of[orig] = lead
            for cat in person_categories(lead, name)[:2]:
                titles += category_files(cat)
        titles += category_files(f"Category:{name}")
        titles = list(dict.fromkeys(titles))[: MAX_PER_FIGHTER * 2]
        info = image_info(titles) if titles else {}
        items = []
        for t in titles:
            if t not in info:
                continue
            item = {"title": t, **info[t]}
            if t in crop_of and crop_of[t] in info:  # where the fighter is in a group photo
                item["crop_of"] = crop_of[t]
                item["crop_width"] = info[crop_of[t]]["width"]
            items.append(item)
        cache[name] = items[:MAX_PER_FIGHTER]
        if k % 10 == 0 or k == len(todo):
            CANDIDATES.write_text(json.dumps(cache, indent=1))
            found = sum(len(v) for v in cache.values())
            print(f"  candidates: {len(cache)}/{len(names)} fighters, {found} images", flush=True)
            tracker.log(
                {
                    "candidates/fighters": len(cache),
                    "candidates/images": found,
                    "candidates/fighters_with_any": sum(bool(v) for v in cache.values()),
                }
            )
    return {n: cache.get(n, []) for n in names}


# --- 2. Download -----------------------------------------------------------------------


def local_path(title: str) -> Path:
    return IMAGE_DIR / (hashlib.sha1(title.encode()).hexdigest()[:16] + ".jpg")


def download(item: dict[str, Any]) -> Path | None:
    path = local_path(item["title"])
    if path.exists():
        return path
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            req = Request(item["url"], headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=60) as r:
                path.write_bytes(r.read())
            time.sleep(PAUSE_S)
            return path
        except (HTTPError, URLError, TimeoutError):
            time.sleep(2**attempt)
    return None


# --- 3. Pose ---------------------------------------------------------------------------


class PoseModel:
    """torchvision's Keypoint R-CNN (ResNet-50 FPN, COCO weights): people and 17 joints."""

    def __init__(self, device: str) -> None:
        import torch
        from torchvision.models.detection import (
            KeypointRCNN_ResNet50_FPN_Weights,
            keypointrcnn_resnet50_fpn,
        )

        self.torch = torch
        weights = KeypointRCNN_ResNet50_FPN_Weights.DEFAULT
        self.model = keypointrcnn_resnet50_fpn(weights=weights).eval()
        self.device = device
        try:
            self.model.to(device)
        except Exception:  # noqa: BLE001 — fall back to the CPU if the device can't run it
            self.device = "cpu"
            self.model.to("cpu")
        self.to_tensor = weights.transforms()

    def __call__(self, path: Path) -> dict[str, Any]:
        from PIL import Image

        img = Image.open(path).convert("RGB")
        x = self.to_tensor(img).to(self.device)
        with self.torch.no_grad():
            out = self.model([x])[0]
        people = []
        for box, score, kp, kps in zip(
            out["boxes"], out["scores"], out["keypoints"], out["keypoints_scores"], strict=True
        ):
            if float(score) < 0.5:
                continue
            people.append(
                {
                    "box": [round(float(v), 1) for v in box],
                    "score": round(float(score), 3),
                    "kp": [
                        [round(float(p[0]), 1), round(float(p[1]), 1), round(float(s), 2)]
                        for p, s in zip(kp, kps, strict=True)
                    ],
                }
            )
        return {"size": list(img.size), "people": people}


# --- 4. Measure ------------------------------------------------------------------------


def dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.hypot(*(a - b)))


def locate_crop(
    original: Path, crop: Path, original_width: int, crop_width: int
) -> list[float] | None:
    """Where a '(cropped)' file sits in its original: the crop, resized to the scale it has
    in the downloaded original (known from both files' full sizes), found by normalised
    cross-correlation. None if it isn't found confidently."""
    import cv2

    o = cv2.imread(str(original), cv2.IMREAD_GRAYSCALE)
    c = cv2.imread(str(crop), cv2.IMREAD_GRAYSCALE)
    if o is None or c is None or not original_width or not crop_width:
        return None
    tw = round(crop_width * o.shape[1] / original_width)
    th = round(c.shape[0] * tw / c.shape[1])
    if tw < 24 or th < 24 or tw > o.shape[1] or th > o.shape[0]:
        return None
    t = cv2.resize(c, (tw, th), interpolation=cv2.INTER_AREA)
    _, best, _, (x, y) = cv2.minMaxLoc(cv2.matchTemplate(o, t, cv2.TM_CCOEFF_NORMED))
    return [float(x), float(y), float(x + tw), float(y + th)] if best >= 0.6 else None


def overlap(box: list[float], target: list[float]) -> float:
    """Share of ``target`` covered by ``box``."""
    w = max(0.0, min(box[2], target[2]) - max(box[0], target[0]))
    h = max(0.0, min(box[3], target[3]) - max(box[1], target[1]))
    return w * h / max((target[2] - target[0]) * (target[3] - target[1]), 1e-9)


def check_and_measure(
    pose: dict[str, Any], target: list[float] | None = None
) -> tuple[str, dict[str, float] | None]:
    """Why a photo is rejected (the first failed check), or 'ok' and its measurements. With
    ``target`` (where the fighter is, from their cropped photo), the person covering it is
    measured; otherwise one person must dominate the photo."""
    people = [p for p in pose["people"] if p["score"] >= PERSON_MIN]
    if not people:
        return "no person", None
    if target is not None:
        cover = [overlap(p["box"], target) for p in people]
        if max(cover) < 0.5:
            return "fighter not found in group photo", None
        person = people[int(np.argmax(cover))]
    else:
        areas = sorted(
            (((b := p["box"])[2] - b[0]) * (b[3] - b[1]), i) for i, p in enumerate(people)
        )[::-1]
        if len(areas) > 1 and areas[0][0] < DOMINANCE * areas[1][0]:
            return "several people", None
        person = people[areas[0][1]]
    kp = np.array(person["kp"])
    xy, conf = kp[:, :2], kp[:, 2]
    if (conf[BODY] < KP_MIN).any():
        return "body not fully visible", None
    sh, hip = (xy[L_SH] + xy[R_SH]) / 2, (xy[L_HIP] + xy[R_HIP]) / 2
    kn, an = (xy[L_KN] + xy[R_KN]) / 2, (xy[L_AN] + xy[R_AN]) / 2
    if not (xy[NOSE][1] < sh[1] < hip[1] < kn[1] < an[1]):
        return "not upright", None
    axis = an - sh
    if abs(math.degrees(math.atan2(axis[0], axis[1]))) > MAX_TILT_DEG:
        return "leaning", None
    torso = dist(sh, hip)
    if dist(xy[L_SH], xy[R_SH]) / torso < MIN_FRONTAL:
        return "side view", None
    stature = an[1] - xy[NOSE][1]
    if stature < MIN_BODY_FRAC * pose["size"][1]:
        return "too small", None
    arm = np.mean(
        [
            dist(xy[s], xy[e]) + dist(xy[e], xy[w])
            for s, e, w in ((L_SH, L_EL, L_WR), (R_SH, R_EL, R_WR))
        ]
    )
    leg = np.mean(
        [
            dist(xy[h], xy[k]) + dist(xy[k], xy[a])
            for h, k, a in ((L_HIP, L_KN, L_AN), (R_HIP, R_KN, R_AN))
        ]
    )
    shoulder = dist(xy[L_SH], xy[R_SH])
    m = {
        "arm": arm / stature,
        "leg": leg / stature,
        "shoulder": shoulder / stature,
        "hip": dist(xy[L_HIP], xy[R_HIP]) / stature,
        "torso": torso / stature,
        "span": (2 * arm + shoulder) / stature,
        "arm_leg": arm / leg,
        "quality": float(conf[BODY].min()),
    }
    return "ok", m


def draw(path: Path, pose: dict[str, Any], status: str) -> Any:
    """The photo with every detected skeleton drawn on (green = kept, red = rejected)."""
    from PIL import Image, ImageDraw

    img = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(img)
    colour = (40, 200, 90) if status == "ok" else (230, 60, 60)
    w = max(2, img.size[0] // 250)
    for p in pose["people"]:
        if p["score"] < PERSON_MIN:
            continue
        kp = p["kp"]
        for a, b in SKELETON:
            d.line([tuple(kp[a][:2]), tuple(kp[b][:2])], fill=colour, width=w)
        for x, y, _ in [kp[i] for i in BODY]:
            d.ellipse([x - w, y - w, x + w, y + w], fill=colour)
    d.text((8, 8), status, fill=colour)
    return img


# --- 5. Validate -----------------------------------------------------------------------


def fighter_bio() -> pd.DataFrame:
    """Name, height and reach (cm) of every active fighter, from their latest fight."""
    raw = load_raw()
    active = active_fighters(load_fights(raw))
    app = appearances(raw)
    app = app[app["id"].isin(active.index)].drop_duplicates("id", keep="last")
    return app.set_index("name")[["id", "height", "reach"]]


def plot_validation(
    best: pd.DataFrame, repeat: pd.DataFrame, funnel: pd.Series, path: Path
) -> dict[str, float]:
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.8))
    ok = best.dropna(subset=["ape"])
    r = float(np.corrcoef(ok["span"], ok["ape"])[0, 1]) if len(ok) > 2 else float("nan")
    axes[0].scatter(ok["ape"], ok["span"], s=18)
    axes[0].set(
        title=f"Measured span vs real reach / height (r = {r:.2f}, n = {len(ok)})",
        xlabel="reach / height (UFCStats)",
        ylabel="(2·arm + shoulders) / body in photo",
    )
    stats: dict[str, float] = {"span_vs_ape_r": r, "n_validated": float(len(ok))}
    if len(repeat) > 2:
        for i, mname in enumerate(["span", "leg", "arm_leg"]):
            rr = float(np.corrcoef(repeat[f"{mname}_1"], repeat[f"{mname}_2"])[0, 1])
            stats[f"repeat_r_{mname}"] = rr
            axes[1].scatter(
                repeat[f"{mname}_1"] - repeat[f"{mname}_1"].mean(),
                repeat[f"{mname}_2"] - repeat[f"{mname}_2"].mean(),
                s=14,
                label=f"{mname} (r = {rr:.2f})",
                color=f"C{i}",
            )
        axes[1].legend(frameon=False)
    axes[1].set(
        title=f"Same fighter, two photos (n = {len(repeat)})",
        xlabel="photo 1 (centred)",
        ylabel="photo 2 (centred)",
    )
    axes[2].barh(funnel.index[::-1], funnel.to_numpy()[::-1], color="0.45")
    axes[2].set(title="Why photos were rejected", xlabel="photos")
    for a in axes:
        a.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)
    return stats


# --- Main ------------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--wandb", default="auto", choices=["auto", "online", "offline", "disabled"]
    )
    parser.add_argument("--limit", type=int, default=0, help="only the first N fighters (a test)")
    parser.add_argument("--device", default="auto", help="cpu, mps, cuda or auto")
    args = parser.parse_args()

    import torch
    import wandb

    device = args.device
    if device == "auto":
        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps"
            if torch.backends.mps.is_available()
            else "cpu"
        )
    bio = fighter_bio()
    names = sorted(bio.index.unique())[: args.limit or None]
    tracker = Tracker(
        "anatomy-photos",
        args.wandb,
        {
            "fighters": len(names),
            "device": device,
            "person_min": PERSON_MIN,
            "kp_min": KP_MIN,
            "dominance": DOMINANCE,
            "max_tilt_deg": MAX_TILT_DEG,
            "min_frontal": MIN_FRONTAL,
            "min_body_frac": MIN_BODY_FRAC,
            "max_per_fighter": MAX_PER_FIGHTER,
        },
    )

    print(f"1. candidate images for {len(names)} fighters (Wikimedia Commons)...", flush=True)
    candidates = gather_candidates(names, tracker)

    print(f"2-3. download and pose ({device})...", flush=True)
    poses: dict[str, Any] = json.loads(POSES.read_text()) if POSES.exists() else {}
    model: PoseModel | None = None
    rows, reasons = [], []
    done = 0
    total = sum(len(v) for v in candidates.values())
    for name, items in candidates.items():
        for item in items:
            done += 1
            key = item["title"]
            path = download(item)
            if path is None:
                reasons.append("download failed")
                continue
            if key not in poses:
                model = model or PoseModel(device)
                try:
                    poses[key] = model(path)
                except Exception as e:  # noqa: BLE001 — a broken image shouldn't stop the run
                    poses[key] = {"size": [0, 0], "people": [], "error": str(e)}
            target = None
            if "crop_of" in item:
                crop_path = local_path(item["crop_of"])
                if crop_path.exists():
                    target = locate_crop(
                        path, crop_path, item.get("width") or 0, item.get("crop_width") or 0
                    )
                if target is None:
                    reasons.append("crop not found in original")
                    continue
            if not poses[key]["size"][1]:
                status, m = "unreadable", None
            else:
                status, m = check_and_measure(poses[key], target)
            reasons.append(status)
            if m:
                rows.append({"name": name, "title": key, "page": item.get("page"), **m})
            if done % 10 == 0 or done == total:
                POSES.write_text(json.dumps(poses))
                counts = pd.Series(reasons).value_counts()
                tracker.log(
                    {
                        "pose/images": done,
                        "pose/images_total": total,
                        "pose/standing_photos": int(counts.get("ok", 0)),
                        "pose/fighters_with_standing": len({r["name"] for r in rows}),
                        **{f"rejected/{k}": int(v) for k, v in counts.items() if k != "ok"},
                    }
                )
                print(f"  {done}/{total} images, {counts.get('ok', 0)} standing", flush=True)
            if done % 40 == 0 or (m and len(rows) <= 12):
                tracker.log(
                    {
                        "pose/example": wandb.Image(
                            draw(path, poses[key], status), caption=f"{name}: {status}"
                        )
                    }
                )
    POSES.write_text(json.dumps(poses))

    print("4-5. measure and validate...", flush=True)
    meas = pd.DataFrame(rows)
    funnel = pd.Series(reasons).value_counts()
    if meas.empty:
        print("no standing photos found")
        tracker.finish(summary={"standing_photos": 0})
        return
    meas = meas.join(bio[["height", "reach"]], on="name")
    meas["ape"] = meas["reach"] / meas["height"]
    # The best photo per fighter (most confident joints), and a second one for repeatability.
    ranked = meas.sort_values("quality", ascending=False).groupby("name")
    best = ranked.nth(0).set_index("name")
    second = ranked.nth(1).set_index("name")
    repeat = best[MEASURES].join(second[MEASURES], lsuffix="_1", rsuffix="_2", how="inner")
    OUT.mkdir(parents=True, exist_ok=True)
    plot_path = OUT / "anatomy-validation.png"
    stats = plot_validation(best, repeat, funnel.drop("ok", errors="ignore"), plot_path)
    cols = ["title", "page", "height", "reach", "ape", *MEASURES, "quality"]
    best[cols].round(4).to_csv(OUT / "anatomy-measures.csv")
    funnel.rename_axis("status").rename("photos").to_csv(OUT / "anatomy-funnel.csv")

    summary = {
        "fighters": len(names),
        "fighters_with_candidates": sum(bool(v) for v in candidates.values()),
        "candidate_images": total,
        "standing_photos": len(meas),
        "fighters_with_standing_photo": len(best),
        "coverage": len(best) / len(names),
        "fighters_with_two": len(repeat),
        **stats,
    }
    print(json.dumps(summary, indent=1))
    examples = best.sort_values("quality", ascending=False).head(24)
    table = pd.DataFrame(
        {
            "fighter": examples.index,
            "photo": [wandb.Image(draw(local_path(t), poses[t], "ok")) for t in examples["title"]],
            "span": examples["span"].round(3),
            "reach/height": examples["ape"].round(3),
            "leg": examples["leg"].round(3),
            "source": examples["page"],
        }
    )
    tracker.log({"anatomy/best_photos": wandb.Table(dataframe=table)})
    tracker.finish(
        summary=summary,
        tables={
            "anatomy/measures": best[cols].round(4).reset_index(),
            "anatomy/funnel": funnel.rename_axis("status").reset_index(),
        },
        images={"anatomy/validation": plot_path},
    )


if __name__ == "__main__":
    main()
