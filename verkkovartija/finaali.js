// ======================================================
// LOPPUHYÖKKÄYS: koneet kuvaavat aiempien kysymysten vastauksia
// ======================================================
let finaaliCallback = null;
let finaaliKesken = false;
let finaaliKoneet = [];
let finaaliEristettyja = 0;
let finaaliVaaria = 0;
let finaaliLukittu = false;
let finaaliTulos = null;
const finaaliVerkkoEl = $("finaali-verkko");
const finaaliLaskuriEl = $("finaali-laskuri");
const finaaliPalauteEl = $("finaali-palaute");
const finaaliValmisEl = $("finaali-valmis");

function aloitaFinaali(callback) {
  finaaliCallback = callback; finaaliKesken = true; finaaliEristettyja = 0; finaaliVaaria = 0; finaaliLukittu = false; finaaliTulos = null;
  // Jokainen kone vastaa yhtä aiempaa kysymystä: oikein = puhdas, väärin = saastunut.
  finaaliKoneet = kysymysTulokset.map((q, i) => ({ ...q, id: i, tartunta: !q.oikein, eristetty: false, vaarin: false }));
  if (!finaaliKoneet.length) finaaliKoneet = [{id:0, oikein:true, tehtava:"Ei tallennettuja kysymyksiä", selitys:"Pelin vastauksia ei löytynyt.", tartunta:false, eristetty:false, vaarin:false}];
  $("finaali-huomio").textContent = huomio;
  $("finaali-ohje").textContent = "Jokainen kone vastaa yhtä aiempaa kysymystä. Oikea vastaus jätti koneen puhtaaksi; väärä vastaus saastutti sen. Klikkaa saastuneita koneita eristääksesi ne. Avaa koneen tiedot nähdäksesi, mikä tehtävä meni väärin.";
  finaaliPalauteEl.className = "selitys piilossa";
  finaaliValmisEl.classList.add("piilossa");
  finaaliValmisEl.disabled = true;
  naytaNaytto("naytto-finaali");
  piirraVerkko();
  // Jos aiemmissa tehtävissä ei ollut yhtään väärää vastausta, jatkaminen on heti mahdollista.
  if (finaaliKoneet.every(x => !x.tartunta || x.eristetty)) naytaJatkoNappi();
}
function piirraVerkko() {
  finaaliVerkkoEl.innerHTML = "";
  finaaliKoneet.forEach((kone, i) => {
    const kortti = document.createElement("div"); kortti.className = "kone";
    if (kone.tartunta && !kone.eristetty) kortti.classList.add("tartunta");
    if (kone.eristetty) kortti.classList.add("eristetty", "tartunta-eristetty");
    if (kone.vaarin) kortti.classList.add("vaarin-eristetty", "puhdas-virheellisesti-eristetty");
    const nappi = document.createElement("button"); nappi.type = "button"; nappi.className = "kone-toiminto";
    nappi.disabled = kone.eristetty || kone.vaarin || finaaliLukittu;
    const kuva = document.createElement("span"); kuva.className = "kone-kuva"; kuva.textContent = kone.eristetty ? "🔒" : (kone.tartunta ? "⚠️" : "💻");
    const nimi = document.createElement("span"); nimi.textContent = "Kone " + (i+1) + (kone.eristetty ? " · saastunut, eristetty" : (kone.vaarin ? " · puhdas, virheellinen eristys" : ""));
    nappi.append(kuva,nimi); nappi.addEventListener("click", () => eristaKone(i));
    const details = document.createElement("p"); details.className = "kone-tehtava";
    details.textContent = kone.tartunta ? ("Saastumisen aiheuttanut tehtävä: " + kone.tehtava + " — väärä vastaus. " + kone.selitys) : ("Tehtävä: " + kone.tehtava + " — vastasit oikein, joten kone on puhdas.");
    const info = document.createElement("button"); info.type="button"; info.className="kone-tiedot"; info.textContent="Näytä tehtävän tiedot";
    info.addEventListener("click", () => { details.classList.toggle("nayta"); info.textContent = details.classList.contains("nayta") ? "Piilota tehtävän tiedot" : "Näytä tehtävän tiedot"; });
    kortti.append(nappi, info, details); finaaliVerkkoEl.appendChild(kortti);
  });
  const tartuntoja = finaaliKoneet.filter(k=>k.tartunta).length;
  finaaliLaskuriEl.textContent = "Eristetty " + finaaliEristettyja + " / " + tartuntoja + " saastunutta konetta · Virheellisiä eristyksiä " + finaaliVaaria + " · Koneita yhteensä " + finaaliKoneet.length;
}
function eristaKone(i) {
  if (!finaaliKesken || finaaliLukittu) return; const k=finaaliKoneet[i]; if(k.eristetty||k.vaarin) return;
  if(k.tartunta) { k.eristetty=true; finaaliEristettyja++; finaaliPalauteEl.textContent="Oikein! Kone eristettiin. Saastumisen aiheutti tehtävä: " + k.tehtava + "."; finaaliPalauteEl.className="selitys oikein"; }
  else { k.vaarin=true; finaaliVaaria++; turva=Math.max(0,turva-5); paivitaMittarit(); finaaliPalauteEl.textContent="Tämä kone oli puhdas, koska vastasit oikein tehtävään: " + k.tehtava + ". Virheellinen eristys haittaa toimintaa (−5 % tietoturvaa)."; finaaliPalauteEl.className="selitys vaarin"; }
  piirraVerkko();
  // Riittää, että kaikki saastuneet koneet on eristetty.
  // Puhtaita koneita ei tarvitse klikata.
  if (finaaliKoneet.every(x => !x.tartunta || x.eristetty)) naytaJatkoNappi();
}
function naytaJatkoNappi() {
  finaaliValmisEl.classList.remove("piilossa");
  finaaliValmisEl.disabled = false;
  finaaliPalauteEl.classList.remove("piilossa");
}
finaaliValmisEl.addEventListener("click", () => {
  if (finaaliKesken && finaaliKoneet.every(x => !x.tartunta || x.eristetty)) { paataFinaali(); return; }
  if (!finaaliKesken && finaaliTulos && finaaliCallback) { const cb = finaaliCallback; finaaliCallback = null; cb(finaaliTulos); }
});

