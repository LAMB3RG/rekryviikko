const questions = [
  {
    question: "Mitä ohjelmointi tarkoittaa?",
    answers: [
      "Tietokoneelle annettavien ohjeiden kirjoittamista",
      "Tietokoneen osien maalaamista",
      "Vain pelien pelaamista"
    ],
    correct: 0
  },
  {
    question: "Mikä näistä on ohjelmointikieli?",
    answers: ["Wi-Fi", "Python", "Bluetooth"],
    correct: 1
  },
  {
    question: "Mitä tietoturva auttaa tekemään?",
    answers: [
      "Tekemään näytöstä kirkkaamman",
      "Lataamaan akun nopeammin",
      "Suojaamaan laitteita ja tietoja"
    ],
    correct: 2
  },
  {
    question: "Mitä käyttöliittymäsuunnittelussa tehdään?",
    answers: [
      "Korjataan vain tietokoneen näppäimiä",
      "Suunnitellaan, miten sovellusta käytetään",
      "Valitaan internet-yhteyden nopeus"
    ],
    correct: 1
  },
  {
    question: "Mitä IT-alan opinnoissa voi oppia?",
    answers: [
      "Vain käyttämään yhtä tietokoneohjelmaa",
      "Ainoastaan kirjoittamaan sähköposteja",
      "Ohjelmointia, laitteita ja digitaalisten palvelujen tekemistä"
    ],
    correct: 2
  }
];

const startScreen = document.querySelector("#start-screen");
const quizScreen = document.querySelector("#quiz-screen");
const resultScreen = document.querySelector("#result-screen");
const questionElement = document.querySelector("#question");
const questionCount = document.querySelector("#question-count");
const answerList = document.querySelector("#answer-list");
const feedback = document.querySelector("#feedback");
const nextButton = document.querySelector("#next-button");
const progressTrack = document.querySelector("#progress-track");
const progressFill = document.querySelector("#progress-fill");
const gameTimer = document.querySelector("#game-timer");

let currentQuestion = 0;
let score = 0;
let timerId;
let idleTimerId;
let deadline;
const idleTimeout = 60 * 1000;

// Aloittaa uuden pelikerran ja näyttää ensimmäisen kysymyksen.
function startGame() {
  clearInterval(timerId);
  clearTimeout(idleTimerId);
  currentQuestion = 0;
  score = 0;
  deadline = Date.now() + 5 * 60 * 1000;
  gameTimer.textContent = "5:00";
  startScreen.hidden = true;
  resultScreen.hidden = true;
  quizScreen.hidden = false;
  showQuestion();
  timerId = setInterval(updateTimer, 1000);
  resetIdleTimer();
}

// Piirtää kysymyksen ja päivittää etenemispalkin.
function showQuestion() {
  const item = questions[currentQuestion];
  questionElement.textContent = item.question;
  questionCount.textContent = `${currentQuestion + 1}/${questions.length}`;
  progressTrack.setAttribute("aria-valuenow", String(currentQuestion + 1));
  progressFill.style.width = `${((currentQuestion + 1) / questions.length) * 100}%`;
  answerList.replaceChildren();
  feedback.textContent = "";
  feedback.className = "feedback";
  nextButton.hidden = true;

  item.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.type = "button";
    button.textContent = answer;
    button.addEventListener("click", () => chooseAnswer(index));
    answerList.append(button);
  });
  questionElement.focus();
}

// Lukitsee vastaukset ja antaa heti palautteen.
function chooseAnswer(selectedIndex) {
  updateTimer();
  if (quizScreen.hidden) {
    return;
  }

  const item = questions[currentQuestion];
  const buttons = answerList.querySelectorAll(".answer-button");
  const isCorrect = selectedIndex === item.correct;

  buttons.forEach((button, index) => {
    button.disabled = true;
    if (index === item.correct) {
      button.classList.add("is-correct");
    }
  });

  if (isCorrect) {
    score += 1;
    feedback.textContent = "Oikein! Hyvä tietää.";
    feedback.classList.add("is-correct");
  } else {
    feedback.textContent = `Ei aivan. Oikea vastaus: ${item.answers[item.correct]}`;
    feedback.classList.add("is-wrong");
    buttons[selectedIndex].classList.add("is-wrong");
  }

  nextButton.textContent = currentQuestion === questions.length - 1
    ? "Katso tulos"
    : "Seuraava kysymys";
  nextButton.hidden = false;
  nextButton.focus();
}

// Siirtyy seuraavaan kysymykseen tai näyttää loppupisteet.
function continueGame() {
  updateTimer();
  if (quizScreen.hidden) {
    return;
  }

  currentQuestion += 1;
  if (currentQuestion < questions.length) {
    showQuestion();
    return;
  }

  showResult();
}

// Näyttää pisteet ja lyhyen kannustavan palautteen.
function showResult(timeExpired = false) {
  clearInterval(timerId);
  quizScreen.hidden = true;
  resultScreen.hidden = false;
  progressTrack.setAttribute("aria-valuenow", String(questions.length));
  progressFill.style.width = "100%";
  document.querySelector("#result-score").textContent = `${score} / ${questions.length}`;

  let message = "Hyvä yritys — nyt tiedät IT-alasta jo vähän enemmän.";
  if (score === questions.length) {
    message = "Täydet pisteet! IT-pulssi on vahva.";
  } else if (score >= 3) {
    message = "Hienosti tehty! Sinulla on jo hyvä tuntuma IT-alaan.";
  }
  if (timeExpired) {
    message = `Aika loppui. ${message}`;
  }
  document.querySelector("#result-message").textContent = message;
}

// Palaa aloitusruutuun, kun peliä ei ole käytetty minuuttiin.
function returnToStart() {
  clearInterval(timerId);
  clearTimeout(idleTimerId);
  currentQuestion = 0;
  score = 0;
  quizScreen.hidden = true;
  resultScreen.hidden = true;
  startScreen.hidden = false;
}

// Aloittaa käyttämättömyysajan uudelleen pelin aikana.
function resetIdleTimer() {
  clearTimeout(idleTimerId);
  if (!startScreen.hidden) {
    return;
  }

  idleTimerId = setTimeout(returnToStart, idleTimeout);
}

// Laskee jäljellä olevan ajan ja päättää pelin ajan loppuessa.
function updateTimer() {
  const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  gameTimer.textContent = `${minutes}:${seconds}`;

  if (secondsLeft === 0) {
    clearInterval(timerId);
    showResult(true);
  }
}

// Käyttäjän toiminta estää peliä palaamasta aloitukseen kesken pelaamisen.
["pointerdown", "pointermove", "keydown", "touchstart", "wheel"].forEach((eventName) => {
  document.addEventListener(eventName, resetIdleTimer, { passive: true });
});

document.querySelector("#start-button").addEventListener("click", startGame);
document.querySelector("#restart-button").addEventListener("click", startGame);
nextButton.addEventListener("click", continueGame);