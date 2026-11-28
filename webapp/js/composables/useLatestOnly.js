/**
 * Latest only - an async action that can start again before it ends: each start is numbered, and the caller asks after
 * every await whether its start is still the latest. A late answer of an earlier start is dropped, whatever the order
 * in which the answers come (no timer, no retry: an ordering invariant).
 *
 *   const latest = useLatestOnly();
 *   async function load() {
 *       const current = latest();
 *       const items = await fetchItems();
 *       if (!current()) return;   // a newer load started
 *       show(items);
 *   }
 */
export function useLatestOnly() {
    let last = 0;
    return () => {
        const mine = ++last;
        return () => mine === last;
    };
}
