// Sites dispatches dynamic route handlers reliably under /api/*. Keep the
// transport implementation in one place while retaining /mcp for direct-worker
// and local MCP clients.
export { POST, runtime } from "../../mcp/route";
