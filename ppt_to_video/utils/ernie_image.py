"""
ERNIE-Image-Turbo integration.

Flow:
  1. pick_slides_for_images() selects which slides get an AI image.
     It tries DeepSeek first; falls back to title/layout heuristics if
     DeepSeek is unavailable or fails.
  2. generate_ernie_images() calls the ERNIE endpoint in parallel for all
     selected slides and returns (slide_index, image_bytes) pairs.
"""

import json
import os
import base64
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

ERNIE_ENDPOINT = os.environ.get(
    "ERNIE_ENDPOINT",
    "https://majority-enquirer-grievous.ngrok-free.dev/generate"
)
ERNIE_TIMEOUT = 1800  # seconds per request — Kaggle GPU can be slow on cold start


# ── Slide selection helpers ────────────────────────────────────────────────────

# Layout names that benefit most from a background image
_IMAGE_FRIENDLY_LAYOUTS = {"title", "section-header", "section_header", "cover", "closing", "conclusion"}

def _title_to_prompt(title, layout=""):
    """Convert a slide title into a simple ERNIE image prompt."""
    title = title.strip()
    if layout in ("title", "cover"):
        return f"Cinematic wide-angle professional scene, {title}, modern abstract background, no text"
    if layout in ("conclusion", "closing"):
        return f"Inspiring wide-angle landscape symbolizing success and achievement, {title}, no text"
    return f"Professional clean illustration representing {title}, abstract, high quality, no text"


def _fallback_select(slides, num_images):
    """
    Select `num_images` slides without DeepSeek.
    Priority: title/section-header layouts first, then evenly distributed.
    """
    preferred = [
        i for i, s in enumerate(slides)
        if s.get("layout", "").lower() in _IMAGE_FRIENDLY_LAYOUTS
    ]

    # Always include slide 0 (title slide) if available
    if 0 not in preferred and slides:
        preferred = [0] + preferred

    # Fill remaining slots from evenly distributed positions
    if len(preferred) < num_images:
        step = max(1, len(slides) // (num_images - len(preferred) + 1))
        for i in range(0, len(slides), step):
            if i not in preferred:
                preferred.append(i)
            if len(preferred) >= num_images:
                break

    selected = preferred[:num_images]
    result = []
    for idx in selected:
        slide = slides[idx]
        title = slide.get("title", f"Slide {idx + 1}")
        layout = slide.get("layout", "")
        result.append({
            "slide_index": idx,
            "title": title,
            "prompt": _title_to_prompt(title, layout),
        })
    return result


def pick_slides_for_images(slide_plan, num_images):
    """
    Return a list of dicts: [{"slide_index": int, "title": str, "prompt": str}, ...]

    Tries DeepSeek first. Falls back to heuristic selection if DeepSeek is
    unavailable or the API call fails.
    """
    slides = slide_plan.get("slides", [])
    if not slides:
        return []

    num_images = min(num_images, len(slides))

    # ── Try DeepSeek ──────────────────────────────────────────────────────────
    deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if deepseek_api_key:
        slide_summaries = []
        for i, slide in enumerate(slides):
            title  = slide.get("title", f"Slide {i + 1}")
            layout = slide.get("layout", "")
            bullets = slide.get("content", {}).get("bullets", [])
            preview = "; ".join(str(b) for b in bullets[:2])
            slide_summaries.append(f"{i}: [{layout}] {title} — {preview}")

        system_msg = (
            "You are a visual design assistant. "
            "Given a list of presentation slides, select the slides that would benefit most "
            "from a full-bleed AI-generated background image "
            "(e.g. title slide, section openers — NOT plain bullet lists). "
            f"Choose exactly {num_images} slides. "
            "For each write a concise image prompt (max 20 words, no text/logos). "
            'Respond ONLY with a JSON array: '
            '[{"slide_index": <int>, "title": "<title>", "prompt": "<prompt>"}, ...]'
        )
        user_msg = "Slides:\n" + "\n".join(slide_summaries)

        try:
            resp = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {deepseek_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user",   "content": user_msg},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 512,
                },
                timeout=60,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1] if len(parts) > 1 else raw
                if raw.startswith("json"):
                    raw = raw[4:]

            prompts = json.loads(raw.strip())
            if isinstance(prompts, list) and prompts:
                print(f"[ERNIE] DeepSeek selected {len(prompts)} slides for images")
                return prompts[:num_images]
        except Exception as exc:
            print(f"[ERNIE] DeepSeek selection failed ({exc}) — using fallback")

    # ── Fallback heuristic ────────────────────────────────────────────────────
    print(f"[ERNIE] Using fallback slide selection for {num_images} images")
    return _fallback_select(slides, num_images)


