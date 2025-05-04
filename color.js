// color.js
document.addEventListener('DOMContentLoaded', () => {
  const colorBtn = document.getElementById('color-button');
  let toggled = false;

  colorBtn.addEventListener('click', () => {
    toggled = !toggled;

    if (toggled) {
      // move 100px right and grow to 1.5× size
      colorBtn.style.transition = 'transform 0.3s ease';
      colorBtn.style.transform   = 'translateX(100px) scale(1.5)';
    } else {
      // return to original
      colorBtn.style.transform = 'translateX(0) scale(1)';
    }
  });
});