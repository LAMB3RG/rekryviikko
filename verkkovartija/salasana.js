// ======================================================
// MINI-PELI: SALASANAPAJA
// ======================================================
// Tämä tiedosto hoitaa vain salasanapelin. Pelin muu logiikka on script.js:ssä.
// Salasanaa ei lähetetä minnekään: kaikki laskenta tapahtuu omalla koneellasi.

// ---------- Asetukset ----------
const ARVAUKSIA_SEKUNNISSA = 1e10;          // huijarin nopeus: 10 miljardia arvausta / s
const SEKUNTIA_VUODESSA = 31557600;

// Sanat ja kuviot, jotka huijari kokeilee ensimmäisenä (sanakirjahyökkäys)
const YLEISET = ["salasana", "password", "qwerty", "admin", "1234", "abcd", "iloveyou",
                 "letmein", "minecraft", "forssa", "vartija", "kissa123", "koira123"];

// Huijari tuntee myös kirjainten vaihdot numeroiksi (p4ssw0rd)
const KORVAUKSET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

// Tasot: murtoajan mukaan. pisteet ja turvaMuutos vaikuttavat peliin.
const TASOT = [
  { nimi: "Murtuu heti",  pisteet: 0,   turvaMuutos: -15 },
  { nimi: "Heikko",       pisteet: 50,  turvaMuutos: -5 },
  { nimi: "Kohtalainen",  pisteet: 100, turvaMuutos: 0 },
  { nimi: "Hyvä",         pisteet: 200, turvaMuutos: 5 },
  { nimi: "Vahva",        pisteet: 300, turvaMuutos: 10 }
];

// ---------- Muisti ----------
let salasanaCallback = null;   // funktio, jota kutsutaan kun peli päättyy
let salasanaKesken = false;

// ---------- Elementit ----------
const kenttaEl = $("salasana-kentta");
const murtoaikaEl = $("murtoaika");
const vahvuusTaytto = $("vahvuus-taytto");
const vahvuusTeksti = $("vahvuus-teksti");
const vihjeetEl = $("salasana-vihjeet");

// ---------- Laskenta (puhtaita funktioita: ottavat sisään ja palauttavat tuloksen) ----------

// Arvioi salasanan ja laskee, kuinka kauan sen murtaminen kestäisi sekunteina
function arvioiSalasana(sana) {
  const pieni = sana.toLowerCase();
  const korvattu = [...pieni].map((c) => KORVAUKSET[c] || c).join("");
  const yleinen = YLEISET.some((y) => pieni.includes(y) || korvattu.includes(y))
                  || (sana.length > 0 && new Set(sana).size <= 3);

  const onPieni = /[a-zåäö]/.test(sana);
  const onIso = /[A-ZÅÄÖ]/.test(sana);
  const onNumero = /[0-9]/.test(sana);
  const onMerkki = /[^a-zA-ZåäöÅÄÖ0-9]/.test(sana);

  // Montako erilaista merkkiä huijarin pitää kokeilla joka kohtaan
  let merkistoa = 0;
  if (onPieni) merkistoa += 29;
  if (onIso) merkistoa += 29;
  if (onNumero) merkistoa += 10;
  if (onMerkki) merkistoa += 33;

  let aika;
  if (sana.length === 0 || yleinen) {
    aika = 0.5;                                   // sanakirjasta löytyy heti
  } else {
    // Kaikki mahdolliset yhdistelmät = merkistö ^ pituus. Keskimäärin löytyy puolivälissä.
    aika = Math.pow(merkistoa, sana.length) / 2 / ARVAUKSIA_SEKUNNISSA;
  }
  return { aika, yleinen, pituus: sana.length, onPieni, onIso, onNumero, onMerkki };
}

// Muuttaa murtoajan tasoksi 0-4
function laskeTaso(aika) {
  if (aika < 1) return 0;
  if (aika < 3600) return 1;
  if (aika < SEKUNTIA_VUODESSA) return 2;
  if (aika < 100 * SEKUNTIA_VUODESSA) return 3;
  return 4;
}

