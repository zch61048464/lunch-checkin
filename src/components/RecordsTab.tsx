import { useCallback, useEffect, useState } from 'react';
import {
  addManualCheckin,
  deleteCheckin,
  listCheckinsByDate,
  listEmployees,
  monthlySummary,
  type Checkin,
  type Employee,
  type MonthlyRow,
} from '../lib/db';
import { fmtDate, fmtDateTime, fmtMonth, fmtTime, localDate, localMonth, localTime } from '../lib/date';
import Notice, { errText, type NoticeState } from './Notice';

export default function RecordsTab() {
  const [date, setDate] = useState(localDate());
  const [month, setMonth] = useState(localMonth());
  const [day, setDay] = useState<Checkin[]>([]);
  const [summary, setSummary] = useState<MonthlyRow[]>([]);
  const [emps, setEmps] = useState<Employee[]>([]);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [mEmp, setMEmp] = useState('');
  const [mDate, setMDate] = useState(localDate());
  const [mTime, setMTime] = useState('12:00');

  const loadDay = useCallback(async () => setDay(await listCheckinsByDate(date)), [date]);
  const loadMonth = useCallback(async () => setSummary(await monthlySummary(month)), [month]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);
  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);
  useEffect(() => {
    void listEmployees().then(setEmps);
  }, []);

  const undo = async (c: Checkin) => {
    if (!confirm(`${c.name}さんの受付（${fmtDateTime(c.date, c.time)}）を取り消しますか？`)) return;
    await deleteCheckin(c.id);
    setNotice({ kind: 'ok', text: `${c.name}さんの受付を取り消しました` });
    await Promise.all([loadDay(), loadMonth()]);
  };

  const supplement = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!mEmp) {
      setNotice({ kind: 'err', text: '社員を選択してください' });
      return;
    }
    try {
      const r = await addManualCheckin(mEmp, mDate, mTime);
      setNotice({ kind: 'ok', text: `手動登録しました：${r.name}さん ${fmtDateTime(r.date, r.time)}` });
      await Promise.all([loadDay(), loadMonth()]);
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
    }
  };

  const total = summary.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <Notice n={notice} />

      <section className="card">
        <div className="list-head">
          <h2>
            日別の利用者 <small>{fmtDate(date)}・{day.length}名</small>
          </h2>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <ul className="rows">
          {day.length === 0 && <li className="muted">この日の受付はありません</li>}
          {day.map((c) => (
            <li key={c.id} className="row">
              <span className="no">{fmtTime(c.time)}</span>
              <span className="nm">
                {c.name} <span className="muted">{c.empNo}</span>
                {c.manual && <em className="tag">手動登録</em>}
              </span>
              <span className="btns">
                <button className="danger" onClick={() => undo(c)}>
                  取消
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>手動登録（受付漏れの追加）</h2>
        <form className="form-row" onSubmit={supplement}>
          <label>
            社員
            <select value={mEmp} onChange={(e) => setMEmp(e.target.value)}>
              <option value="">選択してください</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.empNo} {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            日付
            <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
          </label>
          <label>
            時刻
            <input type="time" value={mTime} onChange={(e) => setMTime(e.target.value || localTime().slice(0, 5))} />
          </label>
          <button className="primary" type="submit">
            登録
          </button>
        </form>
        <p className="muted">同じ社員は1日1回のみ受付できます。内容を訂正する場合は、先に取り消してから登録してください。</p>
      </section>

      <section className="card">
        <div className="list-head">
          <h2>
            月別集計 <small>{fmtMonth(month)}・計{total}食</small>
          </h2>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>社員番号</th>
              <th>氏名</th>
              <th className="num">利用回数</th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  データがありません
                </td>
              </tr>
            )}
            {summary.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.empNo}</td>
                <td>
                  {r.name}
                  {r.deleted && <em className="tag">削除済み</em>}
                </td>
                <td className="num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
