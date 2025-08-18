import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { getCurrentTime } from './tools_local.js';

const app = express();
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));
app.use(express.json());

const transports = /** @type {Record<string, StreamableHTTPServerTransport>} */ ({});

app.post('/mcp', async (req, res) => {
  const sessionId = /** @type {string|undefined} */ (req.headers['mcp-session-id']);
  let transport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = new McpServer({ name: 'example-mcp', version: '1.0.0' });

    server.tool(
      'get_current_time',
      'Return current server time as ISO 8601 string.',
      {},
      async () => ({ content: [{ type: 'text', text: getCurrentTime() }] })
    );

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSessionRequest = async (req, res) => {
  const sessionId = /** @type {string|undefined} */ (req.headers['mcp-session-id']);
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

const PORT = process.env.NODE_PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
});
