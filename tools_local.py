from datetime import datetime, timezone


def get_current_time() -> str:
    """
    Return the current server time in ISO 8601 format (UTC), as a plain string
    per SSE_MCP_Starlette_Guide.md.
    """
    return datetime.now(timezone.utc).isoformat()
