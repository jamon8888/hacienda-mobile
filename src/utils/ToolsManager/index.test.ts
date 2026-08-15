export {};

jest.mock("@/store/UIStore", () => ({
  __esModule: true,
  default: { getFromStorage: jest.fn().mockResolvedValue({}) },
}));

jest.mock("./tools", () => ({
  __esModule: true,
  default: { default: {}, appConnections: {} },
}));

jest.mock("../constants", () => ({
  generateUUID: () => "mock-uuid",
}));

jest.mock("../Telemetry", () => ({
  __esModule: true,
  default: {
    logEvent: jest.fn(),
    CUSTOM_EVENTS: { ACTIONS: { TOOL_CALLED: "tool_called" } },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ToolsManager = require("./index").default;

// cactus/index.ts wraps CactusLM's functionCalls (already-parsed argument objects) into
// this JSON-string shape before they reach ToolsManager -- this is the boundary contract
// _generateToolCallSignature must keep parsing correctly.
function generateSignature(name: string, argumentsJson: string): string {
  return (ToolsManager as any)._generateToolCallSignature({
    function: { name, arguments: argumentsJson },
  });
}

describe("_generateToolCallSignature", () => {
  it("formats a JSON-string-arguments tool call into a readable signature", () => {
    expect(
      generateSignature(
        "get_weather",
        JSON.stringify({ city: "Paris", unit: "celsius" }),
      ),
    ).toBe("get_weather(city: Paris, unit: celsius)");
  });

  it("renders a no-argument call as name()", () => {
    expect(generateSignature("get_current_time", "{}")).toBe(
      "get_current_time()",
    );
  });

  it("falls back to a raw string rather than throwing on malformed JSON", () => {
    expect(generateSignature("broken_tool", "not json")).toBe(
      'broken_tool("not json")',
    );
  });

  it("returns an empty string when the tool call has no name", () => {
    expect(generateSignature("", "{}")).toBe("");
  });
});
