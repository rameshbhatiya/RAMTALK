 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
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
diff --git a/package.json b/package.json
new file mode 100644
index 0000000000000000000000000000000000000000..bbcb14e8f5096e30791dced8960bad17607bc995
--- /dev/null
+++ b/package.json
@@ -0,0 +1,14 @@
+{
+  "name": "ramtalk",
+  "version": "1.0.0",
+  "description": "Reels + private chat + voice/video call starter app",
+  "main": "server.js",
+  "scripts": {
+    "start": "node server.js"
+  },
+  "dependencies": {
+    "express": "^4.19.2",
+    "socket.io": "^4.7.5",
+    "uuid": "^9.0.1"
+  }
+}
diff --git a/public/app.js b/public/app.js
new file mode 100644
index 0000000000000000000000000000000000000000..9b0e628c186f71c205ae52609d764cf16db34b45
--- /dev/null
+++ b/public/app.js
@@ -0,0 +1,184 @@
+const socket = io();
+
+let myUserId = '';
+let peerId = '';
+let currentMessages = [];
+let localStream;
+let pc;
+
+const rtcConfig = {
+  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
+};
+
+const reelsEl = document.getElementById('reels');
+const messagesEl = document.getElementById('messages');
+const myUserInput = document.getElementById('myUserId');
+const peerInput = document.getElementById('peerId');
+const messageInput = document.getElementById('messageInput');
+const localVideo = document.getElementById('localVideo');
+const remoteVideo = document.getElementById('remoteVideo');
+
+document.getElementById('joinBtn').onclick = () => {
+  myUserId = myUserInput.value.trim();
+  if (!myUserId) return alert('Enter your user id');
+  socket.emit('auth:join', { userId: myUserId });
+  alert(`Joined as ${myUserId}`);
+};
+
+document.getElementById('loadChatBtn').onclick = () => {
+  peerId = peerInput.value.trim();
+  if (!myUserId || !peerId) return alert('Join first and enter peer user id');
+  loadConversation();
+};
+
+document.getElementById('sendBtn').onclick = () => {
+  const text = messageInput.value.trim();
+  if (!text || !myUserId || !peerId) return;
+  socket.emit('chat:send', { from: myUserId, to: peerId, text });
+  messageInput.value = '';
+};
+
+document.getElementById('voiceCallBtn').onclick = () => startCall(false);
+document.getElementById('videoCallBtn').onclick = () => startCall(true);
+document.getElementById('endCallBtn').onclick = endCall;
+
+socket.on('chat:message', () => {
+  if (!myUserId || !peerId) return;
+  loadConversation();
+});
+
+socket.on('chat:sync-needed', () => {
+  if (!myUserId || !peerId) return;
+  loadConversation();
+});
+
+socket.on('call:offer', async ({ from, offer, video }) => {
+  peerId = from;
+  peerInput.value = from;
+
+  await setupPeerConnection(video);
+  await pc.setRemoteDescription(new RTCSessionDescription(offer));
+  const answer = await pc.createAnswer();
+  await pc.setLocalDescription(answer);
+
+  socket.emit('call:answer', { from: myUserId, to: from, answer });
+});
+
+socket.on('call:answer', async ({ answer }) => {
+  await pc.setRemoteDescription(new RTCSessionDescription(answer));
+});
+
+socket.on('call:ice-candidate', async ({ candidate }) => {
+  if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
+});
+
+socket.on('call:end', () => {
+  cleanupCall();
+});
+
+async function loadReels() {
+  const reels = await fetch('/api/reels').then((r) => r.json());
+  reelsEl.innerHTML = '';
+
+  reels.forEach((reel) => {
+    const container = document.createElement('div');
+    container.className = 'reel';
+    container.innerHTML = `
+      <video controls loop src="${reel.mediaUrl}"></video>
+      <p><strong>@${reel.author}</strong> ${reel.caption}</p>
+    `;
+    reelsEl.appendChild(container);
+  });
+}
+
+async function loadConversation() {
+  currentMessages = await fetch(`/api/chats/${myUserId}/${peerId}`).then((r) => r.json());
+  renderMessages();
+}
+
+function renderMessages() {
+  messagesEl.innerHTML = '';
+  currentMessages.forEach((msg) => {
+    const li = document.createElement('li');
+    li.className = 'message';
+    li.innerHTML = `
+      <div><strong>${msg.from}</strong>: ${msg.text}</div>
+      <small>${new Date(msg.sentAt).toLocaleTimeString()}</small>
+      <br />
+    `;
+
+    const deleteBtn = document.createElement('button');
+    deleteBtn.textContent = 'Delete for me';
+    deleteBtn.onclick = async () => {
+      await fetch(`/api/chats/${msg.id}`, {
+        method: 'DELETE',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ viewerId: myUserId })
+      });
+      await loadConversation();
+    };
+
+    li.appendChild(deleteBtn);
+    messagesEl.appendChild(li);
+  });
+}
+
+async function startCall(video) {
+  peerId = peerInput.value.trim();
+  if (!myUserId || !peerId) return alert('Join first and enter peer user id');
+
+  await setupPeerConnection(video);
+  const offer = await pc.createOffer();
+  await pc.setLocalDescription(offer);
+
+  socket.emit('call:offer', { from: myUserId, to: peerId, offer, video });
+}
+
+async function setupPeerConnection(video) {
+  cleanupCall();
+
+  localStream = await navigator.mediaDevices.getUserMedia({
+    video,
+    audio: true
+  });
+
+  localVideo.srcObject = localStream;
+
+  pc = new RTCPeerConnection(rtcConfig);
+
+  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
+
+  pc.ontrack = (event) => {
+    const [stream] = event.streams;
+    remoteVideo.srcObject = stream;
+  };
+
+  pc.onicecandidate = ({ candidate }) => {
+    if (!candidate) return;
+    socket.emit('call:ice-candidate', { from: myUserId, to: peerId, candidate });
+  };
+}
+
+function endCall() {
+  if (myUserId && peerId) {
+    socket.emit('call:end', { from: myUserId, to: peerId });
+  }
+  cleanupCall();
+}
+
+function cleanupCall() {
+  if (pc) {
+    pc.close();
+    pc = null;
+  }
+
+  if (localStream) {
+    localStream.getTracks().forEach((track) => track.stop());
+    localStream = null;
+  }
+
+  localVideo.srcObject = null;
+  remoteVideo.srcObject = null;
+}
+
+loadReels();
diff --git a/public/index.html b/public/index.html
new file mode 100644
index 0000000000000000000000000000000000000000..b6815e685b7f81912a64b5695a5b9a3b42b2ff29
--- /dev/null
+++ b/public/index.html
@@ -0,0 +1,64 @@
+<!doctype html>
+<html lang="en">
+  <head>
+    <meta charset="UTF-8" />
+    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
+    <title>RAMTALK</title>
+    <link rel="stylesheet" href="styles.css" />
+  </head>
+  <body>
+    <header>
+      <h1>RAMTALK</h1>
+      <p>Reels + private chat + voice/video calls</p>
+    </header>
+
+    <main>
+      <section class="card">
+        <h2>1) Login</h2>
+        <div class="row">
+          <input id="myUserId" placeholder="Your user id (e.g., alex)" />
+          <button id="joinBtn">Join</button>
+        </div>
+      </section>
+
+      <section class="grid">
+        <article class="card">
+          <h2>2) Reels feed</h2>
+          <div id="reels" class="reels"></div>
+        </article>
+
+        <article class="card">
+          <h2>3) Chat</h2>
+          <div class="row">
+            <input id="peerId" placeholder="Chat with user id" />
+            <button id="loadChatBtn">Load Chat</button>
+          </div>
+          <ul id="messages" class="messages"></ul>
+          <div class="row">
+            <input id="messageInput" placeholder="Type a message" />
+            <button id="sendBtn">Send</button>
+          </div>
+          <small>
+            Deleting a message only syncs your own inbox. No delete notification is sent to the other person.
+          </small>
+        </article>
+      </section>
+
+      <section class="card">
+        <h2>4) Voice / Video Call</h2>
+        <div class="row">
+          <button id="voiceCallBtn">Start Voice Call</button>
+          <button id="videoCallBtn">Start Video Call</button>
+          <button id="endCallBtn">End Call</button>
+        </div>
+        <div class="video-grid">
+          <video id="localVideo" autoplay muted playsinline></video>
+          <video id="remoteVideo" autoplay playsinline></video>
+        </div>
+      </section>
+    </main>
+
+    <script src="/socket.io/socket.io.js"></script>
+    <script src="app.js"></script>
+  </body>
+</html>
diff --git a/public/styles.css b/public/styles.css
new file mode 100644
index 0000000000000000000000000000000000000000..fb02b081b5c31d03b92168b520108025ef823031
--- /dev/null
+++ b/public/styles.css
@@ -0,0 +1,109 @@
+:root {
+  color-scheme: dark;
+  --bg: #111827;
+  --card: #1f2937;
+  --muted: #9ca3af;
+  --text: #f3f4f6;
+  --accent: #22c55e;
+}
+
+body {
+  margin: 0;
+  font-family: Inter, system-ui, -apple-system, sans-serif;
+  background: linear-gradient(160deg, #0b1220, var(--bg));
+  color: var(--text);
+}
+
+header,
+main {
+  max-width: 1000px;
+  margin: 0 auto;
+  padding: 1rem;
+}
+
+.card {
+  background: var(--card);
+  border-radius: 14px;
+  padding: 1rem;
+  margin-bottom: 1rem;
+}
+
+.grid {
+  display: grid;
+  gap: 1rem;
+  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
+}
+
+.row {
+  display: flex;
+  gap: 0.5rem;
+  margin-bottom: 0.75rem;
+}
+
+input,
+button {
+  border-radius: 10px;
+  border: 1px solid #374151;
+  padding: 0.55rem 0.7rem;
+  background: #111827;
+  color: var(--text);
+}
+
+button {
+  background: var(--accent);
+  color: #052e16;
+  font-weight: 700;
+  cursor: pointer;
+}
+
+.reels {
+  max-height: 400px;
+  overflow-y: auto;
+  display: grid;
+  gap: 0.75rem;
+}
+
+.reel video {
+  width: 100%;
+  border-radius: 10px;
+}
+
+.messages {
+  list-style: none;
+  padding: 0;
+  margin: 0 0 0.75rem;
+  max-height: 300px;
+  overflow-y: auto;
+  display: grid;
+  gap: 0.4rem;
+}
+
+.message {
+  border: 1px solid #374151;
+  padding: 0.55rem;
+  border-radius: 10px;
+}
+
+.message button {
+  margin-top: 0.4rem;
+  font-size: 0.75rem;
+  background: #ef4444;
+  color: white;
+}
+
+small {
+  color: var(--muted);
+}
+
+.video-grid {
+  display: grid;
+  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
+  gap: 0.75rem;
+}
+
+video {
+  width: 100%;
+  min-height: 160px;
+  border-radius: 10px;
+  background: #000;
+}
diff --git a/server.js b/server.js
new file mode 100644
index 0000000000000000000000000000000000000000..7b808f23be0a9ca8a95228b0100c7aa331b851bf
--- /dev/null
+++ b/server.js
@@ -0,0 +1,145 @@
+const express = require('express');
+const http = require('http');
+const path = require('path');
+const { Server } = require('socket.io');
+const { v4: uuid } = require('uuid');
+
+const app = express();
+const server = http.createServer(app);
+const io = new Server(server);
+
+app.use(express.json());
+app.use(express.static(path.join(__dirname, 'public')));
+
+const reels = [
+  {
+    id: 'r1',
+    author: 'alex',
+    caption: 'Morning ride 🚴',
+    mediaUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
+  },
+  {
+    id: 'r2',
+    author: 'sam',
+    caption: 'City sunset 🌆',
+    mediaUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'
+  }
+];
+
+const messages = [];
+const onlineUsers = new Map();
+
+app.get('/api/reels', (_req, res) => {
+  res.json(reels);
+});
+
+app.get('/api/chats/:userA/:userB', (req, res) => {
+  const { userA, userB } = req.params;
+
+  const conversation = messages
+    .filter((m) => {
+      const participantsMatch =
+        (m.from === userA && m.to === userB) ||
+        (m.from === userB && m.to === userA);
+      const isDeletedForViewer = m.deletedFor.has(userA);
+      return participantsMatch && !isDeletedForViewer;
+    })
+    .map((m) => ({
+      id: m.id,
+      from: m.from,
+      to: m.to,
+      text: m.text,
+      sentAt: m.sentAt
+    }));
+
+  res.json(conversation);
+});
+
+app.delete('/api/chats/:messageId', (req, res) => {
+  const { messageId } = req.params;
+  const { viewerId } = req.body;
+
+  if (!viewerId) {
+    return res.status(400).json({ error: 'viewerId is required' });
+  }
+
+  const message = messages.find((m) => m.id === messageId);
+
+  if (!message) {
+    return res.status(404).json({ error: 'Message not found' });
+  }
+
+  message.deletedFor.add(viewerId);
+
+  // Intentionally notify only the requester to avoid "message deleted" notifications.
+  io.to(viewerId).emit('chat:sync-needed');
+
+  return res.status(204).send();
+});
+
+io.on('connection', (socket) => {
+  socket.on('auth:join', ({ userId }) => {
+    if (!userId) {
+      return;
+    }
+    onlineUsers.set(userId, socket.id);
+    socket.join(userId);
+  });
+
+  socket.on('chat:send', ({ from, to, text }) => {
+    if (!from || !to || !text?.trim()) {
+      return;
+    }
+
+    const message = {
+      id: uuid(),
+      from,
+      to,
+      text: text.trim(),
+      sentAt: new Date().toISOString(),
+      deletedFor: new Set()
+    };
+
+    messages.push(message);
+
+    const payload = {
+      id: message.id,
+      from: message.from,
+      to: message.to,
+      text: message.text,
+      sentAt: message.sentAt
+    };
+
+    io.to(from).to(to).emit('chat:message', payload);
+  });
+
+  socket.on('call:offer', ({ from, to, offer, video }) => {
+    io.to(to).emit('call:offer', { from, offer, video });
+  });
+
+  socket.on('call:answer', ({ from, to, answer }) => {
+    io.to(to).emit('call:answer', { from, answer });
+  });
+
+  socket.on('call:ice-candidate', ({ from, to, candidate }) => {
+    io.to(to).emit('call:ice-candidate', { from, candidate });
+  });
+
+  socket.on('call:end', ({ from, to }) => {
+    io.to(to).emit('call:end', { from });
+  });
+
+  socket.on('disconnect', () => {
+    for (const [userId, socketId] of onlineUsers.entries()) {
+      if (socketId === socket.id) {
+        onlineUsers.delete(userId);
+        break;
+      }
+    }
+  });
+});
+
+const PORT = process.env.PORT || 3000;
+server.listen(PORT, () => {
+  console.log(`RAMTALK listening on http://localhost:${PORT}`);
+});
 
EOF
)
