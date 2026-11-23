// Messaging between the editor and projector outputs.
// Same device: BroadcastChannel (window.postMessage fallback).
// Other screens: Presentation API connection (JSON + binary for media).

export const CHANNEL_NAME = 'luzmap-sync-v1';

export class Link {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.peers = new Set();
    this.bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel(CHANNEL_NAME);
        this.bc.onmessage = (e) => this._receive(e.data, 'bc');
      } catch (_) {
        this.bc = null;
      }
    }
    if (!this.bc) {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.__luzmap) this._receive(e.data.msg, 'pm', e.source);
      });
    }
    this.connections = new Set();
  }

  get transportName() {
    return this.bc ? 'BroadcastChannel' : 'postMessage';
  }

  _receive(msg, via, source) {
    if (!msg || typeof msg !== 'object') return;
    if (source && !this.bc) this.peers.add(source);
    this.onMessage(msg, via);
  }

  addPeer(win) {
    if (win) this.peers.add(win);
  }

  send(msg) {
    if (this.bc) {
      try {
        this.bc.postMessage(msg);
      } catch (err) {
        console.warn('Falha ao enviar mensagem', err);
      }
    } else {
      for (const w of this.peers) {
        try {
          if (w.closed) this.peers.delete(w);
          else w.postMessage({ __luzmap: true, msg }, location.origin);
        } catch (_) {
          this.peers.delete(w);
        }
      }
    }
    for (const c of this.connections) c.__queue = (c.__queue || Promise.resolve()).then(() => sendOverConnection(c, msg));
  }

  /** Attach a PresentationConnection (2-screen mode). */
  attachConnection(conn) {
    this.connections.add(conn);
    let pendingMedia = null;
    conn.binaryType = 'arraybuffer';
    conn.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch (_) {
          return;
        }
        if (msg.type === 'mediaHeader') {
          pendingMedia = msg;
          return;
        }
        this.onMessage(msg, 'presentation');
      } else if (pendingMedia) {
        const blob = new Blob([e.data], { type: pendingMedia.info?.mime || '' });
        this.onMessage({ type: 'media', id: pendingMedia.id, info: pendingMedia.info, blob }, 'presentation');
        pendingMedia = null;
      }
    });
    const drop = () => this.connections.delete(conn);
    conn.addEventListener('close', drop);
    conn.addEventListener('terminate', drop);
  }
}

async function sendOverConnection(conn, msg) {
  if (conn.state !== 'connected') return;
  try {
    if (msg.type === 'media' && msg.blob) {
      const { blob, ...rest } = msg;
      const buf = await blob.arrayBuffer();
      conn.send(JSON.stringify({ ...rest, type: 'mediaHeader' }));
      conn.send(buf);
    } else conn.send(JSON.stringify(msg));
  } catch (err) {
    console.warn('Falha na conexão de apresentação', err);
  }
}
