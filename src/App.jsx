import { Routes, Route } from 'react-router-dom'
import AdminGate from './components/admin/AdminGate'
import MemberBoard from './components/public/MemberBoard'
import MemberLinkNotice from './components/public/MemberLinkNotice'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MemberLinkNotice />} />
      <Route path="/admin" element={<AdminGate />} />
      <Route path="/m/:token" element={<MemberBoard />} />
    </Routes>
  )
}
