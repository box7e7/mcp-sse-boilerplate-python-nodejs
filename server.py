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

# 2) Register your tools (only the required one)
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
