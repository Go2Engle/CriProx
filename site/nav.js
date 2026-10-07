// Native <details> keeps the mobile menu usable without JavaScript.
const menu = document.querySelector('.mobile-navigation');
const toggle = menu.querySelector('summary');
const desktop = window.matchMedia('(min-width: 768px)');

function closeMenu(restoreFocus = false) {
  menu.open = false;
  if (restoreFocus) toggle.focus();
}

function updateToggle() {
  toggle.setAttribute('aria-expanded', String(menu.open));
  toggle.setAttribute('aria-label', menu.open ? 'Close menu' : 'Open menu');
}

updateToggle();
menu.addEventListener('toggle', updateToggle);

document.addEventListener('keydown', (event) => {
  if (menu.open && event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);
  }
});

document.addEventListener('pointerdown', (event) => {
  if (menu.open && !menu.contains(event.target)) closeMenu();
});

menu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => closeMenu());
});

desktop.addEventListener('change', () => {
  if (desktop.matches) {
    if (menu.contains(document.activeElement)) document.querySelector('.header > .brand').focus();
    closeMenu();
  }
});
