// Loads the pre-installed Playwright (global install) from ES modules.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch (_) {
  pw = require('/opt/node-tools/node_modules/playwright');
}
export const { chromium, devices } = pw;
