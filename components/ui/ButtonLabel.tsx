/** Collapses a button's text label below `sm` so icon-led toolbar buttons don't
 * force horizontal overflow on narrow screens. Pair with an explicit
 * `aria-label` on the button — visually hidden text still contributes to the
 * accessible name, but an aria-label keeps it exact and less brittle. */
export function ButtonLabel({ children }: { children: React.ReactNode }) {
  return <span className="hidden sm:inline">{children}</span>;
}
