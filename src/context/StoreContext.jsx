import { createContext, useContext } from 'react'
import { useTandaStore } from '../hooks/useTandaStore'

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const store = useTandaStore()
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
