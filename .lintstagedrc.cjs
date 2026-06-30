module.exports = {
  '*.{ts,tsx,js,cjs,mjs}': ['prettier --write', 'eslint --fix'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};