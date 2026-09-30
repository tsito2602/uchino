# Import interface sources

The import animation uses the same implementation as `tsito2602/uchiwake`
main commit `3f93e552ba743055972b6051a52c492c721729a3` (2026-09-30).

- `soft-orbit.ts`, `soft-orbit-glow.tsx`: unchanged 12-color, nine-second orbit,
  three canvas layers, strength 0.7, reduced-motion and visibility cleanup.
- `studio-action.css`, `studio-action-label.tsx`: unchanged Libraries.dev Studio
  button gradients, masking, timing and wand sparks from uchiwake.
- `import-processing-label.tsx`: unchanged `thinking-orbs@0.3.2` breathing orb
  with the original processing shimmer styles.
- `border-beam@1.4.1`: same medium size, light theme, colorful variant,
  28px border radius and 0.7 overlay opacity as uchiwake.
- `import-thinking.tsx`: same Beautiful UI Thinking primitive; MIT notice in
  `licenses/beautiful-ui-MIT.txt`.
- `import-effects.css`: uchiwake import styles, excluding its frame-size rules
  so every uchino panel retains the shared viewport and keyboard behavior.
- `import-follow-scroll.ts`: unchanged list-only follow scrolling.
- Recipe progress and original-source accordion adapt uchiwake's status,
  skeletons, arriving rows and Motion height/opacity transition to recipe data.

The staging demo replays the original 2s reading / 6s reveal / 2s checking
sequence. Reduced-motion skips these artificial demo delays. Live imports use
server events and indeterminate progress, never a simulated completion percent.
