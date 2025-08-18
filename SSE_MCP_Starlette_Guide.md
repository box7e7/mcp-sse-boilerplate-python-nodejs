# SSE + MCP with Starlette — Quickstart Guide (with generic code)

This guide shows how to run and extend a simple SSE-based MCP server implemented with Starlette and the `mcp` package, plus a minimal SSE client and a generic tools module. The included code is generic (not domain-specific) so developers or LLMs can copy/paste and run immediately.

Contents
- Prerequisites
- Repository files (what they do)
- Setup (venv, install)
- Environment variables (.env)
- Run the server
- Run the client
- Full source files (generic server.py, simple_client.py, tools_local.py)
- How to add/register new tools (async & sync)
- Example client calls
- Recommended fixes & notes
- Troubleshooting
- Optional: Docker notes
- Next steps and references

Prerequisites
- Python 3.10+ recommended.
- pip
- Optional: Node.js + npm if you intend to use a tool that invokes a Node script.
- Internet access for packages and any external APIs your tools may call.

Repository files (example)
- `server.py` — Starlette app which exposes SSE endpoints and runs the MCP server loop.
- `simple_client.py` — Async client that connects to the SSE server, initializes the MCP client session, and demonstrates listing tools and calling them.
- `tools_local.py` — Generic tool implementations (async HTTP, CPU-bound sync, subprocess invocation). Replace with your own tool logic.
- `requirements.txt` — Python dependencies for this example.
- `.env` — Example environment variables (not committed to source control in production).

Setup (commands)
1. Create and activate a virtual environment:
   - macOS / Linux:
     - python -m venv .venv
     - source .venv/bin/activate
   - Windows (PowerShell):
     - python -m venv .venv
     - .\.venv\Scripts\Activate.ps1
2. Install dependencies:
   - pip install --upgrade pip
   - pip install -r requirements.txt
3. Ensure `.env` is present (see below).

Environment variables (.env)
Create a `.env` file in the project root with at least the following keys:
- MCP_SSE_URL — URL that the client will use to connect to the server SSE endpoint. For local testing set:
  MCP_SSE_URL=http://localhost:8334/sse
- (Optional) API keys used by your tools, e.g. OPENAI_API_KEY, etc.

Example:
OPENAI_API_KEY=your-openai-api-key
MCP_SSE_URL=http://localhost:8334/sse

Run the server
- python server.py --host 0.0.0.0 --port 8334

Run the client
- Ensure `.env` contains MCP_SSE_URL set to the server's SSE route (e.g. http://localhost:8334/sse).
- python simple_client.py

Full source files (generic)

```python
import argparse
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from mcp.server import Server
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.requests import Request
import uvicorn
import tools_local

# 1) Create your MCP instance
mcp = FastMCP("example-mcp")

# 2) Register your tools (examples)
@mcp.tool()
async def fetch_data(url: str) -> dict:
    """Async I/O-bound tool example: fetch JSON from a URL."""
    return await tools_local.fetch_data(url)


@mcp.tool()
def compute_sum(a: int, b: int) -> int:
    """Sync CPU-bound tool example: compute and return sum."""
    return tools_local.compute_sum(a, b)


@mcp.tool()
def get_current_time() -> str:
    """Return current server time as ISO 8601 string."""
    return tools_local.get_current_time()


def create_starlette_app(mcp_server: Server, debug: bool = False) -> Starlette:
    sse = SseServerTransport("/messages/")

    async def handle_sse(request: Request):
        # Connect SSE and hand off read/write streams to MCP server
        async with sse.connect_sse(request.scope, request.receive, request._send) as (
            read_stream,
            write_stream,
        ):
            await mcp_server.run(
                read_stream, write_stream, mcp_server.create_initialization_options()
            )
        from starlette.responses import Response
        return Response(status_code=200)

    return Starlette(
        debug=debug,
        routes=[
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic SSE MCP Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8334)
    args = parser.parse_args()

    # Access the internal Server instance from FastMCP
    mcp_server = mcp._mcp_server  # type: ignore

    app = create_starlette_app(mcp_server, debug=True)
    uvicorn.run(app, host=args.host, port=args.port)
```

