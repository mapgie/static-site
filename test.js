// test.js
// wait for the DOM to be fully parsed
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('test-button');
    const output = document.getElementById('output');

    button.addEventListener('click', () => {
        // update the <p> to show that JS fired
        output.textContent = 'Button clicked! JavaScript is working.';
    });
});