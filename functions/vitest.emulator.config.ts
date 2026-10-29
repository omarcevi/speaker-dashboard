import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{src,test}/**/*.emulator.test.ts'],
  },
})
