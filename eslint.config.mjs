import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Layer boundaries (see .claude/rules/architecture.md): UI never touches the database.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/features/*/components/**/*.{ts,tsx}"],
    ignores: ["**/*-page-content.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db", "@/db/*", "drizzle-orm", "**/queries/*", "@/lib/logger"],
              allowTypeImports: true,
              message:
                "Components get data from the page (queries) or server actions, never from the database directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.ts", "src/features/*/lib/**/*.ts", "src/features/*/queries/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components/*", "@/components/*"],
              allowTypeImports: true,
              message: "lib and queries stay UI-free; move the shared value into lib.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-test/**",
    ".cache/**",
    ".playwright-mcp/**",
    ".playwright-runs/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
