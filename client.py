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

            # Example: call get_current_time if available
            tool_names = {t.name for t in resp.tools}
            if "get_current_time" in tool_names:
                result = await session.call_tool("get_current_time", {})
                print("get_current_time result:", result)
            else:
                print("get_current_time tool not found on server")

if __name__ == "__main__":
    asyncio.run(main())
