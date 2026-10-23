// ======================================================
// MINI-PELI: BUGI KOODISSA
// ======================================================
// Pelaajalle näytetään lyhyt koodipätkä. Hänen pitää klikata riviä, jossa on virhe.
// Tämä tiedosto sisältää sekä tehtävät (BUGIT) että pelin logiikan.

// ---------- Asetukset ----------
          // sekuntia koko mini-pelille
const BUGEJA_PELISSA = 3;      // montako koodipätkää arvotaan
const PISTEET_BUGI = 75;       // pisteet jokaisesta löydetystä bugista

// ---------- Tehtävät ----------
// vika = sen rivin numero, jossa virhe on (ensimmäinen rivi on 0)
const BUGIT = [
  { kieli: "Python", tehtava: "Ohjelman pitäisi tervehtiä Mattia nimellä. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['nimi = input("Mikä on nimesi? ")',
            'if nimi = "Matti":',
            '    print("Hei Matti!")',
            'else:',
            '    print("Hei vieras!")'],
    vika: 1,
    selitys: "Vertailussa pitää käyttää kahta yhtäläisyysmerkkiä (==). Yksi = tallentaa arvon, kaksi == vertaa arvoja." },

  { kieli: "JavaScript", tehtava: "Pelin pitäisi päättyä, kun elämät loppuvat. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['let elamat = 3;',
            'while (elamat > 0) {',
            '  console.log("Peli jatkuu");',
            '  elamat = elamat + 1;',
            '}'],
    vika: 3,
    selitys: "Elämät kasvavat joka kierroksella eivätkä koskaan lopu, joten silmukka pyörii ikuisesti. Pitäisi olla elamat - 1." },

  { kieli: "JavaScript", tehtava: "Funktion pitäisi laskea kahden luvun keskiarvo. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['function keskiarvo(a, b) {',
            '  let summa = a + b;',
            '  return summa / 3;',
            '}'],
    vika: 2,
    selitys: "Kahden luvun keskiarvo saadaan jakamalla kahdella, ei kolmella." },

  { kieli: "HTML", tehtava: "Sivun pitäisi näyttää otsikko ja kappale. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['<h1>Tervetuloa!',
            '<p>Tämä on sivuni.</p>'],
    vika: 0,
    selitys: "Otsikolta puuttuu sulkeva merkintä </h1>. Selain ei tiedä, mihin otsikko loppuu." },

  { kieli: "CSS", tehtava: "Napin pitäisi olla punainen ja keltataustainen. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['.nappi {',
            '  color: red',
            '  background: yellow;',
            '}'],
    vika: 1,
    selitys: "Rivin loppuun puuttuu puolipiste. Ilman sitä selain sekoittaa kaksi riviä yhteen." },

  { kieli: "JavaScript", tehtava: "Ohjelman pitäisi tervehtiä pelaajaa. Valitse koodirivi, joka aiheuttaa bugin.",
    rivit: ['let pelaaja = "Aino";',
            'console.log("Hei " + Pelaaja);'],
    vika: 1,
    selitys: "JavaScript erottaa isot ja pienet kirjaimet. Pelaaja ja pelaaja ovat kaksi eri muuttujaa." },

  { kieli: "JavaScript", tehtava: "Funktion pitäisi päästää sisään vain oikealla salasanalla. Missä on tietoturvaongelma?",
    rivit: ['function kirjaudu(syote) {',
            '  const salasana = "admin123";',
            '  return syote === salasana;',
            '}'],
    vika: 1,
    selitys: "Salasana on kirjoitettu suoraan koodiin. Kuka tahansa, joka näkee koodin, näkee myös salasanan." }
];

// ---------- Muisti ----------
let bugiCallback = null;
let bugiKesken = false;
let bugiLista = [];      // tässä pelissä arvotut tehtävät
let bugiNro = 0;         // monesko tehtävä on menossa
let bugiOikein = 0;
let bugiTulokset = [];
let bugiLukittu = false; // onko nykyiseen tehtävään jo vastattu

