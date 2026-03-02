# Internationalization (i18n)

## Overview

The application supports three languages:
- **English** (en) — default
- **Polish** (pl)
- **Russian** (ru)

Locale files are stored in the shared `packages/i18n` package and consumed by the web application.

## Architecture

```
packages/i18n/
└── src/locales/
    ├── en.json    # English translations
    ├── pl.json    # Polish translations
    └── ru.json    # Russian translations
        ↓
apps/web/src/lib/i18n.ts    # svelte-i18n initialization
        ↓
apps/web/src/routes/        # Components use $t('key')
```

## Web Application (SvelteKit)

### Library

Uses **svelte-i18n** for translation management.

### Initialization

File: `apps/web/src/lib/i18n.ts`

- Registers all locale files
- Detects browser language preference
- Falls back to English if locale not available
- Persists selected locale to `localStorage`

### Usage in Components

```svelte
<script>
  import { t } from 'svelte-i18n';
</script>

<h1>{$t('dashboard.title')}</h1>
<p>{$t('dashboard.welcome', { values: { name: user.name } })}</p>
```

### Language Switcher

The web app includes a language switcher component that:
1. Shows current locale flag/name
2. Lists available locales
3. On selection: updates svelte-i18n locale and persists to localStorage

## AI Agent

The Chat Agent supports multilingual responses:
- System prompt instructs the AI to respond in the user's language
- Language detection based on message content
- Supports EN, PL, RU conversations

## Translation Key Structure

The locale files contain the following top-level namespaces:

| Namespace | Description |
|-----------|-------------|
| `common` | Shared UI labels (Save, Cancel, Delete, Loading, etc.) |
| `nav` | Navigation menu labels |
| `auth` | Login, register, password forms |
| `onboarding` | Onboarding flow |
| `projects` | Project list, create, settings |
| `content` | Content types, statuses, editor |
| `campaigns` | Campaign management |
| `email` | Email marketing (accounts, lists, subscribers, campaigns) |
| `checklists` | Checklist and task management |
| `documents` | Document management |
| `aiChat` | AI chat assistant |
| `settings` | Organization and account settings pages |
| `billing` | Billing plans and subscription management |
| `templates` | Email template management |
| `social` | Social media integrations (LinkedIn, Twitter, Facebook, Telegram) — account connection, publishing, project account linking |
| `analytics` | Analytics dashboard and metrics |
| `errors` | Error messages |
| `tracking` | Web analytics tracking |
| `calendar` | Content calendar |

Example structure:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading..."
  },
  "auth": {
    "login": "Sign In",
    "register": "Sign Up",
    "email": "Email",
    "password": "Password"
  },
  "projects": {
    "create": "New Project",
    "empty": "No projects yet"
  },
  "social": {
    "title": "Social Integrations",
    "subtitle": "Connect your social media accounts to publish content directly",
    ...
  },
  "settings": {
    "title": "Settings",
    "team": "Team Members",
    ...
  },
  "calendar": {
    ...
  }
}
```

## Adding a New Language

1. Create a new locale file in `packages/i18n/src/locales/` (e.g., `de.json`)
2. Copy the structure from `en.json` and translate all values
3. Register the locale in `apps/web/src/lib/i18n.ts`
4. Add the locale option to the language switcher component
