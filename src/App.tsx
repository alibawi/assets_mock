import { Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/Layout'
import AssetForm from './pages/AssetForm'
import AssetsList from './pages/AssetsList'
import Dashboard from './pages/Dashboard'
import { RunForm, RunsList } from './pages/Depreciation'
import { ClassesPage, GroupsPage, LocationsPage } from './pages/MasterData'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import Transactions from './pages/Transactions'

export default function App() {
  // Keying on the path remounts forms when navigating between /x/new and /x/:id
  const { pathname } = useLocation()
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets" element={<AssetsList />} />
        <Route path="/assets/new" element={<AssetForm key={pathname} />} />
        <Route path="/assets/:id" element={<AssetForm key={pathname} />} />
        <Route path="/runs" element={<RunsList />} />
        <Route path="/runs/:id" element={<RunForm key={pathname} />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </AppLayout>
  )
}
