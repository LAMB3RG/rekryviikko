# Verkkovartija - speksi (versio 2)

**Kohderyhmä:** 9.-luokkalaiset, jotka tutustuvat IT-alan opintoihin (Forssan ammatti-instituutti)
**Kesto:** max 5 min. **Teknologia:** HTML, CSS, vanilla JavaScript, ei kirjastoja.

## Idea
Pelaaja on yrityksen tietoturvavahti. Hän tutkii viestejä, päättää mitkä ovat huijauksia,
ratkoo IT-mini-pelejä ja torjuu lopuksi haittaohjelman leviämisen verkossa.

## Pelin kulku (n. 5 min)
1. Aloitusruutu
2. Viestiaalto 1: 6 viestiä, 80 s
3. Mini-peli: Salasanapaja (25 s)
4. Viestiaalto 2: 6 viestiä, 80 s
5. Mini-peli: Bugi koodissa (25 s)
6. Loppuhyökkäys: tartunta leviää verkossa, pelaaja eristää koneet (60 s)
7. Loppuruutu: pisteet, arvosana, IT-alan suositus

## Mekaniikat
- Tutkintatila: klikkaa epäilyttäviä kohtia (oikeita merkkejä ja harhoja).
- Rajalliset työkalut koko pelin ajan: lähettäjän tarkistus 4, linkin tarkistus 3, kollegalta kysyminen 2.
- Huijauslinkin klikkaaminen: tietoturva -30 %.
- Läpi päässeet huijaukset vaikuttavat loppuhyökkäyksen alkutilanteeseen.

## Esittelytila
Jos pelissä ei tehdä mitään 60 sekuntiin, peli nollautuu aloitusruutuun (pisteet, tietoturva ja työkalut nollataan, salasanakenttä tyhjennetään). 50 sekunnin kohdalla näytetään varoitus. Tämä on tarkoitettu tilanteeseen, jossa ryhmä lähtee kesken pelin ja seuraava ryhmä tulee.

## IT-alasuositus
Viestit on jaettu aloihin: tietoturva, verkot, ylläpito, ohjelmointi.
Mini-pelit ja loppuhyökkäys antavat lisäpisteitä omille aloilleen.

## Tekninen rakenne
- messages.js: 20 viestiä (sisältö)
- salasana.js: salasanapaja-mini-peli
- bugi.js: bugi koodissa -mini-peli
- script.js: logiikka, KULKU-lista ohjaa vaiheita
- index.html: neljä näyttöä (aloitus, viestit, välinäyttö, loppu)
- style.css: ulkoasu

## Tila
- [x] Viestit ja tutkintatila
- [x] Aloitusruutu, ajastin, työkalut, loppuruutu
- [x] Salasanapaja
- [x] Bugi koodissa
- [ ] Loppuhyökkäys (verkkopeli)
- [ ] Äänet ja animaatiot, viimeistely


Loppuhyökkäyksessä jokainen kone vastaa yhtä aiempaa kysymystä: oikea vastaus = puhdas kone, väärä vastaus tai vastaamatta jäänyt viesti = saastunut kone. Koneen tiedoista näkee tehtävän ja väärän vastauksen selityksen.


## Päivitys: yhteinen aikaraja
Koko pelissä on yksi yhteinen 5 minuutin aikaraja. Viestiaaltojen, salasanatehtävän, ohjelmointitehtävän ja loppuhyökkäyksen omat aikarajat on poistettu. Aikabonuksia ei anneta. Loppuhyökkäyksessä saastuneet, vielä eristämättömät koneet ovat punaisia ja onnistuneesti eristetyt koneet vihreitä.
