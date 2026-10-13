/** 触发浏览器下载（iPad Safari 会保存到"文件"App 的下载项） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const textBlob = (text: string, type: string) => new Blob([text], { type });

/** 系统分享面板（可直接"存储到文件"或发送到 Google Drive）；不支持时返回 false */
export function canShareFiles(): boolean {
  try {
    const f = new File(['x'], 'x.txt', { type: 'text/plain' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

export async function shareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  try {
    await navigator.share({ files: [file], title: filename });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // 用户取消
    throw e;
  }
}
