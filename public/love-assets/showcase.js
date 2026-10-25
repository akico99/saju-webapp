'use strict';
document.querySelectorAll('[data-love-price]').forEach(n => { n.textContent = window.LoveBrand.product.priceKrw.toLocaleString('ko-KR') + '원'; });
const navLinks = [...document.querySelectorAll('.category-nav a')];
navLinks.forEach(a => a.addEventListener('click', () => { navLinks.forEach(n => n.classList.toggle('active', n === a)); }));
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) navLinks.forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id)); });
}, { rootMargin: '-15% 0px -55% 0px' });
navLinks.forEach(a => { const section = document.querySelector(a.hash); if(section) observer.observe(section); });
