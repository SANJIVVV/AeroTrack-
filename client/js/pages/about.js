/** About the project (team, objectives, stack) and the privacy summary. */
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { photo } from '../lib/photos.js';
import { smartImage } from '../components/media.js';

// Team details as supplied by the project owner. No contact details are published.
export const TEAM = [
  { name: 'Sanjiv Kumar A', role: 'Main Developer / Project Lead', roll: '26MX217' },
  { name: 'Dheena Dhayal M', role: 'Developer', roll: '26MX106' },
  { name: 'Rebakha Snowit M', role: 'Developer', roll: '26MX121' },
];

export const PROJECT = {
  name: 'AeroTrack',
  title: 'AeroTrack — Smart Airline Baggage Tracking System',
  institution: 'PSG College of Technology',
  programme: 'Master of Computer Applications (MCA)',
  // Repository named by the project owner.
  github: 'https://github.com/SANJIVVV/AeroTrack',
};

const STACK = [
  { iconName: 'boxes', title: 'Frontend', items: ['HTML5', 'CSS3 (custom properties, grid, animations)', 'Vanilla JavaScript (ES modules)', 'History API router', 'Hand-drawn SVG charts', 'Pointer-event drag and drop', 'Lucide icons (SVG)'] },
  { iconName: 'globe2', title: 'API integration', items: ['Credentialed JSON requests', 'Authentication and baggage workflows require a compatible API', 'API origin configured in client/js/config.js'] },
  { iconName: 'qrCode', title: 'QR', items: ['qrcode (tag generation)', 'html5-qrcode (camera scanning)'] },
];

const OBJECTIVES = [
  'Give every bag an ID and a QR tag that carries no personal data.',
  'Record each checkpoint (check-in, security, loading, departure, arrival, belt, collection) as a verified event.',
  'Let passengers follow their own bags, and staff move bags only through valid next steps.',
  'Use one authoritative baggage record so the tracking page, operations board and admin dashboard agree.',
  'Raise explainable alerts for skipped checkpoints, wrong airports and long dwell times.',
  'Be honest about data: sample flights and demo bags are always labelled.',
];

