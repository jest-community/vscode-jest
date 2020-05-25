module.exports = {
  trailingComma: 'es5',
  printWidth: 100,
  semi: true,
  singleQuote: true,
  overrides: [
    {
      files: '*.ts',
      options: {
        parser: 'typescript',
      },
    },
  ],
};
