import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{src,test}/**/*.emulator.test.ts'],
    fileParallelism: false, // test files share one Firestore emulator
  },
})
