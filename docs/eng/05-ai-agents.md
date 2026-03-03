# AI Agent System

## Overview

The AI Agent system is a standalone Express.js microservice (`apps/ai-agent`) that uses **LangChain**, **LangGraph**, and **OpenAI GPT-4o** to generate marketing content, run SEO audits, provide analytics insights, and power an interactive chat assistant.

## Architecture

```mermaid
graph LR
    subgraph "NestJS API"
        AS["AgentService"]
        BQ["Bull Queue"]
        QP["Queue Processor"]
    end

    subgraph "AI Agent (Express :3001)"
        SUP["Supervisor\n(router)"]
        CA["Content Agent"]
        CHA["Checklist Agent"]
        DA["Document Agent"]
        SEO["SEO Agent"]
        STRAT["Strategy Agent"]
        EA["Email Agent"]
        AA["Analytics Agent"]
        CHAT["Chat Agent"]
    end

    subgraph "Storage"
        DB[("PostgreSQL")]
        RD[("Redis")]
    end

    LLM["OpenAI GPT-4o"]

    AS -->|"create AgentRun"| DB
    AS -->|"enqueue"| BQ
    BQ --> RD
    RD --> QP
    QP -->|"POST /run"| SUP
    SUP --> CA & CHA & DA & SEO & STRAT & EA & AA
    CA & CHA & DA & SEO & STRAT & EA & AA -->|"read/write"| DB
    CA & CHA & DA & SEO & STRAT & EA & AA -->|"LLM calls"| LLM
    CHAT -->|"POST /chat"| LLM
```

### Request Flow

1. Client calls `POST /api/agent/run` with `{ projectId, agentType, input }`
2. API creates `AgentRun` record in DB (status: `PENDING`)
3. Job added to Bull queue (Redis-backed)
4. Queue processor sends HTTP request to AI Agent microservice at `POST /run`
5. Supervisor routes to the correct agent based on `agentType`
6. Agent loads project context from DB
7. LangChain/LangGraph processes request via OpenAI GPT-4o
8. Result saved to DB; `AgentRun` updated to `COMPLETED`

## Agent Types

### Content Agent

**File:** `apps/ai-agent/src/agents/content-agent.ts`

Generates marketing content for all supported formats and platforms.

**Input:**
```json
{
  "type": "SOCIAL_POST | BLOG_ARTICLE | EMAIL | NEWSLETTER | AD_COPY | LANDING_PAGE | SEO_ARTICLE | REFERRAL_COPY | IN_APP_MESSAGE",
  "platform": "TWITTER | LINKEDIN | FACEBOOK | INSTAGRAM",
  "topic": "Product launch announcement",
  "keywords": ["innovation", "tech", "launch"],
  "tone": "professional | casual | humorous | formal",
  "length": "short | medium | long"
}
```

**Behavior:**
- Loads project context (name, description, target audience, brand voice, industry)
- For `SEO_ARTICLE`: performs SERP analysis, outputs `metaTitle`, `metaDescription`, `suggestedSlug`, `keywordDensity`
- For `LANDING_PAGE`: structured JSON output (hero, features, social proof, pricing CTA, FAQ)
- Model: GPT-4o, temperature: 0.8
- Creates Content record in database with `seoMetadata` field populated for SEO articles

### Checklist Agent

**File:** `apps/ai-agent/src/agents/checklist-agent.ts`

Generates task checklists for marketing activities.

**Input:**
```json
{
  "type": "LAUNCH | WEEKLY | CAMPAIGN_PREP | SEO | SOCIAL_MEDIA | EMAIL_CAMPAIGN | PRODUCT_HUNT_LAUNCH",
  "description": "Optional context"
}
```

**Behavior:**
- Generates prioritized checklist items with LOW/MEDIUM/HIGH/CRITICAL priorities
- Creates Checklist and ChecklistItem records in DB
- Supports `PRODUCT_HUNT_LAUNCH` type for launch day checklists

### Document Agent

**File:** `apps/ai-agent/src/agents/document-agent.ts`

Generates marketing documents.

**Input:**
```json
{
  "type": "MARKETING_PLAN | REPORT | COMPETITIVE_ANALYSIS | BRAND_GUIDELINES | CONTENT_CALENDAR | PRODUCT_HUNT_BRIEF",
  "topic": "Q1 2026 marketing strategy",
  "additionalContext": "Focus on B2B SaaS"
}
```

**Behavior:**
- Generates structured Markdown documents with sections, headers, and actionable recommendations
- `PRODUCT_HUNT_BRIEF` output includes: tagline, description, maker comment, launch-day social posts
- Creates Document record in DB

### SEO Agent

**File:** `apps/ai-agent/src/agents/seo-agent.ts`

Performs on-page SEO audits and competitor SERP analysis using LangGraph state machine.

