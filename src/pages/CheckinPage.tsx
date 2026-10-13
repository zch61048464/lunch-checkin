import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { checkIn, countByDate, listCheckinsByDate, type Checkin } from '../lib/db';
import { fmtDate, fmtTime, localDate } from '../lib/date';
import { parsePayload } from '../lib/qr';
import { playSound, unlockSound } from '../lib/sound';

type Msg = { kind: 'idle' | 'ok' | 'dup' | 'err'; title: string; sub?: string };
const IDLE: Msg = { kind: 'idle', title: 'QRコードをカメラにかざしてください' };
const SCAN_INTERVAL_MS = 90;
const SAME_CODE_MS = 4000; // 同一张码持续停留在镜头前，不重复处理
const MSG_MS = 3000;

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'カメラの使用が許可されていません。iPadの「設定」→「Safari」→「カメラ」を「確認」または「許可」に変更し、もう一度「スキャン開始」を押してください。';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '使用できるカメラが見つかりません。';
  if (name === 'NotReadableError') return 'カメラが他のアプリで使用されています。他のアプリやタブを閉じてからやり直してください。';
  if (!navigator.mediaDevices?.getUserMedia) return 'この環境ではカメラを使用できません（https で開く必要があります）。';
  return 'カメラを起動できません：' + (e instanceof Error ? e.message : String(e));
}

export default function CheckinPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const wantScan = useRef(false);
  const busy = useRef(false);
  const last = useRef({ code: '', t: 0 });
  const msgTimer = useRef<number>(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const facing = useRef<'environment' | 'user'>('environment');

  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<Msg>(IDLE);
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<Checkin[]>([]);
  const [front, setFront] = useState(false);

  const refresh = useCallback(async () => {
    const today = localDate();
    setCount(await countByDate(today));
    setRecent((await listCheckinsByDate(today)).slice(-8).reverse());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const show = useCallback((m: Msg) => {
    setMsg(m);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(IDLE), MSG_MS);
  }, []);

  const handleCode = useCallback(
    async (raw: string) => {
      const now = Date.now();
      if (raw === last.current.code && now - last.current.t < SAME_CODE_MS) {
        last.current.t = now;
        return;
      }
      last.current = { code: raw, t: now };
      busy.current = true;
      try {
        const id = parsePayload(raw);
        if (!id) {
          playSound('err');
          show({ kind: 'err', title: '無効なQRコードです', sub: 'このシステムで発行した社員用QRコードをご使用ください' });
          return;
        }
        const r = await checkIn(id);
        if (r.status === 'ok') {
          playSound('ok');
          show({ kind: 'ok', title: `受付完了：${r.checkin.name}さん`, sub: `社員番号 ${r.checkin.empNo} ・ ${fmtTime(r.checkin.time)}` });
          void refresh();
        } else if (r.status === 'duplicate') {
          playSound('dup');
          show({
            kind: 'dup',
            title: '本日は受付済みです',
            sub: `${r.checkin.name}さん（社員番号 ${r.checkin.empNo}）・ ${fmtTime(r.checkin.time)}`,
          });
        } else {
          playSound('err');
          show({ kind: 'err', title: '社員が見つかりません', sub: '削除された社員の可能性があります。管理者にご確認ください' });
        }
      } catch (e) {
        playSound('err');
        show({ kind: 'err', title: '保存できませんでした', sub: e instanceof Error ? e.message : String(e) });
      } finally {
        busy.current = false;
      }
    },
    [refresh, show],
  );

  const stopStream = useCallback(() => {
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const tick = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !streamRef.current) return;
    timerRef.current = window.setTimeout(tick, SCAN_INTERVAL_MS);
    if (busy.current || v.readyState < 2 || !v.videoWidth) return;
    const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(v, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code?.data) void handleCode(code.data);
  }, [handleCode]);

  const openStream = useCallback(async () => {
    stopStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing.current }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    streamRef.current = stream;
    const v = videoRef.current!;
    v.srcObject = stream;
    await v.play();
    tick();
  }, [stopStream, tick]);

  const keepAwake = useCallback(async () => {
    try {
      wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      /* 不支持就算了 */
    }
  }, []);

  const start = async () => {
    unlockSound(); // 必须在点击中调用，之后才允许自动播放提示音
    setError('');
    try {
      wantScan.current = true;
      await openStream();
      setScanning(true);
      setMsg(IDLE);
      void keepAwake();
    } catch (e) {
      wantScan.current = false;
      stopStream();
      setScanning(false);
      setError(cameraError(e));
    }
  };

  const stop = useCallback(() => {
    wantScan.current = false;
    stopStream();
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    setScanning(false);
  }, [stopStream]);

  const flip = async () => {
    facing.current = facing.current === 'environment' ? 'user' : 'environment';
    setFront(facing.current === 'user');
    if (!wantScan.current) return;
    try {
      await openStream();
    } catch (e) {
      stop();
      setError(cameraError(e));
    }
  };

  // 切到后台时 iOS 会冻结摄像头，回到前台时自动恢复
  useEffect(() => {
    const onVis = async () => {
      if (document.hidden) {
        stopStream();
      } else if (wantScan.current) {
        try {
          await openStream();
          void keepAwake();
        } catch (e) {
          stop();
          setError(cameraError(e));
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [openStream, stopStream, stop, keepAwake]);

  // 离开页面时关闭摄像头
  useEffect(
    () => () => {
      wantScan.current = false;
      window.clearTimeout(msgTimer.current);
      stopStream();
      void wakeLock.current?.release().catch(() => {});
    },
    [stopStream],
  );

  return (
    <main className="checkin">
      <section className={`viewer ${msg.kind}`}>
        <video ref={videoRef} playsInline muted autoPlay className={front ? 'mirror' : ''} />
        <canvas ref={canvasRef} hidden />
        {!scanning && (
          <div className="viewer-idle">
            <button className="big primary" onClick={start}>
              スキャン開始
            </button>
            <p>ボタンを押し、カメラの使用を許可してください</p>
          </div>
        )}
        {scanning && <div className="frame" />}
      </section>

      <section className="side">
        <div className={`banner ${msg.kind}`} role="status" aria-live="polite">
          <div className="banner-title">{msg.kind === 'ok' ? `✓ ${msg.title}` : msg.title}</div>
          {msg.sub && <div className="banner-sub">{msg.sub}</div>}
        </div>

        {error && <div className="notice err">{error}</div>}

        <div className="stat">
          <span>本日の利用人数</span>
          <b>{count}<small>名</small></b>
        </div>

        <div className="actions">
          {scanning && (
            <button className="big" onClick={stop}>
              スキャン停止
            </button>
          )}
          <button onClick={flip}>カメラ切替（前面/背面）</button>
          <button onClick={() => { unlockSound(); playSound('ok'); }}>音を確認</button>
        </div>

        <h2>直近の受付（{fmtDate(localDate())}）</h2>
        <ul className="recent">
          {recent.length === 0 && <li className="muted">本日の受付はまだありません</li>}
          {recent.map((r) => (
            <li key={r.id}>
              <span className="t">{fmtTime(r.time)}</span>
              <span>{r.name}</span>
              <span className="muted">{r.empNo}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
