import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEmployee,
  addManualCheckin,
  checkIn,
  countByDate,
  deleteCheckin,
  deleteEmployee,
  exportBackup,
  listCheckinsByDate,
  listEmployees,
  monthlySummary,
  parseBackup,
  resetDbForTest,
  restoreBackup,
  updateEmployee,
  getDb,
} from '../src/lib/db';

let n = 0;
beforeEach(async () => {
  await resetDbForTest('test-' + n++);
});

const D1 = new Date(2026, 9, 13, 12, 5, 9);
const D2 = new Date(2026, 9, 14, 12, 0, 0);

describe('员工', () => {
  it('新增、修改、工号唯一', async () => {
    const a = await addEmployee(' A001 ', ' 张三 ');
    expect(a.empNo).toBe('A001');
    await expect(addEmployee('A001', '李四')).rejects.toMatchObject({ code: 'DUP_EMPNO' });
    const b = await addEmployee('A002', '李四');
    await expect(updateEmployee(b.id, 'A001', '李四')).rejects.toMatchObject({ code: 'DUP_EMPNO' });
    await updateEmployee(b.id, 'A003', '李四四');
    expect((await listEmployees()).map((e) => e.empNo)).toEqual(['A001', 'A003']);
    await expect(addEmployee('', 'x')).rejects.toMatchObject({ code: 'INVALID' });
  });
});

describe('打卡', () => {
  it('首次成功，同日重复返回 duplicate，次日可再打', async () => {
    const e = await addEmployee('A001', '张三');
    const r1 = await checkIn(e.id, D1);
    expect(r1.status).toBe('ok');
    if (r1.status === 'ok') {
      expect(r1.checkin).toMatchObject({ date: '2026-10-13', time: '12:05:09', name: '张三', empNo: 'A001' });
    }
    expect((await checkIn(e.id, D1)).status).toBe('duplicate');
    expect(await countByDate('2026-10-13')).toBe(1);
    expect((await checkIn(e.id, D2)).status).toBe('ok');
  });

  it('未知员工', async () => {
    expect((await checkIn('nope12345678', D1)).status).toBe('unknown');
  });

  it('并发扫同一人只会有一笔', async () => {
    const e = await addEmployee('A001', '张三');
    const rs = await Promise.all(Array.from({ length: 5 }, () => checkIn(e.id, D1)));
    expect(rs.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(await countByDate('2026-10-13')).toBe(1);
  });

  it('数据库唯一索引直接拒绝重复写入', async () => {
    const e = await addEmployee('A001', '张三');
    await checkIn(e.id, D1);
    const db = await getDb();
    const [rec] = await listCheckinsByDate('2026-10-13');
    await expect(db.add('checkins', { ...rec, id: 'another-id' })).rejects.toMatchObject({ name: 'ConstraintError' });
  });

  it('撤销后可重新登记；补录遵守同样限制', async () => {
    const e = await addEmployee('A001', '张三');
    const r = await checkIn(e.id, D1);
    if (r.status !== 'ok') throw new Error('unexpected');
    await expect(addManualCheckin(e.id, '2026-10-13', '12:00')).rejects.toMatchObject({ code: 'DUP_CHECKIN' });
    await deleteCheckin(r.checkin.id);
    const m = await addManualCheckin(e.id, '2026-10-13', '12:00');
    expect(m).toMatchObject({ manual: true, time: '12:00:00' });
    await expect(addManualCheckin(e.id, '2026/10/13', '12:00')).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('删除员工后历史记录保留，月度统计标记已删除', async () => {
    const a = await addEmployee('A001', '张三');
    const b = await addEmployee('A002', '李四');
    await checkIn(a.id, D1);
    await checkIn(a.id, D2);
    await checkIn(b.id, D1);
    await deleteEmployee(a.id);
    const rows = await monthlySummary('2026-10');
    expect(rows).toEqual([
      { employeeId: a.id, empNo: 'A001', name: '张三', count: 2, deleted: true },
      { employeeId: b.id, empNo: 'A002', name: '李四', count: 1, deleted: false },
    ]);
    expect(await monthlySummary('2026-09')).toEqual([
      { employeeId: b.id, empNo: 'A002', name: '李四', count: 0, deleted: false },
    ]);
  });
});

describe('备份', () => {
  it('导出后清空再导入，数据一致', async () => {
    const a = await addEmployee('A001', '张三');
    await checkIn(a.id, D1);
    const text = JSON.stringify(await exportBackup());
    const parsed = parseBackup(text);

    await deleteEmployee(a.id);
    await deleteCheckin((await listCheckinsByDate('2026-10-13'))[0].id);
    expect(await listEmployees()).toHaveLength(0);

    await restoreBackup(parsed);
    expect(await listEmployees()).toHaveLength(1);
    expect((await listCheckinsByDate('2026-10-13'))[0]).toMatchObject({ name: '张三', employeeId: a.id });
    expect((await checkIn(a.id, D1)).status).toBe('duplicate'); // 唯一约束依然有效
  });

  it('拒绝非法文件，且不改动现有数据', async () => {
    const a = await addEmployee('A001', '张三');
    expect(() => parseBackup('not json')).toThrow();
    expect(() => parseBackup('{"app":"other"}')).toThrow();
    expect(() => parseBackup(JSON.stringify({ app: 'lunch-checkin', employees: [{ id: 'x' }], checkins: [] }))).toThrow();
    expect(await listEmployees()).toHaveLength(1);
    expect((await listEmployees())[0].id).toBe(a.id);
  });

  it('备份里同人同日重复记录只保留一笔', () => {
    const rec = { employeeId: 'e1', date: '2026-10-13', time: '12:00:00', empNo: 'A', name: 'n' };
    const b = parseBackup(
      JSON.stringify({
        app: 'lunch-checkin',
        employees: [{ id: 'e1', empNo: 'A', name: 'n' }],
        checkins: [{ ...rec, id: 'c1' }, { ...rec, id: 'c2' }],
      }),
    );
    expect(b.checkins).toHaveLength(1);
  });
});