**Input:**
```json
{
  "url": "https://example.com",
  "keywords": ["saas marketing", "b2b growth"],
  "competitorUrls": ["https://competitor1.com"]
}
```

**LangGraph State Flow:**

```mermaid
stateDiagram-v2
    [*] --> fetchPage
    fetchPage --> auditPage
    auditPage --> analyzeSERP
    analyzeSERP --> generateRecommendations
    generateRecommendations --> [*]
```

**Output:**
- Page title, meta description, H1/H2 structure
- Keyword density analysis
- SERP competitor comparison
- Prioritized optimization recommendations
- `suggestedSlug`, `metaTitle`, `metaDescription` for new content

### Strategy Agent

**File:** `apps/ai-agent/src/agents/strategy-agent.ts`

Generates go-to-market strategies and marketing plans.

**Input:**
```json
{
  "type": "GTM | POSITIONING | PRODUCT_HUNT | PRICING",
  "topic": "SaaS product launch strategy",
  "additionalContext": "B2B, enterprise segment"
}
```

**Behavior:**
- Generates structured Document (MARKETING_PLAN or PROPOSAL type)
- Covers: positioning, competitive landscape, channel strategy, budget allocation, KPIs
- Patterns: similar to document-agent but with strategy-specific system prompts

### Email Agent

**File:** `apps/ai-agent/src/agents/email-agent.ts`

Generates email marketing copy and complete drip sequences.

**Input:**
```json
{
  "type": "SUBJECT_LINE | CAMPAIGN_EMAIL | SEQUENCE",
  "topic": "SaaS onboarding sequence",
  "sequenceLength": 5,
  "tone": "friendly"
}
```

**Behavior:**
- `SUBJECT_LINE`: generates multiple A/B test variants with predicted open rates
- `CAMPAIGN_EMAIL`: full email copy (subject + preheader + body + CTA)
- `SEQUENCE`: generates a complete drip sequence (N emails with timing suggestions)

### Analytics Agent

**File:** `apps/ai-agent/src/agents/analytics-agent.ts`

Analyzes marketing performance data and generates natural-language insights.

**Input:**
```json
{
  "query": "Why did traffic drop last week?",
  "projectId": "clx...",
  "days": 30
}
```

**LangGraph State Flow:**

```mermaid
stateDiagram-v2
    [*] --> loadMetrics
    loadMetrics --> loadEvents
    loadEvents --> analyzeData
    analyzeData --> generateInsights
    generateInsights --> [*]
```

**Behavior:**
- Read-only Prisma queries to `DailyMetrics` and `AnalyticsEvent`
- Trend analysis, channel comparison, anomaly detection
- Generates weekly digest reports
- Responds in natural language to free-form marketing questions

### Chat Agent

**File:** `apps/ai-agent/src/agents/chat-agent.ts`

Interactive AI marketing assistant.

**Input:**
```json
{
  "message": "What marketing strategy would you recommend?",
  "projectId": "clx...",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Behavior:**
- Model: GPT-4o, temperature: 0.7
- Loads project context if `projectId` provided
- Covers: strategy, content creation, email marketing, SEO, social media, analytics
- Supports EN/PL/RU multilingual responses
- Maintains conversation history from client

### Supervisor

**File:** `apps/ai-agent/src/agents/supervisor.ts`

Task dispatcher that routes requests to the correct agent.

- Receives `{ runId, projectId, agentType, input }`
- Routes to appropriate agent based on `agentType`
- Times execution duration
- Tracks token usage and estimated cost in USD
- Updates `AgentRun` record in DB with output, duration, tokensUsed, cost

## Configuration

### Environment Variables

```env
# Required
OPENAI_API_KEY="sk-your-openai-api-key"

# Optional
OPENAI_MODEL="gpt-4o"
AI_AGENT_PORT="3001"

# LangSmith tracing (optional but recommended)
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
| `@langchain/langgraph` | Graph-based agent state machines |
| `@langchain/community` | TavilySearch, CheerioWebBaseLoader for SEO agent |
| `langsmith` | Execution tracing and cost monitoring |

## API Endpoints (AI Agent microservice)

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
  "timestamp": "2026-03-01T10:35:00Z"
}
```

### GET `/health`

**Response:**
```json
{ "status": "ok", "timestamp": "2026-03-01T10:30:00Z" }
```

## Cost Tracking

Each `AgentRun` record stores:
- **tokensUsed** — total input + output tokens consumed
- **cost** — estimated cost in USD (based on GPT-4o pricing)
- **duration** — execution time in milliseconds
- **langsmithTraceUrl** — link to LangSmith trace for debugging

## Scheduled Runs

The `AgentSchedule` model enables cron-based automation:
- Define a cron expression per project per agent type
- Default input parameters stored with the schedule
- `isActive` flag to enable/disable
- `lastRunAt` / `nextRunAt` for tracking
- Processor checks `isActive && nextRunAt <= now()` on each @Cron tick
