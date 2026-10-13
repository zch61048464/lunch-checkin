import { useEffect, useState } from 'react';
import CheckinPage from './pages/CheckinPage';
import AdminPage from './pages/AdminPage';

type Page = 'checkin' | 'admin';
const fromHash = (): Page => (location.hash === '#/admin' ? 'admin' : 'checkin');

export default function App() {
  const [page, setPage] = useState<Page>(fromHash());

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (p: Page) => {
    location.hash = p === 'admin' ? '#/admin' : '#/';
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>社員食堂 昼食受付システム</h1>
        <nav>
          <button className={page === 'checkin' ? 'on' : ''} onClick={() => go('checkin')}>
            受付
          </button>
          <button className={page === 'admin' ? 'on' : ''} onClick={() => go('admin')}>
            管理
          </button>
        </nav>
      </header>
      {page === 'checkin' ? <CheckinPage /> : <AdminPage />}
    </div>
  );
}
