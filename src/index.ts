// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "http://52.18.93.49:8080";
const TABLE_ID = "m3jxshm3jce0b2v";

const server = new McpServer({
  name: "nocodb",
  version: "1.0.0",
  capabilities: {
    tools: {},
    logging: {}, // optional, but stderr logs already show in Claude logs
  },
});

server.tool(
  "nocodb-fetch",
  "Fetch NocoDB records and log them",
  {
    limit: z.number().int().min(1).max(1000).default(25),
    offset: z.number().int().min(0).default(0),
    shuffle: z.number().int().min(0).max(1).default(0),
    token: z
      .string()
      .optional()
      .describe("NocoDB API token; or set NOCODB_TOKEN"),
  },
  async ({ limit, offset, shuffle, token }) => {
    const apiToken = token || process.env.NOCODB_TOKEN;
    if (!apiToken) {
      return {
        content: [
          {
            type: "text",
            text: "Missing API token. Provide token or set NOCODB_TOKEN.",
          },
        ],
      };
    }

    const url = new URL(
      `/api/v2/tables/${encodeURIComponent(TABLE_ID)}/records`,
      BASE_URL
    );
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("shuffle", String(shuffle));

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json", "xc-token": apiToken },
      });
      const bodyText = await res.text();
      if (!res.ok) {
        console.error(
          `[nocodb] HTTP ${res.status} ${res.statusText}\n${bodyText}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Request failed: ${res.status} ${res.statusText}`,
            },
          ],
        };
      }

      const data = JSON.parse(bodyText);
      const list = Array.isArray(data?.list)
        ? data.list
        : Array.isArray(data?.rows)
        ? data.rows
        : [];
      console.error(`[nocodb] fetched ${list.length} records from ${TABLE_ID}`);
      for (const rec of list)
        console.error(`[nocodb] record: ${JSON.stringify(rec).slice(0, 2000)}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: list.length,
                records: list,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e) {
      console.error(`[nocodb] error: ${String(e)}`);
      return { content: [{ type: "text", text: `Error: ${String(e)}` }] };
    }
  }
);

await server.connect(new StdioServerTransport());
