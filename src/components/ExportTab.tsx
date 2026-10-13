import { useRef, useState } from 'react';
import {
  exportBackup,
  listAllCheckins,
  listCheckinsByMonth,
  monthlySummary,
  parseBackup,
  restoreBackup,
} from '../lib/db';
import { checkinsCsv, monthlyCsv } from '../lib/csv';
import { localDate, localMonth } from '../lib/date';
import { canShareFiles, downloadBlob, shareBlob, textBlob } from '../lib/files';
import Notice, { errText, type NoticeState } from './Notice';

const CSV_TYPE = 'text/csv;charset=utf-8';

export default function ExportTab() {
  const [month, setMonth] = useState(localMonth());
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const share = canShareFiles();

  const run = async (label: string, make: () => Promise<{ blob: Blob; name: string }>, viaShare = false) => {
    try {
      const { blob, name } = await make();
      if (viaShare) await shareBlob(blob, name);
      else downloadBlob(blob, name);
      setNotice({ kind: 'ok', text: `${label}を出力しました：${name}` });
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
    }
  };

  const csvAll = async () => ({ blob: textBlob(checkinsCsv(await listAllCheckins()), CSV_TYPE), name: `昼食利用記録_全期間_${localDate()}.csv` });
  const csvMonth = async () => ({ blob: textBlob(checkinsCsv(await listCheckinsByMonth(month)), CSV_TYPE), name: `昼食利用記録_${month}.csv` });
  const csvSummary = async () => ({ blob: textBlob(monthlyCsv(month, await monthlySummary(month)), CSV_TYPE), name: `昼食月別集計_${month}.csv` });
  const json = async () => ({
    blob: textBlob(JSON.stringify(await exportBackup(), null, 2), 'application/json'),
    name: `昼食受付バックアップ_${localDate()}.json`,
  });

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const b = parseBackup(await file.text());
      if (!confirm(`バックアップファイルの内容で現在のデータをすべて置き換えます。\n社員 ${b.employees.length}名、受付記録 ${b.checkins.length}件\n\n現在のデータは消去されます。続行しますか？`)) return;
      await restoreBackup(b);
      setNotice({ kind: 'ok', text: `復元しました：社員 ${b.employees.length}名、受付記録 ${b.checkins.length}件` });
    } catch (e) {
      setNotice({ kind: 'err', text: '復元できませんでした（現在のデータは変更されていません）：' + errText(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <Notice n={notice} />

      <section className="card">
        <h2>CSV出力（Excelで開けます）</h2>
        <div className="form-row">
          <label>
            対象月
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => run('CSVファイル', csvMonth)}>
            月の利用履歴をCSV出力
          </button>
          <button onClick={() => run('CSVファイル', csvSummary)}>月別集計をCSV出力</button>
          <button onClick={() => run('CSVファイル', csvAll)}>全期間の利用履歴をCSV出力</button>
        </div>
      </section>

      <section className="card">
        <h2>データをバックアップ</h2>
        <p className="muted">全社員と全受付記録をJSONファイルに保存します。iPadの交換や操作ミスの際の復元に使えます。週に1回のバックアップをおすすめします。</p>
        <div className="actions">
          <button className="primary" onClick={() => run('バックアップ', json)}>
            バックアップファイルを保存
          </button>
          {share && (
            <button onClick={() => run('バックアップ', json, true)}>共有 / Google Driveへ保存</button>
          )}
        </div>
        <p className="muted">
          保存したファイルは「ファイル」アプリの「ダウンロード」にあります。Google Driveアプリで「＋」→「アップロード」から選ぶと、クラウドに保存できます。
        </p>
      </section>

      <section className="card">
        <h2>データを復元</h2>
        <p className="muted">以前に保存したバックアップ（JSON）ファイルを選択してください。現在のデータはすべて置き換えられます。実行前に確認が表示されます。</p>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => restore(e.target.files?.[0])} />
      </section>
    </div>
  );
}
