(() => {
  'use strict';

  const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
  const EVENTS_URL = `${SUPABASE_URL}/rest/v1/rpc/get_public_events`;

  const status = document.querySelector('[data-events-status]');
  const list = document.querySelector('[data-events-list]');
  const count = document.querySelector('[data-events-count]');

  if (!status || !list) return;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseDate(value) {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatDate(date, options) {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }

  function dateRange(event) {
    const start = parseDate(event.start_date);
    const end = parseDate(event.end_date) || start;
    if (!start || !end) return 'Date to be announced';

    if (start.getTime() === end.getTime()) {
      return formatDate(start, { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${formatDate(start, { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }

    return `${formatDate(start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function locationLine(event) {
    const cityState = [event.city, event.state]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join(', ');
    return [event.venue, cityState]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join(' · ');
  }

  function safeEventUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function eventCard(event) {
    const start = parseDate(event.start_date);
    const end = parseDate(event.end_date) || start;
    const url = safeEventUrl(event.event_url);
    const location = locationLine(event);
    const promoter = String(event.promoter_name || '').trim();
    const description = String(event.public_description || '').trim();
    const month = start ? formatDate(start, { month: 'short' }).toUpperCase() : 'DATE';
    const day = start ? start.getDate() : '—';
    const endLabel = start && end && start.getTime() !== end.getTime()
      ? `through ${formatDate(end, { month: 'short', day: 'numeric' })}`
      : '&nbsp;';

    const article = document.createElement('article');
    article.className = 'event-card';
    article.innerHTML = `
      <div class="event-date-badge" aria-hidden="true">
        <span class="event-date-month">${escapeHtml(month)}</span>
        <span class="event-date-day">${escapeHtml(day)}</span>
        <span class="event-date-end">${endLabel}</span>
      </div>
      <div class="event-copy">
        <h3>${escapeHtml(event.name || 'Upcoming Event')}</h3>
        <p class="event-dates">${escapeHtml(dateRange(event))}</p>
        ${location ? `<p class="event-location">${escapeHtml(location)}</p>` : ''}
        ${promoter ? `<p class="event-promoter">Promoted by ${escapeHtml(promoter)}</p>` : ''}
        ${description ? `<p class="event-description">${escapeHtml(description)}</p>` : ''}
      </div>
      ${url ? `<a class="button event-action" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Event Website</a>` : ''}
    `;
    return article;
  }

  function showEmpty() {
    list.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'events-empty';
    empty.innerHTML = `
      <h3>No upcoming events are posted yet.</h3>
      <p>Check back soon. We publish confirmed conventions and appearances here as our schedule is finalized.</p>
    `;
    list.appendChild(empty);
    if (count) count.textContent = 'No upcoming events currently posted.';
  }

  function showError() {
    list.replaceChildren();
    const error = document.createElement('div');
    error.className = 'events-error';
    error.innerHTML = `
      <h3>We could not load the event schedule.</h3>
      <p>Please refresh the page or contact us if you are trying to confirm where we will be vending.</p>
    `;
    list.appendChild(error);
    if (count) count.textContent = 'Event schedule temporarily unavailable.';
  }

  async function loadEvents() {
    status.hidden = false;
    status.textContent = 'Loading upcoming conventions…';

    try {
      const response = await fetch(EVENTS_URL, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_include_past: false })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `Event request failed (${response.status})`);
      }
      if (!Array.isArray(payload)) throw new Error('Event response was invalid.');

      status.hidden = true;
      if (payload.length === 0) {
        showEmpty();
        return;
      }

      list.replaceChildren();
      payload.forEach(event => list.appendChild(eventCard(event)));
      if (count) {
        count.textContent = payload.length === 1
          ? '1 upcoming event currently posted.'
          : `${payload.length} upcoming events currently posted.`;
      }
    } catch (error) {
      console.error('[events] public event feed error', error);
      status.hidden = true;
      showError();
    }
  }

  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  hamburger?.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    mobileNav?.classList.toggle('show', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  loadEvents();
})();
