import { useCallback, useEffect, useMemo, useState } from 'react';
import { addEmployee, deleteEmployee, listEmployees, updateEmployee, type Employee } from '../lib/db';
import { makeQrImage } from '../lib/qr';
import { downloadBlob } from '../lib/files';
import Notice, { errText, type NoticeState } from './Notice';

export default function EmployeesTab() {
  const [list, setList] = useState<Employee[]>([]);
  const [empNo, setEmpNo] = useState('');
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [editing, setEditing] = useState<{ id: string; empNo: string; name: string } | null>(null);
  const [qr, setQr] = useState<{ emp: Employee; blob: Blob; url: string } | null>(null);

  const load = useCallback(async () => setList(await listEmployees()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? list.filter((e) => e.name.toLowerCase().includes(k) || e.empNo.toLowerCase().includes(k)) : list;
  }, [list, q]);

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await addEmployee(empNo, name);
      setNotice({ kind: 'ok', text: `${name.trim()}さんを追加しました` });
      setEmpNo('');
      setName('');
      await load();
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateEmployee(editing.id, editing.empNo, editing.name);
      setEditing(null);
      setNotice({ kind: 'ok', text: '変更を保存しました（QRコードは変わらないため、再印刷は不要です）' });
      await load();
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
    }
  };

  const remove = async (e: Employee) => {
    if (!confirm(`${e.name}さん（社員番号 ${e.empNo}）を削除しますか？\n過去の利用履歴は残りますが、この社員のQRコードは使用できなくなります。`)) return;
    await deleteEmployee(e.id);
    setNotice({ kind: 'ok', text: `${e.name}さんを削除しました` });
    await load();
  };

  const showQr = async (e: Employee) => {
    try {
      const blob = await makeQrImage(e.id, e.empNo, e.name);
      setQr({ emp: e, blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setNotice({ kind: 'err', text: errText(err) });
    }
  };

  const closeQr = () => {
    if (qr) URL.revokeObjectURL(qr.url);
    setQr(null);
  };

  return (
    <div>
      <form className="card form-row" onSubmit={add}>
        <label>
          社員番号
          <input value={empNo} onChange={(e) => setEmpNo(e.target.value)} placeholder="例：A001" autoCapitalize="off" />
        </label>
        <label>
          氏名
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
        </label>
        <button className="primary" type="submit">
          社員を追加
        </button>
      </form>

      <Notice n={notice} />

      <div className="list-head">
        <h2>社員一覧（{list.length}名）</h2>
        <input className="search" type="search" placeholder="氏名・社員番号で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ul className="rows">
        {shown.length === 0 && <li className="muted">{list.length ? '該当する社員がいません' : '社員が登録されていません。上のフォームから追加してください'}</li>}
        {shown.map((e) =>
          editing?.id === e.id ? (
            <li key={e.id} className="row editing">
              <input value={editing.empNo} onChange={(ev) => setEditing({ ...editing, empNo: ev.target.value })} aria-label="社員番号" />
              <input value={editing.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} aria-label="氏名" />
              <button className="primary" onClick={saveEdit}>
                保存
              </button>
              <button onClick={() => setEditing(null)}>キャンセル</button>
            </li>
          ) : (
            <li key={e.id} className="row">
              <span className="no">{e.empNo}</span>
              <span className="nm">{e.name}</span>
              <span className="btns">
                <button onClick={() => showQr(e)}>QRコード</button>
                <button onClick={() => setEditing({ id: e.id, empNo: e.empNo, name: e.name })}>編集</button>
                <button className="danger" onClick={() => remove(e)}>
                  削除
                </button>
              </span>
            </li>
          ),
        )}
      </ul>

      {qr && (
        <div className="modal" onClick={closeQr}>
          <div className="modal-box" onClick={(ev) => ev.stopPropagation()}>
            <img src={qr.url} alt={`${qr.emp.name}さんのQRコード`} />
            <p className="muted">画像を長押しして「“写真”に追加」で保存することもできます</p>
            <div className="actions">
              <button className="primary" onClick={() => downloadBlob(qr.blob, `${qr.emp.empNo}_${qr.emp.name}.png`)}>
                QRコード画像をダウンロード
              </button>
              <button onClick={closeQr}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
