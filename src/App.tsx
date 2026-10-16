import { Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/Layout'
import AssetForm from './pages/AssetForm'
import AssetsList from './pages/AssetsList'
import Dashboard from './pages/Dashboard'
import { DepreciationForm, DepreciationList } from './pages/Depreciation'
import { DisposalForm, DisposalsList } from './pages/Disposals'
import { MaintenanceForm, MaintenanceList } from './pages/Maintenance'
import { CategoriesPage, LocationsPage } from './pages/MasterData'
import Reports from './pages/Reports'
import { RevaluationForm, RevaluationsList } from './pages/Revaluations'
import SettingsPage from './pages/Settings'
import { TransferForm, TransfersList } from './pages/Transfers'

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
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/depreciation" element={<DepreciationList />} />
        <Route path="/depreciation/:id" element={<DepreciationForm key={pathname} />} />
        <Route path="/transfers" element={<TransfersList />} />
        <Route path="/transfers/:id" element={<TransferForm key={pathname} />} />
        <Route path="/revaluations" element={<RevaluationsList />} />
        <Route path="/revaluations/:id" element={<RevaluationForm key={pathname} />} />
        <Route path="/disposals" element={<DisposalsList />} />
        <Route path="/disposals/:id" element={<DisposalForm key={pathname} />} />
        <Route path="/maintenance" element={<MaintenanceList />} />
        <Route path="/maintenance/:id" element={<MaintenanceForm key={pathname} />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </AppLayout>
  )
}

