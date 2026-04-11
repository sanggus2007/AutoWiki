"""Authentication utilities for GitHub Copilot."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from typing import Callable, Dict, Optional, Tuple, Union

import httpx

logger = logging.getLogger(__name__)

CLIENT_ID = "Iv1.b507a08c87ecfe98"
CACHE_PATH = os.path.expanduser("~/.github-copilot-chat.json")

# Shared Copilot headers
# Modern Copilot headers (VS Code 1.92.0 equivalent)
COPILOT_EDITOR_VERSION = "vscode/1.96.2"
COPILOT_PLUGIN_VERSION = "copilot-chat/0.23.2"
COPILOT_INTEGRATION_ID = "vscode-chat"
COPILOT_USER_AGENT = "GitHubCopilotChat/0.23.2"

COPILOT_DEFAULT_HEADERS = {
    "Copilot-Integration-Id": COPILOT_INTEGRATION_ID,
    "User-Agent": COPILOT_USER_AGENT,
    "Editor-Version": COPILOT_EDITOR_VERSION,
    "Editor-Plugin-Version": COPILOT_PLUGIN_VERSION,
    "editor-version": COPILOT_EDITOR_VERSION,
    "editor-plugin-version": COPILOT_PLUGIN_VERSION,
    "X-GitHub-Api-Version": "2023-01-01",
    "Accept": "application/json",
}

# Locking for proactive token refresh
_sync_token_refresh_lock = threading.Lock()
_async_token_refresh_lock: asyncio.Lock | None = None

def _get_token_refresh_lock() -> asyncio.Lock:
    global _async_token_refresh_lock
    if _async_token_refresh_lock is None:
        _async_token_refresh_lock = asyncio.Lock()
    return _async_token_refresh_lock

def load_tokens_from_cache() -> dict[str, str]:
    """Load cached tokens from the file system."""
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_tokens_to_cache(github_token: str, copilot_token: str, expires_at: float | None) -> None:
    """Save tokens to the cache file."""
    data = {
        "github_token": github_token,
        "copilot_token": copilot_token,
        "expires_at": expires_at,
    }
    try:
        with open(CACHE_PATH, "w") as f:
            json.dump(data, f)
    except Exception as e:
        logger.warning(f"Failed to save tokens to cache: {e}")


def fetch_copilot_token(github_token: str) -> Tuple[Optional[str], Optional[float]]:
    """Fetch copilot token and return it with expiration time."""
    github_token = github_token.strip() # Remove any accidental whitespace
    
    # Try multiple auth schemes commonly used by GitHub Internal API
    schemes = [f"Bearer {github_token}", f"token {github_token}"]
    last_error = ""

    for auth_header in schemes:
        headers = {
            "Authorization": auth_header,
            **COPILOT_DEFAULT_HEADERS,
        }
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(
                    "https://api.github.com/copilot_internal/v2/token",
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    return data.get("token"), data.get("expires_at")
                
                last_error = f"{res.status_code}: {res.text}"
                token_slice = github_token[:8] + "..." if len(github_token) > 8 else "???"
                logger.warning(f"[Auth] ❌ Token exchange failed for prefix {token_slice}. Error: {last_error}")
                print(f"[Auth] ❌ Token exchange failed for prefix {token_slice}. Status: {res.status_code}")
        except Exception as e:
            last_error = str(e)
            logger.error(f"FetchCopilotToken Error: {last_error}")

    # If all failed, raise with detail
    raise Exception(f"Failed all auth schemes. Last error: {last_error}")


async def afetch_copilot_token(
    github_token: str,
) -> Tuple[Optional[str], Optional[float]]:
    """Async fetch copilot token and return it with expiration time."""
    github_token = github_token.strip()
    schemes = [f"Bearer {github_token}", f"token {github_token}"]
    last_error = ""

    for auth_header in schemes:
        headers = {
            "Authorization": auth_header,
            **COPILOT_DEFAULT_HEADERS,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://api.github.com/copilot_internal/v2/token",
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    return data.get("token"), data.get("expires_at")
                
                last_error = f"{res.status_code}: {res.text}"
        except Exception as e:
            last_error = str(e)

    raise Exception(f"Failed all auth schemes (async). Last error: {last_error}")


def get_copilot_token(
    client_id: str = CLIENT_ID,
    callback: Optional[Callable[[str], None]] = None,
    return_both: bool = False,
) -> Union[Optional[str], Tuple[Optional[str], Optional[str]]]:
    """
    Authenticate via GitHub Device Flow to get a Copilot Token.
    This function will block and wait for the user to complete the
    authorization in their browser.

    Args:
        client_id: The GitHub OAuth App Client ID to use. Defaults
            to the VS Code Copilot Chat client ID.
        callback: Optional callable that receives status messages instead of
            printing them. If None, messages are printed to stdout.

    Returns:
        The fetched Copilot Token string, or None if authentication failed.
    """

    def _print(msg: str) -> None:
        if callback:
            callback(msg)
        else:
            print(msg)  # noqa: T201

    _print("1. Requesting device code from GitHub...")
    with httpx.Client() as client:
        res = client.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={"client_id": client_id, "scope": "read:user"},
        )
        res.raise_for_status()
        data = res.json()

    device_code = data.get("device_code")
    user_code = data.get("user_code")
    verification_uri = data.get("verification_uri")
    interval = data.get("interval", 5)

    _print("\n==========================================")
    _print(f"Please open your browser to: {verification_uri}")
    _print(f"And enter the authorization code: {user_code}")
    _print("==========================================\n")
    _print(f"Waiting for authorization (checking every {interval} seconds)...")

    access_token = None
    with httpx.Client() as client:
        while True:
            token_res = client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": client_id,
                    "device_code": device_code,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                },
            ).json()

            if "access_token" in token_res:
                access_token = token_res["access_token"]
                _print("\n✅ Authorization successful! Exchanging for Copilot Token...")
                break
            elif token_res.get("error") == "authorization_pending":
                time.sleep(interval)
            else:
                _print(f"\n❌ Authorization failed: {token_res}")
                return None

        # Exchange the standard access token for a Copilot internal token
        copilot_token, expires_at = fetch_copilot_token(access_token)

        if copilot_token:
            save_tokens_to_cache(access_token, copilot_token, expires_at)
            _print("🎉 Successfully acquired Copilot Token!")
            if return_both:
                return access_token, copilot_token
            return copilot_token
        else:
            _print("❌ Failed to acquire Copilot Token!")
            if return_both:
                return access_token, None
            return None
