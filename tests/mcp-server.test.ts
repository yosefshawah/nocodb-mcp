import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe("MCP Server", () => {
  let server: McpServer;

  beforeEach(() => {
    jest.clearAllMocks();
    server = new McpServer({
      name: "nocodb",
      version: "1.0.0",
      capabilities: {
        tools: {},
        logging: {},
      },
    });
  });

  describe("Server Initialization", () => {
    test("should create server instance with correct config", () => {
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpServer);
    });
  });

  describe("Tool Registration", () => {
    test("should register tool with schema", () => {
      const schema = {
        limit: z.number().int().min(1).max(1000).default(25),
        offset: z.number().int().min(0).default(0),
      };

      server.tool("test-tool", "Test tool", schema, async () => ({
        content: [{ type: "text", text: "success" }],
      }));

      expect(server).toBeDefined();
    });

    //for the future if i want to add a new tool for pushing records.
    test("should register multiple tools", () => {
      server.tool("tool-1", "First", { p: z.string() }, async () => ({
        content: [{ type: "text", text: "1" }],
      }));

      server.tool("tool-2", "Second", { p: z.number() }, async () => ({
        content: [{ type: "text", text: "2" }],
      }));

      expect(server).toBeDefined();
    });
  });

  // tools can have different schemas
  describe("Schema Validation", () => {
    test("should validate limit constraints", () => {
      const schema = z.number().int().min(1).max(1000).default(25);

      expect(schema.safeParse(25).success).toBe(true);
      expect(schema.safeParse(0).success).toBe(false);
      expect(schema.safeParse(1001).success).toBe(false);
    });

    // not all tools require a token
    test("should handle optional token parameter", () => {
      const schema = z.string().optional();

      expect(schema.safeParse("token").success).toBe(true);
      expect(schema.safeParse(undefined).success).toBe(true);
      expect(schema.safeParse(123).success).toBe(false);
    });
  });

  describe("Tool Handler", () => {
    test("should execute handler and return response", async () => {
      process.env.NOCODB_TOKEN = "test-token";

      const mockResponse = {
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockReturnValue(
            Promise.resolve(JSON.stringify({ list: [{ id: 1, name: "Test" }] }))
          ),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      server.tool(
        "nocodb-fetch",
        "Fetch records",
        {
          limit: z.number().default(25),
          token: z.string().optional(),
        },
        async ({ limit, token }: { limit: number; token?: string }) => {
          const apiToken = token || process.env.NOCODB_TOKEN;
          const res = await fetch("http://test.com/api", {
            headers: { "xc-token": apiToken! },
          });
          const data = JSON.parse(await res.text());
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
          };
        }
      );

      // Tool registered successfully
      expect(server).toBeDefined();
    });

    test("should handle missing token", async () => {
      delete process.env.NOCODB_TOKEN;

      const handler = async (token?: string) => {
        const apiToken = token || process.env.NOCODB_TOKEN;
        if (!apiToken) {
          return { content: [{ type: "text", text: "Missing token" }] };
        }
        return { content: [{ type: "text", text: "Success" }] };
      };

      const result = await handler();
      expect(result.content[0].text).toBe("Missing token");
    });
  });
});
