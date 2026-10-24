import type { Config } from "tailwindcss";

// Same stack as leadvelocity.co.za (Tailwind 3, shadcn-style semantic colours) but every colour resolves to a SortMyCover
// brand token (src/styles/tokens.css, copied from brand/tokens.css). No hex values live here.
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { lg: "1080px" } },
    extend: {
      fontFamily: { sans: ["var(--sm-font)"] },
      colors: {
        background: "var(--sm-bg)",
        foreground: "var(--sm-text)",
        card: { DEFAULT: "var(--sm-surface)", foreground: "var(--sm-text)" },
        muted: { DEFAULT: "var(--sm-surface-raised)", foreground: "var(--sm-text-muted)" },
        primary: { DEFAULT: "var(--sm-amber)", foreground: "var(--sm-accent-text)" },
        secondary: { DEFAULT: "var(--sm-charcoal)", foreground: "var(--sm-off-white)" },
        border: "var(--sm-border)",
        ring: "var(--sm-text)",
        destructive: "var(--err)",
        charcoal: { DEFAULT: "var(--sm-charcoal)", 2: "var(--sm-charcoal-2)" },
        amber: "var(--sm-amber)",
        offwhite: { DEFAULT: "var(--sm-off-white)", 2: "var(--sm-off-white-2)" },
      },
      borderRadius: { sm: "var(--sm-radius-sm)", md: "var(--sm-radius-md)", lg: "var(--sm-radius-lg)", xl: "var(--sm-radius-xl)" },
      maxWidth: { prose: "42rem" },
    },
  },
  plugins: [],
} satisfies Config;
