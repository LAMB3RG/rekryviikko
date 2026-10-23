// ======================================================
// VERKKOVARTIJA - vaihe 3: pelin kulku, ajastin, työkalut
// ======================================================

// ---------- 1. ASETUKSET (näitä muuttamalla säädät pelin tuntumaa) ----------
const VIESTEJA_PER_AALTO = 6;
const AALTOJA = 2;
const PELIN_AIKA = 300;          // koko pelin yhteinen aikaraja: 5 minuuttia

const PISTEET_OIKEIN = 100;
const PISTEET_LOYTO = 20;        // bonus jokaisesta löydetystä huijauksen merkistä
const TURVA_VAARIN = 20;         // väärästä vastauksesta
const TURVA_LINKKI = 30;         // huijauslinkin klikkaamisesta
const TURVA_KASITTELEMATTA = 10; // jokaisesta käsittelemättä jääneestä viestistä

const TYOKALUT_ALUSSA = { lahettaja: 4, linkki: 3, kollega: 2 };

// Esittelytilan nollaus: jos kukaan ei tee mitään, peli palaa alkuun
const TOIMETTOMUUS_RAJA = 60;    // sekuntia ilman toimintaa -> peli nollautuu
const VAROITUS_ALKAA = 50;       // tästä alkaen näytetään varoitus

// Pelin kulku järjestyksessä. Tähän lisätään myöhemmin mini-pelit.
const KULKU = ["aalto", "salasana", "aalto", "bugi", "finaali", "loppu"];

// IT-alat ja suositukset loppuruutuun
const ALAT = {
  "tietoturva":  { nimi: "Tietoturva",  suositus: "Kyberturva-asiantuntija",
    teksti: "Huomasit huijaukset hyvin. Tietoturva-ala etsii juuri tällaisia ihmisiä, joille epäilyttävä viesti herättää kysymyksiä." },
  "verkot":      { nimi: "Verkot",      suositus: "Verkko- ja järjestelmäasiantuntija",
    teksti: "Osaat lukea osoitteita ja linkkejä tarkasti. Verkkojen ja palvelinten parissa tästä on paljon hyötyä." },
  "ylläpito":    { nimi: "Ylläpito",    suositus: "ICT-asentaja / ylläpitäjä",
    teksti: "Pidät kokonaisuuden hallinnassa ja ratkaiset ongelmia. Käyttäjätuki ja laitteiden ylläpito sopivat sinulle." },
  "ohjelmointi": { nimi: "Ohjelmointi", suositus: "Ohjelmoija",
    teksti: "Huomaat pienet yksityiskohdat, jotka muut ohittavat. Ohjelmoinnissa se on tärkeä taito." }
};

// ---------- 2. PELIN MUISTI ----------
let aallot = [];            // lista aalloista, jokainen aalto on lista viestejä
let vaihe = -1;             // missä kohdassa KULKU-listaa ollaan
let aaltoNro = -1;          // monesko viestiaalto on menossa (0 = ensimmäinen)
let nykyinen = 0;           // monesko viesti aallossa
let pisteet = 0;
let turva = 100;
let lapaisseet = 0;         // huijaukset, jotka pääsivät läpi (käytetään loppuhyökkäyksessä)
let kysymysTulokset = [];   // loppuhyökkäyksen koneet vastaavat aiempiin tehtäviin
let loydetyt = 0;           // löydetyt merkit tässä viestissä
let valmis = false;         // onko tähän viestiin jo vastattu
let aikaaJaljella = 0;
let aikaMax = PELIN_AIKA;      // yhteisen ajastimen alkuperäinen pituus
let aikaLoppuToiminto = null; // funktio, joka kutsutaan kun aika loppuu
let ajastin = null; // varattu vanhalle vaiheajastimelle; vaiheilla ei ole omia aikarajoja
let peliAjastin = null;
let peliAikaaJaljella = PELIN_AIKA;
let peliPaattynyt = false;
let huomio = "";            // viesti, joka näytetään seuraavassa välinäytössä
let tyokalut = { ...TYOKALUT_ALUSSA };
let lahettajaTarkistettu = false;
let linkkiTarkistettu = false;

