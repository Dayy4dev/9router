import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const store = read("src/store/taskStore.js");
const toast = read("src/shared/components/NotifToast.js");
const bell = read("src/shared/components/NotificationBell.js");
const route = read("src/app/api/notifications/route.js");
const repo = read("src/lib/db/repos/notificationsRepo.js");
const proxyPage = read("src/app/(dashboard)/dashboard/proxy-pools/page.js");

describe("finished work is announced, not swallowed", () => {
  it("finish() parks the row as done instead of deleting it", () => {
    // The bell used to go empty the instant an import ended, so nothing ever
    // said the run landed. Removing the row is no longer the mechanism.
    const finish = store.slice(store.indexOf("finish(id)"), store.indexOf("dismiss(id)"));
    expect(finish).toContain('state: "done"');
    expect(finish).not.toMatch(/tasks:\s*s\.tasks\.filter/);
  });

  it("a finished row retires itself on a bounded timer", () => {
    expect(store).toContain("DONE_TTL_MS");
    expect(store).toMatch(/setTimeout\([\s\S]{0,220}DONE_TTL_MS/);
    // Retiring must not cancel a run that restarted inside the window.
    expect(store).toMatch(/task && task\.state === "done"/);
  });

  it("dismiss() is the one path that drops a row outright", () => {
    expect(store).toMatch(/dismiss\(id\)\s*\{[\s\S]{0,120}filter/);
  });

  it("a page seeding its state from the store ignores retired rows", () => {
    // proxy-pools asks the store whether an import is in flight; a row parked
    // as `done` would have made a finished import read as still running.
    expect(proxyPage).toContain('t.state !== "done"');
  });
});

describe("the bell marks a completed run as completed", () => {
  it("relabels the section when nothing is running any more", () => {
    expect(toast).toContain('"Running in background" : "Completed"');
  });

  it("renders a finished row in the success tone, with a check", () => {
    expect(toast).toContain('"check_circle" : "progress_activity"');
    expect(toast).toContain('"bg-success" : "bg-primary"');
    expect(toast).toContain('"text-success" : "text-text-muted"');
  });

  it("sorts finished rows below work still in flight", () => {
    expect(toast).toMatch(/sort\(\s*\(a, b\) => Number\(a\.state === "done"\)/);
  });

  it("counts only in-flight rows as running for the dot and label", () => {
    expect(bell).toContain('live.filter((t) => t.state !== "done").length');
  });
});

describe("the bell carries a running indicator", () => {
  it("shows a green dot on the trigger while anything runs", () => {
    expect(bell).toContain("absolute -top-1.5 -right-1.5 size-1.5 rounded-full bg-success");
  });

  it("leaves the badge formula alone - the dot is additive", () => {
    expect(bell).toContain("const badge = unread + live.length");
  });
});

describe("per-item actions reach the feed", () => {
  it("the route accepts a bare id for a dismissed row", () => {
    expect(route).toContain("clearNotificationById");
    expect(route).toMatch(/if \(body\.id\) await clearNotificationById/);
  });

  it("dismissal is soft so a still-true condition is announced again", () => {
    const fn = repo.slice(repo.indexOf("clearNotificationById"), repo.indexOf("getUnreadCount"));
    expect(fn).toContain("clearedAt = ?");
    // The dedupe row is kept, not dropped, so notify() can find it again.
    expect(fn).not.toMatch(/DELETE FROM notifications/);
  });

  it("offers both controls on every notice row", () => {
    expect(bell).toContain("markReadOne(n)");
    expect(bell).toContain("dismissOne(n)");
    expect(bell).toContain('action: "clear", id: n.id');
  });
});
