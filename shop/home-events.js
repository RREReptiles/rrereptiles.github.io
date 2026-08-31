(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const EVENTS_URL = `${SUPABASE_URL}/rest/v1/rpc/get_public_events`;
    const EVENTS_PAGE = '/events.html';

    function installStyles() {
        if (document.querySelector('style[data-home-events]')) return;
        const style = document.createElement('style');
        style.dataset.homeEvents = '';
        style.textContent = `
            .home-events-section { padding-top: 0; }
            .home-events-header {
                display: flex;
                align-items: end;
                justify-content: space-between;
                gap: 1.25rem;
                margin-bottom: 1.35rem;
            }
            .home-events-header .section-subtitle { margin-bottom: 0; }
            .home-events-link {
                display: inline-flex;
                align-items: center;
                gap: .35rem;
                flex: 0 0 auto;
                color: var(--accent);
                font-size: .9rem;
                font-weight: 800;
                text-decoration: none;
            }
            .home-events-link:hover { color: var(--accent-hover); }
            .home-events-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 1rem;
            }
            .home-event-card {
                display: grid;
                grid-template-columns: 74px minmax(0, 1fr);
                gap: 1rem;
                min-width: 0;
                padding: 1.15rem;
                background: var(--card-bg);
                border: 1px solid rgba(26,26,26,.1);
                border-bottom: 3px solid var(--accent);
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                text-decoration: none;
                color: var(--black);
                transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
            }
            .home-event-card:hover {
                color: var(--black);
                transform: translateY(-4px);
                box-shadow: 0 12px 30px rgba(0,0,0,.12);
            }
            .home-event-date {
                align-self: start;
                padding: .55rem .35rem;
                background: #f5efe4;
                border: 1px solid rgba(158,20,3,.14);
                border-radius: 10px;
                text-align: center;
            }
            .home-event-month {
                display: block;
                color: var(--accent);
                font-size: .7rem;
                font-weight: 900;
                letter-spacing: .11em;
            }
            .home-event-day {
                display: block;
                margin-top: .1rem;
                font-family: 'Playfair Display', Georgia, serif;
                font-size: 1.85rem;
                font-weight: 800;
                line-height: 1;
            }
            .home-event-copy { min-width: 0; }
            .home-event-copy h3 {
                margin: 0 0 .2rem;
                font-family: 'Playfair Display', Georgia, serif;
                font-size: 1.08rem;
                line-height: 1.25;
            }
            .home-event-dates {
                margin: 0 0 .25rem;
                color: var(--accent);
                font-size: .8rem;
                font-weight: 800;
            }
            .home-event-location,
            .home-event-description {
                margin: .18rem 0 0;
                color: var(--gray);
                font-size: .82rem;
                line-height: 1.45;
            }
            .home-event-description {
                display: -webkit-box;
                overflow: hidden;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }
            @media (max-width: 900px) {
                .home-events-grid { grid-template-columns: 1fr; }
            }
            @media (max-width: 620px) {
                .home-events-header { align-items: flex-start; flex-direction: column; }
                .home-event-card { grid-template-columns: 64px minmax(0, 1fr); }
            }
            @media (prefers-reduced-motion: reduce) {
                .home-event-card { transition: none; }
                .home-event-card:hover { transform: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function addEventsLink(container, afterSelector = null) {
        if (!container || container.querySelector('a[href="/events.html"]')) return;
        const link = document.createElement('a');
        link.href = EVENTS_PAGE;
        link.textContent = 'Events';

        const after = afterSelector ? container.querySelector(afterSelector) : null;
        if (after?.nextSibling) {
            container.insertBefore(link, after.nextSibling);
        } else if (after) {
            container.appendChild(link);
        } else {
            container.appendChild(link);
        }
    }

    function installNavigation() {
        addEventsLink(document.querySelector('header .nav-links'), 'a[data-page="shop"]');
        addEventsLink(document.getElementById('mobileNav'), 'a[data-page="shop"]');

        const quickLinks = Array.from(document.querySelectorAll('footer .footer-grid > div'))
            .find(column => /quick links/i.test(column.querySelector('h4')?.textContent || ''));
        if (quickLinks && !quickLinks.querySelector('a[href="/events.html"]')) {
            const shopLink = quickLinks.querySelector('a[data-page="shop"]');
            const link = document.createElement('a');
            link.href = EVENTS_PAGE;
            link.textContent = 'Events';
            const br = document.createElement('br');
            if (shopLink) {
                const shopBreak = shopLink.nextSibling;
                if (shopBreak?.nextSibling) {
                    quickLinks.insertBefore(link, shopBreak.nextSibling);
                    quickLinks.insertBefore(br, link.nextSibling);
                } else {
                    quickLinks.append(link, br);
                }
            } else {
                quickLinks.append(link, br);
            }
        }
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
            return formatDate(start, { month: 'long', day: 'numeric' });
        }
        if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
            return `${formatDate(start, { month: 'short' })} ${start.getDate()}–${end.getDate()}`;
        }
        return `${formatDate(start, { month: 'short', day: 'numeric' })} – ${formatDate(end, { month: 'short', day: 'numeric' })}`;
    }

    function eventLocation(event) {
        const cityState = [event.city, event.state]
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .join(', ');
        return [event.venue, cityState]
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .join(' · ');
    }

    function eventCard(event) {
        const start = parseDate(event.start_date);
        const card = document.createElement('a');
        card.className = 'home-event-card';
        card.href = EVENTS_PAGE;
        card.setAttribute('aria-label', `View event details for ${event.name || 'upcoming event'}`);

        const date = document.createElement('div');
        date.className = 'home-event-date';
        const month = document.createElement('span');
        month.className = 'home-event-month';
        month.textContent = start ? formatDate(start, { month: 'short' }).toUpperCase() : 'DATE';
        const day = document.createElement('span');
        day.className = 'home-event-day';
        day.textContent = start ? String(start.getDate()) : '—';
        date.append(month, day);

        const copy = document.createElement('div');
        copy.className = 'home-event-copy';
        const title = document.createElement('h3');
        title.textContent = event.name || 'Upcoming Event';
        const dates = document.createElement('p');
        dates.className = 'home-event-dates';
        dates.textContent = dateRange(event);
        copy.append(title, dates);

        const location = eventLocation(event);
        if (location) {
            const line = document.createElement('p');
            line.className = 'home-event-location';
            line.textContent = location;
            copy.appendChild(line);
        }

        const description = String(event.public_description || '').trim();
        if (description) {
            const text = document.createElement('p');
            text.className = 'home-event-description';
            text.textContent = description;
            copy.appendChild(text);
        }

        card.append(date, copy);
        return card;
    }

    function findInsertPoint(homePage) {
        const sections = Array.from(homePage.querySelectorAll(':scope > section'));
        return sections.find(section => /meet the\s*parents/i.test(section.querySelector('h2')?.textContent || ''))
            || homePage.querySelector(':scope > .contact-strip')
            || null;
    }

    function buildSection(events) {
        const homePage = document.getElementById('page-home');
        if (!homePage || document.querySelector('[data-home-events-section]')) return;

        const section = document.createElement('section');
        section.className = 'section home-events-section';
        section.dataset.homeEventsSection = '';

        const header = document.createElement('div');
        header.className = 'home-events-header';
        const headingCopy = document.createElement('div');
        const heading = document.createElement('h2');
        heading.className = 'section-title';
        heading.textContent = 'Find Us at an Upcoming Show';
        const divider = document.createElement('div');
        divider.className = 'divider';
        const subtitle = document.createElement('p');
        subtitle.className = 'section-subtitle';
        subtitle.textContent = 'See where Red Rocks Exotic Reptiles will be vending next around Colorado.';
        headingCopy.append(heading, divider, subtitle);

        const allEvents = document.createElement('a');
        allEvents.className = 'home-events-link';
        allEvents.href = EVENTS_PAGE;
        allEvents.textContent = 'View All Events →';
        header.append(headingCopy, allEvents);

        const grid = document.createElement('div');
        grid.className = 'home-events-grid';
        events.slice(0, 3).forEach(event => grid.appendChild(eventCard(event)));
        section.append(header, grid);

        const insertPoint = findInsertPoint(homePage);
        if (insertPoint) homePage.insertBefore(section, insertPoint);
        else homePage.appendChild(section);
    }

    async function loadEvents() {
        try {
            const response = await fetch(EVENTS_URL, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_include_past: false })
            });
            if (!response.ok) return;
            const events = await response.json().catch(() => null);
            if (!Array.isArray(events) || events.length === 0) return;
            buildSection(events);
        } catch (error) {
            console.warn('[home-events] event preview unavailable', error);
        }
    }

    function init() {
        installStyles();
        installNavigation();
        loadEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