const tilasto = {
  "tietoturva":  { oikein: 0, yht: 0 },
  "verkot":      { oikein: 0, yht: 0 },
  "ylläpito":    { oikein: 0, yht: 0 },
  "ohjelmointi": { oikein: 0, yht: 0 }
};

// ---------- 3. HTML-ELEMENTIT ----------
const $ = (id) => document.getElementById(id);
const pisteetEl = $("pisteet");
const aikaTeksti = $("aika-teksti"), aikaTaytto = $("aika-taytto");
const turvaTeksti = $("turva-teksti"), turvaTaytto = $("turva-taytto");
const aaltorivi = $("aaltorivi");
const tyyppiEl = $("viesti-tyyppi"), lahettajaEl = $("lahettaja");
const otsikkoEl = $("viesti-otsikko"), tekstiEl = $("viesti-teksti");
const linkkiEl = $("linkki"), tilariviEl = $("tilarivi");
const lokiEl = $("loki-lista"), selitysEl = $("selitys");
const nappiAito = $("nappi-aito"), nappiHuijaus = $("nappi-huijaus"), nappiSeuraava = $("nappi-seuraava");
const tyoLahettaja = $("tyo-lahettaja"), tyoLinkki = $("tyo-linkki"), tyoKollega = $("tyo-kollega");

const OLETUSVIHJE = "Vihje: klikkaa epäilyttäviä kohtia tekstistä tai käytä työkaluja.";

// ---------- 4. APUFUNKTIOT ----------
function sekoita(lista) {                       // Fisher-Yates
  const kopio = [...lista];
  for (let i = kopio.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopio[i], kopio[j]] = [kopio[j], kopio[i]];
  }
  return kopio;
}

function naytaNaytto(id) {
  document.querySelectorAll(".naytto").forEach((el) => el.classList.add("piilossa"));
  $(id).classList.remove("piilossa");
  document.body.dataset.naytto = id;
}

function nykyinenViesti() { return aallot[aaltoNro][nykyinen]; }

function paivitaMittarit() {
  pisteetEl.textContent = pisteet;
  turvaTeksti.textContent = Math.max(turva, 0) + " %";
  turvaTaytto.style.width = Math.max(turva, 0) + "%";
}

function paivitaAika() {
  aikaTeksti.textContent = peliAikaaJaljella + " s";
  aikaTaytto.style.width = (peliAikaaJaljella / PELIN_AIKA * 100) + "%";
  aikaTaytto.classList.toggle("kiire", peliAikaaJaljella <= 30);
}

function aloitaYhteinenAjastin() {
  clearInterval(peliAjastin);
  peliAikaaJaljella = PELIN_AIKA;
  paivitaAika();
  peliAjastin = setInterval(() => {
    if (peliPaattynyt || document.body.dataset.naytto === "naytto-aloitus") return;
    peliAikaaJaljella = Math.max(0, peliAikaaJaljella - 1);
    paivitaAika();
    if (peliAikaaJaljella <= 0) {
      clearInterval(peliAjastin);
      clearInterval(ajastin);
      peliPaattynyt = true;
      naytaLoppu(false);
      $("loppu-otsikko").textContent = "Aika loppui!";
      $("suositus-teksti").textContent += " Peli päättyi, koska viiden minuutin kokonaisaika tuli täyteen.";
    }
  }, 1000);
}

// ---------- 5. PELIN KULKU ----------
function nollaaPeli() {
  clearInterval(ajastin);
  clearInterval(peliAjastin);
  salasanaKesken = false;
  bugiKesken = false;
  finaaliKesken = false;
  kysymysTulokset = [];
  $("salasana-kentta").value = "";
  aallot = [];
  pisteet = 0; turva = 100; lapaisseet = 0; huomio = "";
  peliPaattynyt = false;
  vaihe = -1; aaltoNro = -1;
  tyokalut = { ...TYOKALUT_ALUSSA };
  for (const ala in tilasto) { tilasto[ala].oikein = 0; tilasto[ala].yht = 0; }
  aikaMax = PELIN_AIKA;
  aikaaJaljella = PELIN_AIKA;
  peliAikaaJaljella = PELIN_AIKA;
  paivitaMittarit();
  paivitaAika();
}

