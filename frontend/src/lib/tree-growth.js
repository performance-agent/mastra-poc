(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const LEAF = 'M0 0C-17-5-17-24 0-36C17-24 17-5 0 0Z';
  const COLORS = { pass: '#4D9868', partial: '#D5A24B', 'no-data': '#ADB5B0', fail: '#CE6464' };
  const THEMES = {
    light: { ink: '#242A27', plan: '#E9ECEA', error: '#CE6464', colors: COLORS },
    dark: { ink: '#DCE7E1', plan: '#34413B', error: '#E18B8B', colors: { pass: '#77C696', partial: '#DDB86C', 'no-data': '#8B9D93', fail: '#E18B8B' } }
  };
  const DEFAULTS = ['pass', 'pass', 'partial', 'no-data', 'fail'];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const number = n => Math.round(n * 100) / 100;
  const durationOf = value => Math.max(400, Math.min(600, Number(value) || 500));

  function normalize(rules = 5) {
    if (typeof rules === 'number') {
      if (!Number.isInteger(rules) || rules < 1) throw new RangeError('Debe existir al menos una regla.');
      rules = Array.from({ length: rules }, (_, i) => ({ label: `Regla ${i + 1}`, status: DEFAULTS[i % DEFAULTS.length] }));
    }
    if (!Array.isArray(rules) || !rules.length) throw new TypeError('rules debe contener al menos una regla.');
    return rules.map((rule, i) => ({
      label: String(rule.label || `Regla ${i + 1}`),
      status: Object.hasOwn(COLORS, rule.status) ? rule.status : 'no-data'
    }));
  }

  function aggregate(rules) {
    return ['fail', 'partial', 'no-data', 'pass'].find(status => rules.some(rule => rule.status === status));
  }

  function smooth(points) {
    if (points.length < 2) return null;
    let path = `M${number(points[0].x)} ${number(points[0].y)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
      path += `C${number(b.x + (c.x - a.x) / 6)} ${number(b.y + (c.y - a.y) / 6)} ${number(c.x - (d.x - b.x) / 6)} ${number(c.y - (d.y - b.y) / 6)} ${number(c.x)} ${number(c.y)}`;
    }
    return path;
  }

  function geometry(rulesInput = 5, duration = 500) {
    const rules = normalize(rulesInput);
    const groups = rules.length <= 5 ? rules : [...rules.slice(0, 4), {
      label: `Reglas 5 a ${rules.length}`, status: aggregate(rules.slice(4))
    }];
    const layouts = {
      1: [[320, 115, 0]],
      2: [[248, 148, -35], [392, 148, 35]],
      3: [[208, 156, -42], [320, 105, 0], [432, 156, 42]],
      4: [[194, 171, -48], [276, 118, -18], [364, 118, 18], [446, 171, 48]],
      5: [[182, 185, -50], [246, 133, -28], [320, 105, 0], [394, 133, 28], [458, 185, 50]]
    };
    const roots = [
      { key: 'root-0', label: 'Commits', x: 211, y: 378, d: 'M320 326C298 345 259 348 211 378' },
      { key: 'root-1', label: 'Pull requests', x: 320, y: 393, d: 'M320 326C325 350 313 369 320 393' },
      { key: 'root-2', label: 'Tickets', x: 429, y: 378, d: 'M320 326C342 345 381 348 429 378' }
    ];
    const trunk = { key: 'trunk', d: 'M320 326C314 285 327 248 320 208' };
    let time = 0;
    roots.forEach(root => { root.start = time; time += duration; });
    trunk.start = time; time += duration;
    const branches = layouts[groups.length].map(([x, y, angle], index) => {
      const dx = x - 320;
      const d = groups.length === 1 ? 'M320 208C320 180 320 148 320 115' : `M320 208C${number(320 + dx * .15)} 185 ${number(x - dx * .18)} ${y + 19} ${x} ${y}`;
      const branch = { ...groups[index], key: `branch-${index}`, x, y, angle, d, start: time };
      branch.tip = { x: x + 36 * Math.sin(angle * Math.PI / 180), y: y - 36 * Math.cos(angle * Math.PI / 180) };
      time += duration;
      return branch;
    });
    branches.forEach(branch => { branch.judgeStart = time; branch.fillStart = time + duration; time += duration + 160; });
    const crown = { key: 'crown', d: smooth(branches.map(branch => branch.tip)), start: time };
    return { rules, groups, roots, trunk, branches, crown, duration, totalDuration: time + (crown.d ? duration : 0) };
  }

  const styles = `
    svg{--tree-ink:#242A27;--tree-plan:#E9ECEA;--tree-teal:var(--effort-color,#00B8A6);--tree-error:#CE6464}
    .tree-line{fill:none;stroke-linecap:round;stroke-linejoin:round}
    [data-layer="plan"]{stroke:var(--tree-plan);fill:none}
    .tree-trace{stroke:var(--tree-ink);stroke-dasharray:1;stroke-dashoffset:1;opacity:0}
    .tree-disc{fill:var(--tree-ink);opacity:0}
    .tree-outline{fill:none;stroke:var(--tree-ink);stroke-width:1.7;opacity:0}
    .tree-fill{opacity:0;transform:scale(.15);transform-origin:0px -18px}
    .tree-drop{fill:var(--tree-teal);opacity:0;pointer-events:none}
    svg[data-autoplay="true"] .tree-trace{animation:tree-trace var(--duration) linear var(--start) forwards}
    svg[data-autoplay="true"] .tree-disc,svg[data-autoplay="true"] .tree-outline{animation:tree-reveal 1ms linear var(--start) forwards}
    svg[data-autoplay="true"] .tree-fill{animation:tree-grow 160ms ease-out var(--start) forwards}
    svg[data-autoplay="true"] .tree-drop{animation:tree-droplet var(--duration) linear var(--start) forwards}
    @keyframes tree-trace{0%{opacity:1;stroke:var(--tree-teal);stroke-dashoffset:1}99.99%{stroke:var(--tree-teal)}100%{opacity:1;stroke:var(--tree-ink);stroke-dashoffset:0}}
    @keyframes tree-reveal{to{opacity:1}}
    @keyframes tree-grow{to{opacity:1;transform:scale(1)}}
    @keyframes tree-droplet{0%,99.99%{opacity:1}100%{opacity:0}}
    @media(prefers-reduced-motion:reduce){
      svg[data-autoplay="true"] .tree-trace{animation:none;opacity:1;stroke-dashoffset:0;stroke:var(--tree-ink)}
      svg[data-autoplay="true"] .tree-disc,svg[data-autoplay="true"] .tree-outline{animation:none;opacity:1}
      svg[data-autoplay="true"] .tree-fill{animation:none;opacity:1;transform:scale(1)}
      .tree-drop{display:none}
    }`;

  function buildSvg({ rules = 5, duration = 500, autoplay = true, theme = 'light' } = {}) {
    duration = durationOf(duration);
    theme = Object.hasOwn(THEMES, theme) ? theme : 'light';
    const palette = THEMES[theme];
    const g = geometry(rules, duration);
    const trace = (part, width) => `<path class="tree-line tree-trace" data-segment="${part.key}" pathLength="1" stroke-width="${width}" d="${part.d}" style="--start:${part.start}ms"/>`;
    const planned = (part, width) => `<path class="tree-line" stroke-width="${width}" d="${part.d}"/>`;
    const position = branch => `translate(${branch.x} ${branch.y}) rotate(${branch.angle})`;
    const branchInfo = g.branches.map((b, i) => `<g transform="${position(b)}" data-leaf="${i}"><title>${escape(b.label)}</title><g class="tree-fill" data-fill="${i}" style="--start:${b.fillStart}ms"><path d="${LEAF}" fill="${palette.colors[b.status]}"/></g><path class="tree-outline" data-outline="${i}" d="${LEAF}" style="--start:${b.start + duration}ms"/></g>`).join('');
    const droplets = g.branches.map((b, i) => `<circle class="tree-drop" data-drop="${i}" r="3.6" style="--start:${b.judgeStart}ms">${autoplay ? `<animateMotion dur="${duration}ms" begin="${b.judgeStart}ms" path="${b.d}" calcMode="paced" fill="freeze"/>` : ''}</circle>`).join('');
    return `<svg xmlns="${NS}" width="640" height="420" viewBox="0 0 640 420" fill="none" role="img" aria-label="Árbol de evaluación que crece desde la evidencia hasta el juicio de las reglas" data-autoplay="${Boolean(autoplay)}" data-theme="${theme}" data-rule-count="${g.rules.length}" data-branch-count="${g.branches.length}" style="--duration:${duration}ms;--tree-ink:${palette.ink};--tree-plan:${palette.plan};--tree-error:${palette.error}">
<title>Árbol de evaluación</title><desc>Raíces de evidencia, tronco y ramas de reglas, hojas de juicio y copa final. El color de cada hoja indica su resultado.</desc>
<style>${styles}</style>
<g data-layer="plan" aria-hidden="true">${g.roots.map(r => planned(r, 3.2) + `<circle cx="${r.x}" cy="${r.y}" r="6.5" fill="var(--tree-plan)" stroke="none"/>`).join('')}${planned(g.trunk, 4.6)}${g.branches.map(b => planned(b, 3.2) + `<path transform="${position(b)}" stroke-width="1.7" d="${LEAF}"/>`).join('')}${g.crown.d ? planned(g.crown, 1.25) : ''}</g>
<g data-layer="ink">${g.roots.map(r => trace(r, 3.2) + `<circle class="tree-disc" data-disc="${r.key}" cx="${r.x}" cy="${r.y}" r="6.5" style="--start:${r.start + duration}ms"><title>${escape(r.label)}</title></circle>`).join('')}${trace(g.trunk, 4.6)}${g.branches.map(b => trace(b, 3.2)).join('')}${branchInfo}${g.crown.d ? trace(g.crown, 1.25) : ''}${droplets}</g>
</svg>`;
  }

  class Controller extends EventTarget {
    constructor(host, { rules = 5, duration = 500, reducedMotion = null, theme = 'light' } = {}) {
      super();
      if (!(host instanceof Element)) throw new TypeError('Debe indicarse un contenedor HTML.');
      this.host = host;
      this.duration = durationOf(duration);
      this.theme = Object.hasOwn(THEMES, theme) ? theme : 'light';
      this.palette = THEMES[this.theme];
      this.reducedMotion = reducedMotion;
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      this._onMotion = () => { if (this.isReduced && this._finishFrame) this._finishFrame(); };
      this.media.addEventListener('change', this._onMotion);
      this.reset(rules);
    }
    get isReduced() { return this.reducedMotion === null ? this.media.matches : Boolean(this.reducedMotion); }
    cancel() {
      this._token = (this._token || 0) + 1;
      cancelAnimationFrame(this._raf);
      if (this._resolveFrame) this._resolveFrame(false);
      this._resolveFrame = this._finishFrame = null;
    }
    reset(rules = this.rules) {
      this.cancel();
      this.rules = normalize(rules);
      this.model = geometry(this.rules, this.duration);
      this.host.innerHTML = buildSvg({ rules: this.rules, duration: this.duration, autoplay: false, theme: this.theme });
      this.svg = this.host.querySelector('svg');
      this.status = 'idle';
      this.failed = false;
      this._notify('idle');
      return this;
    }
    dispose() { this.cancel(); this.media.removeEventListener('change', this._onMotion); }
    setTheme(theme) {
      this.theme = Object.hasOwn(THEMES, theme) ? theme : 'light';
      this.palette = THEMES[this.theme];
      if (!this.svg) return;
      this.svg.dataset.theme = this.theme;
      this.svg.style.setProperty('--tree-ink', this.palette.ink);
      this.svg.style.setProperty('--tree-plan', this.palette.plan);
      this.svg.style.setProperty('--tree-error', this.palette.error);
      this.svg.querySelectorAll('[data-status]').forEach((node) => {
        const path = node.querySelector('path');
        const color = this.palette.colors[node.dataset.status];
        if (path && color) path.setAttribute('fill', color);
      });
    }
    _notify(phase, detail = {}) {
      this.svg.dataset.phase = phase;
      this.dispatchEvent(new CustomEvent('progress', { detail: { phase, status: this.status, ...detail } }));
    }
    _path(key) { return this.svg.querySelector(`[data-segment="${key}"]`); }
    _point(path, fraction = .5) { const p = path.getPointAtLength(path.getTotalLength() * fraction); return { x: p.x, y: p.y }; }
    _animate(duration, update) {
      if (this.isReduced) { update(1); return Promise.resolve(true); }
      return new Promise(resolve => {
        const started = performance.now();
        this._resolveFrame = resolve;
        const finish = () => {
          cancelAnimationFrame(this._raf); update(1);
          this._resolveFrame = this._finishFrame = null; resolve(true);
        };
        this._finishFrame = finish;
        const frame = now => {
          const t = Math.min(1, (now - started) / duration);
          update(t);
          if (t >= 1) finish(); else this._raf = requestAnimationFrame(frame);
        };
        update(0); this._raf = requestAnimationFrame(frame);
      });
    }
    _fail(path, phase, label, index) {
      path.style.opacity = '1'; path.style.strokeDashoffset = '.5'; path.style.stroke = 'var(--tree-error)';
      path.dataset.status = 'failed';
      this.failed = true; this.status = 'failed';
      this.svg.querySelectorAll('.tree-drop').forEach(drop => { drop.style.opacity = '0'; });
      this._notify(phase, { failed: true, label, index, anchor: this._point(path) });
      return false;
    }
    async _draw(key, phase, label, fail = false, index = null) {
      if (this.failed) return false;
      const path = this._path(key);
      this.status = 'drawing';
      path.style.opacity = '1'; path.style.stroke = 'var(--tree-teal)'; path.dataset.status = 'drawing';
      this._notify(phase, { label, index, anchor: this._point(path) });
      const end = fail ? .5 : 1;
      if (!await this._animate(this.duration * end, t => { path.style.strokeDashoffset = String(1 - t * end); })) return false;
      if (fail) return this._fail(path, phase, label, index);
      path.style.stroke = 'var(--tree-ink)'; path.dataset.status = 'complete';
      return true;
    }
    async evidence({ failAt = null } = {}) {
      for (const root of this.model.roots) {
        if (!await this._draw(root.key, 'evidence', root.label, failAt === root.key)) return false;
        this.svg.querySelector(`[data-disc="${root.key}"]`).style.opacity = '1';
      }
      return true;
    }
    growTrunk({ fail = false } = {}) { return this._draw('trunk', 'rules', 'Tronco', fail); }
    async interpretRule(index, { fail = false } = {}) {
      const branch = this.model.branches[index];
      if (!branch) throw new RangeError('La rama indicada no existe.');
      if (!await this._draw(branch.key, 'rules', branch.label, fail, index)) return false;
      this.svg.querySelector(`[data-outline="${index}"]`).style.opacity = '1';
      return true;
    }
    async judgeRule(index, status = this.model.branches[index]?.status, { fail = false } = {}) {
      if (this.failed) return false;
      const branch = this.model.branches[index];
      if (!branch) throw new RangeError('La rama indicada no existe.');
      const outline = this.svg.querySelector(`[data-outline="${index}"]`);
      if (outline.style.opacity !== '1') throw new Error('La rama debe terminar antes de juzgar su hoja.');
      if (!Object.hasOwn(COLORS, status)) throw new RangeError('Resultado de regla desconocido.');
      const path = this._path(branch.key), drop = this.svg.querySelector(`[data-drop="${index}"]`);
      const fill = this.svg.querySelector(`[data-fill="${index}"]`);
      const length = path.getTotalLength();
      this.status = 'judging';
      this._notify('judgment', { label: branch.label, index, anchor: this._point(path, .8) });
      drop.style.opacity = this.isReduced ? '0' : '1';
      const end = fail ? .5 : 1;
      if (!await this._animate(this.duration * end, t => {
        const p = path.getPointAtLength(length * t * end);
        drop.setAttribute('cx', p.x); drop.setAttribute('cy', p.y);
      })) return false;
      drop.style.opacity = '0';
      if (fail) return this._fail(path, 'judgment', branch.label, index);
      fill.querySelector('path').setAttribute('fill', this.palette.colors[status]);
      if (!await this._animate(160, t => { fill.style.opacity = '1'; fill.style.transform = `scale(${.15 + t * .85})`; })) return false;
      fill.dataset.status = status;
      return true;
    }
    async finish({ fail = false } = {}) {
      if (this.failed) return false;
      // Una sola punta no requiere una línea de unión ni hojas adicionales.
      if (this.model.crown.d && !await this._draw('crown', 'crown', 'Copa', fail)) return false;
      this.status = 'ready'; this._notify('ready'); return true;
    }
    async run({ failAt = null } = {}) {
      this.reset();
      const token = this._token;
      if (!await this.evidence({ failAt }) || token !== this._token) return false;
      if (!await this.growTrunk({ fail: failAt === 'trunk' }) || token !== this._token) return false;
      for (let i = 0; i < this.model.branches.length; i++) {
        if (!await this.interpretRule(i, { fail: failAt === `branch-${i}` }) || token !== this._token) return false;
      }
      for (let i = 0; i < this.model.branches.length; i++) {
        if (!await this.judgeRule(i, this.model.branches[i].status, { fail: failAt === `judgment-${i}` }) || token !== this._token) return false;
      }
      return this.finish({ fail: failAt === 'crown' });
    }
  }
  window.TreeGrowth = { Controller, buildSvg, geometry, colors: { ...COLORS } };
})();
