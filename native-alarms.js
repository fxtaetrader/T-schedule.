/* T Schedule - native alarm bridge. Does nothing in the browser/PWA.
   Inside the Android app it schedules REAL phone alarms (they ring even when the app is closed). */
(function () {
  var C = window.Capacitor;
  if (!C || !(C.isNativePlatform && C.isNativePlatform())) return;
  var LN = (C.Plugins && C.Plugins.LocalNotifications) || (C.registerPlugin && C.registerPlugin('LocalNotifications'));
  if (!LN) return;
  var DAYS = 14, MAX = 200, tm = null;
  function dk(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function load() { try { return JSON.parse(localStorage.getItem('tsched') || '{}'); } catch (e) { return {}; } }
  function ap(r, k, d) {
    if (r.rep !== 'once' && k < r.cr) return false;
    var w = d.getDay();
    return r.rep === 'daily' || (r.rep === 'weekdays' && w > 0 && w < 6) || (r.rep === 'weekends' && (w === 0 || w === 6)) || (r.rep === 'once' && r.date === k);
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2147483000 + 1; }
  function plan() {
    var S = load(), rem = S.rem || [], log = S.log || {}, out = [], seen = {}, now = Date.now();
    for (var i = 0; i < DAYS; i++) {
      var d = new Date(); d.setDate(d.getDate() + i); var k = dk(d);
      rem.forEach(function (r) {
        if (!ap(r, k, d) || (log[k] || {})[r.id]) return;
        (r.nf || []).forEach(function (n) {
          var p = String(n.t || r.time).split(':'), at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +p[0], +p[1], 0), id = hash(k + r.id + n.t);
          if (at.getTime() <= now + 5000 || seen[id]) return; seen[id] = 1;
          out.push({ id: id, title: '\u23F0 ' + r.title, body: (n.l || 'Time to start') + ' \u00B7 ' + n.t, schedule: { at: at, allowWhileIdle: true }, channelId: 'alarms', actionTypeId: 'ALARM', extra: { rid: r.id } });
        });
      });
    }
    out.sort(function (a, b) { return a.schedule.at - b.schedule.at; });
    return out.slice(0, MAX);
  }
  async function sync() {
    try {
      var pend = await LN.getPending(), old = (pend.notifications || []).filter(function (x) { return !(x.extra && x.extra.snooze); });
      if (old.length) await LN.cancel({ notifications: old.map(function (x) { return { id: x.id }; }) });
      var list = plan(); if (list.length) await LN.schedule({ notifications: list });
    } catch (e) {}
  }
  function later(rid, mins, title) {
    var at = new Date(Date.now() + mins * 60000);
    LN.schedule({ notifications: [{ id: hash('z' + Date.now() + rid), title: title, body: 'Snoozed reminder', schedule: { at: at, allowWhileIdle: true }, channelId: 'alarms', actionTypeId: 'ALARM', extra: { rid: rid, snooze: 1 } }] }).catch(function () {});
  }
  function onAction(e) {
    var n = e.notification || {}, rid = n.extra && n.extra.rid, a = e.actionId;
    if (!rid) return;
    if (a === 'done') { var tries = 0, t = setInterval(function () { if (window.act || ++tries > 20) { clearInterval(t); if (window.act) window.act('done', rid); } }, 300); }
    else if (a === 'snooze') later(rid, 5, n.title);
    else if (a === 'later') later(rid, 30, n.title);
  }
  async function init() {
    try {
      var p = await LN.checkPermissions(); if (p.display !== 'granted') await LN.requestPermissions();
      try { if (!localStorage.getItem('tsExact')) { localStorage.setItem('tsExact', '1'); var ex = await LN.checkExactNotificationSetting(); if (ex.exact_alarm !== 'granted') await LN.changeExactNotificationSetting(); } } catch (e) {}
      await LN.createChannel({ id: 'alarms', name: 'Alarms', description: 'T Schedule reminder alarms', importance: 5, visibility: 1, vibration: true, lights: true });
      await LN.registerActionTypes({ types: [{ id: 'ALARM', actions: [{ id: 'done', title: 'Done' }, { id: 'snooze', title: 'Snooze' }, { id: 'later', title: 'Later' }] }] });
      LN.addListener('localNotificationActionPerformed', onAction);
    } catch (e) {}
    sync();
  }
  var si = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k) { si.apply(this, arguments); if (k === 'tsched') { clearTimeout(tm); tm = setTimeout(sync, 1500); } };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  init();
})();
