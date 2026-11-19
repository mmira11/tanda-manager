import { createContext, useContext } from 'react'
import { useCycleStore } from '../hooks/useCycleStore'

export const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const store = useCycleStore()
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
