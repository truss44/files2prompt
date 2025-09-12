#!/usr/bin/env node

import { main } from './index.js';

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