// Muuttaa sekunnit luettavaksi tekstiksi
function muotoileAika(s) {
  if (s < 1) return "alle sekunnin";
  if (s < 60) return Math.round(s) + " sekuntia";
  if (s < 3600) return Math.round(s / 60) + " minuuttia";
  if (s < 86400) return Math.round(s / 3600) + " tuntia";
  if (s < SEKUNTIA_VUODESSA) return Math.round(s / 86400) + " päivää";
  const v = s / SEKUNTIA_VUODESSA;
  if (v < 1000) return Math.round(v) + " vuotta";
  if (v < 1e6) return "tuhansia vuosia";
  if (v < 1e9) return "miljoonia vuosia";
  return "miljardeja vuosia";
}

// ---------- Näyttö ----------
function paivitaSalasana() {
  const a = arvioiSalasana(kenttaEl.value);
  const taso = laskeTaso(a.aika);

  murtoaikaEl.textContent = a.pituus === 0 ? "-" : muotoileAika(a.aika);
  vahvuusTeksti.textContent = a.pituus === 0 ? "Kirjoita salasana" : TASOT[taso].nimi;

  // Palkki: tasot 0-4 -> leveys 5-100 %
  vahvuusTaytto.style.width = (a.pituus === 0 ? 0 : 5 + taso * 23.75) + "%";
  vahvuusTaytto.className = "taytto taso" + taso;

  const vihjeet = [
    [a.pituus >= 12, "Vähintään 12 merkkiä"],
    [a.onPieni && a.onIso, "Isoja ja pieniä kirjaimia"],
    [a.onNumero, "Numeroita"],
    [a.onMerkki, "Erikoismerkkejä (esim. ! ? - _)"],
    [a.pituus > 0 && !a.yleinen, "Ei yleisiä sanoja tai kuvioita"]
  ];
  vihjeetEl.innerHTML = vihjeet
    .map(([ok, teksti]) => `<li class="${ok ? "ok" : "ei"}">${ok ? "✓" : "✗"} ${teksti}</li>`)
    .join("");
}

// ---------- Pelin kulku ----------
function aloitaSalasanapeli(callback) {
  salasanaCallback = callback;
  salasanaKesken = true;
  kenttaEl.value = "";
  $("salasana-huomio").textContent = huomio;     // huomio tulee script.js:stä
  naytaNaytto("naytto-salasana");
  paivitaSalasana();
  kenttaEl.focus();
}

function lukitseSalasana() {
  if (!salasanaKesken) return;
  salasanaKesken = false;
  clearInterval(ajastin);

  const a = arvioiSalasana(kenttaEl.value);
  const taso = laskeTaso(a.aika);
  const onnistui = taso >= 3;

  let teksti = "Huijari yritti murtaa salasanasi. Arvioitu murtoaika: " + muotoileAika(a.aika) + ". ";
  teksti += onnistui ? "Palvelin selvisi! " : "Palvelin murtui. ";

  if (a.pituus === 0) {
    teksti += "Et ehtinyt kirjoittaa salasanaa, ja tyhjä salasana murtuu heti.";
  } else if (a.yleinen) {
    teksti += "Yleiset sanat ja kuviot (kuten paikannimi, 1234 tai p4ssw0rd) löytyvät huijarin sanakirjasta. Kirjainten vaihtaminen numeroiksi ei auta.";
  } else if (a.pituus < 12) {
    teksti += "Pituus on salasanan tärkein ominaisuus. Jokainen lisämerkki kasvattaa murtoaikaa moninkertaiseksi.";
  } else if (onnistui) {
    teksti += "Pitkä salasanalause on helppo muistaa ja vaikea murtaa. Käytä jokaiselle palvelulle eri salasanaa ja harkitse salasanahallintaa.";
  } else {
    teksti += "Lisää pituutta tai erilaisia merkkejä.";
  }

  kenttaEl.value = "";    // ei jätetä salasanaa näkyviin
  salasanaCallback({
    taso: TASOT[taso].nimi,
    onnistui: onnistui,
    pisteet: TASOT[taso].pisteet,
    turvaMuutos: TASOT[taso].turvaMuutos,
    teksti: teksti
  });
}

// ---------- Kuuntelijat ----------
kenttaEl.addEventListener("input", paivitaSalasana);
kenttaEl.addEventListener("keydown", (e) => { if (e.key === "Enter") lukitseSalasana(); });
$("nappi-lukitse").addEventListener("click", lukitseSalasana);
