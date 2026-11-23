// Projector output page: shows ONLY the final composition (black background,
// no UI). Follows the editor through BroadcastChannel / Presentation API, or
// plays the last saved project on its own if opened directly.

import { Renderer } from './renderer.js';
import { MediaManager } from './media.js';
import { Transport } from './transport.js';
import { Link } from './sync.js';
import { storage, prefs } from './storage.js';
import { normalizeProject, collectActiveMedia, referencedMedia } from './state.js';
import { renderRoom } from './room.js';
import { uid } from './utils.js';

const id = uid('out');
const canvas = document.getElementById('out');
const hud = document.getElementById('hud');
const hint = document.getElementById('hint');
const statusEl = document.getElementById('status');
const media = new MediaManager({});
const transport = new Transport();
const isReceiver = !!navigator.presentation?.receiver;
const renderer = new Renderer(canvas, { media, quality: 2 });
media.maxTexture = Math.min(4096, renderer.maxTexture || 4096);

let project = null;
let session = { calibration: null, blackout: false, solo: null, fit: 'fit' };
let audio = [0, 0, 0, 0];
let connected = false;
let lastMsg = 0;
let standalone = false;
const requested = new Set();

if (!renderer.ok) {
  statusEl.textContent = 'WebGL indisponível neste navegador/dispositivo.';
  document.body.classList.add('show-hud');
}

const link = new Link(onMessage);
if (window.opener) link.addPeer(window.opener);

function onMessage(msg) {
  lastMsg = Date.now();
  if (!connected) {
    connected = true;
    standalone = false;
    updateStatus();
  }
  switch (msg.type) {
    case 'project':
      setProject(msg.project);
      break;
    case 'transport':
      transport.follow(msg.state);
      break;
    case 'session':
      session = { ...session, ...msg.session };
      if (msg.session.fit) fit = msg.session.fit;
      break;
    case 'media':
      if (msg.blob) media.addBlob(msg.id, msg.blob, msg.info || {}).then(() => requested.delete(msg.id));
      break;
    case 'audio':
      audio = msg.levels || audio;
      break;
    default:
      break;
  }
}

async function setProject(p) {
  project = normalizeProject(p);
  transport.configure(project.timeline);
  if ([...referencedMedia(project)].some((m) => m === 'builtin:room') || project.background?.mediaId === 'builtin:room') ensureRoom();
  const missing = [];
  for (const mid of referencedMedia(project)) {
    if (media.has(mid) && media.status(mid) !== 'missing') continue;
    if (requested.has(mid)) continue;
    requested.add(mid);
    const ok = await media.ensure(mid);
    if (!ok) missing.push(mid);
  }
  if (missing.length) link.send({ type: 'needMedia', id, ids: missing });
}

let roomReady = false;
function ensureRoom() {
  if (roomReady) return;
  roomReady = true;
  media.registerBuiltin('builtin:room', renderRoom(1920, 1080));
}

async function loadStandalone() {
  if (connected || project) return;
  try {
    const last = prefs.get('lastProjectId');
    const rec = last ? await storage.getProject(last) : null;
    if (rec && !connected) {
      standalone = true;
      await setProject(rec.data);
      transport.playing = true;
      updateStatus();
    } else if (!connected) {
      statusEl.textContent = 'Aguardando o editor… Abra o LuzMap e clique em "Saída do projetor".';
      document.body.classList.add('show-hud');
    }
  } catch (err) {
    console.warn(err);
  }
}

// ---------------------------------------------------------------- render loop

