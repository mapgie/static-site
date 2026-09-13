// rps.js — Rock Paper Scissors
'use strict';

const CHOICES = ['Rock', 'Paper', 'Scissors'];
const BEATS   = { Rock: 'Scissors', Paper: 'Rock', Scissors: 'Paper' };

const buttons           = document.querySelectorAll('.choice');
const userChoiceSpan    = document.getElementById('user-choice');
const computerChoiceSpan = document.getElementById('computer-choice');
const resultSpan        = document.getElementById('result');
const playAgainButton   = document.getElementById('play-again');
const scoreSpans = {
  wins:   document.getElementById('score-wins'),
  losses: document.getElementById('score-losses'),
  draws:  document.getElementById('score-draws')
};

const score = { wins: 0, losses: 0, draws: 0 };
let roundOver = false;

function getComputerChoice() {
  return CHOICES[Math.floor(Math.random() * CHOICES.length)];
}

function determineWinner(user, computer) {
  if (user === computer) return 'draw';
  return BEATS[user] === computer ? 'win' : 'lose';
}

function renderScore() {
  scoreSpans.wins.textContent   = score.wins;
  scoreSpans.losses.textContent = score.losses;
  scoreSpans.draws.textContent  = score.draws;
}

function playRound(userChoice) {
  if (roundOver) return;
  roundOver = true;

  const computerChoice = getComputerChoice();
  const outcome = determineWinner(userChoice, computerChoice);

  userChoiceSpan.textContent     = userChoice;
  computerChoiceSpan.textContent = computerChoice;
  resultSpan.textContent = outcome === 'draw' ? "It's a draw!" : outcome === 'win' ? 'You win!' : 'You lose!';
  resultSpan.dataset.outcome = outcome;

  if (outcome === 'win') score.wins++;
  else if (outcome === 'lose') score.losses++;
  else score.draws++;
  renderScore();

  buttons.forEach(b => {
    b.disabled = b.dataset.choice !== userChoice;
    b.classList.toggle('picked', b.dataset.choice === userChoice);
  });
  playAgainButton.hidden = false;
  playAgainButton.focus();
}

function resetRound() {
  roundOver = false;
  userChoiceSpan.textContent = computerChoiceSpan.textContent = resultSpan.textContent = '';
  delete resultSpan.dataset.outcome;
  buttons.forEach(b => { b.disabled = false; b.classList.remove('picked'); });
  playAgainButton.hidden = true;
}

buttons.forEach(button => button.addEventListener('click', () => playRound(button.dataset.choice)));
playAgainButton.addEventListener('click', resetRound);
resetRound();
renderScore();
