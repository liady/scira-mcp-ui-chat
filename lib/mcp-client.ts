import { jsonSchema } from "ai";
import { z } from "zod";

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServerConfig {
  url: string;
  type: "sse" | "stdio" | "http";
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
}

export interface MCPClientManager {
  tools: Record<string, {
    description: string;
    parameters: any;
    execute: (args: any) => Promise<any>;
  }>;
  clients: any[];
  cleanup: () => Promise<void>;
}

/**
 * Initialize MCP clients for API calls
 * This uses the already running persistent SSE servers
 */
export async function initializeMCPClients(
  mcpServers: MCPServerConfig[] = [],
  abortSignal?: AbortSignal
): Promise<MCPClientManager> {
  // Initialize tools
  let tools = {};
  const mcpClients: any[] = [];

  // Process each MCP server configuration
  for (const mcpServer of mcpServers) {
    try {
      // All servers are handled as SSE
      const transport = {
        type: "http" as const,
        url: mcpServer.url,
        headers: mcpServer.headers?.reduce((acc, header) => {
          if (header.key) acc[header.key] = header.value || "";
          return acc;
        }, {} as Record<string, string>),
      };

      const mcpClient = await createMCPClient({ transport });
      mcpClients.push(mcpClient);

      const mcptools = await mcpClient.tools();

      console.log(`MCP tools from ${mcpServer.url}:`, Object.keys(mcptools));

      // Add MCP tools to tools object
      tools = { ...tools, ...mcptools };
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      // Continue with other servers instead of failing the entire request
    }
  }

  // Register cleanup for all clients if an abort signal is provided
  if (abortSignal && mcpClients.length > 0) {
    abortSignal.addEventListener("abort", async () => {
      await cleanupMCPClients(mcpClients);
    });
  }

  return {
    tools,
    clients: mcpClients,
    cleanup: async () => await cleanupMCPClients(mcpClients),
  };
}

async function cleanupMCPClients(clients: any[]): Promise<void> {
  // Clean up the MCP clients
  for (const client of clients) {
    try {
      await client.close();
    } catch (error) {
      console.error("Error closing MCP client:", error);
    }
  }
}

async function createMCPClient({
  transport,
}: {
  transport: { type: "http"; url: string; headers: Record<string, string> | undefined };
}): Promise<{
  tools: () => Promise<Record<string, {
    description: string;
    parameters: any;
    execute: (args: any) => Promise<any>;
  }>>;
  close: () => Promise<void>;
}> {
  const { type, url, headers } = transport;
  // Example request using the endpoint


  return {
    tools: async () => {
      const tools = (await (await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer Aq4LeStB1GoP9xvZK67RjQwMne3F5kHuYDpC2VxBbYl8iTzR0mEJasN4hQeXtF9CwKuR1zH5oMjG8fP2RvD3qS6nY4bWxTgAl9FeRx' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })
      })).json()).result.tools as {name: string, description: string, inputSchema: any}[];
      return tools.reduce<Record<string, {
        description: string;
        parameters: any;
        execute: (args: any) => Promise<any>;
      }>>((acc, tool) => {
        acc[tool.name] = {
          description: tool.description,
          parameters: jsonSchema(tool.inputSchema),
          execute: async (args: any) => {
            const result = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer Aq4LeStB1GoP9xvZK67RjQwMne3F5kHuYDpC2VxBbYl8iTzR0mEJasN4hQeXtF9CwKuR1zH5oMjG8fP2RvD3qS6nY4bWxTgAl9FeRx' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                id: 1,
                params: {
                  name: tool.name,
                  arguments: args,
                },
              }),
            });
            return (await result.json())?.result;
          },
        };
        return acc;
      }, {} as Record<string, any>);
    },
    close: async () => {
      // No need to close the client
    },
  };
}
