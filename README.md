diff --git a/README.md b/README.md
index 972966b6c02a723df4a1709789476ab7de30baf1..2922837a103ff20f3abcc6a2d5f029ccb17a65da 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,55 @@
-# RAMTALK
\ No newline at end of file
+# RAMTALK
+
+A starter app that demonstrates the core flow you asked for:
+
+- **Reels feed** (Instagram-style short videos)
+- **Private chat** (WhatsApp-like messaging)
+- **Silent delete behavior** (when a user deletes a message for themselves, the other person gets **no deletion notification**)
+- **Voice + video calling** using WebRTC signaling over Socket.IO
+
+> This is an MVP starter architecture and codebase you can extend to production with auth, persistence, moderation, encryption, and scaling.
+
+## Tech stack
+
+- Node.js + Express
+- Socket.IO (real-time chat + call signaling)
+- Vanilla HTML/CSS/JS frontend
+- WebRTC for media calls
+
+## Quick start
+
+```bash
+npm install
+npm start
+```
+
+Open `http://localhost:3000` in 2 browser tabs (or 2 devices), join as different user IDs, then test reels/chat/calls.
+
+## Silent-delete behavior
+
+In this implementation, deleting a message is "delete for me" only:
+
+- Message is hidden for the deleting user.
+- Server only emits `chat:sync-needed` to the deleting user.
+- No `message deleted` event is sent to the peer.
+
+This avoids "This message was deleted" notifications to the other person.
+
+## Production hardening checklist
+
+1. **Authentication & identity**
+   - Replace plain userId input with JWT/session auth.
+2. **Database layer**
+   - Move in-memory stores to PostgreSQL + Redis.
+3. **Media pipeline**
+   - Store uploaded reels in S3-compatible storage with transcoding.
+4. **WebRTC reliability**
+   - Add TURN servers for NAT traversal.
+5. **Privacy and safety**
+   - Add abuse reporting, block lists, and legal compliance.
+6. **Scalability**
+   - Use Socket.IO Redis adapter + horizontal scaling.
+
+## Important note
+
+If you plan to hide deletion signals, make sure your product terms clearly explain data/deletion behavior and comply with local regulations.
