// Web app installation (PWA) for Android, iOS and desktop: native install
// prompt where the browser offers one (Chrome/Edge/Samsung), illustrated
// step-by-step guides where it does not (Safari on iPhone/iPad, Firefox),
// a dismissible banner on phones and "installed" detection.

import { el } from './utils.js';
import { icon, modal, toast } from './ui.js';
import { prefs } from './storage.js';
import { isIOS, isAndroid, isStandalone } from './capabilities.js';

const BANNER_SNOOZE_DAYS = 14;

// Inline SVGs that mimic the system buttons the user has to look for.
const SHARE_IOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1"/></svg>';
const ADD_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const MENU_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const INSTALL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>';

const svgSpan = (svg, cls = '') => {
  const s = document.createElement('span');
  s.className = `sysicon ${cls}`;
  s.innerHTML = svg;
  return s;
};

export function platform() {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}

export class Installer {
  constructor(app) {
    this.app = app;
    this.deferred = window.__luzmapInstallEvent || null;
    this.installed = isStandalone();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e;
      this._sync();
    });
    window.addEventListener('luzmap-installable', () => {
      this.deferred = window.__luzmapInstallEvent || this.deferred;
      this._sync();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      prefs.set('installed', true);
      this.hideBanner();
      this._sync();
      toast('LuzMap instalado! Abra pelo ícone na tela inicial ou na lista de apps.', { type: 'ok', duration: 6000 });
    });
    matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
      this.installed = isStandalone();
      this._sync();
    });
    if (this.installed) document.body.classList.add('standalone');
    this._sync();
  }

  /** True when the browser can show its own install dialog right now. */
  get canPrompt() {
    return !!this.deferred;
  }

  /** True when installing makes sense on this device/browser. */
  get worthOffering() {
    if (this.installed) return false;
    if (this.canPrompt) return true;
    const p = platform();
    return p === 'ios' || p === 'android';
  }

  _sync() {
    document.body.classList.toggle('standalone', this.installed);
    const btn = document.getElementById('btn-install');
    if (btn) btn.hidden = this.installed || !(this.canPrompt || platform() === 'ios');
    document.querySelectorAll('[data-install-item]').forEach((n) => (n.hidden = this.installed));
  }

  /** Main entry point: native prompt if available, otherwise the guide. */
  async install() {
    if (this.installed) {
      modal({ title: 'Aplicativo instalado', content: el('p', 'Você já está usando o LuzMap como aplicativo instalado. 🎉') });
      return 'installed';
    }
    if (this.deferred) {
      const e = this.deferred;
      this.deferred = null;
      try {
        await e.prompt();
        const choice = await e.userChoice;
        this._sync();
        if (choice?.outcome === 'accepted') {
          this.hideBanner();
          return 'accepted';
        }
        return 'dismissed';
      } catch (err) {
        console.warn('Falha no prompt de instalação', err);
      }
    }
    this.showGuide();
    return 'guide';
  }

  showGuide(forPlatform = platform()) {
    const steps = (list) => el('ol.install-steps', list.map(([ic, html]) => {
      const li = el('li', ic);
      const span = el('span');
      span.innerHTML = html;
      li.appendChild(span);
      return li;
    }));
    const ios = el(
      'div.install-guide',
      el('p.lead', 'No iPhone e no iPad o LuzMap é instalado pelo menu Compartilhar do Safari:'),
      steps([
        [svgSpan(SHARE_IOS, 'blue'), 'Toque no botão <b>Compartilhar</b> (quadrado com seta para cima) — na barra inferior do Safari no iPhone ou no topo, no iPad.'],
        [svgSpan(ADD_HOME), 'Role a lista e toque em <b>Adicionar à Tela de Início</b>.'],
        [svgSpan(INSTALL_ICON), 'Confirme em <b>Adicionar</b>. O ícone do LuzMap aparece na tela inicial; abra por ele para usar em tela cheia, sem as barras do navegador.'],
      ]),
      el('div.callout-mini', icon('info'), el('span', 'Em outros navegadores do iPhone (Chrome, Edge, Firefox) o caminho é o mesmo: botão Compartilhar → Adicionar à Tela de Início (iOS 16.4 ou mais recente).')),
      el('div.callout-mini.warn', icon('info'), el('span', 'No iPhone o app instalado guarda os projetos separados do Safari. Para levar um projeto, use Projetos → Exportar com mídias no Safari e importe no app.')),
    );
    const android = el(
      'div.install-guide',
      el('p.lead', 'No Android, pelo Chrome (ou Edge / Samsung Internet):'),
      steps([
        [svgSpan(MENU_DOTS), 'Toque no menu <b>⋮</b> do navegador (canto superior direito).'],
        [svgSpan(INSTALL_ICON), 'Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial → Instalar</b>).'],
        [svgSpan(ADD_HOME), 'Confirme. O LuzMap ganha ícone na tela inicial e na gaveta de apps e abre em janela própria.'],
      ]),
      el('div.callout-mini', icon('info'), el('span', 'Com o app instalado, você pode compartilhar fotos e vídeos da galeria direto para o LuzMap (menu Compartilhar do Android).')),
    );
    const desktop = el(
      'div.install-guide',
      el('p.lead', 'No computador, pelo Chrome ou Edge:'),
      steps([
        [svgSpan(INSTALL_ICON), 'Clique no ícone de <b>instalar</b> na barra de endereço (monitor com seta) ou no menu <b>⋮ → Transmitir, salvar e compartilhar → Instalar página como app</b>.'],
        [svgSpan(ADD_HOME), 'Confirme em <b>Instalar</b>. O LuzMap abre em janela própria e aparece no menu Iniciar / Launchpad.'],
      ]),
      el('div.callout-mini', icon('info'), el('span', 'Instalado, o LuzMap abre arquivos .luzmap.json com duplo clique e funciona sem internet. No Safari do Mac: Arquivo → Adicionar ao Dock.')),
    );
    const panes = { ios, android, desktop };
    const tabs = el('div.segmented.install-tabs', { role: 'tablist' });
    const body = el('div', tabs);
    const show = (p) => {
      [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.p === p));
      Object.entries(panes).forEach(([k, v]) => (v.hidden = k !== p));
    };
    for (const [k, label, ic] of [
      ['android', 'Android', 'phone'],
      ['ios', 'iPhone / iPad', 'phone'],
      ['desktop', 'Computador', 'monitor'],
    ]) {
      const b = el('button', { type: 'button', role: 'tab', onclick: () => show(k) }, icon(ic), el('span', label));
      b.dataset.p = k;
      tabs.appendChild(b);
    }
    body.append(ios, android, desktop);
    body.appendChild(
      el(
        'ul.install-benefits',
        el('li', icon('check'), 'Ícone na tela inicial e abertura em tela cheia, sem barras do navegador'),
        el('li', icon('check'), 'Funciona offline depois do primeiro acesso'),
        el('li', icon('check'), 'Tela sempre ligada durante a projeção'),
        el('li', icon('check'), 'Grátis, sem loja de aplicativos e sem cadastro'),
      ),
    );
    show(forPlatform);
    modal({ title: 'Instalar o LuzMap como aplicativo', content: body, cls: 'install-modal' });
  }

  /** Small banner on phones/tablets suggesting installation. */
  maybeShowBanner() {
    if (!this.worthOffering) return;
    if (platform() === 'desktop' && !this.canPrompt) return;
    const snoozed = prefs.get('installBannerUntil', 0);
    if (snoozed && Date.now() < snoozed) return;
    if (document.querySelector('.install-banner')) return;
    const ios = platform() === 'ios';
    const banner = el(
      'div.install-banner',
      { role: 'region', 'aria-label': 'Instalar aplicativo' },
      el('img', { src: 'assets/icons/icon-192.png', alt: '', width: 40, height: 40 }),
      el('div.install-text', el('strong', 'Instale o LuzMap'), el('small', ios ? 'Tela cheia no iPhone, ícone na tela inicial e uso offline.' : 'Ícone na tela inicial, tela cheia e uso offline.')),
      el('button.btn.primary.small', { type: 'button', onclick: () => this.install() }, el('span.lbl', 'Instalar')),
      el('button.icon-btn', { type: 'button', 'aria-label': 'Agora não', title: 'Agora não', onclick: () => this.hideBanner(true) }, icon('close')),
    );
    document.body.appendChild(banner);
    document.body.classList.add('has-install-banner');
    requestAnimationFrame(() => banner.classList.add('show'));
  }

  hideBanner(snooze = false) {
    if (snooze) prefs.set('installBannerUntil', Date.now() + BANNER_SNOOZE_DAYS * 86400000);
    document.querySelectorAll('.install-banner').forEach((b) => b.remove());
    document.body.classList.remove('has-install-banner');
  }
}
