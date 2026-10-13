import { useState } from 'react';
import EmployeesTab from '../components/EmployeesTab';
import RecordsTab from '../components/RecordsTab';
import ExportTab from '../components/ExportTab';

const TABS = [
  ['employees', '社員管理'],
  ['records', '利用履歴'],
  ['export', 'CSV出力・バックアップ'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('employees');
  return (
    <main className="admin">
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'employees' && <EmployeesTab />}
      {tab === 'records' && <RecordsTab />}
      {tab === 'export' && <ExportTab />}
    </main>
  );
}
