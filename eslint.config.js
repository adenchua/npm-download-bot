const tseslint = require(require.resolve("typescript-eslint", { paths: [process.cwd()] }));
const prettierConfig = require(require.resolve("eslint-config-prettier", { paths: [process.cwd()] }));

module.exports = tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
);
