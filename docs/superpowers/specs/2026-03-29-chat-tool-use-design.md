# AI Chat Tool Use — Design Spec

## Problem

The AI chat can only respond with text. Users want to act on AI suggestions directly — e.g., "create a checklist from this plan" or "generate content based on this strategy." Currently they must manually navigate to the relevant section and re-enter information.

## Solution

Add OpenAI tool calling to the chat agent. The chat agent detects user intent to create entities and dispatches existing specialized agents via the Bull queue through a new internal API endpoint.

## Architecture

### Flow

```
User: "Create a checklist from this plan"
    |
Chat Agent (OpenAI + bindTools) -> calls tool "run_agent"
    |
Tool run_agent() -> HTTP POST to NestJS API: POST /agent/run-internal
    |
API creates AgentRun (PENDING) -> Bull queue -> agent executes async
    |
Chat Agent responds: "Started checklist creation! Result will appear here: [link]"
```

### Tool Definition

One universal tool — `run_agent`:

```typescript
{
  name: "run_agent",
  description: "Run a specialized marketing agent to create content, checklists, documents, strategies, SEO analysis, email campaigns, or analytics reports for the user's project.",
  schema: z.object({
    agentType: z.enum(["CONTENT", "CHECKLIST", "DOCUMENT", "STRATEGY", "SEO", "EMAIL", "ANALYTICS"]),
    input: z.object({
      topic: z.string().optional(),
      type: z.string().optional(),
      platform: z.string().optional(),
      description: z.string().optional(),
    }),
  })
}
```

### Link Mapping

After dispatching, chat returns a user-friendly message with a link based on `agentType`:

| Agent Type | Link |
|------------|------|
| CONTENT | `/projects/{id}/content` |
| CHECKLIST | `/projects/{id}/checklists` |
| STRATEGY, DOCUMENT | `/projects/{id}/documents` |
| EMAIL | `/projects/{id}/campaigns` |
| SEO | `/projects/{id}/seo` |
| ANALYTICS | `/projects/{id}/analytics` |

## Changes

### 1. `apps/ai-agent/src/agents/chat-agent.ts`

Rewrite from simple `model.invoke()` to LangGraph graph with tool-calling loop:

```
START -> chatNode -> shouldUseTool?
    -> yes -> toolNode -> chatNode (loop with tool result)
    -> no  -> END (return response)
```

- Import `StructuredTool` from `@langchain/core/tools`, define `run_agent` tool
- Use `model.bindTools([runAgentTool])` so OpenAI decides when to call the tool
- Tool implementation: HTTP POST to `{API_URL}/agent/run-internal` with `userId`, `projectId`, `agentType`, `input`, and `X-Agent-Secret` header
- On success: return agentRunId + formatted link for chat to include in response
- On missing projectId: system prompt instructs model to ask user to select a project first

### 2. `apps/ai-agent/src/routes/chat.ts`

Pass `userId` through to `chatWithAssistant`:

```typescript
const { message, projectId, history = [], userId } = req.body;
const response = await chatWithAssistant({ message, projectId, history, userId });
```

### 3. `apps/api/src/agent/agent.controller.ts`

New endpoint for internal agent dispatch (no JWT, secret-based auth):

```typescript
@Public()
@Post('run-internal')
async runInternal(
  @Headers('x-agent-secret') secret: string,
  @Body() dto: { userId: string; projectId: string; agentType: AgentType; input: any },
) {
  if (secret !== this.configService.get('AGENT_SECRET')) {
    throw new UnauthorizedException();
  }
  return this.agentService.runAgent(dto.userId, dto.projectId, dto.agentType, dto.input);
}
```

### 4. `apps/api/src/agent/agent.service.ts`

Pass `userId` in the chat request body to ai-agent:

```typescript
async chat(dto, userId: string) {
  const response = await fetch(`${agentUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...dto, userId }),
  });
  return response.json();
}
```

### 5. `apps/api/src/agent/agent.controller.ts` (chat method)

Pass `user.id` to `chat()`:

```typescript
@Post('chat')
chat(@CurrentUser() user: any, @Body() dto) {
  return this.agentService.chat(dto, user.id);
}
```

### 6. `.env`

Add shared secret:

```
AGENT_SECRET=<random-string>
```

## Not Changed

- Web UI (markdown rendering already handles links)
- Bull queue infrastructure
- Existing specialized agents
- Prisma schema
- Other routes/services

## Error Handling

- Missing `projectId`: AI tells user to select a project first (system prompt instruction)
- `run-internal` fails: tool returns error message, AI communicates failure to user in natural language
- Invalid `agentType`: Zod schema validation rejects before tool execution

## Security

- `run-internal` endpoint is `@Public()` but protected by `AGENT_SECRET` header
- Secret is shared only between API and ai-agent services (both on same host in prod)
- `userId` is passed from API (trusted source), not from client