function aloitaPeli() {
  nollaaPeli();
  aloitaYhteinenAjastin();
  const valitut = sekoita(viestit).slice(0, VIESTEJA_PER_AALTO * AALTOJA);
  for (let i = 0; i < AALTOJA; i++) {
    aallot.push(valitut.slice(i * VIESTEJA_PER_AALTO, (i + 1) * VIESTEJA_PER_AALTO));
  }
  seuraavaVaihe();
}

function palaaAlkuun() {
  nollaaPeli();
  naytaNaytto("naytto-aloitus");
}

function seuraavaVaihe() {
  vaihe += 1;
  const tyyppi = KULKU[vaihe];
  if (tyyppi === "aalto") {
    aaltoNro += 1;
    aloitaAalto();
  } else if (tyyppi === "loppu") {
    naytaLoppu(turva <= 0);
  } else if (tyyppi === "finaali") {
    aloitaFinaali(finaaliValmis);
  } else if (tyyppi === "salasana") {
    aloitaSalasanapeli(salasanaValmis);
  } else if (tyyppi === "bugi") {
    aloitaBugipeli(bugiValmis);
  } else {
    naytaValiaika(tyyppi);
  }
}

function aloitaAalto() {
  nykyinen = 0;
  naytaNaytto("naytto-viestit");
  naytaViesti();
}

function kaynnistaAjastin(sekunnit, loppuToiminto) {
  clearInterval(ajastin);
  aikaLoppuToiminto = loppuToiminto;
}

function tikki() {
  aikaaJaljella -= 1;
  paivitaAika();
  if (aikaaJaljella <= 0) {
    clearInterval(ajastin);
    aikaLoppuToiminto();
  }
}

function aallonAikaLoppui() {
  clearInterval(ajastin);
  const ensimmainen = valmis ? nykyinen + 1 : nykyinen;
  const jaljella = aallot[aaltoNro].slice(ensimmainen);
  jaljella.forEach((v) => {
    kysymysTulokset.push({ oikein: false, tehtava: "Viesti: " + v.otsikko, selitys: "Aika loppui ennen vastausta. Viesti jäi tarkistamatta ja huijaus saattoi päästä läpi." });
    turva -= TURVA_KASITTELEMATTA;
    tilasto[v.ala].yht += 1;
    if (v.huijaus) lapaisseet += 1;
  });
  if (jaljella.length > 0) {
    huomio = "Aika loppui! " + jaljella.length + " viestiä jäi käsittelemättä (−" +
             (jaljella.length * TURVA_KASITTELEMATTA) + " % tietoturva).";
  } else {
    huomio = "";
  }
  paivitaMittarit();
  seuraavaVaihe();
}

function aallonValmis() {
  clearInterval(ajastin);
  huomio = "Viestiaalto selvitetty.";
  paivitaMittarit();
  seuraavaVaihe();
}

function naytaValiaikaTeksti(otsikko, teksti) {
  $("valiaika-huomio").textContent = huomio;
  $("valiaika-otsikko").textContent = otsikko;
  $("valiaika-teksti").textContent = teksti;
  naytaNaytto("naytto-valiaika");
}

function naytaValiaika(tyyppi) {
  naytaValiaikaTeksti("Seuraava vaihe", "Jatketaan peliä.");
}

function salasanaValmis(tulos) {
  pisteet += tulos.pisteet;
  turva = Math.min(100, turva + tulos.turvaMuutos);
  tilasto["tietoturva"].yht += 1;
  kysymysTulokset.push({ oikein: tulos.onnistui, tehtava: "Salasanan vahvuus", selitys: tulos.teksti });
  if (tulos.onnistui) tilasto["tietoturva"].oikein += 1;
  huomio = "Salasanapaja: +" + tulos.pisteet + " pistettä, tietoturva " +
           (tulos.turvaMuutos >= 0 ? "+" : "") + tulos.turvaMuutos + " %.";
  paivitaMittarit();
  naytaValiaikaTeksti("Salasanapaja: " + tulos.taso, tulos.teksti);
}

