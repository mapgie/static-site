// header.js — loads the shared site header and wires the mobile menu.
// The header is injected with innerHTML, so any <script> inside header.html
// would never run; the menu behaviour lives here instead.
(function () {
  const placeholder = document.getElementById('header-placeholder');
  if (!placeholder) return;

  fetch('header.html')
    .then(response => response.text())
    .then(html => {
      placeholder.innerHTML = html;
      const hamburger = document.getElementById('hamburger');
      const navLinks  = document.getElementById('nav-links');
      if (!hamburger || !navLinks) return;

      hamburger.addEventListener('click', e => {
        e.stopPropagation();
        navLinks.classList.toggle('show');
      });
      // Close the menu when a link is chosen or when tapping elsewhere.
      navLinks.addEventListener('click', e => {
        if (e.target.closest('a')) navLinks.classList.remove('show');
      });
      document.addEventListener('click', e => {
        if (!navLinks.contains(e.target)) navLinks.classList.remove('show');
      });
    })
    .catch(() => {});
})();
