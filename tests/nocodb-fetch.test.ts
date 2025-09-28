import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock console.error to avoid noise in tests
const mockConsoleError = jest.fn() as jest.MockedFunction<typeof console.error>;
global.console.error = mockConsoleError;

// Extract the tool logic into a testable function
async function nocodbFetchTool({
  limit,
  offset,
  shuffle,
  token,
}: {
  limit: number;
  offset: number;
  shuffle: number;
  token?: string;
}) {
  const BASE_URL = "http://52.18.93.49:8080";
  const TABLE_ID = "m3jxshm3jce0b2v";

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
  url.searchParams.set("offset", String(offset)); //offset is 0-based where to start
  url.searchParams.set("shuffle", String(shuffle)); //shuffle is 0-based  (random or not)

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

describe("NocoDB MCP Server", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOCODB_TOKEN = "test-token";
  });

  describe("nocodb-fetch tool", () => {
    test("should fetch records successfully", async () => {
      // Mock successful API response
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockReturnValue(
          Promise.resolve(
            JSON.stringify({
              list: [
                {
                  id: 1,
                  name: "Uma Nelson",
                  role: "Project Manager",
                  experience: 12,
                  salary: 200000,
                },
                {
                  id: 2,
                  name: "Rachel Roberts",
                  role: "Mobile Developer Lead",
                  experience: 19,
                  salary: 85000,
                },
              ],
            })
          )
        ),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await nocodbFetchTool({
        limit: 2,
        offset: 0,
        shuffle: 0,
        token: "test-token",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://52.18.93.49:8080/api/v2/tables/m3jxshm3jce0b2v/records?limit=2&offset=0&shuffle=0",
        {
          headers: {
            accept: "application/json",
            "xc-token": "test-token",
          },
        }
      );

      expect(result.content[0].text).toContain('"count": 2');
      expect(result.content[0].text).toContain("Uma Nelson");
      expect(result.content[0].text).toContain("Rachel Roberts");
    });

    test("should handle missing token", async () => {
      // to test security
      delete process.env.NOCODB_TOKEN;

      const result = await nocodbFetchTool({
        limit: 10,
        offset: 0,
        shuffle: 0,
      });

      expect(result.content[0].text).toBe(
        "Missing API token. Provide token or set NOCODB_TOKEN."
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("should use environment token when no token provided", async () => {
      process.env.NOCODB_TOKEN = "env-token";

      const mockResponse = {
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockReturnValue(Promise.resolve(JSON.stringify({ list: [] }))),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await nocodbFetchTool({
        limit: 5,
        offset: 0,
        shuffle: 0,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "xc-token": "env-token",
          }),
        })
      );
    });

    test("should handle API error response", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: jest.fn().mockReturnValue(Promise.resolve("Invalid token")),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await nocodbFetchTool({
        limit: 10,
        offset: 0,
        shuffle: 0,
        token: "invalid-token",
      });

      expect(result.content[0].text).toBe("Request failed: 401 Unauthorized");
    });

    test("should handle network error", async () => {
      // so it wouldnt stay stuck on the test
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await nocodbFetchTool({
        limit: 10,
        offset: 0,
        shuffle: 0,
        token: "test-token",
      });

      expect(result.content[0].text).toBe("Error: Error: Network error");
    });

    test("should handle different response formats", async () => {
      // Test with 'rows' format instead of 'list'
      // "rows" - Database terminology (like table rows) if api version changes from list to rows.
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockReturnValue(
          Promise.resolve(
            JSON.stringify({
              rows: [{ id: 3, name: "Noah Moore", role: "Backend Developer" }],
            })
          )
        ),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await nocodbFetchTool({
        limit: 1,
        offset: 0,
        shuffle: 0,
        token: "test-token",
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.count).toBe(1);
      expect(parsedResult.records[0].name).toBe("Noah Moore");
    });

    test("should handle empty response", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockReturnValue(Promise.resolve(JSON.stringify({}))),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await nocodbFetchTool({
        limit: 10,
        offset: 0,
        shuffle: 0,
        token: "test-token",
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.count).toBe(0);
      expect(parsedResult.records).toEqual([]);
    });
  });
});
