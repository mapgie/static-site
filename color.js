 
// color.js
// Toggles the background color of the second button each click
document.addEventListener('DOMContentLoaded', () => {
  const colorBtn = document.getElementById('color-button');

  colorBtn.addEventListener('click', () => {
    const isBlue = colorBtn.style.backgroundColor === 'skyblue';
    colorBtn.style.backgroundColor = isBlue ? '' : 'skyblue';
  });
});