"""ComfyUI Ollama Bridge: one chat node with a model refresh button."""

import asyncio

from aiohttp import web
from server import PromptServer

from .node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .ollama import DEFAULT_URL, OllamaBridgeError, get_models

WEB_DIRECTORY = "./web"


@PromptServer.instance.routes.get("/ollama_bridge/models")
async def ollama_bridge_models(request):
    url = request.query.get("url", DEFAULT_URL)
    force = request.query.get("force", "0") == "1"
    try:
        # Network calls must not block ComfyUI's aiohttp event loop.
        models = await asyncio.to_thread(get_models, url, force=force)
        return web.json_response({"models": models})
    except OllamaBridgeError as exc:
        return web.json_response({"error": str(exc), "models": []}, status=400)
