const { randomUUID } = require("node:crypto");

function createRoomStore({ maxMessagesPerRoom }) {
  const rooms = new Map();
  let nextMessageId = 1;

  function getRoom(name) {
    let room = rooms.get(name);
    if (!room) {
      room = { sockets: new Map(), messages: [] };
      rooms.set(name, room);
    }
    return room;
  }

  function publish(name, text, sender) {
    const room = getRoom(name);
    const message = {
      id: nextMessageId++,
      room: name,
      sender,
      message: text,
      sentAt: new Date().toISOString(),
    };
    room.messages.push(message);
    if (room.messages.length > maxMessagesPerRoom) room.messages.shift();

    const payload = JSON.stringify({ type: "message", ...message });
    for (const socket of room.sockets.values()) {
      if (socket.readyState === 1) socket.send(payload);
    }
    return message;
  }

  return {
    addSocket(name, socket) {
      const room = getRoom(name);
      const id = randomUUID();
      room.sockets.set(id, socket);
      return id;
    },
    removeSocket(name, id) {
      const room = rooms.get(name);
      if (!room) return;
      room.sockets.delete(id);
      if (room.sockets.size === 0 && room.messages.length === 0) rooms.delete(name);
    },
    publish,
    listAfter(name, id) {
      return (rooms.get(name)?.messages || []).filter((message) => message.id > id);
    },
  };
}

module.exports = { createRoomStore };
