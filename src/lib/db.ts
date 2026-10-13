import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { fmtDate, isDate, isTime, localDate, localTime } from './date';

export interface Employee {
  id: string; // 随机 ID，二维码里只存它；改名/改工号不会让已打印的二维码失效
  empNo: string;
  name: string;
  createdAt: number;
}

export interface Checkin {
  id: string;
  employeeId: string;
  empNo: string; // 打卡当时的快照，员工被删除后记录仍完整
  name: string;
  date: string; // YYYY-MM-DD（本地）
  time: string; // HH:mm:ss
  ts: number;
  manual: boolean; // 补录
}

interface LunchDB extends DBSchema {
  employees: {
    key: string;
    value: Employee;
    indexes: { empNo: string };
  };
  checkins: {
    key: string;
    value: Checkin;
    // [employeeId, date] 唯一索引：数据库层面保证同一员工同一天最多一笔有效记录
    indexes: { byEmpDate: [string, string]; date: string };
  };
}

export type Db = IDBPDatabase<LunchDB>;

export class AppError extends Error {
  constructor(public code: 'DUP_EMPNO' | 'DUP_CHECKIN' | 'NOT_FOUND' | 'INVALID', message: string) {
    super(message);
  }
}

let dbPromise: Promise<Db> | null = null;

export function getDb(name = 'lunch-checkin'): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openDB<LunchDB>(name, 1, {
      upgrade(db) {
        const emp = db.createObjectStore('employees', { keyPath: 'id' });
        emp.createIndex('empNo', 'empNo', { unique: true });
        const ck = db.createObjectStore('checkins', { keyPath: 'id' });
        ck.createIndex('byEmpDate', ['employeeId', 'date'], { unique: true });
        ck.createIndex('date', 'date');
      },
    });
  }
  return dbPromise;
}

/** 仅测试使用：换一个全新的数据库 */
export function resetDbForTest(name: string) {
  dbPromise = null;
  return getDb(name);
}

export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

const isConstraint = (e: unknown) => e instanceof DOMException && e.name === 'ConstraintError';

// ---------- 员工 ----------

export async function listEmployees(): Promise<Employee[]> {
  const all = await (await getDb()).getAll('employees');
  return all.sort((a, b) => a.empNo.localeCompare(b.empNo, 'zh', { numeric: true }));
}

function cleanEmployee(empNo: string, name: string) {
  const e = empNo.trim();
  const n = name.trim();
  if (!e || !n) throw new AppError('INVALID', '氏名と社員番号を入力してください');
  return { empNo: e, name: n };
}

export async function addEmployee(empNo: string, name: string): Promise<Employee> {
  const v = cleanEmployee(empNo, name);
  const emp: Employee = { id: newId(), ...v, createdAt: Date.now() };
  try {
    await (await getDb()).add('employees', emp);
  } catch (e) {
    if (isConstraint(e)) throw new AppError('DUP_EMPNO', `社員番号「${v.empNo}」は既に登録されています`);
    throw e;
  }
  return emp;
}

export async function updateEmployee(id: string, empNo: string, name: string): Promise<void> {
  const v = cleanEmployee(empNo, name);
  const db = await getDb();
  try {
    const tx = db.transaction('employees', 'readwrite');
    tx.done.catch(() => {}); // 出错时事务会中止；错误由下面的 await 抛出，避免重复的未处理拒绝
    const cur = await tx.store.get(id);
    if (!cur) throw new AppError('NOT_FOUND', '社員が見つかりません');
    await tx.store.put({ ...cur, ...v });
    await tx.done;
  } catch (e) {
    if (isConstraint(e)) throw new AppError('DUP_EMPNO', `社員番号「${v.empNo}」は既に登録されています`);
    throw e;
  }
}

/** 删除员工；历史打卡记录保留（含当时的姓名、工号） */
export async function deleteEmployee(id: string): Promise<void> {
  await (await getDb()).delete('employees', id);
}

// ---------- 打卡 ----------

export type CheckinResult =
  | { status: 'ok'; checkin: Checkin }
  | { status: 'duplicate'; checkin: Checkin }
  | { status: 'unknown' };

/** 扫码打卡：在单个读写事务内完成"查员工→查重→写入" */
export async function checkIn(employeeId: string, now: Date = new Date()): Promise<CheckinResult> {
  const db = await getDb();
  const tx = db.transaction(['employees', 'checkins'], 'readwrite');
  tx.done.catch(() => {});
  const emp = await tx.objectStore('employees').get(employeeId);
  if (!emp) {
    await tx.done;
    return { status: 'unknown' };
  }
  const date = localDate(now);
  const store = tx.objectStore('checkins');
  const existing = await store.index('byEmpDate').get([emp.id, date]);
  if (existing) {
    await tx.done;
    return { status: 'duplicate', checkin: existing };
  }
  const rec: Checkin = {
    id: newId(),
    employeeId: emp.id,
    empNo: emp.empNo,
    name: emp.name,
    date,
    time: localTime(now),
    ts: now.getTime(),
    manual: false,
  };
  try {
    await store.add(rec);
    await tx.done;
  } catch (e) {
    if (isConstraint(e)) {
      const ex = await db.getFromIndex('checkins', 'byEmpDate', [emp.id, date]);
      if (ex) return { status: 'duplicate', checkin: ex };
    }
    throw e;
  }
  return { status: 'ok', checkin: rec };
}

