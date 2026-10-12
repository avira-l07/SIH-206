import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
export default function NotificationInbox() {
  const { user } = useAuth(), { socket } = useSocket();
  const [open, setOpen] = useState(false), [items, setItems] = useState([]), [unread, setUnread] = useState(0), [cursor, setCursor] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const dialog = useRef(null), generation = useRef(0);
  useEffect(() => {
    let cancelled = false, timer, requestNumber = 0;
    const version = ++generation.current;
    const load = async () => {
      const currentRequest = ++requestNumber;
      try { const { data } = await api.get('/notifications'); if (!cancelled && currentRequest === requestNumber && version === generation.current) { setItems(data.notifications); setUnread(data.unreadCount); setCursor(data.nextCursor); setError(''); } }
      catch { if (!cancelled && currentRequest === requestNumber) setError('Could not refresh your inbox.'); }
      finally { if (!cancelled && currentRequest === requestNumber) setLoading(false); }
    };
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 200); };
    load(); socket?.on('inbox:changed', refresh); socket?.on('connect', refresh); window.addEventListener('online', refresh);
    const poll = setInterval(load, 60000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(poll); socket?.off('inbox:changed', refresh); socket?.off('connect', refresh); window.removeEventListener('online', refresh); };
  }, [user.id, user.trusted, socket, revision]);
  useEffect(() => { const modal = dialog.current; if (open) modal.showModal(); return () => { if (modal?.open) modal.close(); }; }, [open]);
  const act = async (path) => { setBusy(true); try { await api.patch(path, {}); setRevision(v => v + 1); } catch { setError('Could not mark messages read.'); } finally { setBusy(false); } };
  const older = async () => {
    setBusy(true); const version = generation.current;
    try { const { data } = await api.get('/notifications', { params: { before: cursor } }); if (version === generation.current) { setItems(prev => [...prev, ...data.notifications.filter(n => !prev.some(p => p.id === n.id))]); setCursor(data.nextCursor); } }
    catch { setError('Could not load older messages.'); } finally { setBusy(false); }
  };
  return <><button onClick={() => setOpen(true)} aria-label={`Activity inbox, ${unread} unread`} className="rounded-lg border px-2 py-2 text-sm">Inbox{unread > 0 && <span className="ml-1 rounded bg-[#B23A2E] text-white px-1 text-xs">{unread > 99 ? '99+' : unread}</span>}</button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} aria-labelledby="inbox-title" className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-xl border border-[#D8D3C7] bg-white p-5 text-[#14231F] backdrop:bg-black/50"><div className="flex justify-between gap-3"><h2 id="inbox-title" className="text-lg font-bold">Activity inbox</h2><button onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Close inbox</button></div><div className="flex flex-wrap gap-3 mt-3"><button disabled={busy || unread === 0} onClick={() => act('/notifications/read-all')} className="text-sm underline disabled:opacity-40">Mark all read</button><button onClick={() => setRevision(v => v + 1)} className="text-sm underline">Refresh inbox</button></div>{error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}<div className="space-y-3 mt-4">{loading && <p className="text-sm opacity-60">Loading your inbox…</p>}{!loading && items.length === 0 && <p className="text-sm opacity-60">No activity messages yet.</p>}{items.map(item => <article key={item.id} className={`rounded-lg border p-3 ${item.readAt ? 'opacity-65' : 'bg-[#F6F4EF]'}`}><p className="text-sm font-semibold break-words">{item.title}</p><p className="text-xs opacity-60 mt-1">{new Date(item.createdAt).toLocaleString()}</p>{!item.readAt && <button disabled={busy} onClick={() => act(`/notifications/${item.id}/read`)} className="mt-2 text-xs underline">Mark read</button>}</article>)}</div>{cursor && <button disabled={busy} onClick={older} className="mt-4 text-sm underline">Load older messages</button>}</dialog>
  </>;
}
