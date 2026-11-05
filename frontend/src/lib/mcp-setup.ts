export const MCP_CLIENTS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    docs: "https://developers.openai.com/api/docs/guides/custom-mcp-server",
    steps: [
      "Open ChatGPT settings and enable developer mode where available for your account.",
      "Create a custom MCP app using the server URL below and OAuth authentication.",
      "Complete sign-in, then enable the app in a conversation. Availability depends on your workspace settings.",
    ],
  },
  {
    id: "claude",
    name: "Claude",
    docs: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
    steps: [
      "Open Settings → Connectors in Claude and add a custom connector.",
      "Enter the server URL below and complete sign-in with your platform account.",
      "Enable the connector in your conversation. Your server must be reachable from Claude.",
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    docs: "https://cursor.com/docs/mcp",
    steps: [
      "Add the configuration below to .cursor/mcp.json in your project, merging it with existing servers.",
      "Enable the server in Cursor's MCP settings and complete the OAuth sign-in.",
      "Ask your agent to list your projects and available evaluators.",
    ],
  },
  {
    id: "vscode",
    name: "VS Code",
    docs: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
    steps: [
      "Run MCP: Add Server from the Command Palette and choose HTTP.",
      "Paste the server URL, name it platformance, and choose your configuration destination. Alternatively, merge the JSON below into .vscode/mcp.json.",
      "Start the server, complete sign-in, and enable its tools in your agent session.",
    ],
  },
  {
    id: "local",
    name: "Local agent",
    docs: "https://code.claude.com/docs/en/mcp",
    steps: [
      "Use a client that supports remote Streamable HTTP and OAuth. This example is for Claude Code.",
      "Run the command below, then use /mcp in Claude Code to complete browser sign-in.",
      "For another agent, use its HTTP server configuration with this URL and OAuth. Configuration formats vary by client.",
    ],
  },
] as const;
export type McpClient = (typeof MCP_CLIENTS)[number]["id"];

export function mcpConfiguration(client: McpClient, serverUrl: string) {
  if (client === "local")
    return `claude mcp add --transport http platformance ${serverUrl}\n\n# In Claude Code, run /mcp to sign in.`;
  if (client === "vscode")
    return JSON.stringify({ servers: { platformance: { type: "http", url: serverUrl } } }, null, 2);
  if (client === "cursor")
    return JSON.stringify({ mcpServers: { platformance: { url: serverUrl } } }, null, 2);
  return null;
}

export const MCP_AGENT_INSTRUCTIONS = `Use the platformance MCP tools to analyze my team's work.
1. Call list_groups and let me choose an accessible project.
2. Call list_evaluators with its groupId. Ask me which evaluator to use; never silently choose another one.
3. Ask for an optional report period. Call get_group_report_context with groupId, evaluatorId and that period.
4. Follow its instructions, generationPrompt and schema, including the evaluator's rules, questions, personality and effort. Use only the supplied evidence. Keep uncertainty and missing data explicit.
5. Generate the report and call create_group_report with the same groupId, evaluatorId and period. Owners and admins can save; viewers can only read context.
6. Tell me whether the report was saved successfully and return its ID. Do not claim success if the tool fails.`;
