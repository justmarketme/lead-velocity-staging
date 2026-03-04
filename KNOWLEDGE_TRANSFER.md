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

## 🛠 AI Assistant Tools (MCPs & Skills)

If you are using an agentic AI (like Antigravity or a custom Cursor setup), these are the key "powers" we've utilized:

1.  **Supabase MCP**: Essential for managing the database schema, executing migrations, and deploying Edge Functions.
2.  **Integration Engineer Skill**: Used for configuring complex 3rd-party APIs (Twilio/SendGrid).
3.  **PDF Spacer Strategy**: A custom approach to document generation.

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
