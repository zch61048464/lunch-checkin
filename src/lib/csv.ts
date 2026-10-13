import type { Checkin, MonthlyRow } from './db';

/** 单元格转义；以 = + - @ 开头的文本加前缀 ' 防止 Excel 当作公式执行（纯数字除外） */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 生成 CSV 文本：开头带 UTF-8 BOM、行尾 CRLF，
 * Windows 的中文 / 日文 Excel 直接双击打开不会乱码。
 */
export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function checkinsCsv(list: Checkin[]): string {
  return toCsv([
    ['日付', '社員番号', '氏名', '受付時刻', '受付方法'],
    ...list.map((c) => [c.date, c.empNo, c.name, c.time, c.manual ? '手動登録' : 'スキャン']),
  ]);
}

export function monthlyCsv(month: string, rows: MonthlyRow[]): string {
  return toCsv([
    ['対象月', '社員番号', '氏名', '利用回数'],
    ...rows.map((r) => [month, r.empNo, r.name, r.count]),
  ]);
}