function paataFinaali() {
  if(!finaaliKesken) return; finaaliKesken=false; clearInterval(ajastin); finaaliLukittu=true;
  const tartuntoja=finaaliKoneet.filter(k=>k.tartunta).length; const jaljella=tartuntoja-finaaliEristettyja;
  const pisteet=finaaliEristettyja*50; const turvaMuutos=jaljella===0?10:-jaljella*8;
  finaaliPalauteEl.textContent=jaljella===0?"Loistavaa! Kaikki väärin vastattuihin tehtäviin liittyvät saastuneet koneet eristettiin.":""+jaljella+" saastunutta konetta jäi verkkoon. Avaa niiden tehtävät nähdäksesi, mitä meni väärin.";
  finaaliPalauteEl.className="selitys "+(jaljella===0?"oikein":"vaarin"); finaaliValmisEl.classList.remove("piilossa"); finaaliValmisEl.textContent="Jatka tuloksiin"; finaaliValmisEl.disabled=false;
  finaaliTulos={tartunnat:tartuntoja,eristetyt:finaaliEristettyja,pisteet,turvaMuutos,verkotYht:tartuntoja,yllapitoYht:finaaliVaaria,vaaratValtytty:Math.max(0,finaaliKoneet.length-finaaliVaaria),teksti:jaljella===0?"Eristit kaikki väärin vastattuihin kysymyksiin liittyvät koneet. Tutki lopputuloksista, missä taidoissa onnistuit.":"Osa saastuneista koneista jäi verkkoon. Lopputuloksista näet, mitkä tehtävät kannattaa kerrata."};
  piirraVerkko();
}
