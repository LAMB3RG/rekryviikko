// PELIN SISÄLTÖ: 20 viestiä.
// Jokaisella viestillä on nämä kentät:
//   tyyppi    = Sähköposti / Tekstiviesti / Some
//   ala       = tietoturva / verkot / ylläpito / ohjelmointi (käytetään loppuruudun IT-alasuosituksessa)
//   nimi      = nimi, joka näkyy viestissä
//   osoite    = oikea lähettäjä, paljastuu kun hiiri viedään nimen päälle
//   teksti    = viestin sisältö
//   linkki    = (valinnainen) nayta = mitä linkki väittää, oikea = minne se oikeasti vie
//   kohdat    = tekstin kohdat, joita pelaaja voi klikata tutkiakseen
//               huijausmerkki: true = oikea huijauksen merkki, false = vaikuttaa epäilyttävältä mutta on ok
//   huijaus   = true tai false
//   selitys   = näytetään vastauksen jälkeen

const viestit = [
  { tyyppi: "Sähköposti", ala: "tietoturva", nimi: "PayPal Tuki", osoite: "tuki@paypa1-security.com",
    otsikko: "Tilisi on lukittu",
    teksti: "Tilillesi on kirjauduttu epäilyttävästi. Vahvista tunnuksesi 24 tunnin sisällä, muuten tili suljetaan pysyvästi.",
    linkki: { nayta: "Vahvista tunnuksesi", oikea: "http://paypa1-login.xyz/verify" },
    kohdat: [
      { kohta: "24 tunnin sisällä", huijausmerkki: true, selitys: "Kiire on huijarin vakiotemppu: sinun pitäisi toimia ajattelematta." },
      { kohta: "tili suljetaan pysyvästi", huijausmerkki: true, selitys: "Uhkailu. Oikea palvelu ei sulje tiliä näin." } ],
    huijaus: true,
    selitys: "Osoitteessa on paypa1 (numero 1) eikä paypal, ja linkki vie outoon .xyz-osoitteeseen." },

  { tyyppi: "Tekstiviesti", ala: "tietoturva", nimi: "Hammashoitola", osoite: "+358 40 123 4567",
    otsikko: "Aikamuistutus",
    teksti: "Muistutus: hammaslääkäriaikasi on huomenna klo 14.30. Peruutukset puhelimitse viimeistään tänään klo 16 mennessä.",
    kohdat: [
      { kohta: "viimeistään tänään klo 16 mennessä", huijausmerkki: false, selitys: "Aikaraja kuulostaa kiireeltä, mutta tässä se on tavallinen peruutusaika. Salasanaa tai rahaa ei pyydetä." } ],
    huijaus: false,
    selitys: "Viesti vain muistuttaa ajasta. Se ei pyydä tunnuksia, rahaa eikä linkin avaamista." },

  { tyyppi: "Some", ala: "tietoturva", nimi: "@ilmaiset_lahjakortit_26", osoite: "Tili luotu 3 päivää sitten, ei yhtään omaa julkaisua",
    otsikko: "Voitit 500 € lahjakortin!",
    teksti: "Sinut on valittu voittajaksi! Lähetä meille tunnuksesi ja pankkitietosi, niin lähetämme palkinnon heti.",
    kohdat: [
      { kohta: "tunnuksesi ja pankkitietosi", huijausmerkki: true, selitys: "Oikea arvonta ei koskaan kysy tunnuksia tai pankkitietoja." },
      { kohta: "valittu voittajaksi", huijausmerkki: true, selitys: "Et ole osallistunut mihinkään arvontaan." } ],
    huijaus: true,
    selitys: "Uusi tili, jolla ei ole omaa sisältöä, ja palkinto vastineeksi pankkitiedoista. Klassinen huijaus." },

  { tyyppi: "Sähköposti", ala: "verkot", nimi: "Opettaja Virtanen", osoite: "virtanen@koulu.fi",
    otsikko: "Huomisen kokeen alue",
    teksti: "Hei luokka! Huomisessa kokeessa on luvut 3–5. Muistakaa ottaa laskin mukaan. Vastatkaa tähän viestiin, jos teillä on kysyttävää.",
    kohdat: [
      { kohta: "Vastatkaa tähän viestiin", huijausmerkki: false, selitys: "Vastaamaan pyytäminen on normaalia. Salasanaa ei kysytä." } ],
    huijaus: false,
    selitys: "Lähettäjän osoite on koulun oikea osoite, ja viesti liittyy johonkin, mitä odotit." },

  { tyyppi: "Tekstiviesti", ala: "verkot", nimi: "Posti", osoite: "+44 7700 900123",
    otsikko: "Paketti odottaa",
    teksti: "Pakettisi ei voitu toimittaa. Maksa 1,99 € lisämaksu 12 tunnin sisällä, muuten paketti palautetaan.",
    linkki: { nayta: "posti.fi/maksa", oikea: "http://posti-maksu.info/pay" },
    kohdat: [
      { kohta: "1,99 € lisämaksu", huijausmerkki: true, selitys: "Pieni summa saa huijauksen tuntumaan harmittomalta. Oikea tavoite on korttitietosi." },
      { kohta: "12 tunnin sisällä", huijausmerkki: true, selitys: "Taas kiire." } ],
    huijaus: true,
    selitys: "Linkki näyttää oikealta (posti.fi), mutta vie toiseen osoitteeseen. Tarkista aina hiirellä, minne linkki oikeasti menee." },

  { tyyppi: "Sähköposti", ala: "ylläpito", nimi: "IT-tuki", osoite: "it-tuki@koulu-helpdesk.net",
    otsikko: "Salasanasi vanhenee tänään",
    teksti: "Salasanasi vanhenee tänään. Vastaa tähän viestiin ja kirjoita nykyinen salasanasi, niin pidennämme sen voimassaoloa.",
    kohdat: [
      { kohta: "kirjoita nykyinen salasanasi", huijausmerkki: true, selitys: "Oikea IT-tuki ei koskaan kysy salasanaasi." },
      { kohta: "vanhenee tänään", huijausmerkki: true, selitys: "Kiireellä painostetaan." } ],
    huijaus: true,
    selitys: "Osoite on koulu-helpdesk.net eikä koulun oma. Salasanaa ei anneta kenellekään, ei edes IT-tuelle." },

  { tyyppi: "Sähköposti", ala: "ylläpito", nimi: "Koulun IT-tuki", osoite: "it@koulu.fi",
    otsikko: "Huoltokatko lauantaina",
    teksti: "Verkkopalvelut ovat pois käytöstä lauantaina klo 2–4 päivityksen vuoksi. Sinun ei tarvitse tehdä mitään.",
    kohdat: [
      { kohta: "pois käytöstä", huijausmerkki: false, selitys: "Kuulostaa hälyttävältä, mutta on tavallinen huoltoilmoitus." },
      { kohta: "Sinun ei tarvitse tehdä mitään", huijausmerkki: false, selitys: "Aito tiedote ei vaadi toimia eikä kysy tunnuksia." } ],
    huijaus: false,
    selitys: "Oikea osoite, ei linkkejä, ei pyyntöjä. Pelkkä tiedote." },

  { tyyppi: "Some", ala: "ohjelmointi", nimi: "GitHub Security Team", osoite: "@github-security-team (ei vahvistettu tili)",
    otsikko: "API-avaimesi on vuotanut",
    teksti: "API-avaimesi on julkaistu julkisesti. Kirjaudu tarkistamaan tilanne heti, tai tilisi poistetaan.",
    linkki: { nayta: "github.com/security", oikea: "http://github-secure.io/login" },
    kohdat: [
      { kohta: "tilisi poistetaan", huijausmerkki: true, selitys: "Uhkaus saa sinut kiirehtimään." },
      { kohta: "Kirjaudu tarkistamaan tilanne heti", huijausmerkki: true, selitys: "Kirjautumissivu voi olla väärennös, joka varastaa tunnuksesi." } ],
    huijaus: true,
    selitys: "Linkki vie osoitteeseen github-secure.io, joka ei ole GitHubin oma. Kehittäjiä huijataan paljon näin." },

  { tyyppi: "Sähköposti", ala: "ohjelmointi", nimi: "GitHub", osoite: "noreply@github.com",
    otsikko: "Uusi kirjautuminen tilillesi",
    teksti: "Tilillesi kirjauduttiin Chromella Windows-koneelta. Jos tämä olit sinä, mitään ei tarvitse tehdä. Jos et tunnista kirjautumista, vaihda salasana omasta tilistäsi.",
    kohdat: [
      { kohta: "vaihda salasana omasta tilistäsi", huijausmerkki: false, selitys: "Ohje kehottaa menemään itse omalle tilille, ei klikkaamaan viestin linkkiä. Se on turvallista." } ],
    huijaus: false,
    selitys: "Oikea osoite github.com, ei kiirettä, ei linkkejä. Neuvo on oikea: vaihda salasana itse, ei viestin kautta." },

  { tyyppi: "Some", ala: "tietoturva", nimi: "Aatu (kaveri)", osoite: "@aatu_gamer",
    otsikko: "Kokeile tätä peliä",
    teksti: "hei! kokeile tätä uutta peliä, mä oon jo pelannut. lataa peli.exe ja kerro mitä mieltä oot",
    linkki: { nayta: "peli.exe", oikea: "file://download-peli.ru/peli.exe" },
    kohdat: [
      { kohta: "lataa peli.exe", huijausmerkki: true, selitys: "Tuntemattomat .exe-tiedostot voivat sisältää haittaohjelman, vaikka lähettäjä olisi kaveri." },
      { kohta: "hei! kokeile", huijausmerkki: true, selitys: "Viesti tulee ilman mitään yhteyttä aiempaan keskusteluun. Kaverin tili on voitu kaapata." } ],
    huijaus: true,
    selitys: "Kaverin tili oli todennäköisesti kaapattu. Kysy kaverilta toista kautta, ennen kuin lataat mitään." },

  { tyyppi: "Tekstiviesti", ala: "tietoturva", nimi: "Tunnistuspalvelu", osoite: "Lyhytnumero 12345",
    otsikko: "Kirjautumiskoodi",
    teksti: "Kirjautumiskoodisi on 482913. Älä kerro koodia kenellekään. Jos et yrittänyt kirjautua, voit jättää viestin huomiotta.",
    kohdat: [
      { kohta: "Älä kerro koodia kenellekään", huijausmerkki: false, selitys: "Aito palvelu varoittaa itse koodin jakamisesta." } ],
    huijaus: false,
    selitys: "Koodi on vastaus kirjautumisyritykseen, eikä viesti pyydä mitään tekemään. Aito." },

  { tyyppi: "Sähköposti", ala: "verkot", nimi: "Netflix Laskutus", osoite: "billing@netflix-account.co",
    otsikko: "Maksusi epäonnistui",
    teksti: "Emme saaneet veloitettua tilausmaksuasi. Päivitä korttitietosi 48 tunnin sisällä, muuten tilisi jäädytetään.",
    linkki: { nayta: "Päivitä maksutiedot", oikea: "http://netflix-account.co/billing" },
    kohdat: [
      { kohta: "48 tunnin sisällä", huijausmerkki: true, selitys: "Kiire." },
      { kohta: "Päivitä korttitietosi", huijausmerkki: true, selitys: "Korttitiedot annetaan vain palvelun omalla sivulla, ei viestin linkin kautta." } ],
    huijaus: true,
    selitys: "Osoite netflix-account.co ei ole netflix.com. Verkko-osoitteen loppu ratkaisee." },

  { tyyppi: "Tekstiviesti", ala: "tietoturva", nimi: "Tuntematon numero", osoite: "+358 45 555 0199",
    otsikko: "Uusi numero",
    teksti: "Moi, tää on uusi numeroni, vanha hajosi. Voisitko lainata 50 € nopeasti? Maksan huomenna takaisin!",
    kohdat: [
      { kohta: "uusi numeroni", huijausmerkki: true, selitys: "Huijari esiintyy tuttuna. Soita vanhaan numeroon ja varmista." },
      { kohta: "lainata 50 € nopeasti", huijausmerkki: true, selitys: "Raha ja kiire samassa lauseessa." } ],
    huijaus: true,
    selitys: "Viesti ei kerro, kuka lähettäjä on. Se on tarkoituksella epämääräinen." },

  { tyyppi: "Sähköposti", ala: "ylläpito", nimi: "Steam-tuki", osoite: "noreply@steampowered.com",
    otsikko: "Steam Guard -koodi",
    teksti: "Joku kirjautuu tilillesi uudelta laitteelta. Koodisi on K7M2P. Jos et yrittänyt kirjautua, vaihda salasanasi Steam-sovelluksessa.",
    kohdat: [
      { kohta: "vaihda salasanasi Steam-sovelluksessa", huijausmerkki: false, selitys: "Vaihto tehdään omassa sovelluksessa eikä viestin linkin kautta." } ],
    huijaus: false,
    selitys: "Oikea osoite, ja viesti neuvoo toimimaan omassa sovelluksessa." },

  { tyyppi: "Some", ala: "verkot", nimi: "Kahvilan ilmainen Wi-Fi", osoite: "Verkon nimi: Cafe_FREE_WiFi_2 (ei kahvilan oma)",
    otsikko: "Ilmainen netti",
    teksti: "Yhdistä ilmaiseen nettiin! Kirjaudu sähköpostiosoitteellasi ja sähköpostisi salasanalla.",
    kohdat: [
      { kohta: "sähköpostisi salasanalla", huijausmerkki: true, selitys: "Wi-Fi ei tarvitse sähköpostisi salasanaa." },
      { kohta: "Yhdistä ilmaiseen nettiin", huijausmerkki: true, selitys: "Huijari voi pystyttää väärennetyn verkon, jolla on kahvilan nimeä muistuttava nimi." } ],
    huijaus: true,
    selitys: "Kysy aina henkilökunnalta oikean Wi-Fin nimi. Salasanaa ei anneta verkon kirjautumissivulle." },

  { tyyppi: "Sähköposti", ala: "ylläpito", nimi: "Microsoft Tuki", osoite: "support@ms-alert-helpdesk.com",
    otsikko: "VAROITUS: tietokoneesi on saastunut",
    teksti: "Tietokoneessasi on 14 virusta! Älä sammuta konetta. Soita heti numeroon 0800 123 456, niin teknikkomme korjaa ongelman etäyhteydellä.",
    kohdat: [
      { kohta: "14 virusta", huijausmerkki: true, selitys: "Sähköposti ei voi tietää, mitä koneellasi on." },
      { kohta: "etäyhteydellä", huijausmerkki: true, selitys: "Etäyhteyden antaminen tuntemattomalle antaa täyden pääsyn koneeseesi." } ],
    huijaus: true,
    selitys: "Oikea Microsoft ei lähetä tällaisia varoituksia eikä soita sinulle. Älä soita numeroon." },

  { tyyppi: "Sähköposti", ala: "verkot", nimi: "Koulun ruokapalvelu", osoite: "ruoka@koulu.fi",
    otsikko: "Ensi viikon ruokalista",
    teksti: "Hei! Ensi viikon ruokalista on liitteenä. Maanantaina on lihapullia ja tiistaina kasvispataa. Hyvää ruokahalua!",
    kohdat: [
      { kohta: "liitteenä", huijausmerkki: false, selitys: "Liite on tavallinen, kun lähettäjä on tuttu ja viesti odotettu." } ],
    huijaus: false,
    selitys: "Tuttu lähettäjä ja oikea osoite. Ei kiirettä eikä pyyntöjä." },

  { tyyppi: "Sähköposti", ala: "ohjelmointi", nimi: "Opinto-ohjaaja", osoite: "opinto-ohjaus@oppilaitos.fi",
    otsikko: "Kutsu avoimiin oviin",
    teksti: "Tervetuloa tutustumaan IT-alan opintoihin torstaina klo 12. Ilmoittaudu etukäteen vastaamalla tähän viestiin. Kahvitarjoilu!",
    kohdat: [
      { kohta: "Ilmoittaudu etukäteen", huijausmerkki: false, selitys: "Ilmoittautuminen viestillä on turvallista. Salasanoja tai maksutietoja ei pyydetä." } ],
    huijaus: false,
    selitys: "Aito kutsu. Ei kiirettä, ei linkkejä, ei pyyntöjä tunnuksista." },

  { tyyppi: "Some", ala: "ohjelmointi", nimi: "@robux_generator_free", osoite: "Tili luotu 2 päivää sitten",
    otsikko: "Ilmaista pelivaluuttaa",
    teksti: "Hanki 10 000 ilmaista Robuxia! Asenna selainlaajennus, jolla se onnistuu ilman maksua.",
    linkki: { nayta: "Lataa laajennus", oikea: "http://free-robux-tool.top/ext.crx" },
    kohdat: [
      { kohta: "10 000 ilmaista", huijausmerkki: true, selitys: "Liian hyvä ollakseen totta." },
      { kohta: "Asenna selainlaajennus", huijausmerkki: true, selitys: "Laajennus voi lukea kaiken selaamasi, myös salasanasi." } ],
    huijaus: true,
    selitys: "Ilmainen pelivaluutta laajennuksella on lähes aina huijaus tai haittaohjelma." },

  { tyyppi: "Sähköposti", ala: "ylläpito", nimi: "Matti Meikäläinen (Google Docs)", osoite: "drive-shares-noreply@google.com",
    otsikko: "Matti jakoi kanssasi tiedoston: Ryhmätyö",
    teksti: "Matti Meikäläinen kutsui sinut muokkaamaan tiedostoa Ryhmätyö.",
    linkki: { nayta: "Avaa tiedosto", oikea: "https://docs.google.com/document/d/1abc" },
    kohdat: [
      { kohta: "kutsui sinut", huijausmerkki: false, selitys: "Tuttu henkilö ja odotettu tiedosto (oletetaan, että teette ryhmätyötä). Osoite on oikea." } ],
    huijaus: false,
    selitys: "Osoite on google.com ja linkki vie google.comiin. Odotettu kutsu." }
];
