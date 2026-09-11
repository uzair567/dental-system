const API_BASE = '/api';
const CLINIC = {
  name: 'Meridian Dental',
  phone: '+92 300 1234567',
  whatsapp: '923001234567',
  email: 'hello@meridiandental.pk',
  address: 'Suite 4, Blue Court Plaza, Blue Area, Islamabad',
  hours: 'Mon–Sat, 10:00 AM – 8:00 PM'
};

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderHeader(active) {
  const links = [
    ['index.html', 'Home', 'home'],
    ['about.html', 'About', 'about'],
    ['services.html', 'Services', 'services'],
    ['dentists.html', 'Our Dentists', 'dentists'],
    ['blog.html', 'Blog', 'blog'],
    ['faq.html', 'FAQs', 'faq'],
    ['contact.html', 'Contact', 'contact'],
  ];
  const navHtml = links.map(([href, label, key]) =>
    `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('');

  document.querySelectorAll('[data-header]').forEach(el => {
    el.innerHTML = `
      <div class="topbar-inner">
        <a href="index.html" class="brand"><span class="brand-mark">M</span>${CLINIC.name}</a>
        <nav class="mainnav">${navHtml}</nav>
        <div class="topbar-cta">
          <span class="phone-link">${CLINIC.phone}</span>
          <a href="booking.html" class="btn btn-primary">Book Appointment</a>
        </div>
      </div>`;
  });
}

function renderFooter() {
  document.querySelectorAll('[data-footer]').forEach(el => {
    el.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="brand" style="color:#fff;margin-bottom:12px;"><span class="brand-mark">M</span>${CLINIC.name}</div>
            <p style="color:#b9c8c1;font-size:.9rem;max-width:32ch;">Modern, gentle dental care for the whole family — from routine check-ups to full smile makeovers.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href="services.html">Services</a>
            <a href="dentists.html">Our Dentists</a>
            <a href="blog.html">Blog</a>
            <a href="faq.html">FAQs</a>
          </div>
          <div>
            <h4>Patients</h4>
            <a href="booking.html">Book an appointment</a>
            <a href="contact.html">Contact us</a>
            <a href="about.html">About the clinic</a>
          </div>
          <div>
            <h4>Reach us</h4>
            <a href="tel:${CLINIC.phone.replace(/\s/g, '')}">${CLINIC.phone}</a>
            <a href="mailto:${CLINIC.email}">${CLINIC.email}</a>
            <span style="display:block;color:#b9c8c1;font-size:.9rem;margin-top:6px;">${CLINIC.address}</span>
            <span style="display:block;color:#b9c8c1;font-size:.85rem;margin-top:6px;">${CLINIC.hours}</span>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${CLINIC.name}. All rights reserved.</span>
          <span>Admin sign in: <a href="/admin/" style="color:#dfe8e3;text-decoration:underline;">staff portal</a></span>
        </div>
      </div>`;
  });
}

function renderFloatButtons() {
  const el = document.createElement('div');
  el.className = 'float-actions';
  el.innerHTML = `
    <a class="float-btn wa" title="Chat on WhatsApp" target="_blank"
       href="https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent('Hi, I would like to ask about an appointment.')}">💬</a>
    <a class="float-btn call" title="Call the clinic" href="tel:${CLINIC.phone.replace(/\s/g, '')}">📞</a>`;
  document.body.appendChild(el);
}

function toothSvg() {
  return `<svg class="tooth-svg" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 6C34 6 20 22 20 46c0 20 7 34 11 55 3 15 6 33 15 33 10 0 10-26 14-26s4 26 14 26c9 0 12-18 15-33 4-21 11-35 11-55C100 22 86 6 60 6Z"
      stroke="currentColor" stroke-width="3" fill="none"/>
    <path d="M38 40c4-8 12-12 22-12s18 4 22 12" stroke="currentColor" stroke-width="2" opacity=".5"/>
  </svg>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderFooter();
  renderFloatButtons();
});
