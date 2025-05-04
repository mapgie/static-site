 
// interaction.js
// Handles clicks on the first button and updates the <p> text
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('test-button');
  const output = document.getElementById('output');

  button.addEventListener('click', () => {
    output.textContent = '🎉 interaction.js: Button clicked!';
  });
});