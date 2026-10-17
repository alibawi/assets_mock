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
import { MaintenanceForm, MaintenanceList } from './pages/Maintenance'
import { DocForm, DocsList } from './pages/AssetDocs'
import { InvoiceForm, InvoicesList } from './pages/SalesInvoices'
import { BatchForm, BatchesList } from './pages/OpeningBalances'
import type { DocKind } from './data/types'

const DOC_PAGES: [DocKind, string][] = [['reval', 'revaluations'], ['costAdj', 'cost-adjustments'], ['manual', 'manual-depreciation'], ['transfer', 'transfers'], ['disposal', 'disposals']]

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
        {DOC_PAGES.flatMap(([kind, path]) => [
          <Route key={path} path={`/${path}`} element={<DocsList key={path} kind={kind} />} />,
          <Route key={`${path}-id`} path={`/${path}/:id`} element={<DocForm key={pathname} kind={kind} />} />,
        ])}
        <Route path="/sales-invoices" element={<InvoicesList />} />
        <Route path="/sales-invoices/:id" element={<InvoiceForm key={pathname} />} />
        <Route path="/opening-balances" element={<BatchesList />} />
        <Route path="/opening-balances/:id" element={<BatchForm key={pathname} />} />
        <Route path="/maintenance" element={<MaintenanceList />} />
        <Route path="/maintenance/:id" element={<MaintenanceForm key={pathname} />} />
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
