import {useCallback, useEffect, useRef, useState} from "react";
import {fetchAlerts, markAlertRead, markAllAlertsRead} from "../lib/reminderApi";
import type {TaskAlert} from "../lib/reminders";
import {timeAgo} from "./ui";

interface Props {
  onOpen: (alert: TaskAlert) => void;
  onNotify: (text: string) => void;
}

export function AlertFeed({onOpen, onNotify}: Props) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<TaskAlert[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const known = useRef<Set<string> | null>(null);
  const timer = useRef<number | null>(null);
  const timerAt = useRef<number | null>(null);

  const load = useCallback(async (notify = false) => {
    try {
      const page = await fetchAlerts();
      if (notify && known.current) {
        const fresh = page.alerts.filter((item) => !known.current!.has(item.id));
        if (fresh.length) {
          onNotify(fresh.length === 1 ? `Reminder: ${fresh[0].taskTitle}` : `${fresh.length} new reminders`);
        }
      }
      known.current = new Set(page.alerts.map((item) => item.id));
      setAlerts(page.alerts);
      setNextCursor(page.nextCursor);
      setUnread(page.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load alerts.");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load(false);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 30000);
    const focus = () => void load(true);
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", focus);
    };
  }, [load]);

  useEffect(() => {
    const schedule = (event: Event) => {
      const at = Date.parse((event as CustomEvent<string>).detail);
      if (!Number.isFinite(at) || (timerAt.current && timerAt.current > Date.now() && timerAt.current <= at)) return;
      if (timer.current) window.clearTimeout(timer.current);
      timerAt.current = at;
      timer.current = window.setTimeout(() => {
        timerAt.current = null;
        void load(true);
      }, Math.max(0, at - Date.now()) + 1500);
    };
    window.addEventListener("chisel:reminder-saved", schedule);
    return () => {
      window.removeEventListener("chisel:reminder-saved", schedule);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load(false);
    const down = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open, load]);

  const read = async (alert: TaskAlert) => {
    if (!alert.readAt) {
      const at = new Date().toISOString();
      setAlerts((items) => items.map((item) => item.id === alert.id ? {...item, readAt: at} : item));
      setUnread((value) => Math.max(0, value - 1));
      void markAlertRead(alert.id).catch(() => void load(false));
    }
    setOpen(false);
    onOpen(alert);
  };

  const readAll = async () => {
    if (markingAll) return;
    const at = new Date().toISOString();
    setMarkingAll(true);
    setAlerts((items) => items.map((item) => ({...item, readAt: item.readAt ?? at})));
    setUnread(0);
    try {
      await markAllAlertsRead();
    } catch {
      void load(false);
    } finally {
      setMarkingAll(false);
    }
  };

  const more = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAlerts(nextCursor);
      setAlerts((items) => [...items, ...page.alerts.filter((item) => !items.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
      setUnread(page.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more alerts.");
    } finally {
      setLoadingMore(false);
    }
  };

  const unreadLabel = unread === 0 ? "You're all caught up" : `${unread} unread ${unread === 1 ? "reminder" : "reminders"}`;

  return (
    <div className="alert-feed-root" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`alert-bell${open ? " open" : ""}${unread ? " has-unread" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        aria-controls="alert-feed-panel"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BellIcon />
        {unread > 0 && <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section
          id="alert-feed-panel"
          className="alert-feed"
          role="dialog"
          aria-modal="false"
          aria-labelledby="alert-feed-title"
          aria-describedby="alert-feed-summary"
        >
          <header>
            <div className="alert-feed-heading">
              <span className="alert-feed-heading-icon" aria-hidden="true"><BellIcon /></span>
              <div>
                <h2 id="alert-feed-title">Reminders</h2>
                <p id="alert-feed-summary">{unreadLabel}</p>
              </div>
            </div>
            {unread > 0 && (
              <button type="button" className="alert-read-all" disabled={markingAll} onClick={() => void readAll()}>
                <CheckIcon />
                {markingAll ? "Marking…" : "Mark all read"}
              </button>
            )}
          </header>
          <div className="alert-feed-body">
            {error && (
              <div className="alert-feed-error" role="alert">
                <span aria-hidden="true">!</span>
                <div><strong>Alerts couldn’t refresh</strong><p>{error}</p></div>
                <button type="button" onClick={() => void load(false)}>Try again</button>
              </div>
            )}
            {loading ? (
              <div className="alert-feed-loading" role="status" aria-label="Loading alerts">
                {[0, 1, 2].map((item) => <AlertSkeleton key={item} />)}
              </div>
            ) : !alerts.length ? (
              <div className="alert-feed-empty">
                <span aria-hidden="true"><CheckIcon /></span>
                <strong>Nothing needs your attention</strong>
                <p>Task reminders will show up here when they’re due.</p>
              </div>
            ) : (
              <div className="alert-list" aria-label="Alert history">
                {alerts.map((alert) => (
                  <button
                    type="button"
                    className={`alert-item${alert.readAt ? "" : " unread"}`}
                    key={alert.id}
                    onClick={() => void read(alert)}
                  >
                    <span className="alert-item-icon" aria-hidden="true"><BellIcon /></span>
                    <span className="alert-item-copy">
                      <span className="alert-item-title-row">
                        <strong>{alert.taskTitle}</strong>
                        {!alert.readAt && <span className="alert-item-new">New</span>}
                      </span>
                      <span className="alert-item-context">{alert.projectTitle}<i aria-hidden="true">·</i>{alert.workspaceTitle}</span>
                      <time dateTime={alert.triggeredAt} title={new Date(alert.triggeredAt).toLocaleString()}>
                        {timeAgo(new Date(alert.triggeredAt).getTime())}
                      </time>
                    </span>
                    <ArrowIcon />
                  </button>
                ))}
              </div>
            )}
            {nextCursor && !loading && (
              <button type="button" className="alert-feed-more" disabled={loadingMore} onClick={() => void more()}>
                {loadingMore ? <><span className="alert-spinner" />Loading more…</> : "View earlier reminders"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function AlertSkeleton() {
  return <div className="alert-skeleton" aria-hidden="true"><span /><div><i /><i /><i /></div></div>;
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9.5 21h5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function ArrowIcon() {
  return <svg className="alert-item-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
}
