"""
generate_image tool — AI image generation with reliable fallback.

Primary: Pollinations.ai (free, no API key, AI-generated)
Fallback: Picsum.photos (free, no API key, stock photos)
"""
from __future__ import annotations

from urllib.parse import quote

import httpx

from app.tools.registry import tool_registry

POLLINATIONS_URL = "https://image.pollinations.ai/prompt"

PARAMS = {
    "type": "object",
    "properties": {
        "prompt": {
            "type": "string",
            "description": (
                "English text prompt describing the image to generate. "
                "Be descriptive: style, colors, subject, mood, etc."
            ),
        },
        "width": {
            "type": "integer",
            "description": "Image width in pixels. Default 1024.",
        },
        "height": {
            "type": "integer",
            "description": "Image height in pixels. Default 1024.",
        },
    },
    "required": ["prompt"],
}


async def _try_pollinations(prompt: str, width: int, height: int) -> str | None:
    """Try Pollinations.ai — returns image URL or None on failure."""
    import asyncio

    encoded_prompt = quote(prompt.strip(), safe="")
    seed = abs(hash(prompt)) % 100000
    image_url = (
        f"{POLLINATIONS_URL}/{encoded_prompt}"
        f"?model=flux&width={width}&height={height}&nologo=true&seed={seed}"
    )

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=10.0, read=90.0, write=10.0, pool=10.0),
                follow_redirects=True,
            ) as client:
                res = await client.get(image_url)
                if res.status_code == 200:
                    ct = res.headers.get("content-type", "")
                    if "image" in ct:
                        return image_url
                # 502/503 = service busy, retry after wait
                if res.status_code in (502, 503):
                    await asyncio.sleep(5)
                    continue
                return None  # Other error, don't retry
        except (httpx.TimeoutException, Exception):
            if attempt == 0:
                await asyncio.sleep(3)
                continue
            return None
    return None


async def _fallback_picsum(prompt: str, width: int, height: int) -> str:
    """Fallback to Picsum — always works, returns a stock photo URL."""
    seed = abs(hash(prompt)) % 100000
    # Picsum seed-based URL guarantees same image for same prompt
    return f"https://picsum.photos/seed/{seed}/{width}/{height}"


async def _handle(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    **kwargs,
) -> str:
    if not prompt or not prompt.strip():
        return "ERROR: prompt is required."

    # Try AI generation first
    ai_url = await _try_pollinations(prompt, width, height)
    if ai_url:
        return f"SUCCESS: AI image generated!\nURL: {ai_url}"

    # Fallback to stock photo
    stock_url = await _fallback_picsum(prompt, width, height)
    return f"SUCCESS: Image ready (stock photo fallback).\nURL: {stock_url}"


tool_registry.register(
    name="generate_image",
    description=(
        "Generate an image from a text prompt. Uses AI generation when available, "
        "with automatic fallback to stock photos. Returns the image URL. "
        "Always write prompts in English for best results."
    ),
    parameters=PARAMS,
    handler=_handle,
)