simple_client.py
```python
import asyncio
import os
from dotenv import load_dotenv

from mcp import ClientSession
from mcp.client.sse import sse_client

load_dotenv()

async def main():
    server_url = os.getenv("MCP_SSE_URL")
    if not server_url:
        raise ValueError("MCP_SSE_URL environment variable not set")

    print("Connecting to MCP SSE server at", server_url)
    async with sse_client(url=server_url) as streams:
        async with ClientSession(*streams) as session:
            print("Initializing client session...")
            await session.initialize()
            print("Initialized")

            # List tools
            resp = await session.list_tools()
            print("Available tools:")
            for t in resp.tools:
                print(f"- {t.name}: {t.description}")

            # Example calls (uncomment to run)
            # result = await session.call_tool("fetch_data", {"url": "https://api.github.com"})
            # print("fetch_data result:", result)

            # result = await session.call_tool("compute_sum", {"a": 3, "b": 5})
            # print("compute_sum result:", result)

            # result = await session.call_tool("get_current_time", {})
            # print("get_current_time result:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

tools_local.py
```python
import httpx
import subprocess
import json
import os
from typing import Dict, Any

# -- Async example: fetch JSON from a URL
async def fetch_data(url: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=15.0)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            # Return raw text when JSON decode fails
            return {"text": resp.text}

# -- Sync example: simple CPU-bound function
def compute_sum(a: int, b: int) -> int:
    return a + b

# -- Sync example: return current server time as ISO8601 string
def get_current_time() -> str:
    """
    Return the current server time in ISO 8601 format (UTC).
    """
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
```

How to add/register a new tool (examples)
- Async I/O-bound tool:
```python
@mcp.tool()
async def fetch_list(resource_url: str) -> dict:
    return await tools_local.fetch_data(resource_url)
```

- Sync (CPU-bound or subprocess) tool:
```python
@mcp.tool()
def multiply(x: int, y: int) -> int:
    return x * y
```

Example: client call to a tool
```python
result = await session.call_tool("compute_sum", {"a": 10, "b": 20})
print("compute_sum result:", result)
```

Recommended small code practices
- Avoid using `os.chdir()`; pass `cwd=` to subprocess.run instead.
- Validate and sanitize inputs before using them in subprocess commands.
- If a tool performs blocking CPU work, run it off the event loop: e.g. `await asyncio.to_thread(tools_local.compute_sum, a, b)`
- Catch and log exceptions inside tools and return structured error objects if needed.

Run & Verify (step-by-step)
1. Setup venv and install packages (see Setup).
2. Start server:
   - python server.py --host 127.0.0.1 --port 8334
3. In another terminal (with .env pointing to http://localhost:8334/sse), run client:
   - python simple_client.py
4. To test a tool call, uncomment an example in `simple_client.py` or add a one-off call.

Troubleshooting (common issues)
- "MCP_SSE_URL environment variable not set": ensure .env exists and is loaded or export the var.
- Connection refused: verify server is running and reachable.
- Subprocess or renderer errors: ensure external tool is installed and `PROJECT_DIR` is correct.
- HTTP errors: check external endpoints and network connectivity.

Security & production notes
- Manage secrets securely (use a secrets manager).
- Consider authentication/authorization for tool access.
- Bind to specific interfaces and use firewalls when deploying.
- Use monitoring and rate limiting for heavy tools.

Optional: Simple Dockerfile (high-level)
- FROM python:3.11-slim
- COPY . /app
- WORKDIR /app
- RUN python -m pip install --upgrade pip && pip install -r requirements.txt
- ENV MCP_SSE_URL=http://localhost:8334/sse
- CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8334"]

Next steps
- I can:
  - Add a small test script that automatically calls a tool and prints the result.
  - Provide a docker-compose.yml that runs server + a test client.
  - Apply recommended fixes to `tools_local.py` directly in this repository.

References
- MCP docs: https://github.com/modelcontextprotocol/servers
- Starlette docs: https://www.starlette.io/
- Uvicorn docs: https://www.uvicorn.org/
- httpx docs: https://www.python-httpx.org/
