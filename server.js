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
  
