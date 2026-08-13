#!/usr/bin/env node
/**
 * Pull production amplify_outputs.json for local Vite development.
 * Does not modify any AWS resources — only refreshes local config.
 *
 * Usage: npm run sync:outputs
 * Optional: AMPLIFY_OUTPUTS_URL=https://... npm run sync:outputs
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_URL =
  'https://main.dd8kh4wy2zlme.amplifyapp.com/amplify_outputs.json'
const url = process.env.AMPLIFY_OUTPUTS_URL || DEFAULT_URL
const outPath = resolve(process.cwd(), 'amplify_outputs.json')

const response = await fetch(url, { cache: 'no-store' })
if (!response.ok) {
  console.error(`Failed to fetch ${url}: HTTP ${response.status}`)
  process.exit(1)
}

const payload = await response.json()
if (!payload || typeof payload !== 'object') {
  console.error('Invalid amplify_outputs payload')
  process.exit(1)
}

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
const customCount = Object.keys(payload.custom ?? {}).length
console.log(`Wrote ${outPath}`)
console.log(`Auth region: ${payload.auth?.aws_region ?? 'n/a'}`)
console.log(`Custom endpoints: ${customCount}`)
console.log('Restart `npm run dev` if it is already running.')
