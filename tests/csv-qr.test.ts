import { describe, expect, it } from 'vitest';
import { checkinsCsv, csvCell, monthlyCsv, toCsv } from '../src/lib/csv';
import { makePayload, parsePayload } from '../src/lib/qr';
import { fmtDate, fmtDateTime, fmtMonth, fmtTime, localDate, localTime } from '../src/lib/date';

describe('CSV', () => {
  it('带 UTF-8 BOM 与 CRLF，中日文原样保留', () => {
    const s = toCsv([['姓名', '名前'], ['张三', '田中太郎']]);
    expect(s.charCodeAt(0)).toBe(0xfeff);
    expect(s).toBe('﻿姓名,名前\r\n张三,田中太郎\r\n');
  });

  it('转义逗号、引号、换行，并防公式注入', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-12')).toBe('-12');
    expect(csvCell('A-001')).toBe('A-001');
  });

  it('打卡明细与月度统计', () => {
    const c = checkinsCsv([
      { id: '1', employeeId: 'e', empNo: 'A001', name: '張三', date: '2026-10-13', time: '12:00:00', ts: 0, manual: false },
    ]);
    expect(c).toContain('日付,社員番号,氏名,受付時刻,受付方法\r\n2026-10-13,A001,張三,12:00:00,スキャン');
    expect(monthlyCsv('2026-10', [{ employeeId: 'e', empNo: 'A001', name: '張三', count: 3, deleted: false }])).toContain(
      '対象月,社員番号,氏名,利用回数',
    );
  });
});

describe('二维码内容', () => {
  it('往返解析；拒绝陌生内容', () => {
    expect(parsePayload(makePayload('abc123def456'))).toBe('abc123def456');
    expect(parsePayload('https://example.com')).toBeNull();
    expect(parsePayload('LUNCH:')).toBeNull();
    expect(parsePayload('LUNCH:../../x')).toBeNull();
  });
});

describe('本地日期', () => {
  it('使用本地时区而非 UTC', () => {
    const d = new Date(2026, 0, 1, 0, 30, 5); // 本地 1 月 1 日 00:30
    expect(localDate(d)).toBe('2026-01-01');
    expect(localTime(d)).toBe('00:30:05');
  });
});

describe('日本語の日付表示（内部キーは変えない）', () => {
  it('年月日・時刻の整形', () => {
    expect(fmtDate('2026-10-13')).toBe('2026年10月13日');
    expect(fmtDate('2026-01-01')).toBe('2026年1月1日');
    expect(fmtMonth('2026-10')).toBe('2026年10月');
    expect(fmtTime('12:05:09')).toBe('12:05');
    expect(fmtDateTime('2026-10-13', '12:05:09')).toBe('2026年10月13日 12:05');
  });
  it('内部の日付キーは従来どおり YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 9, 13, 12, 5))).toBe('2026-10-13');
  });
});

describe('既存データとの互換', () => {
  it('QRコードの内容形式は変わらない（LUNCH:<id>）', () => {
    expect(makePayload('1v2z0q1m6m1q')).toBe('LUNCH:1v2z0q1m6m1q');
  });
  it('CSV の業務データ（日付・時刻・番号）は ISO 形式のまま', () => {
    const c = checkinsCsv([
      { id: '1', employeeId: 'e', empNo: '=cmd', name: '=HYPERLINK("x")', date: '2026-10-13', time: '12:00:00', ts: 0, manual: true },
    ]);
    expect(c).toContain("2026-10-13,'=cmd,\"'=HYPERLINK(\"\"x\"\")\",12:00:00,手動登録");
  });
});
