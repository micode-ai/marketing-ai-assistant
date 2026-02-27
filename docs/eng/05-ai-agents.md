# AI Agent System

## Overview

The AI Agent system is a standalone Express.js microservice (`apps/ai-agent`) that uses **LangChain** and **OpenAI GPT-4o** to generate marketing content, documents, checklists, and provide interactive chat assistance.

## Architecture

```
┌──────────────────┐         ┌──────────────────┐
│    API (NestJS)   │         │  AI Agent (Express)│
│                    │  HTTP   │                    │
│  AgentService     │────────>│  /run              │
│  Bull Queue       │         │  /chat             │
│  AgentRun (DB)    │         │  /health           │
└────────┬─────────┘         └────────┬───────────┘
         │                            │
    ┌────┴────┐                  ┌────┴────┐
    │  Redis  │                  │ OpenAI  │
    │  Queue  │                  │ GPT-4o  │
    └─────────┘                  └─────────┘
```

### Request Flow

1. Client calls `POST /api/agent/run` with `{ projectId, agentType, input }`
2. API creates `AgentRun` record in DB (status: `PENDING`)
3. Job added to Bull queue (Redis-backed)
4. Queue processor sends HTTP request to AI Agent microservice
5. AI Agent loads project context from DB
6. LangChain processes request via OpenAI
7. Result saved to DB; `AgentRun` updated to `COMPLETED`

## Agent Types

### Content Agent

**File:** `apps/ai-agent/src/agents/content-agent.ts`

Generates marketing content for various platforms.

**Input:**
```json
{
  "type": "SOCIAL_POST | BLOG_ARTICLE | EMAIL | NEWSLETTER | AD_COPY | LANDING_PAGE",
  "platform": "TWITTER | LINKEDIN | FACEBOOK | INSTAGRAM",
  "topic": "Product launch announcement",
  "keywords": ["innovation", "tech", "launch"],
  "tone": "professional | casual | humorous | formal",
  "length": "short | medium | long"
}
```

**Behavior:**
- Loads project context (name, description, target audience, brand voice, industry)
- System prompt includes brand guidelines and platform-specific formatting
- Model: GPT-4o, temperature: 0.8
- Creates Content record in database
- Returns generated content with metadata

### Checklist Agent

**File:** `apps/ai-agent/src/agents/checklist-agent.ts`

Generates task checklists for marketing activities.

**Input:**
```json
{
  "type": "LAUNCH | WEEKLY | CAMPAIGN_PREP | SEO | SOCIAL_MEDIA | EMAIL_CAMPAIGN",
  "description": "Optional context about what the checklist should cover"
}
```

**Behavior:**
- Generates prioritized checklist items
- Assigns priority levels (LOW/MEDIUM/HIGH/CRITICAL)
- Creates Checklist and ChecklistItem records in DB

### Document Agent

**File:** `apps/ai-agent/src/agents/document-agent.ts`

Generates marketing documents.

**Input:**
```json
{
  "type": "MARKETING_PLAN | REPORT | COMPETITIVE_ANALYSIS | BRAND_GUIDELINES | CONTENT_CALENDAR",
  "topic": "Q1 2026 marketing strategy",
  "additionalContext": "Focus on B2B SaaS market"
}
```

**Behavior:**
- Generates structured Markdown documents
- Includes sections, headers, and actionable recommendations
- Creates Document record in DB

### Chat Agent

**File:** `apps/ai-agent/src/agents/chat-agent.ts`

Interactive AI marketing assistant.

**Input:**
```json
{
  "message": "User's question or request",
  "projectId": "optional - loads project context",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Behavior:**
- Model: GPT-4o, temperature: 0.7
- Loads project context if `projectId` provided
- System prompt covers: strategy, content creation, email marketing, SEO, social media, analytics
- Supports multiple languages (EN, PL, RU)
- Maintains conversation history from client

### Supervisor

**File:** `apps/ai-agent/src/agents/supervisor.ts`

Task dispatcher that routes requests to the correct agent.

**Behavior:**
- Receives `{ runId, projectId, agentType, input }`
- Routes to Content/Checklist/Document agent based on `agentType`
- Times execution duration
- Tracks token usage and estimated cost
- Returns: `{ runId, output, duration, tokensUsed, cost }`

## Configuration

### Environment Variables

```env
# Required
OPENAI_API_KEY="sk-your-openai-api-key"

# Optional
OPENAI_MODEL="gpt-4o"                    # Default model
AI_AGENT_PORT="3001"                      # Agent service port

# LangSmith tracing (optional)
LANGSMITH_API_KEY="your-langsmith-api-key"
LANGSMITH_PROJECT="marketing-ai-assistant"
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@langchain/core` | Base messaging (HumanMessage, SystemMessage, AIMessage) |
| `@langchain/openai` | ChatOpenAI model wrapper |
| `@langchain/langgraph` | Graph-based agent workflows |
| `@langchain/community` | Additional tools and integrations |
| `langsmith` | Execution tracing and monitoring |

## API Endpoints

### POST `/run`

Execute an agent task.

**Request:**
```json
{
  "runId": "clx...",
  "projectId": "clx...",
  "agentType": "CONTENT",
  "input": { ... }
}
```

**Response:**
```json
{
  "runId": "clx...",
  "output": { ... },
  "duration": 3500,
  "tokensUsed": 1250,
  "cost": 0.0375
}
```

### POST `/chat`

Interactive chat with AI assistant.

**Request:**
```json
{
  "message": "How should I approach email marketing?",
  "projectId": "clx...",
  "history": []
}
```

**Response:**
```json
{
  "message": "For email marketing, I'd recommend...",
  "role": "assistant",
  "timestamp": "2026-02-27T10:35:00Z"
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-27T10:30:00Z"
}
```

## Cost Tracking

Each agent run tracks:
- **tokensUsed** — total input + output tokens
- **cost** — estimated cost in USD (based on model pricing)
- **duration** — execution time in milliseconds

This data is stored in the `AgentRun` record and accessible via `GET /api/agent/runs/:id`.

## Scheduled Runs

The `AgentSchedule` model supports cron-based automation:
- Define a cron expression per project per agent type
- Default input parameters stored with schedule
- `isActive` flag to enable/disable
- `lastRunAt`/`nextRunAt` for tracking