// ---------- Elementit ----------
const bugiKoodiEl = $("bugi-koodi");
const bugiSelitysEl = $("bugi-selitys");
const bugiSeuraavaEl = $("bugi-seuraava");

// ---------- Pelin kulku ----------
function aloitaBugipeli(callback) {
  bugiCallback = callback;
  bugiKesken = true;
  bugiLista = sekoita(BUGIT).slice(0, BUGEJA_PELISSA);   // sekoita() löytyy script.js:stä
  bugiNro = 0;
  bugiOikein = 0;
  bugiTulokset = [];
  $("bugi-huomio").textContent = huomio;
  naytaNaytto("naytto-bugi");
  naytaBugi();
}

function naytaBugi() {
  const b = bugiLista[bugiNro];
  bugiLukittu = false;
  $("bugi-laskuri").textContent = "Koodipätkä " + (bugiNro + 1) + " / " + bugiLista.length + " · " + b.kieli;
  $("bugi-tehtava").textContent = b.tehtava;

  // Rakennetaan koodin rivit nappeina. textContent estää sen, että <h1> tulkittaisiin oikeaksi HTML:ksi.
  bugiKoodiEl.innerHTML = "";
  b.rivit.forEach((rivi, i) => {
    const nappi = document.createElement("button");
    nappi.className = "koodirivi";
    nappi.dataset.i = i;
    const nro = document.createElement("span");
    nro.className = "rivinro";
    nro.textContent = i + 1;
    const koodi = document.createElement("code");
    koodi.textContent = rivi;
    nappi.appendChild(nro);
    nappi.appendChild(koodi);
    bugiKoodiEl.appendChild(nappi);
  });

  bugiSelitysEl.classList.add("piilossa");
  bugiSeuraavaEl.classList.add("piilossa");
}

function klikkaaKoodiriviä(tapahtuma) {
  const nappi = tapahtuma.target.closest(".koodirivi");
  if (!nappi || bugiLukittu || !bugiKesken) return;
  bugiLukittu = true;

  const b = bugiLista[bugiNro];
  const valittu = Number(nappi.dataset.i);
  const oikein = (valittu === b.vika);

  bugiTulokset.push({ oikein, tehtava: "Kooditehtävä: " + b.tehtava, selitys: b.selitys });
  if (oikein) bugiOikein += 1;
  else nappi.classList.add("vaara");
  bugiKoodiEl.children[b.vika].classList.add("oikea");   // näytetään aina oikea rivi

  bugiSelitysEl.textContent = (oikein ? "Oikein! " : "Ei aivan. ") + b.selitys;
  bugiSelitysEl.className = "selitys " + (oikein ? "oikein" : "vaarin");
  bugiSeuraavaEl.textContent = (bugiNro === bugiLista.length - 1) ? "Valmis" : "Seuraava";
  bugiSeuraavaEl.classList.remove("piilossa");
}

function seuraavaBugi() {
  if (!bugiKesken) return;
  bugiNro += 1;
  if (bugiNro >= bugiLista.length) paataBugipeli();
  else naytaBugi();
}

function paataBugipeli() {
  if (!bugiKesken) return;
  bugiKesken = false;
  clearInterval(ajastin);

  const yht = bugiLista.length;
  let teksti = bugiOikein === yht ? "Löysit kaikki bugit! " : "Löysit " + bugiOikein + " / " + yht + " bugia. ";
  teksti += "Virheiden etsiminen eli debuggaus on iso osa ohjelmoijan työtä. Tekoälykin tekee virheitä, joten niiden löytäminen on tärkeä taito.";

  let turvaMuutos = 0;
  if (bugiOikein === yht) turvaMuutos = 5;
  else if (bugiOikein === 0) turvaMuutos = -10;

  bugiCallback({ oikein: bugiOikein, yht: yht, tulokset: bugiTulokset, pisteet: bugiOikein * PISTEET_BUGI,
                 turvaMuutos: turvaMuutos, teksti: teksti });
}

// ---------- Kuuntelijat ----------
bugiKoodiEl.addEventListener("click", klikkaaKoodiriviä);
bugiSeuraavaEl.addEventListener("click", seuraavaBugi);
