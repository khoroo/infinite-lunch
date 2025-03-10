export default {
  base: 'https://robert.sparks.me.uk/infinite-lunch/',
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['minizinc'],
      output: {
        paths: {
          minizinc: 'https://cdn.jsdelivr.net/npm/minizinc/dist/minizinc.mjs'
        }
      }
  }
}
}