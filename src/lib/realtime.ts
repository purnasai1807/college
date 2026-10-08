// One process only. If you run several app instances, replace this with Redis pub/sub.
type Listener = () => void
const g = globalThis as unknown as { ccListeners?: Set<Listener> }
const listeners = (g.ccListeners ??= new Set<Listener>())

export const subscribe = (fn: Listener) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

// Carries no data on purpose: clients just refetch what they are allowed to see.
export const publish = () => listeners.forEach((fn) => fn())
