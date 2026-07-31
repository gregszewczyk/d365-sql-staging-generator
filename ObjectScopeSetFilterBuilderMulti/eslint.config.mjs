import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/generated/**", "out/**", "node_modules/**", "jest.config.js"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Empty catch is used deliberately for the optional aggregate-count query.
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  }
);
