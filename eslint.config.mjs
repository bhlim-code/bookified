import { readFileSync } from "node:fs";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";
import globals from "globals";

// Every class declared in globals.css (`@utility name` or a `.name` selector),
// so tailwindcss/no-custom-classname allows them but still flags typos like
// `md-col-span`. Anchored, because the whitelist entries are regex strings.
const globalsCss = readFileSync(
  new URL("./app/globals.css", import.meta.url),
  "utf8",
);
const customClasses = [
  ...new Set([
    ...[...globalsCss.matchAll(/@utility\s+([\w-]+)/g)].map(([, name]) => name),
    ...[...globalsCss.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(([, name]) => name),
  ]),
].map((name) => `^${name}$`);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Settings shared by the Tailwind and import plugins
  {
    settings: {
      tailwindcss:
        /** @type {import('eslint-plugin-tailwindcss').PluginSettings} */
        ({
          // mandatory for Tailwind v4: path to the main CSS file
          cssConfigPath: "./app/globals.css",

          // also lint class strings inside these helpers
          functions: ["cn", "clsx", "cva"],
        }),

      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        }),
      ],
    },
  },

  // Custom rules, skipping shadcn-generated files
  {
    ignores: ["**/components/ui/**"],
    plugins: {
      tailwindcss: eslintPluginTailwindcss,
      "import-x": importX,
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      // Force relative imports to become @/ path aliases automatically on save/fix
      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        { allowSameFolder: false, prefix: "@" },
      ],
      "import-x/no-unresolved": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
            "object",
          ],
          "newlines-between": "always",
          pathGroups: [
            {
              pattern: "@/components/**",
              group: "internal",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],

      // class order is handled by prettier-plugin-tailwindcss
      "tailwindcss/classnames-order": "off",
      "tailwindcss/no-arbitrary-value": "warn",
      "tailwindcss/no-custom-classname": ["warn", { whitelist: customClasses }],
      "tailwindcss/no-contradicting-classname": "warn",
    },
  },

  // TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // enforce type-only imports
      "@typescript-eslint/consistent-type-imports": "error",
      // ignore variables and arguments prefixed with an underscore
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      eqeqeq: ["error", "smart"],
      "@typescript-eslint/no-shadow": "error",
      // 'no-unused-expressions': 'error',
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Config files run in Node
  {
    files: ["*.config.{js,ts,mjs}"],
    languageOptions: { globals: globals.node },
  },

  // Turns off the ESLint rules that conflict with Prettier. Keep this last.
  // Formatting itself is handled by `npm run format` / `format:check`.

  eslintConfigPrettier,
]);

export default eslintConfig;
