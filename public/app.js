public/app.js
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
                                              
