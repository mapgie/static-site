fetch('header.html')
.then(response => response.text())
.then(data => {
  document.getElementById('header-placeholder').innerHTML = data;
});

const buttons = document.querySelectorAll('.choice');
const userChoiceSpan = document.getElementById('user-choice');
const computerChoiceSpan = document.getElementById('computer-choice');
const resultSpan = document.getElementById('result');
const playAgainButton = document.getElementById('play-again');
const choices = ['Rock', 'Paper', 'Scissors'];

buttons.forEach(button => {
button.addEventListener('click', () => {
  if (button.classList.contains('disabled')) return;

  const userChoice = button.dataset.choice;
  const computerChoice = getComputerChoice();
  const result = determineWinner(userChoice, computerChoice);

  userChoiceSpan.textContent = userChoice;
  computerChoiceSpan.textContent = computerChoice;
  resultSpan.textContent = result;

  buttons.forEach(b => b.classList.add('disabled'));
  button.classList.remove('disabled');
});
});

playAgainButton.addEventListener('click', () => {
userChoiceSpan.textContent = '';
computerChoiceSpan.textContent = '';
resultSpan.textContent = '';
buttons.forEach(button => button.classList.remove('disabled'));
});

function getComputerChoice() {
const index = Math.floor(Math.random() * choices.length);
return choices[index];
}

function determineWinner(user, computer) {
if (user === computer) return "It's a Draw!";
if ((user === 'Rock' && computer === 'Scissors') ||
    (user === 'Paper' && computer === 'Rock') ||
    (user === 'Scissors' && computer === 'Paper')) {
  return "You Win!";
} else {
  return "You Lose!";
}
}