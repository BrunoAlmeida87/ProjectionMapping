// Feature detection, so the UI can explain what this browser/device can do.

import { recordingFormats, canRecordScreen } from './recorder.js';

export const isIOS = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isMobile = () => isIOS() || isAndroid() || matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

export function fullscreenSupported() {
  const d = document.documentElement;
  return !!(d.requestFullscreen || d.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
}

export function detectCapabilities(renderer) {
  const formats = recordingFormats();
  const list = [
    {
      id: 'webgl',
      label: 'Renderização GPU (WebGL)',
      ok: !!renderer?.ok,
      note: renderer?.ok ? `${renderer.isWebGL2 ? 'WebGL 2' : 'WebGL 1'} · ${renderer.info?.renderer || ''}` : 'Sem WebGL: o editor não consegue desenhar. Atualize o navegador ou ative a aceleração de hardware.',
    },
    {
      id: 'record',
      label: 'Gravação de vídeo (MediaRecorder)',
      ok: formats.length > 0,
      note: formats.length ? `Formatos: ${formats.map((f) => f.label).join(', ')}` : 'Indisponível neste navegador.',
    },
    { id: 'screenrec', label: 'Gravar a tela com a interface', ok: canRecordScreen(), note: canRecordScreen() ? 'Disponível (computador).' : 'Indisponível (comum em celulares).' },
    { id: 'bc', label: 'Janela de projeção sincronizada', ok: typeof BroadcastChannel !== 'undefined', note: typeof BroadcastChannel !== 'undefined' ? 'BroadcastChannel' : 'Usando postMessage (fallback).' },
    {
      id: 'wm',
      label: 'Posicionar saída na tela do projetor',
      ok: 'getScreenDetails' in window,
      note: 'getScreenDetails' in window ? 'Window Management API (Chrome/Edge).' : 'Arraste a janela manualmente para a tela do projetor.',
    },
    { id: 'fs', label: 'Tela cheia', ok: fullscreenSupported(), note: fullscreenSupported() ? 'Fullscreen API.' : isIOS() ? 'iPhone: use "Adicionar à Tela de Início" para abrir sem barras.' : 'Indisponível.' },
    {
      id: 'present',
      label: 'Segunda tela sem fio (Presentation API)',
      ok: typeof window.PresentationRequest !== 'undefined',
      note: typeof window.PresentationRequest !== 'undefined' ? 'Experimental: depende do dispositivo receptor (ex.: Chromecast).' : 'Use o espelhamento de tela do sistema.',
    },
    { id: 'wake', label: 'Manter a tela ligada (Wake Lock)', ok: 'wakeLock' in navigator, note: 'wakeLock' in navigator ? 'Disponível.' : 'Ajuste o bloqueio automático nas configurações do aparelho.' },
    { id: 'idb', label: 'Salvar projetos e mídias localmente', ok: typeof indexedDB !== 'undefined', note: 'IndexedDB (nada é enviado para servidores).' },
    { id: 'gif', label: 'GIF animado', ok: typeof window.ImageDecoder !== 'undefined', note: typeof window.ImageDecoder !== 'undefined' ? 'ImageDecoder (WebCodecs).' : 'GIFs serão exibidos como imagem estática neste navegador.' },
    { id: 'mic', label: 'Áudio reativo (microfone)', ok: !!navigator.mediaDevices?.getUserMedia, note: 'Requer permissão.' },
    { id: 'sw', label: 'Uso offline / instalar como app (PWA)', ok: 'serviceWorker' in navigator && window.isSecureContext, note: window.isSecureContext ? 'Disponível após o primeiro carregamento.' : 'Requer HTTPS.' },
    {
      id: 'installed',
      label: 'Aplicativo instalado (PWA)',
      ok: isStandalone(),
      note: isStandalone() ? 'Rodando como aplicativo instalado.' : 'Pode ser instalado: menu → Instalar como aplicativo (Android, iPhone, PC).',
    },
    { id: 'touch', label: 'Toque / caneta', ok: navigator.maxTouchPoints > 0, note: navigator.maxTouchPoints > 0 ? `${navigator.maxTouchPoints} pontos de toque` : 'Mouse e teclado' },
  ];
  return list;
}

export function screenInfo() {
  const dpr = window.devicePixelRatio || 1;
  return { w: Math.round(screen.width * dpr), h: Math.round(screen.height * dpr), dpr, cssW: screen.width, cssH: screen.height };
}

export function autoQuality(renderer) {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const gpu = (renderer?.info?.renderer || '').toLowerCase();
  if (isMobile()) {
    if (mem <= 3 || cores <= 4 || /mali-4|adreno \(tm\) [34]|powervr/.test(gpu)) return 0;
    return 1;
  }
  if (/swiftshader|llvmpipe|software/.test(gpu)) return 0;
  if (/nvidia|geforce|rtx|radeon rx|apple m\d|arc/.test(gpu)) return 2;
  return 1;
}
