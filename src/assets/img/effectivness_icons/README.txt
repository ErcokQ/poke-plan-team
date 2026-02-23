Damage effectiveness icons (SVG, 128px):
 - 4×  -> effectiveness_x4.svg
 - 2×  -> effectiveness_x2.svg
 - 1×  -> effectiveness_x1.svg
 - 1/2×-> effectiveness_x12.svg
 - 1/4×-> effectiveness_x14.svg
 - 0×  -> effectiveness_x0.svg

Usage in Vue (Vite):
  <img :src="new URL('../assets/effectiveness_x2.svg', import.meta.url).href" alt="2x"/>
Or copy the SVG inline into a component for color overrides with CSS variables.
