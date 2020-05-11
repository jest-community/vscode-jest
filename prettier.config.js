module.exports = {
  trailingComma: "es5",
  printWidth: 120,
  semi: false,
  singleQuote: true,
  "overrides": [
    {
      "files": "*.ts",
      "options": {
        "parser": "typescript"
      }
    }
  ]
};