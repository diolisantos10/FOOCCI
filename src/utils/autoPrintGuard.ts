/**
 * Session-scoped guard that prevents an order from triggering auto-print more
 * than once (e.g. on re-render).  Returns `true` the first time a given orderId
 * is checked, `false` on every subsequent call for the same ID.
 *
 * Usage (inside a React component):
 *   const guardRef = useRef(createAutoPrintGuard());
 *   if (guardRef.current.claim(orderId)) printOrder(orderId);
 */
export function createAutoPrintGuard() {
  const claimed = new Set<string>();

  return {
    /** Returns true and records the ID if not yet claimed; false otherwise. */
    claim(orderId: string): boolean {
      if (claimed.has(orderId)) return false;
      claimed.add(orderId);
      return true;
    },
    has(orderId: string): boolean {
      return claimed.has(orderId);
    },
  };
}

export type AutoPrintGuard = ReturnType<typeof createAutoPrintGuard>;
