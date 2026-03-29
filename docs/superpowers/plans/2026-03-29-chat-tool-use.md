# AI Chat Tool Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable AI chat to dispatch specialized agents (CONTENT, CHECKLIST, DOCUMENT, STRATEGY, SEO, EMAIL, ANALYTICS) via existing Bull queue, so users can create entities directly from conversation.

**Architecture:** Chat agent is rewritten from a simple `model.invoke()` to a LangGraph graph with a tool-calling loop. A single `run_agent` tool calls a new `POST /agent/run-internal` endpoint on the NestJS API (secret-based auth, no JWT). The API enqueues the agent run via Bull as it already does for UI-triggered runs.

**Tech Stack:** LangGraph, `@langchain/openai` (bindTools), `@langchain/core` (ToolMessage, tool), NestJS, Bull queue, zod

**Spec:** `docs/superpowers/specs/2026-03-29-chat-tool-use-design.md`

**GitHub Issue:** #24

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/agent/agent.controller.ts` | Modify | Add `POST /agent/run-internal` endpoint, pass userId to `chat()` |
| `apps/api/src/agent/agent.service.ts` | Modify | Accept and forward `userId` in `chat()` method |
| `apps/ai-agent/src/agents/chat-agent.ts` | Rewrite | LangGraph graph with tool-calling loop + `run_agent` tool |
| `apps/ai-agent/src/routes/chat.ts` | Modify | Pass `userId` to `chatWithAssistant()` |
| `.env` | Modify | Add `AGENT_SECRET` |

---

### Task 1: Add `AGENT_SECRET` env variable

**Files:**
- Modify: `.env`
- Modify: `.env.example` (if exists)

- [ ] **Step 1: Add AGENT_SECRET to .env**

Add to the root `.env` file:
```
AGENT_SECRET=chat-agent-internal-secret-key
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "MAS-25 Add AGENT_SECRET env variable for internal agent dispatch"
```

> Note: Do NOT commit `.env` itself. Only commit `.env.example` if it exists.

---

### Task 2: API — Add `run-internal` endpoint and pass userId to chat

**Files:**
- Modify: `apps/api/src/agent/agent.controller.ts`
- Modify: `apps/api/src/agent/agent.service.ts`

- [ ] **Step 1: Modify `agent.service.ts` — pass userId in chat()**

In `apps/api/src/agent/agent.service.ts`, update the `chat()` method to accept and forward `userId`:

```typescript
async chat(dto: { projectId?: string; message: string; history?: any[] }, userId?: string) {
  const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
  try {
    const response = await fetch(`${agentUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dto, userId }),
    });
    return response.json();
  } catch {
    return { message: 'AI agent service is unavailable. Please try again later.' };
  }
}
```

- [ ] **Step 2: Modify `agent.controller.ts` — pass userId to chat, add run-internal**

In `apps/api/src/agent/agent.controller.ts`:

Add imports:
```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
```

Add `ConfigService` to constructor:
```typescript
constructor(
  private agentService: AgentService,
  private configService: ConfigService,
) {}
```

Update `chat()` method to pass userId:
```typescript
@Post('chat')
@ApiOperation({ summary: 'Chat with AI assistant' })
chat(@Body() dto: { projectId?: string; message: string; history?: any[] }, @CurrentUser() user: any) {
  return this.agentService.chat(dto, user.id);
}
```

Add new endpoint before the closing brace:
```typescript
@Public()
@Post('run-internal')
@ApiOperation({ summary: 'Internal: run agent from AI chat (secret-based auth)' })
async runInternal(
  @Headers('x-agent-secret') secret: string,
  @Body() dto: { userId: string; projectId: string; agentType: string; input: Record<string, unknown> },
) {
  if (secret !== this.configService.get('AGENT_SECRET')) {
    throw new UnauthorizedException('Invalid agent secret');
  }
  return this.agentService.runAgent(dto);
}
```

- [ ] **Step 3: Verify API compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/agent/agent.controller.ts apps/api/src/agent/agent.service.ts
git commit -m "MAS-25 Add run-internal endpoint and pass userId to chat"
```

---

### Task 3: AI Agent route — pass userId

**Files:**
- Modify: `apps/ai-agent/src/routes/chat.ts`

- [ ] **Step 1: Update chat route to extract and pass userId**

In `apps/ai-agent/src/routes/chat.ts`:

```typescript
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, projectId, history = [], userId } = req.body as {
      message: string;
      projectId?: string;
      history?: Array<{ role: string; content: string }>;
      userId?: string;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const response = await chatWithAssistant({ message, projectId, history, userId });
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message', details: String(error) });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/ai-agent/src/routes/chat.ts
git commit -m "MAS-25 Pass userId through chat route to agent"
```

---

### Task 4: Rewrite chat-agent with LangGraph + tool calling

**Files:**
- Rewrite: `apps/ai-agent/src/agents/chat-agent.ts`

This is the main task. The chat agent becomes a LangGraph graph with:
- A `run_agent` tool bound to the model
- A tool-calling loop (chatNode → toolNode → chatNode)
- Link generation based on agent type

- [ ] **Step 1: Rewrite chat-agent.ts**

Replace the entire content of `apps/ai-agent/src/agents/chat-agent.ts` with:

```typescript
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../prisma';
import { extractUsage } from '../lib/costs';

const MODEL = process.env['OPENAI_MODEL'] || 'gpt-4o';

function getModel() {
  return new ChatOpenAI({
    model: MODEL,
    temperature: 0.7,
    apiKey: process.env['OPENAI_API_KEY'],
  });
}

// ── Link mapping ────────────────────────────────────────────

const AGENT_TYPE_LINKS: Record<string, string> = {
  CONTENT: 'content',
  CHECKLIST: 'checklists',
  DOCUMENT: 'documents',
  STRATEGY: 'documents',
  SEO: 'seo',
  EMAIL: 'campaigns',
  ANALYTICS: 'analytics',
};

// ── Tool definition ─────────────────────────────────────────

const runAgentTool = tool(
  async (input, config) => {
    const { projectId, userId } = config?.configurable || {};

    if (!projectId) {
      return 'Error: No project selected. Please ask the user to select a project first before running agents.';
    }

    const apiUrl = process.env['API_URL'] || 'http://localhost:3000/api';
    const secret = process.env['AGENT_SECRET'];

    try {
      const response = await fetch(`${apiUrl}/agent/run-internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-secret': secret || '',
        },
        body: JSON.stringify({
          userId,
          projectId,
          agentType: input.agentType,
          input: {
            topic: input.topic,
            type: input.type,
            platform: input.platform,
            description: input.description,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return `Error dispatching agent: ${err}`;
      }

      const run = await response.json();
      const section = AGENT_TYPE_LINKS[input.agentType] || 'overview';

      return `Agent run created successfully (ID: ${run.id}). The ${input.agentType} agent is now working. Results will appear at: /projects/${projectId}/${section}`;
    } catch (e) {
      return `Error calling API: ${String(e)}`;
    }
  },
  {
    name: 'run_agent',
    description:
      'Run a specialized marketing agent to create content, checklists, documents, strategies, SEO analysis, email campaigns, or analytics reports for the user\'s project. Use this when the user asks you to CREATE, GENERATE, or BUILD something — not for answering questions or giving advice.',
    schema: z.object({
      agentType: z
        .enum(['CONTENT', 'CHECKLIST', 'DOCUMENT', 'STRATEGY', 'SEO', 'EMAIL', 'ANALYTICS'])
        .describe('Type of agent to run'),
      topic: z.string().optional().describe('Main topic or subject for the agent task'),
      type: z
        .string()
        .optional()
        .describe(
          'Subtype, e.g. SOCIAL_POST, BLOG_ARTICLE, LAUNCH, WEEKLY, GO_TO_MARKET, etc.',
        ),
      platform: z
        .string()
        .optional()
        .describe('Target platform, e.g. LINKEDIN, TWITTER, INSTAGRAM'),
      description: z
        .string()
        .optional()
        .describe('Detailed description or instructions for what to create'),
    }),
  },
);

// ── Graph state ─────────────────────────────────────────────

const ChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  totalInputTokens: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  totalOutputTokens: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  totalCost: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
});

// ── Graph nodes ─────────────────────────────────────────────

async function chatNode(
  state: typeof ChatState.State,
  config?: { configurable?: Record<string, unknown> },
) {
  const model = getModel().bindTools([runAgentTool]);
  const response = await model.invoke(state.messages, config);
  const { inputTokens, outputTokens, cost } = extractUsage(response, MODEL);

  return {
    messages: [response],
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    totalCost: cost,
  };
}

async function toolNode(
  state: typeof ChatState.State,
  config?: { configurable?: Record<string, unknown> },
) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];
  const results: ToolMessage[] = [];

  for (const tc of toolCalls) {
    const result = await runAgentTool.invoke(tc.args, config);
    results.push(
      new ToolMessage({
        content: typeof result === 'string' ? result : JSON.stringify(result),
        tool_call_id: tc.id!,
      }),
    );
  }

  return { messages: results };
}

function shouldUseTool(state: typeof ChatState.State): 'tool' | 'end' {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return 'tool';
  }
  return 'end';
}

// ── Build graph ─────────────────────────────────────────────

const graph = new StateGraph(ChatState)
  .addNode('chat', chatNode)
  .addNode('tool', toolNode)
  .addEdge(START, 'chat')
  .addConditionalEdges('chat', shouldUseTool, {
    tool: 'tool',
    end: END,
  })
  .addEdge('tool', 'chat')
  .compile();

// ── Public interface ────────────────────────────────────────

interface ChatInput {
  message: string;
  projectId?: string;
  history?: Array<{ role: string; content: string }>;
  userId?: string;
}

export async function chatWithAssistant({
  message,
  projectId,
  history = [],
  userId,
}: ChatInput) {
  let projectContext = '';

  if (projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          _count: { select: { campaigns: true, content: true, checklists: true } },
        },
      });

      if (project) {
        projectContext = `
Current Project Context:
- Project ID: ${project.id}
- Name: ${project.name}
- Description: ${project.description || 'N/A'}
- Website: ${project.websiteUrl || 'N/A'}
- Target Audience: ${project.targetAudience || 'N/A'}
- Industry: ${project.industry || 'N/A'}
- Active Campaigns: ${project._count.campaigns}
- Content Pieces: ${project._count.content}
- Checklists: ${project._count.checklists}
`;
      }
    } catch (e) {
      console.warn('Could not load project context:', e);
    }
  }

  const systemPrompt = `You are an expert AI marketing assistant for the Marketing AI Assistant platform.
You help users with marketing strategy, content creation, email campaigns, SEO, and analytics.

${projectContext ? `Here is the context for the current project:\n${projectContext}` : 'No project is currently selected. If the user asks to create something, tell them to select a project first.'}

You have a tool called "run_agent" that can create things in the application:
- CONTENT agent: creates social posts, blog articles, emails, newsletters, ad copy, landing pages, SEO articles
- CHECKLIST agent: creates checklists (launch, weekly, campaign prep, SEO, social media, etc.)
- DOCUMENT agent: creates marketing documents
- STRATEGY agent: creates marketing strategies (go-to-market, positioning, competitor response, etc.)
- SEO agent: runs SEO analysis (keyword research, competitor analysis, site audit)
- EMAIL agent: creates email campaigns
- ANALYTICS agent: generates analytics reports

When the user asks you to CREATE, GENERATE, or BUILD any of these — use the run_agent tool.
When the user asks questions, wants advice, or just chats — respond normally with text, do NOT use the tool.

When you successfully dispatch an agent, tell the user what you started and include the link path from the tool result so they can check the results.

Always provide actionable, specific advice. When generating content, make it ready to use.
Respond in the same language the user writes in (English, Polish, or Russian).`;

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...history.map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content),
    ),
    new HumanMessage(message),
  ];

  const result = await graph.invoke(
    { messages },
    { configurable: { projectId, userId } },
  );

  // Extract the last AI message (not a tool message)
  const allMessages: BaseMessage[] = result.messages;
  let finalMessage = '';
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i]._getType() === 'ai' && typeof allMessages[i].content === 'string') {
      finalMessage = allMessages[i].content as string;
      break;
    }
  }

  return {
    message: finalMessage,
    role: 'assistant',
    timestamp: new Date().toISOString(),
    tokensUsed: result.totalInputTokens + result.totalOutputTokens,
    cost: result.totalCost,
  };
}
```

- [ ] **Step 2: Verify ai-agent compiles**

Run: `cd apps/ai-agent && npx tsx --eval "import './src/agents/chat-agent'; console.log('OK')"`
Expected: "OK" (or at least no TypeScript errors)

- [ ] **Step 3: Commit**

```bash
git add apps/ai-agent/src/agents/chat-agent.ts
git commit -m "MAS-25 Rewrite chat agent with LangGraph tool-calling loop"
```

---

### Task 5: Manual integration test

- [ ] **Step 1: Add AGENT_SECRET to .env**

Ensure root `.env` has:
```
AGENT_SECRET=chat-agent-internal-secret-key
```

- [ ] **Step 2: Start services**

```bash
docker compose up -d
pnpm dev
```

- [ ] **Step 3: Test normal chat (no tool use)**

Open http://localhost:5173, select a project, open AI Chat.
Send: "What are the best marketing channels for SaaS?"
Expected: Normal text response, no agent dispatched.

- [ ] **Step 4: Test tool use — create checklist**

Send: "Create a launch checklist for this product"
Expected: AI responds with something like "I've started creating a launch checklist! Results will appear at [Checklists](/projects/{id}/checklists)."
Verify: Check AgentRun table has a new PENDING/RUNNING/COMPLETED record with agentType=CHECKLIST.

- [ ] **Step 5: Test tool use — create content**

Send: "Generate a LinkedIn post about our product launch"
Expected: AI dispatches CONTENT agent, returns confirmation with link.

- [ ] **Step 6: Test without project selected**

Deselect project, send: "Create a blog article about AI marketing"
Expected: AI responds asking to select a project first.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "MAS-25 Integration fixes for chat tool use"
```

---

### Task 6: Push and deploy

- [ ] **Step 1: Push to remote**

```bash
git push
```

- [ ] **Step 2: Add AGENT_SECRET to production environment**

SSH to production and add `AGENT_SECRET` to the production `.env` file. Must match between API and ai-agent containers.

- [ ] **Step 3: Verify deploy**

After CI deploys, test on https://emarketingai.pl — select a project, ask chat to create a checklist.
