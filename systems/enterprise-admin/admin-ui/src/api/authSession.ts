// Process-local intent identity. Never persisted, sent to the API or used as authorization.
let generation = 0;
const listeners = new Set<() => void>();

export function currentAuthGeneration(): number { return generation; }

export function advanceAuthGeneration(): number {
    ++generation;
    for (const listener of listeners) listener();
    return generation;
}

export function subscribeAuthGeneration(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
