import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Skrip utilitas Node (scripts/**) sengaja CommonJS supaya bisa
    // `node scripts/foo.js` tanpa "--input-type=module". File ini bukan
    // bagian dari bundle Next.js, jadi aturan react/@typescript-eslint
    // untuk `src/` tidak relevan di sini.
    "scripts/**",
  ]),
]);

export default eslintConfig;
