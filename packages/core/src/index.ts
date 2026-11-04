// Kamo engine. It does not know where it runs (rule 1): capture, events, storage and
// files come in through interfaces each app implements (arriving in step 1b).

/** Physics for every Kamo animation: camera, cursor and UI (rule 10). Never linear. */
export const SPRING = { stiffness: 170, damping: 26 } as const
