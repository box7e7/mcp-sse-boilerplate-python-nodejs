import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const serverUrl = process.env.MCP_HTTP_URL || 'http://localhost:3000/mcp';

async function main() {
  console.log('Connecting to MCP Streamable HTTP server at', serverUrl);
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client({ name: 'example-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('Initialized');

  const tools = await client.listTools();
  console.log('Available tools:');
  for (const t of tools.tools) {
    console.log(`- ${t.name}: ${t.description}`);
  }

  const has = tools.tools.some((t) => t.name === 'get_current_time');
  if (has) {
    const result = await client.callTool({ name: 'get_current_time', arguments: {} });
    console.log('get_current_time result:', result);
  } else {
    console.log('get_current_time tool not found on server');
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
