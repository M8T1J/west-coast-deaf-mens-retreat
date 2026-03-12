const nav = document.getElementById('site-nav');
const menuToggle = document.querySelector('.menu-toggle');

if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
        const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!expanded));
        nav.classList.toggle('open');
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            menuToggle.setAttribute('aria-expanded', 'false');
            nav.classList.remove('open');
        });
    });
}

// Active link by current page.
if (nav) {
    const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    nav.querySelectorAll('a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href.toLowerCase() === currentFile) {
            link.classList.add('active');
        }
    });
}

// Countdown timer (home page only).
const countdownRoot = document.querySelector('.countdown[data-countdown-target]');
if (countdownRoot) {
    const targetValue = countdownRoot.getAttribute('data-countdown-target');
    const targetDate = new Date(targetValue).getTime();

    const daysEl = document.getElementById('count-days');
    const hoursEl = document.getElementById('count-hours');
    const minutesEl = document.getElementById('count-minutes');
    const secondsEl = document.getElementById('count-seconds');
    const statusEl = document.getElementById('countdown-status');

    const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

    const renderCountdown = () => {
        const remaining = targetDate - Date.now();
        if (remaining <= 0) {
            if (daysEl) daysEl.textContent = '000';
            if (hoursEl) hoursEl.textContent = '00';
            if (minutesEl) minutesEl.textContent = '00';
            if (secondsEl) secondsEl.textContent = '00';
            if (statusEl) statusEl.textContent = 'Retreat has started.';
            return true;
        }

        const totalSeconds = Math.floor(remaining / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (daysEl) daysEl.textContent = String(days).padStart(3, '0');
        if (hoursEl) hoursEl.textContent = pad(hours);
        if (minutesEl) minutesEl.textContent = pad(minutes);
        if (secondsEl) secondsEl.textContent = pad(seconds);
        return false;
    };

    if (!Number.isNaN(targetDate)) {
        if (!renderCountdown()) {
            const timer = setInterval(() => {
                if (renderCountdown()) {
                    clearInterval(timer);
                }
            }, 1000);
        }
    }
}

// Contact page helper.
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const status = document.getElementById('form-status');
        if (status) {
            status.textContent = 'Thank you. Your message is ready. Please email wcdeafmr@gmail.com if you need a direct reply right away.';
        }
    });
}

// Footer year.
document.querySelectorAll('.current-year').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
});
