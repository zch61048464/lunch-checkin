import QRCode from 'qrcode';

const PREFIX = 'LUNCH:';

/** 二维码内容：只含员工内部 ID，越短越好扫 */
export const makePayload = (employeeId: string) => PREFIX + employeeId;

export function parsePayload(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith(PREFIX)) return null;
  const id = t.slice(PREFIX.length);
  return /^[0-9a-z]{6,32}$/.test(id) ? id : null;
}

/** 生成可打印的二维码图片（PNG，下方印工号 + 姓名），返回 Blob */
export async function makeQrImage(employeeId: string, empNo: string, name: string): Promise<Blob> {
  const W = 640;
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, makePayload(employeeId), {
    width: 560,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 760;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(qr, (W - 560) / 2, 20, 560, 560);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.font = 'bold 56px -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  g.fillText(name, W / 2, 650, W - 40);
  g.font = '40px -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  g.fillStyle = '#444';
  g.fillText(`社員番号 ${empNo}`, W / 2, 710, W - 40);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像の作成に失敗しました'))), 'image/png'));
}