function bugiValmis(tulos) {
  pisteet += tulos.pisteet;
  turva = Math.min(100, turva + tulos.turvaMuutos);
  tilasto["ohjelmointi"].yht += tulos.yht;
  tilasto["ohjelmointi"].oikein += tulos.oikein;
  if (tulos.tulokset) kysymysTulokset.push(...tulos.tulokset);
  huomio = "Bugit: +" + tulos.pisteet + " pistettä.";
  paivitaMittarit();
  naytaValiaikaTeksti("Bugi koodissa: " + tulos.oikein + " / " + tulos.yht + " löytyi", tulos.teksti);
}

function finaaliValmis(tulos) {
  pisteet += tulos.pisteet;
  turva = Math.max(0, Math.min(100, turva + tulos.turvaMuutos));
  tilasto["verkot"].yht += tulos.verkotYht || tulos.tartunnat;
  tilasto["verkot"].oikein += tulos.eristetyt;
  tilasto["ylläpito"].yht += tulos.yllapitoYht;
  tilasto["ylläpito"].oikein += tulos.vaaratValtytty;
  huomio = "Loppuhyökkäys: " + tulos.eristetyt + " / " + tulos.tartunnat + " tartuntaa eristetty.";
  paivitaMittarit();
  naytaValiaikaTeksti("Loppuhyökkäys selvitetty", tulos.teksti);
}

function naytaLoppu(murtui) {
  peliPaattynyt = true;
  clearInterval(ajastin);
  clearInterval(peliAjastin);
  naytaNaytto("naytto-loppu");

  $("loppu-otsikko").textContent = murtui ? "Järjestelmä murrettiin!" : "Vuoro päättyi";
  let arvosana = "Aloittelija";
  if (turva >= 80) arvosana = "Kyberturvamestari";
  else if (turva >= 50) arvosana = "Vartija";
  $("loppu-arvosana").textContent = "Arvosana: " + arvosana;
  $("loppu-pisteet").textContent = pisteet;

  const lista = $("loppu-tilasto");
  lista.innerHTML = "";
  let paras = null, parasOsuus = -1;
  for (const ala in tilasto) {
    const t = tilasto[ala];
    const li = document.createElement("li");
    li.textContent = ALAT[ala].nimi + ": " + t.oikein + " / " + t.yht + " oikein";
    lista.appendChild(li);
    const osuus = t.yht > 0 ? t.oikein / t.yht : 0;
    if (t.yht > 0 && (osuus > parasOsuus || (osuus === parasOsuus && t.oikein > tilasto[paras].oikein))) {
      paras = ala; parasOsuus = osuus;
    }
  }
  if (paras && parasOsuus > 0) {
    $("suositus-otsikko").textContent = "Sinussa on: " + ALAT[paras].suositus;
    $("suositus-teksti").textContent = ALAT[paras].teksti;
  } else {
    $("suositus-otsikko").textContent = "Harjoitus tekee mestarin";
    $("suositus-teksti").textContent = "Tällä kertaa ei vielä selvää suuntaa. Pelaa uudelleen ja tutki viestejä tarkemmin!";
  }
}

// ---------- 6. VIESTIN NÄYTTÖ ----------
function rakennaTeksti(v) {
  let html = v.teksti;
  v.kohdat.forEach((k, i) => {
    html = html.replace(k.kohta, `<button class="kohta" data-i="${i}">${k.kohta}</button>`);
  });
  return html;
}

function naytaViesti() {
  const v = nykyinenViesti();
  valmis = false;
  loydetyt = 0;
  lahettajaTarkistettu = false;
  linkkiTarkistettu = false;

  aaltorivi.textContent = "Aalto " + (aaltoNro + 1) + " / " + AALTOJA +
                          " · viesti " + (nykyinen + 1) + " / " + aallot[aaltoNro].length;
  tyyppiEl.textContent = v.tyyppi;
  lahettajaEl.textContent = v.nimi;
  lahettajaEl.classList.remove("paljastettu");
  otsikkoEl.textContent = v.otsikko;
  tekstiEl.innerHTML = rakennaTeksti(v);
  lokiEl.innerHTML = "";
  
  // KORJAUS: Tyhjennetään vanha tilarivin teksti aina uuden viestin alussa
  tilariviEl.textContent = OLETUSVIHJE;

  if (v.linkki) {
    linkkiEl.textContent = v.linkki.nayta;
    linkkiEl.classList.remove("piilossa");
  } else {
    linkkiEl.textContent = ""; // TYHJENNETÄÄN LINKIN TEKSTI
    linkkiEl.classList.add("piilossa");
  }

  selitysEl.classList.add("piilossa");
  nappiSeuraava.classList.add("piilossa");
  nappiAito.classList.remove("piilossa");
  nappiHuijaus.classList.remove("piilossa");
  paivitaMittarit();
  paivitaTyokalut();
}

