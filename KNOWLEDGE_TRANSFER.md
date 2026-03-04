# Knowledge Transfer: Velocity Neon Tech Stack

This document outlines the core architecture and technologies used in the Velocity Neon project to assist team members working with AI coding assistants like Cursor.

## 🚀 Core Tech Stack

- **Frontend**: React 18 (Vite), TypeScript, Tailwind CSS.
- **UI Components**: Shadcn UI + Lucide React icons.
- **Backend / Database**: Supabase (PostgreSQL, Auth, Storage, Edge Functions).
- **AI Engine**: Gemini 2.0 Flash (Invoked via Supabase Edge Functions).
- **Document Generation**: Custom PDF engine using `html2canvas` and `jsPDF`.
- **Voice Interaction**: Web Speech API (STT/TTS).
- **Communications**: SendGrid (Email) and Twilio (Future Voice/SMS).

## 🛠 Assistant Requirements (MCPs & Skills)

For an AI assistant (like Antigravity or Cursor) to work effectively on this specific build, it needs the following "powers":

### 1. Model Context Protocol (MCP)
- **`supabase-mcp-server`**: This is **CRITICAL**. The assistant must be able to:
    - Run SQL queries to understand/modify the schema.
    - Deploy and view Edge Functions (`supabase/functions`).
    - Read database logs for debugging.
    - Check RLS (Row Level Security) policies.
- **`search_docs`**: Access to Supabase and React documentation.

### 2. Specialized Skills
- **`integration_engineer`**: Essential for handling the complexity of Twilio and SendGrid integrations.
- **`web_application_development`**: Guidelines for the "Clean UI" and "Premium Aesthetics" we've maintained (dark mode, glassmorphism).

## 🚀 Colleague's Pre-flight Checklist

Before starting work in Cursor, ensure the following is configured:

1.  **Pull Latest**: Run `git pull origin master`.
2.  **MCP Setup**: Verify these MCPs are active:
    - [ ] `supabase-mcp-server` (Configured with Project ID: `cmsylaupctrbsvzrgzwy`)
    - [ ] `github-mcp-server` (For branch management)
    - [ ] `vercel-mcp-server` (For deployment monitoring)
3.  **Skill Context**: Inform the AI about these core patterns:
    - [ ] "Always use the Smart PDF engine in `src/utils/pdfUtils.ts`."
    - [ ] "Check `src/utils/legalAI.ts` for AI integration patterns."
    - [ ] "Follow the dark-mode aesthetic defined in `index.css`."
4.  **Knowledge Base**: 
    - [ ] Add `KNOWLEDGE_TRANSFER.md` to the AI's "Always Reference" list.
    - [ ] Read the last 3 entries in `task.md` for current project status.

## 📄 Document Generation Logic (`pdfUtils.ts`)

> [!IMPORTANT]
> The most complex part of the frontend is the "Smart PDF" generator.

Standard `html2canvas` often "slices" text in half at page breaks. We solve this in `src/utils/pdfUtils.ts`:
- It clones the document off-screen.
- It scans for elements (sections, tables, paragraphs) that would cross an A4 boundary.
- It **injects white-space spacers** before those elements to push them to the next page.
- It then renders the "padded" document.

**When creating new generators:**
1. Use `generateSmartPDF(clone, options)`.
2. Wrap your content in semantic `section` tags or use the `.document-section` class.
3. Ensure the CSS in your generator's `handleGenerate` function applies `break-inside: avoid` to key containers.

## 🤖 AI Integration (`callLegalAI.ts`)

AI features (Contract/Proposal/Invoice editing) go through `src/utils/legalAI.ts`.
- It formats the request for the `legal-ai` Edge Function.
- It returns structured JSON containing `response`, `changes` (to be merged into state), and `suggestions`.

## 🔑 Key Files for Cursor Context

- `src/integrations/supabase/client.ts`: Main Supabase connection.
- `src/utils/pdfUtils.ts`: The PDF engine.
- `src/components/dashboard/BrokerSelector.tsx`: Shared component for picking brokers.
- `supabase/functions/`: All serverless logic (AI, Emails, etc.).

## 📡 Deployment

- **Hosting**: Vercel.
- **Database**: Supabase.
- **CI/CD**: Pushing to `main` triggers a Vercel build. Edge Functions must be deployed manually via Supabase CLI or MCP.