/** 手动补录某员工某天的用餐 */
export async function addManualCheckin(employeeId: string, date: string, time: string): Promise<Checkin> {
  if (!isDate(date)) throw new AppError('INVALID', '日付の形式が正しくありません');
  if (!isTime(time)) throw new AppError('INVALID', '時刻の形式が正しくありません');
  const t = time.length === 5 ? `${time}:00` : time;
  const db = await getDb();
  const emp = await db.get('employees', employeeId);
  if (!emp) throw new AppError('NOT_FOUND', '社員が見つかりません');
  const rec: Checkin = {
    id: newId(),
    employeeId: emp.id,
    empNo: emp.empNo,
    name: emp.name,
    date,
    time: t,
    ts: new Date(`${date}T${t}`).getTime(),
    manual: true,
  };
  try {
    await db.add('checkins', rec);
  } catch (e) {
    if (isConstraint(e)) throw new AppError('DUP_CHECKIN', `${emp.name}さんは${fmtDate(date)}に既に受付済みです`);
    throw e;
  }
  return rec;
}

/** 撤销误登记：直接删除该记录，同一员工同一天即可重新登记 */
export async function deleteCheckin(id: string): Promise<void> {
  await (await getDb()).delete('checkins', id);
}

export async function listCheckinsByDate(date: string): Promise<Checkin[]> {
  const all = await (await getDb()).getAllFromIndex('checkins', 'date', date);
  return all.sort((a, b) => a.time.localeCompare(b.time));
}

export async function countByDate(date: string): Promise<number> {
  return (await getDb()).countFromIndex('checkins', 'date', date);
}

export async function listCheckinsByMonth(month: string): Promise<Checkin[]> {
  const range = IDBKeyRange.bound(`${month}-01`, `${month}-31`);
  const all = await (await getDb()).getAllFromIndex('checkins', 'date', range);
  return all.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export async function listAllCheckins(): Promise<Checkin[]> {
  const all = await (await getDb()).getAll('checkins');
  return all.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export interface MonthlyRow {
  employeeId: string;
  empNo: string;
  name: string;
  count: number;
  deleted: boolean;
}

/** 每位员工当月用餐次数；0 次的在职员工也列出，已删除但有记录的员工也列出 */
export async function monthlySummary(month: string): Promise<MonthlyRow[]> {
  const [emps, recs] = await Promise.all([listEmployees(), listCheckinsByMonth(month)]);
  const map = new Map<string, MonthlyRow>();
  for (const e of emps) map.set(e.id, { employeeId: e.id, empNo: e.empNo, name: e.name, count: 0, deleted: false });
  for (const r of recs) {
    const row = map.get(r.employeeId) ?? { employeeId: r.employeeId, empNo: r.empNo, name: r.name, count: 0, deleted: true };
    row.count++;
    map.set(r.employeeId, row);
  }
  return [...map.values()].sort((a, b) => a.empNo.localeCompare(b.empNo, 'zh', { numeric: true }));
}

// ---------- 备份 / 恢复 ----------

export interface BackupFile {
  app: 'lunch-checkin';
  version: 1;
  exportedAt: string;
  employees: Employee[];
  checkins: Checkin[];
}

export async function exportBackup(): Promise<BackupFile> {
  const db = await getDb();
  return {
    app: 'lunch-checkin',
    version: 1,
    exportedAt: new Date().toISOString(),
    employees: await db.getAll('employees'),
    checkins: await db.getAll('checkins'),
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** 校验备份内容，失败抛 AppError('INVALID')；返回整理后的数据 */
export function parseBackup(text: string): BackupFile {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError('INVALID', 'ファイルを読み込めません（JSON形式ではありません）');
  }
  if (!raw || raw.app !== 'lunch-checkin' || !Array.isArray(raw.employees) || !Array.isArray(raw.checkins)) {
    throw new AppError('INVALID', 'このシステムで作成したバックアップファイルではありません');
  }
  const employees: Employee[] = [];
  const ids = new Set<string>();
  const nos = new Set<string>();
  for (const e of raw.employees) {
    if (!isStr(e?.id) || !isStr(e?.empNo) || !isStr(e?.name)) throw new AppError('INVALID', 'バックアップ内の社員データが不完全です');
    if (ids.has(e.id) || nos.has(e.empNo)) throw new AppError('INVALID', `バックアップ内で社員が重複しています：${e.empNo}`);
    ids.add(e.id);
    nos.add(e.empNo);
    employees.push({ id: e.id, empNo: e.empNo, name: e.name, createdAt: Number(e.createdAt) || 0 });
  }
  const checkins: Checkin[] = [];
  const seen = new Set<string>();
  const cids = new Set<string>();
  for (const c of raw.checkins) {
    if (!isStr(c?.id) || !isStr(c?.employeeId) || !isDate(c?.date) || !isTime(c?.time)) {
      throw new AppError('INVALID', 'バックアップ内の受付データが不完全です');
    }
    const key = `${c.employeeId}|${c.date}`;
    if (seen.has(key) || cids.has(c.id)) continue; // 同人同日只留第一笔
    seen.add(key);
    cids.add(c.id);
    checkins.push({
      id: c.id,
      employeeId: c.employeeId,
      empNo: String(c.empNo ?? ''),
      name: String(c.name ?? ''),
      date: c.date,
      time: c.time,
      ts: Number(c.ts) || new Date(`${c.date}T${c.time}`).getTime(),
      manual: !!c.manual,
    });
  }
  return { app: 'lunch-checkin', version: 1, exportedAt: String(raw.exportedAt ?? ''), employees, checkins };
}

/** 用备份完全替换当前数据（单事务，失败则整体回滚） */
export async function restoreBackup(b: BackupFile): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['employees', 'checkins'], 'readwrite');
  await tx.objectStore('employees').clear();
  await tx.objectStore('checkins').clear();
  for (const e of b.employees) await tx.objectStore('employees').add(e);
  for (const c of b.checkins) await tx.objectStore('checkins').add(c);
  await tx.done;
}
