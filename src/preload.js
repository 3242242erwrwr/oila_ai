const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('familyApi', {
  getMembers: () => ipcRenderer.invoke('members:get'),
  getHome: () => ipcRenderer.invoke('home:get'),
  getBotStatus: () => ipcRenderer.invoke('bot:status'),
  sendRoomAction: (payload) => ipcRenderer.invoke('room:action', payload),
  onMembers: on('members:update'),
  onHome: on('home:update'),
  onMoved: on('member:moved'),
  onJoined: on('member:joined'),
  onSay: on('member:say'),
  onBotStatus: on('bot:status'),
});
