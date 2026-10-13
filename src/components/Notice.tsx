export interface NoticeState {
  kind: 'ok' | 'err';
  text: string;
}

export default function Notice({ n }: { n: NoticeState | null }) {
  if (!n) return null;
  return (
    <div className={`notice ${n.kind}`} role="status">
      {n.text}
    </div>
  );
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