function lisaaLokiin(teksti, luokka) {
  const li = document.createElement("li");
  li.textContent = teksti;
  li.className = luokka;
  lokiEl.appendChild(li);
}

function lopetaViesti(luokka, teksti) {
  const v = nykyinenViesti();
  valmis = true;
  selitysEl.textContent = teksti;
  selitysEl.className = "selitys " + luokka;

  lahettajaEl.textContent = v.nimi + " <" + v.osoite + ">";
  lahettajaEl.classList.add("paljastettu");
  if (v.linkki) tilariviEl.textContent = "→ " + v.linkki.oikea;

  nappiAito.classList.add("piilossa");
  nappiHuijaus.classList.add("piilossa");
  nappiSeuraava.textContent = (nykyinen === aallot[aaltoNro].length - 1) ? "Valmis" : "Seuraava viesti";
  nappiSeuraava.classList.remove("piilossa");
  paivitaMittarit();
  paivitaTyokalut();
}

// ---------- 7. PELAAJAN TOIMINNOT ----------
function vastaa(sanooHuijaus) {
  if (valmis) return;
  const v = nykyinenViesti();
  const oikein = (sanooHuijaus === v.huijaus);

  tilasto[v.ala].yht += 1;
  kysymysTulokset.push({ oikein, tehtava: "Viesti: " + v.otsikko, selitys: v.selitys });
  if (oikein) {
    tilasto[v.ala].oikein += 1;
    const bonus = v.huijaus ? loydetyt * PISTEET_LOYTO : 0;
    pisteet += PISTEET_OIKEIN + bonus;
    let teksti = "Oikein! " + v.selitys;
    if (bonus > 0) teksti += " (Tutkimusbonus +" + bonus + ")";
    lopetaViesti("oikein", teksti);
  } else {
    turva -= TURVA_VAARIN;
    if (v.huijaus) lapaisseet += 1;
    lopetaViesti("vaarin", "Väärin. " + v.selitys);
  }
}

function seuraava() {
  if (peliPaattynyt) return;
  nykyinen += 1;
  if (nykyinen >= aallot[aaltoNro].length) aallonValmis();
  else naytaViesti();
}

function klikkaaLinkkia() {
  if (valmis) return;
  const v = nykyinenViesti();
  if (v.huijaus) {
    turva -= TURVA_LINKKI;
    lapaisseet += 1;
    tilasto[v.ala].yht += 1;
    lopetaViesti("vaarin", "Klikkasit huijauslinkkiä! Tietoturva laski. " + v.selitys);
  } else {
    lisaaLokiin("Linkki avattiin: se vei turvalliseen osoitteeseen.", "hyva");
  }
}

function paljastaKohta(nappi, etuliite) {
  const k = nykyinenViesti().kohdat[nappi.dataset.i];
  nappi.classList.add("loydetty");
  if (k.huijausmerkki) {
    loydetyt += 1;
    lisaaLokiin(etuliite + "Huijauksen merkki: " + k.selitys, "hyva");
  } else {
    lisaaLokiin(etuliite + "Näyttää epäilyttävältä, mutta on ok: " + k.selitys, "harha");
  }
}

function klikkaaKohtaa(tapahtuma) {
  const nappi = tapahtuma.target.closest(".kohta");
  if (!nappi || valmis || nappi.classList.contains("loydetty")) return;
  paljastaKohta(nappi, "");
}