# ── ERNIE API call ─────────────────────────────────────────────────────────────

def _call_ernie(slide_index, prompt, seed=42, errors_out=None):
    """
    Call ERNIE for a single prompt using async submit+poll to avoid ngrok proxy timeouts.

    Flow:
      1. POST /generate  → returns {job_id} immediately (or legacy {image} directly)
      2. GET  /status/<job_id> every 10 s until status=='done'
    Returns (slide_index, image_bytes or None).
    """
    import time as _time

    base_url = ERNIE_ENDPOINT.rsplit('/generate', 1)[0]
    generate_url = base_url + '/generate'
    headers = {"ngrok-skip-browser-warning": "true"}

    try:
        print(f"[ERNIE] Submitting job for slide {slide_index}: {prompt[:60]}")
        resp = requests.post(
            generate_url,
            json={"prompt": prompt, "seed": seed, "width": 1024, "height": 768},
            timeout=ERNIE_TIMEOUT,   # full timeout — Kaggle app may be sync
            headers=headers,
        )
        resp.raise_for_status()
        result = resp.json()

        # Legacy sync API: response contains image directly
        if "image" in result:
            print(f"[ERNIE] Sync response for slide {slide_index}")
            return slide_index, base64.b64decode(result["image"])

        # Async API: response contains job_id, poll for completion
        job_id = result.get("job_id")
        if not job_id:
            msg = f"slide {slide_index}: unexpected response — {result}"
            if errors_out is not None:
                errors_out.append(msg)
            print(f"[ERNIE] {msg}")
            return slide_index, None

        status_url = f"{base_url}/status/{job_id}"
        deadline = _time.time() + ERNIE_TIMEOUT
        poll_interval = 10  # seconds between polls

        print(f"[ERNIE] Polling slide {slide_index} job {job_id[:8]}...")
        while _time.time() < deadline:
            _time.sleep(poll_interval)
            sr = requests.get(status_url, timeout=15, headers=headers)
            sr.raise_for_status()
            status_data = sr.json()

            if status_data.get("status") == "done":
                img_bytes = base64.b64decode(status_data["image"])
                print(f"[ERNIE] Slide {slide_index} done ({len(img_bytes):,} bytes)")
                return slide_index, img_bytes

            if status_data.get("status") == "error":
                msg = f"slide {slide_index}: ERNIE error — {status_data.get('error')}"
                if errors_out is not None:
                    errors_out.append(msg)
                print(f"[ERNIE] {msg}")
                return slide_index, None

            print(f"[ERNIE] Slide {slide_index} still pending...")

        msg = f"slide {slide_index}: timed out after {ERNIE_TIMEOUT}s"
        if errors_out is not None:
            errors_out.append(msg)
        print(f"[ERNIE] {msg}")
        return slide_index, None

    except Exception as exc:
        msg = f"slide {slide_index}: {type(exc).__name__}: {exc}"
        print(f"[ERNIE] Request failed — {msg}")
        if errors_out is not None:
            errors_out.append(msg)
        return slide_index, None


def generate_ernie_images(prompts, on_image_ready=None, errors_out=None):
    """
    Generate images in parallel.

    `prompts` is the list from `pick_slides_for_images`.
    `on_image_ready(slide_index, img_bytes)` is called as each image completes (optional).
    `errors_out` is an optional list that will be appended with error strings on failure.
    Returns sorted list of (slide_index, image_bytes) for successful results.
    """
    if not prompts:
        return []

    results = []
    with ThreadPoolExecutor(max_workers=1) as executor:  # sequential — Kaggle Flask is single-threaded
        futures = {
            executor.submit(_call_ernie, p["slide_index"], p["prompt"], 42 + i, errors_out): p
            for i, p in enumerate(prompts)
        }
        for future in as_completed(futures):
            slide_index, image_bytes = future.result()
            if image_bytes:
                results.append((slide_index, image_bytes))
                print(f"[ERNIE] Received image for slide {slide_index} ({len(image_bytes):,} bytes)")
                if on_image_ready:
                    try:
                        on_image_ready(slide_index, image_bytes)
                    except Exception as cb_exc:
                        print(f"[ERNIE] on_image_ready callback error: {cb_exc}")

    return sorted(results, key=lambda x: x[0])
