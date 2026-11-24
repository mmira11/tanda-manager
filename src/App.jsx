import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import MemberBoard from './components/public/MemberBoard'
import MemberLinkNotice from './components/public/MemberLinkNotice'

// Opt in to React Router v7 behavior now, so the upgrade is a version bump.
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true }

// Members are most visitors. The organizer app loads only on /admin, so their phones
// never download it.
const AdminGate = lazy(() => import('./components/admin/AdminGate'))
const Preview = import.meta.env.DEV ? lazy(() => import('./preview/MockGallery')) : null

function Loading() {
  return <div className="min-h-screen bg-cream" aria-busy="true" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MemberLinkNotice />} />
      <Route path="/admin" element={<Suspense fallback={<Loading />}><AdminGate /></Suspense>} />
      <Route path="/m/:token" element={<MemberBoard />} />
      {Preview && (
        <Route
          path="/preview/:screen"
          element={<Suspense fallback={null}><Preview /></Suspense>}
        />
      )}
    </Routes>
  )
}
