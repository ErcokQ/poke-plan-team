import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfigWithVueTs(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'src/assets/**',
    'src/data/mock/**',
    'src/pages/**',
    'tailwind.config.js',
    'eslint.config.ts',
  ]),
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        projectService: true,
      },
    },
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    ...pluginVitest.configs.recommended,
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
  },
  skipFormatting,
)