export function aboutPage(ctx) {
  const bg = photo('terminal');
  const initials = (name) =>
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('');
  ctx.el.innerHTML = String(html`
    <section class="page-hero">
      ${smartImage({ photoKey: 'terminal', width: 2000, priority: true, showIcon: false, cls: 'fill page-hero-bg', imgCls: 'anim-slow-zoom', alt: '' })}
      <div class="page-hero-shade dense" aria-hidden="true"></div>
      <div class="container-md relative">
        <p class="eyebrow cyan fade-up">About us · ${PROJECT.institution}</p>
        <h1 class="display-title mt-3 fade-up" style="--d:0.1s">${PROJECT.title}</h1>
        <p class="hero-lead mt-5 fade-up" style="--d:0.2s">An academic project by students of the ${PROJECT.programme} programme at ${PROJECT.institution}.</p>
      </div>
      ${bg ? html`<p class="photo-credit">Photo: ${bg.photographer} / Unsplash</p>` : ''}
    </section>

    <div class="container-md section-sm stack-16">
      <section class="grid g-2">
        <div class="card p-6 reveal">
          <p class="row gap-2 bold">${icon('target', 'i-5 brand-cyan')} The problem</p>
          <p class="mt-3 small muted relaxed">Passengers usually learn that a bag is late only at the reclaim belt. Between check-in and collection there is little information they can see, and staff often work from separate lists that can disagree about where a bag is.</p>
        </div>
        <div class="card p-6 reveal" style="--d:0.06s">
          <p class="row gap-2 bold">${icon('scanLine', 'i-5 brand-cyan')} Our solution</p>
          <p class="mt-3 small muted relaxed">AeroTrack tags each bag with a QR code. Staff can record checkpoints by scanning or by moving a bag on the operations board. When connected to a compatible API, its validation and records power the passenger, staff and administrator views.</p>
        </div>
      </section>

      <section>
        <div class="reveal"><p class="eyebrow">Project objectives</p><h2 class="h2 mt-2">What we set out to build</h2></div>
        <ul class="grid g-2 mt-6 gap-3">
          ${OBJECTIVES.map((o, i) => html`<li class="objective reveal" style="--d:${i * 0.04}s">${icon('shieldCheck', 'i-4 ok')} ${o}</li>`)}
        </ul>
      </section>

      <section>
        <div class="reveal"><p class="eyebrow">Technology stack</p><h2 class="h2 mt-2">How it is built</h2></div>
        <div class="grid g-4 mt-6 gap-4">
          ${STACK.map(
            (s, i) => html`<div class="card p-5 reveal" style="--d:${i * 0.05}s">
              ${icon(s.iconName, 'i-5 brand-cyan')}
              <h3 class="bold mt-3">${s.title}</h3>
              <ul class="small muted mt-2 stack-1">${s.items.map((it) => html`<li>${it}</li>`)}</ul>
            </div>`,
          )}
        </div>
      </section>

      <section>
        <div class="reveal"><p class="eyebrow">Team</p><h2 class="h2 mt-2">The people behind AeroTrack</h2></div>
        <ul class="grid g-3 mt-6 gap-4">
          ${TEAM.map(
            (m, i) => html`<li class="card accent-border p-6 reveal" style="--d:${i * 0.08}s">
              <div class="team-avatar" aria-hidden="true">${initials(m.name)}</div>
              <h3 class="h5 bold mt-4">${m.name}</h3>
              <p class="small semibold brand-cyan">${m.role}</p>
              <p class="mono xs muted mt-1">${m.roll}</p>
            </li>`,
          )}
        </ul>
      </section>

      <section class="card project-facts">
        <div class="row gap-4 align-start">
          <div class="feature-icon lg">${icon('graduationCap', 'i-6')}</div>
          <dl class="facts-grid small">
            <div><dt class="muted">Institution</dt><dd class="semibold">${PROJECT.institution}</dd></div>
            <div><dt class="muted">Programme</dt><dd class="semibold">${PROJECT.programme}</dd></div>
            <div><dt class="muted">Project</dt><dd class="semibold">${PROJECT.title}</dd></div>
            <div><dt class="muted">Status</dt><dd class="semibold">Academic project, not a commercial service</dd></div>
          </dl>
        </div>
        <a href="${PROJECT.github}" target="_blank" rel="noreferrer" class="btn btn-navy">${icon('github', 'i-5')} GitHub repository</a>
      </section>
      <p class="center xs muted">Not affiliated with, or endorsed by, any airline, airport or the institution's partners. Airline names are used only to label demonstration data.</p>
    </div>
  `);
}

export function privacyPage(ctx) {
  const items = [
    { iconName: 'lock', t: 'API requests', d: 'Sign-in, baggage and other data operations are sent to the compatible API configured for this frontend. This repository does not include that API or its database.' },
    { iconName: 'qrCode', t: 'What a QR tag contains', d: 'Only the baggage ID (for example AEROTRACK:BAG:AT-2026-100245). No name, email or flight details.' },
    { iconName: 'shieldCheck', t: 'Access and retention', d: 'Access controls, data retention and any audit logging are determined by the connected API and its operator.' },
    { iconName: 'wrench', t: 'Before using real data', d: 'Review the connected API’s privacy and security practices before entering personal or operational information.' },
  ];
  ctx.el.innerHTML = String(html`<div class="container-sm page-top">
    <p class="eyebrow">Privacy</p>
    <h1 class="h1 mt-2">How AeroTrack handles your data</h1>
    <p class="mt-3 muted">This frontend does not store baggage records itself. Its data practices depend on the compatible API it is connected to; this page is not a legal policy of any airline or airport.</p>
    <ul class="stack-3 mt-8">
      ${items.map((i) => html`<li class="card privacy-item">${icon(i.iconName, 'i-5 brand-cyan')}<div><h2 class="bold">${i.t}</h2><p class="mt-1 small muted">${i.d}</p></div></li>`)}
    </ul>
  </div>`);
}
