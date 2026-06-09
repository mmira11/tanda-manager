import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { StoreProvider, useStore } from './context/StoreContext'
import PinGate from './components/admin/PinGate'
import SetupWizard from './components/admin/SetupWizard'
import AdminDashboard from './components/admin/AdminDashboard'
import PublicBoard from './components/public/PublicBoard'

function AdminRoute() {
  const { store } = useStore()
  const [unlocked, setUnlocked] = useState(false)

  if (!store.config.initialized) return <SetupWizard />
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />
  return <AdminDashboard />
}

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/" element={<PublicBoard />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Routes>
    </StoreProvider>
  )
}
