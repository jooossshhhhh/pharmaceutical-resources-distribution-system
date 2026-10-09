const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/laroa/AppData/Roaming/com.prds.naga/prds.db');
const row1 = db.prepare("SELECT key, value FROM sync_metadata WHERE key LIKE 'passcode_%'").all();
row1.forEach(r => {
  const p = JSON.parse(r.value);
  console.log({
    key: r.key,
    userId: p.userId,
    email: p.email,
    role: p.profile?.role,
    hasSession: !!p.session,
    hasRefreshToken: !!p.session?.refresh_token,
    sessionUser: p.session?.user?.email
  });
});
