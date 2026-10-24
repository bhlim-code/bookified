/** @type {import('prettier').Config} */
const config = {
  // Required: Enables the Tailwind class sorter
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/globals.css",
  tailwindFunctions: ["cn", "clsx", "cva"],
  // Add these two rules to control JSX wrapping
  bracketSameLine: false,
  printWidth: 80,
  // Recommended formatting rules
  singleQuote: true,
  jsxSingleQuote: true,
  semi: true,
  tabWidth: 2,
  trailingComma: "es5",
  arrowParens: "always",
  bracketSpacing: true,
  endOfLine: "lf",
};

export default config;