let fit = prefs.get('outputFit', 'fit');
let last = performance.now();
let fps = 0;
let frames = 0;
let fpsT = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  transport.update(dt);
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  renderer.resize(w, h);
  if (project) {
    const active = collectActiveMedia(project, transport.time, transport.clock);
    // The editor window plays the sound; the projector output stays silent (no echo).
    if (project.audio?.mediaId) active.delete(project.audio.mediaId);
    media.sync(active, project, transport, { forceMute: true });
    const ar = project.output.width / project.output.height;
    let stage = { x: 0, y: 0, w, h };
    if (fit !== 'stretch') {
      let sw = w;
      let sh = w / ar;
      if (sh > h) {
        sh = h;
        sw = h * ar;
      }
      stage = { x: (w - sw) / 2, y: (h - sh) / 2, w: sw, h: sh };
    }
    renderer.render({
      project,
      t: transport.time,
      clock: transport.clock,
      stage,
      outsideColor: [0, 0, 0],
      calibration: session.calibration,
      blackout: session.blackout,
      solo: session.solo,
      audio,
    });
  } else {
    renderer.render({ project: { output: { width: 16, height: 9 }, surfaces: [] }, stage: { x: 0, y: 0, w, h } });
  }
  frames++;
  if (now - fpsT > 1000) {
    fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
    link.send({ type: 'status', id, w, h, fullscreen: !!document.fullscreenElement, fps, kind: isReceiver ? 'presentation' : 'window' });
    if (connected && Date.now() - lastMsg > 5000) {
      connected = false;
      updateStatus();
    }
    statusEl.dataset.fps = fps;
    updateStatus();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- HUD, fullscreen, wake lock

function updateStatus() {
  const w = canvas.width;
  const h = canvas.height;
  const mode = connected ? 'Conectado ao editor' : standalone ? 'Modo independente (último projeto salvo)' : 'Aguardando o editor';
  statusEl.textContent = `${mode} · saída ${w}×${h}${project ? ` · projeto ${project.output.width}×${project.output.height}` : ''} · ${statusEl.dataset.fps || 0} fps`;
}

let hudTimer = 0;
function showHud() {
  document.body.classList.add('show-hud');
  document.body.style.cursor = 'default';
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => {
    document.body.classList.remove('show-hud');
    document.body.style.cursor = 'none';
  }, 2500);
}
window.addEventListener('pointermove', showHud);
window.addEventListener('pointerdown', showHud);

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
    else alert('Tela cheia não suportada aqui. No iPhone, use "Adicionar à Tela de Início" para abrir sem barras.');
  } catch (err) {
    console.warn(err);
  }
  hint.hidden = true;
  requestWakeLock();
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch (_) {
    /* not critical */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

document.getElementById('btn-fs').addEventListener('click', toggleFullscreen);
document.getElementById('btn-fit').addEventListener('click', () => {
  fit = fit === 'fit' ? 'stretch' : 'fit';
  prefs.set('outputFit', fit);
  document.getElementById('btn-fit').textContent = fit === 'fit' ? 'Ajuste: manter proporção' : 'Ajuste: esticar';
});
document.getElementById('btn-fit').textContent = fit === 'fit' ? 'Ajuste: manter proporção' : 'Ajuste: esticar';
document.getElementById('btn-close').addEventListener('click', () => window.close());
hint.addEventListener('click', toggleFullscreen);
window.addEventListener('dblclick', toggleFullscreen);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'i' || e.key === 'I') showHud();
});
document.addEventListener('fullscreenchange', () => {
  hint.hidden = !!document.fullscreenElement;
});
setTimeout(() => (hint.hidden = true), 9000);
window.addEventListener('keydown', () => (hint.hidden = true), { once: true });
if (location.hash === '#auto-fullscreen') hint.querySelector('strong').textContent = 'Clique para ativar a tela cheia no projetor';
window.addEventListener('beforeunload', () => link.send({ type: 'bye', id }));
window.addEventListener('resize', updateStatus);

// Presentation API receiver (second screen / cast)
if (isReceiver) {
  hint.hidden = true;
  navigator.presentation.receiver.connectionList.then((list) => {
    list.connections.forEach((c) => link.attachConnection(c));
    list.addEventListener('connectionavailable', (e) => link.attachConnection(e.connection));
  });
}

link.send({ type: 'hello', id, w: canvas.width, h: canvas.height, kind: isReceiver ? 'presentation' : 'window' });
setTimeout(loadStandalone, 1200);
requestWakeLock();
showHud();
window.__luzmapOutput = { get project() { return project; }, transport, renderer, get connected() { return connected; } };