// ---------- 8. TYÖKALUT ----------
function paivitaTyokalut() {
  const v = nykyinenViesti();
  tyoLahettaja.textContent = "Tarkista lähettäjä (" + tyokalut.lahettaja + ")";
  tyoLinkki.textContent = "Tarkista linkki (" + tyokalut.linkki + ")";
  tyoKollega.textContent = "Kysy kollegalta (" + tyokalut.kollega + ")";
  tyoLahettaja.disabled = valmis || tyokalut.lahettaja <= 0 || lahettajaTarkistettu;
  tyoLinkki.disabled = valmis || !v.linkki || tyokalut.linkki <= 0 || linkkiTarkistettu;
  tyoKollega.disabled = valmis || tyokalut.kollega <= 0;
}

function tarkistaLahettaja() {
  if (valmis || tyokalut.lahettaja <= 0 || lahettajaTarkistettu) return;
  const v = nykyinenViesti();
  tyokalut.lahettaja -= 1;
  lahettajaTarkistettu = true;
  lahettajaEl.textContent = v.nimi + " <" + v.osoite + ">";
  lahettajaEl.classList.add("paljastettu");
  paivitaTyokalut();
}

function tarkistaLinkki() {
  const v = nykyinenViesti();
  if (valmis || !v.linkki || tyokalut.linkki <= 0 || linkkiTarkistettu) return;
  tyokalut.linkki -= 1;
  linkkiTarkistettu = true;
  tilariviEl.textContent = "→ " + v.linkki.oikea;
  paivitaTyokalut();
}

function kysyKollegalta() {
  if (valmis || tyokalut.kollega <= 0) return;
  const v = nykyinenViesti();
  const loytamattomat = [...tekstiEl.querySelectorAll(".kohta:not(.loydetty)")];
  if (loytamattomat.length === 0) {
    lisaaLokiin("Kollega: En huomaa tässä enempää tutkittavaa.", "harha");
    return;
  }
  tyokalut.kollega -= 1;
  const valittu = loytamattomat.find((n) => v.kohdat[n.dataset.i].huijausmerkki) || loytamattomat[0];
  paljastaKohta(valittu, "Kollega: ");
  paivitaTyokalut();
}

// ---------- 9. KUUNTELIJAT ----------
$("nappi-aloita").addEventListener("click", aloitaPeli);
$("nappi-jatka").addEventListener("click", seuraavaVaihe);
$("nappi-uudelleen").addEventListener("click", aloitaPeli);
nappiAito.addEventListener("click", () => vastaa(false));
nappiHuijaus.addEventListener("click", () => vastaa(true));
nappiSeuraava.addEventListener("click", seuraava);
linkkiEl.addEventListener("click", klikkaaLinkkia);
tekstiEl.addEventListener("click", klikkaaKohtaa);
tyoLahettaja.addEventListener("click", tarkistaLahettaja);
tyoLinkki.addEventListener("click", tarkistaLinkki);
tyoKollega.addEventListener("click", kysyKollegalta);

// ---------- 10. TOIMETTOMUUDEN TUNNISTUS ----------
let viimeisinToiminto = Date.now();
const varoitusEl = $("passiivisuus-varoitus");

["pointerdown", "keydown", "mousemove", "touchstart", "wheel"].forEach((tapahtuma) => {
  document.addEventListener(tapahtuma, () => {
    viimeisinToiminto = Date.now();
    varoitusEl.classList.add("piilossa");
  });
});

function tarkistaToimettomuus() {
  if (document.body.dataset.naytto === "naytto-aloitus") return;
  const hiljaa = Math.floor((Date.now() - viimeisinToiminto) / 1000);
  if (hiljaa >= TOIMETTOMUUS_RAJA) {
    varoitusEl.classList.add("piilossa");
    palaaAlkuun();
  } else if (hiljaa >= VAROITUS_ALKAA) {
    varoitusEl.textContent = "Oletko vielä siellä? Peli nollautuu " + (TOIMETTOMUUS_RAJA - hiljaa) +
                             " s kuluttua. Paina mitä tahansa jatkaaksesi.";
    varoitusEl.classList.remove("piilossa");
  }
}
setInterval(tarkistaToimettomuus, 1000);

// ---------- 11. KÄYNNISTYS ----------
paivitaMittarit();