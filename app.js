/* Přehled 42 – logika appky. Data (byty, auto, odkazy) se načtou z databáze po přihlášení,
   do tohoto souboru se nepíšou. Načítá je index.html do objektu P42. */
const BYTY = P42.BYTY, OBECNE = P42.OBECNE, AUTO = P42.AUTO;
const UPOZORNENI_MESICU = P42.UPOZORNENI_MESICU;   // kolik měsíců předem hlásit konec smlouvy

/* ========================================================================== */

const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const DAY = 86400000;
const czDate = s => { const d=new Date(s+"T00:00:00");
  return d.toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric",year:"numeric"}); };
const dayDiff = s => Math.round((new Date(s+"T00:00:00") - TODAY)/DAY);
const kc = n => n.toLocaleString("cs-CZ")+" Kč";
const kcH = n => n.toLocaleString("cs-CZ",{minimumFractionDigits:Number.isInteger(n)?0:2, maximumFractionDigits:2})+" Kč";   // s haléři, když jsou
const pad = n => String(n).padStart(2,"0");
const minusMonths = (s,m) => { const d=new Date(s+"T00:00:00"); d.setMonth(d.getMonth()-m);
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const relText = d => {
  if(d<0) return "před "+Math.abs(d)+" dny";
  if(d===0) return "dnes";
  if(d===1) return "zítra";
  if(d<31) return "za "+d+(d<5?" dny":" dní");
  const m=Math.round(d/30.44);
  return "za "+m+" "+(m===1?"měsíc":m<5?"měsíce":"měsíců");
};
const tone = d => d<0 ? "red" : d<=30 ? "red" : d<=90 ? "amber" : "green";

/* --- sestavení událostí --- */
const CATS = {
  smlouva:  "Nájemní smlouvy",
  vyuct:    "Vyúčtování",
  zalohy:   "Změna záloh",
  hypo:     "Hypotéka a koupě",
  pojisteni:"Pojištění",
  energie:  "Energie"
};

/* Nejbližší budoucí výročí – den a měsíc se opakují každý rok. */
function dalsiVyroci(den, mesic){
  const rok = TODAY.getFullYear();
  const letos = new Date(rok, mesic-1, den);
  const d = letos >= TODAY ? letos : new Date(rok+1, mesic-1, den);
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
}
/* --- vývoj cen energií (Botanika) --- */
const cenaKwh = n => (n/1000).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:3});
function vyvojTabulka(nazev, radky, dph){
  const max = Math.max(...radky.map(r=>r.mwh));
  const tr = radky.map((r,i)=>{
    const zm = i ? Math.round((r.mwh/radky[i-1].mwh-1)*100) : null;
    const zmHtml = zm===null ? "" :
      `<span style="color:var(--${zm>0?'red':zm<0?'green':'muted'})">${zm>0?"+":""}${zm} %</span>`;
    const posledni = i===radky.length-1;
    return `<tr${posledni?' class="ph-now"':''}>
      <td>${r.obdobi}</td><td>${r.produkt}</td>
      <td class="ph-cena"><div class="ph-barwrap"><i style="width:${(r.mwh/max*100).toFixed(0)}%"></i></div><b>${cenaKwh(r.mwh)}</b></td>
      <td style="white-space:nowrap">${zmHtml}</td>
      <td>${(r.mwh*dph/1000).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td>${r.plat.toLocaleString("cs-CZ",{minimumFractionDigits:r.plat%1?2:0})} Kč</td>
      <td class="ph-src">${r.zdroj}</td></tr>`;
  }).join("");
  return `<div class="btitle btitle-komodita">${nazev}</div>
    <div class="ph-scroll"><table class="ph"><thead><tr>
      <th>Období</th><th>Produkt</th><th>Kč/kWh bez DPH</th><th>Změna</th><th>s DPH</th><th>Stálý plat / měs.</th><th>Zdroj</th>
    </tr></thead><tbody>${tr}</tbody></table></div>`;
}
function vyvojCenKarta(b){
  const v=b.vyvojCen;
  const celkem = v.plynCelkem.map(([o,c])=>`${o}: <b>${c.toLocaleString("cs-CZ",{minimumFractionDigits:2})} Kč/kWh</b>`).join(" · ");
  return `<div class="card common c-${b.id}">
    <div class="cardhead"><h3>${b.nazev} · Vývoj cen energií</h3>
      <div class="addr">Cena samotné elektřiny a plynu (komodita bez distribuce a regulovaných plateb), DPH 21 %</div></div>
    <div class="block blk-energie">
      ${vyvojTabulka("Elektřina (sazba D02d, vysoký tarif)", v.elektrina, v.dph)}
      <div style="border-top:1px solid var(--line);margin:14px 0"></div>
      ${vyvojTabulka("Plyn", v.plyn, v.dph)}
      <div class="ph-note"><b>Průměrná cena plynu včetně distribuce</b> z ročních vyúčtování (bez DPH): ${celkem}</div>
      <div class="ph-note">${v.pozn}</div>
    </div>
  </div>`;
}

const DRUH = { byt:"Pojištění bytu", nemovitost:"Pojištění nemovitosti", dum:"Pojištění domu a domácnosti" };

/* --- vývoj spotřeby a nákladů za vodu (Botanika) --- */
function vyvojVodyKarta(b){
  const r=b.vyvojVody, max=Math.max(...r.map(x=>x.celkem));
  const proc = (a,z) => { const p=Math.round((a/z-1)*100);
    return `<span style="color:var(--${p>0?'red':p<0?'green':'muted'})">${p>0?"+":""}${p} %</span>`; };
  const tr = r.map((x,i)=>{
    const pred = i>1 ? r[i-1] : null;   // první období je jen 4 měsíce, srovnání s ním nedává smysl
    const vys = x.vysledek>0 ? `doplatek ${kc(x.vysledek)}` : `<span style="color:var(--green)">přeplatek ${kc(-x.vysledek)}</span>`;
    return `<tr${i===r.length-1?' class="ph-now"':''}>
      <td>${x.obdobi}${x.pozn?`<br><span class="ph-src">${x.pozn}</span>`:""}</td>
      <td style="white-space:nowrap">${x.vodne} m³${pred?` · ${proc(x.vodne,pred.vodne)}`:""}</td>
      <td>${x.stocne} m³</td>
      <td class="ph-cena"><div class="ph-barwrap"><i style="width:${(x.celkem/max*100).toFixed(0)}%"></i></div><b>${kc(x.celkem)}</b></td>
      <td style="white-space:nowrap">${pred?proc(x.celkem,pred.celkem):""}</td>
      <td style="white-space:nowrap">${kc(Math.round(x.celkem/x.vodne))}</td>
      <td>${kc(x.zalohy)}</td>
      <td style="white-space:nowrap">${vys}</td></tr>`;
  }).join("");
  const p1=r[1], pN=r[r.length-1];
  return `<div class="card common c-${b.id}">
    <div class="cardhead"><h3>${b.nazev} · Vývoj spotřeby a nákladů za vodu</h3>
      <div class="addr">Roční vyúčtování PVK, částky včetně DPH</div></div>
    <div class="block blk-voda">
      <div class="ph-scroll"><table class="ph"><thead><tr>
        <th>Období</th><th>Vodné</th><th>Stočné</th><th>Celkem za rok</th><th>Změna</th><th>Kč za 1 m³</th><th>Zálohy</th><th>Výsledek</th>
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="ph-note">Od ${p1.obdobi.split(" – ")[0]} do ${pN.obdobi.split(" – ")[1]} vzrostla spotřeba z ${p1.vodne} na ${pN.vodne} m³ za rok
        a roční náklady z ${kc(p1.celkem)} na ${kc(pN.celkem)}. „Kč za 1 m³“ = celkem za rok děleno vodným, tedy včetně stočného a DPH.</div>
    </div>
  </div>`;
}

/* Nejbližší budoucí den v měsíci (např. splatnost zálohy každého 17.). */
function dalsiDenVMesici(den){
  let d = new Date(TODAY.getFullYear(), TODAY.getMonth(), den);
  if(d < TODAY) d = new Date(TODAY.getFullYear(), TODAY.getMonth()+1, den);
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
}

const events = [];
BYTY.forEach(b=>{
  (b.udalosti||[]).forEach(u=>events.push({flat:b.id, cat:u.cat, date:u.date, title:u.title, ukol:u.ukol, desc:u.desc, inkaso:u.inkaso}));
  (b.pojisteni||[]).forEach(p=>{
    events.push({flat:b.id, cat:"pojisteni", date:dalsiVyroci(p.vyrociDen,p.vyrociMesic),
      title:DRUH[p.druh]+" – výročí ("+p.pojistovna+")",
      desc:"Odchází "+kc(p.rocne)+" za rok, smlouva č. "+p.cislo+
           ". Výročí je jediný termín, kdy jde pojistku bez sankce vypovědět."});
  });
  if(b.energie){
    const e=b.energie;
    events.push({flat:b.id, cat:"energie", date:minusMonths(e.elektrina.platnostDo, UPOZORNENI_MESICU),
      title:"Řešit další dodávku energií – končí pevná cena a doba určitá (PRE)",
      desc:"Elektřina i plyn jsou sjednané do "+czDate(e.elektrina.platnostDo)+
           ". Pokud nikdo smlouvu nevypoví nejpozději 20 dní před koncem, přejde na dobu neurčitou s cenou podle ceníku PRE PRO."});
    events.push({flat:b.id, cat:"energie", date:e.elektrina.platnostDo,
      title:"Konec doby určité a pevné ceny – elektřina a plyn (PRE)",
      desc:"Smlouvy "+e.elektrina.smlouva+" a "+e.plyn.smlouva+" platí od "+czDate(e.elektrina.platnostOd)+" (elektřina) a "+
           czDate(e.plyn.platnostOd)+" (plyn)."});
    events.push({flat:b.id, cat:"energie", date:dalsiDenVMesici(e.plyn.splatnostDen), inkaso:true,
      title:"Záloha za plyn "+kc(e.plyn.zaloha),
      desc:"Inkasuje se přímým inkasem, vždy k "+e.plyn.splatnostDen+". dni v měsíci."});
  }
  if(b.voda){
    const v=b.voda;
    events.push({flat:b.id, cat:"energie", date:dalsiDenVMesici(v.splatnostDen), inkaso:true,
      title:"Záloha za vodu "+kc(v.zaloha)+" (PVK)",
      desc:"Platí se "+v.uhrada+", vždy k "+v.splatnostDen+". dni v měsíci. Plán záloh platí do "+czDate(v.zalohyDo)+"."});
    events.push({flat:b.id, cat:"energie", date:v.dalsiVyuctovani,
      title:"Očekávané roční vyúčtování vody (PVK)",
      desc:"Chodí začátkem března (2023–2026 vždy 3.–7. 3.), splatnost asi za 17 dní. S ním přijde i nový plán záloh."});
    events.push({flat:b.id, cat:"energie", date:v.vymenaPodruzneho,
      title:"Výměna podružného vodoměru (zálivka) – nejpozději v roce 2030",
      desc:"Podle montážního listu PVK ze 7. 3. 2025. Minule se objednávala u PVK objednávkou s čestným prohlášením – podklady jsou ve složce PVK/vodoměr."});
  }
  if(b.hypo){
    const h=b.hypo;
    if(h.fixaceDo){
      events.push({flat:b.id, cat:"hypo", date:minusMonths(h.fixaceDo, UPOZORNENI_MESICU),
        title:"Začít shánět nabídky – končí fixace ("+h.banka+")",
        desc:"Fixace končí "+czDate(h.fixaceDo)+" se sazbou "+h.sazba+
             ". Nabídky je rozumné mít dřív, než přijde sdělení z banky."});
      events.push({flat:b.id, cat:"hypo", date:h.fixaceDo,
        title:"Konec fixace úrokové sazby – "+h.banka,
        desc:"Dosavadní sazba "+h.sazba+", splátka "+kc(h.splatka)+
             ". Od tohoto dne platí nová sazba."});
    }
    if(h.prvniSplatka && h.splatka) events.push({flat:b.id, cat:"hypo", date:h.prvniSplatka, inkaso:!!h.zpusob,
      title:"První splátka hypotéky "+kc(h.splatka),
      desc:h.banka+", úvěr č. "+h.cislo+". Dál vždy k "+h.den+". dni v měsíci."});
  }
  if(b.stav==="pronajato"){
    const alert = minusMonths(b.do, UPOZORNENI_MESICU);
    events.push({flat:b.id, cat:"smlouva", date:alert,
      title:"Řešit prodloužení nájmu – "+b.najemnik,
      desc:"Smlouva končí "+czDate(b.do)+". Tohle je "+UPOZORNENI_MESICU+" měsíce předem."});
    events.push({flat:b.id, cat:"smlouva", date:b.do,
      title:"Konec nájemní smlouvy – "+b.najemnik,
      desc:"Nájem sjednán na dobu určitou od "+czDate(b.od)+"."});
    events.push({flat:b.id, cat:"vyuct", date:b.vyuctovaniOcek,
      title:"Očekávané vyúčtování za "+b.vyuctovaniZa,
      desc:"Zúčtovací období "+b.obdobi+". Nedoplatek: "+b.splatnost+"."});
    if(b.minuleVyuctovani){
      const m=b.minuleVyuctovani;
      events.push({flat:b.id, cat:"vyuct", date:m.splatnostBylo,
        title:"Nedoplatek z vyúčtování "+m.za+" – "+kc(m.nedoplatek),
        desc:"Vyúčtování doručeno "+czDate(m.doruceno)+", splatnost "+czDate(m.splatnostBylo)+
             ". Odškrtni, až ověříš, že je uhrazený."});
    }
    if(b.zalohyOd) events.push({flat:b.id, cat:"zalohy", date:b.zalohyOd,
      title:"Nová výše záloh "+kc(b.predpisCelkem||b.zalohy)+" měsíčně",
      desc:"Podle výpočtového listu platného od "+czDate(b.zalohyOd)+
           ". Se zúčtovacím obdobím to nesouvisí – zálohy se mění samostatně."});
  } else if(b.stav==="pred-prevzetim"){
    events.push({flat:b.id, cat:"hypo", date:b.hypoCerpaniDo,
      title:"Konec lhůty pro čerpání hypotéky",
      desc:b.hypoBanka+", úvěr č. "+b.hypoCislo+", "+kc(b.hypoCastka)+"."});
    events.push({flat:b.id, cat:"hypo", date:b.planOd,
      title:"Plánovaný začátek pronájmu",
      desc:"Zatím jen odhad z Excelu – po převzetí bytu upřesnit."});
  }
});
events.push({flat:AUTO.id, cat:"auto", date:minusMonths(AUTO.stk.dalsi, UPOZORNENI_MESICU),
  title:"Objednat STK – auto (VW Sharan)",
  desc:"Platnost technické prohlídky končí "+czDate(AUTO.stk.dalsi)+". Minule "+AUTO.stk.stanice+", společně s měřením emisí."});
events.push({flat:AUTO.id, cat:"auto", date:AUTO.stk.dalsi,
  title:"Konec platnosti STK – auto (VW Sharan)",
  desc:"Poslední prohlídka "+czDate(AUTO.stk.posledni)+" bez závad, stav tachometru "+AUTO.stk.km+"."});
events.push({flat:AUTO.id, cat:"auto", date:AUTO.navrh.zacatek,
  title:"Pojištění auta – začátek nové smlouvy (Kooperativa)",
  desc:"Nová smlouva z modelace ze dne "+czDate(AUTO.navrh.vytvoreno)+" začíná "+czDate(AUTO.navrh.zacatek)+", "+kc(AUTO.navrh.rocne)+" za rok. Podepiš návrh beze změn a ověř ukončení staré smlouvy z 2019."});
events.push({flat:AUTO.id, cat:"auto", date:AUTO.navrh.fotkyRadny,
  title:"Fotky auta a techničáku pro Kooperativu",
  desc:"Pošli přes odkaz v SMS do "+czDate(AUTO.navrh.fotkyRadny)+" (náhradní termín "+czDate(AUTO.navrh.fotkyNahradni)+"). Jinak spoluúčast 90 %, po náhradním termínu zaniká havárie a výmol."});
events.push({flat:AUTO.id, cat:"auto", date:AUTO.znamka.do,
  title:"Konec dálniční známky – auto (VW Sharan)",
  desc:"Roční elektronická známka platí do "+czDate(AUTO.znamka.do)+" 23:59. Novou kup předem na edalnice.gov.cz, počátek platnosti si zvolíš."});
events.sort((a,b)=> a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
/* Každá událost má vlastní id (z něj je odkaz na úkol). Pokud je ve stejný den u stejného bytu a kategorie
   víc událostí, první si nechá původní tvar (už založené úkoly zůstanou) a další dostanou na konec zkratku názvu. */
function zkratkaNazvu(t){ let h=0; for(const ch of t) h=(h*31+ch.codePointAt(0))>>>0; return h.toString(36); }
const _zakladId = {};
events.forEach(e => {
  const z = e.flat+"|"+e.cat+"|"+e.date;
  _zakladId[z] = (_zakladId[z]||0) + 1;
  e.id = _zakladId[z] === 1 ? z : z+"|"+zkratkaNazvu(e.title);
});

/* V seznamu „Co je potřeba řešit“ jen termíny od dneška do OKNO_MESICU dopředu.
   Proběhlé termíny a platby, které se platí samy (inkaso, trvalý příkaz, převod; inkaso:true), se nezobrazují. */
const OKNO_MESICU = 3;
const KONEC_OKNA = (()=>{ const d=new Date(TODAY); d.setMonth(d.getMonth()+OKNO_MESICU);
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); })();
const vOkne = e => !e.inkaso && dayDiff(e.date) >= 0 && e.date <= KONEC_OKNA;

/* --- úkoly v Myší úkolárně (tabulka tasks) ----------------------------------
   Termíny ze seznamu „Co je potřeba řešit“ se zakládají jako úkoly: kategorie „Přehled 42“,
   osoba An, název bez jmen nájemníků, částek a čísel (tabulka tasks je otevřená pro Úkolárnu).
   Odškrtnutí je sloupec done u úkolu, takže platí v Přehledu 42 i v Úkolárně a pro oba účty.
   Osoba a odškrtnutí se při synchronizaci nikdy nepřepisují.
   ----------------------------------------------------------------------- */
const UKOL_KATEGORIE = "Přehled 42";
const UKOL_OSOBA = "An";
const refUkolu = e => "p42|" + e.id;

/* Neutrální název podle začátku původního názvu události. Ručně zadané události mají pole ukol. */
const UKOL_NAZVY = [
  ["Pojištění bytu", "zaplatit pojistné za byt"],
  ["Pojištění nemovitosti", "zaplatit pojistné za nemovitost"],
  ["Pojištění domu a domácnosti", "zaplatit pojistné za dům a domácnost"],
  ["Pojištění auta", "zaplatit pojistné za auto (nová smlouva)"],
  ["Řešit další dodávku energií", "řešit další dodávku energií"],
  ["Konec doby určité", "konec pevné ceny energií"],
  ["Očekávané roční vyúčtování vody", "roční vyúčtování vody"],
  ["Výměna podružného vodoměru", "výměna vodoměru"],
  ["Začít shánět nabídky", "hypotéka – začít shánět nabídky"],
  ["Konec fixace", "konec fixace hypotéky"],
  ["Konec lhůty pro čerpání", "konec lhůty čerpání hypotéky"],
  ["Plánovaný začátek pronájmu", "plánovaný začátek pronájmu"],
  ["Řešit prodloužení nájmu", "řešit prodloužení nájmu"],
  ["Konec nájemní smlouvy", "konec nájemní smlouvy"],
  ["Očekávané vyúčtování", "očekávané vyúčtování služeb"],
  ["Nedoplatek z vyúčtování", "zaplatit nedoplatek z vyúčtování"],
  ["Nová výše záloh", "nová výše záloh správci"],
  ["Objednat STK", "objednat STK"],
  ["Konec platnosti STK", "konec platnosti STK"],
  ["Fotky auta", "fotky auta pro Kooperativu"],
  ["Konec dálniční známky", "konec dálniční známky"]
];
function nazevUkolu(e){
  const b = BYTY.find(x=>x.id===e.flat) || AUTO;
  const t = e.ukol || (UKOL_NAZVY.find(([p])=>e.title.startsWith(p))||[])[1] || (CATS[e.cat]||"termín").toLowerCase();
  return b.kratky + " – " + t;
}

let done = {};   // id události -> true, plní se z tabulky tasks
const isoDen = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const novyIdUkolu = () => "p42" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

function renderNote(msg){
  document.getElementById("storagenote").innerHTML = msg
    ? `<div class="note">${msg}</div>` : "";
}

async function nactiUkoly(){
  const r = await sb.from("tasks").select("id,ref,title,date,person,done").like("ref","p42|%");
  if(r.error) throw r.error;
  return r.data;
}
function dosadOdskrtnuti(rows){
  const m = {};
  rows.forEach(r => { if(r.done) m[r.ref] = true; });
  done = {};
  events.forEach(e => { if(m[refUkolu(e)]) done[e.id] = true; });
}

async function synchronizujUkoly(){
  const rows = await nactiUkoly();
  const maji = {};
  rows.forEach(r => maji[r.ref] = r);

  /* Odškrtnutí z dřívější verze (jen v tomto prohlížeči) se jednorázově převede do nových úkolů. */
  let puvodni = {};
  try { puvodni = JSON.parse(localStorage.getItem("byty-hotovo-v1") || "{}"); } catch(e){}

  const potreba = events.filter(vOkne);
  const nove = potreba.filter(e => !maji[refUkolu(e)]).map((e, i) => ({
    id: novyIdUkolu(), title: nazevUkolu(e), cat: UKOL_KATEGORIE, date: e.date, person: UKOL_OSOBA,
    store: "", important: dayDiff(e.date) <= 30, secret: false, owner: "", done: !!puvodni[e.id],
    created: Date.now() + i, ref: refUkolu(e)   // + i: Úkolárna řadí stejné datum podle vzniku, tedy v pořadí Přehledu
  }));
  if(nove.length){
    const r = await sb.from("tasks").upsert(nove, { onConflict:"ref", ignoreDuplicates:true });
    if(r.error) throw r.error;
  }

  /* Opravit název u nehotových úkolů, kdyby se změnil. */
  for(const e of potreba){
    const r = maji[refUkolu(e)];
    if(r && !r.done && r.title !== nazevUkolu(e)){
      await sb.from("tasks").update({ title: nazevUkolu(e) }).eq("ref", r.ref);
    }
  }

  /* Nehotový úkol, který zůstal u Andrey a jehož událost už neexistuje (změnilo se datum),
     se odstraní. Delegované úkoly a úkoly s proběhlým termínem zůstávají. */
  const existuji = new Set(events.map(refUkolu));
  const dnes = isoDen(TODAY);
  const zrusit = rows.filter(r => !r.done && r.person === UKOL_OSOBA && !existuji.has(r.ref) && r.date >= dnes);
  for(const r of zrusit) await sb.from("tasks").delete().eq("ref", r.ref);

  dosadOdskrtnuti(await nactiUkoly());
}

async function nastavOdskrtnuti(id, hotovo){
  const r = await sb.from("tasks").update({ done: hotovo }).eq("ref", "p42|" + id);
  if(r.error){ renderNote("Odškrtnutí se nepodařilo uložit: " + r.error.message); return false; }
  renderNote("");
  return true;
}

let obnovCasovac = null;
async function obnovOdskrtnuti(){
  try { dosadOdskrtnuti(await nactiUkoly()); renderTimeline(); renderCollapse(); } catch(e){}
}
function spustSdileni(){
  sb.channel("p42-tasks")
    .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, () => {
      clearTimeout(obnovCasovac); obnovCasovac = setTimeout(obnovOdskrtnuti, 300);
    })
    .subscribe();
  document.addEventListener("visibilitychange", () => { if(!document.hidden) obnovOdskrtnuti(); });
}
async function inicializujUkoly(){
  try {
    await synchronizujUkoly();
    renderNote("");
  } catch(e){
    renderNote("Úkoly se nepodařilo propojit s Úkolárnou: " + (e.message || e) + ". Odškrtnutí se nemusí uložit.");
  }
  renderTimeline(); renderCollapse();
  spustSdileni();
}

/* --- filtry --- */
let fFlat="all", fCat="all";
/* Hotové termíny se ve výchozím stavu skrývají, volba se pamatuje v prohlížeči. */
let hideDone = true;
try { hideDone = localStorage.getItem("p42-skryt-hotove") !== "0"; } catch(e){}

function chips(el, items, cur, cb, tecky){
  el.innerHTML="";
  items.forEach(([val,label])=>{
    const b=document.createElement("button");
    b.className = "chip" + (tecky && val!=="all" ? " k-"+val : "");
    b.textContent=label;
    b.setAttribute("aria-pressed", val===cur);
    b.onclick=()=>cb(val);
    el.appendChild(b);
  });
}
function renderFilters(){
  chips(document.getElementById("f-flat"),
    [["all","Všechny nemovitosti"], ...BYTY.map(b=>[b.id,b.kratky])],
    fFlat, v=>{fFlat=v; render();});
  chips(document.getElementById("f-cat"),
    [["all","Vše"], ...Object.entries(CATS)],
    fCat, v=>{fCat=v; render();}, true);
}

function renderTimeline(){
  const box=document.getElementById("timeline");
  let list=events.filter(e=>
    (fFlat==="all"||e.flat===fFlat) &&
    (fCat==="all"||e.cat===fCat) &&
    vOkne(e));

  const hotovo = list.filter(e=>done[e.id]).length;

  /* postup a ovládání */
  const prog=document.getElementById("prog");
  prog.max = Math.max(list.length,1); prog.value = hotovo;
  document.getElementById("progtext").textContent =
    list.length ? `${hotovo} z ${list.length} hotovo` : "";
  const tg=document.getElementById("toggledone");
  tg.textContent = hideDone ? `Zobrazit hotové (${hotovo})` : "Skrýt hotové";
  tg.style.display = hotovo ? "" : "none";
  document.getElementById("resetdone").style.display = hotovo ? "" : "none";
  document.querySelector(".donebar").style.display = hotovo ? "" : "none";

  /* hotové dolů, případně schovat */
  if(hideDone) list = list.filter(e=>!done[e.id]);
  list = [...list].sort((a,b)=>
    (done[a.id]?1:0)-(done[b.id]?1:0) || (a.date<b.date?-1:1));

  document.getElementById("count").textContent =
    list.length ? list.length+" termínů" : "";
  if(!list.length){ box.innerHTML = hotovo
    ? '<div class="empty">Všechno hotovo ✓</div>'
    : '<div class="empty">Pro tenhle výběr nejsou žádné termíny.</div>'; return; }

  box.innerHTML = '<div class="ev-head"><span></span><span>Kdy</span><span>Co</span><span>Kde</span></div>' + list.map(e=>{
    const d=dayDiff(e.date), b=BYTY.find(x=>x.id===e.flat) || (e.flat===AUTO.id ? AUTO : null);
    const past = d<0, isDone = !!done[e.id];
    return `<div class="ev ${isDone?'done':past?'blue':tone(d)}">
      <input type="checkbox" data-id="${e.id}" ${isDone?"checked":""}
             aria-label="Označit jako hotové: ${e.title.replace(/"/g,"'")}">
      <div class="ev-when">
        <div class="ev-date">${czDate(e.date)}</div>
        <div class="ev-in">${isDone?"hotovo":relText(d)}</div>
      </div>
      <div>
        <div class="ev-title">${e.title}${isDone||past?'':d<=90?'<span class="badge b-amber">blíží se</span>':''}</div>
        <div class="ev-desc">${e.desc}</div>
      </div>
      <div class="ev-flat">${b.kratky}</div>
    </div>`;
  }).join("");

  box.querySelectorAll("input[type=checkbox]").forEach(cb=>{
    cb.onchange = async () => {
      const id = cb.dataset.id, hotovo = cb.checked;
      if(hotovo) done[id] = true; else delete done[id];
      renderTimeline(); renderCollapse();
      if(!(await nastavOdskrtnuti(id, hotovo))){
        if(hotovo) delete done[id]; else done[id] = true;
        renderTimeline(); renderCollapse();
      }
    };
  });
}

// Cesty k dokumentům jsou relativní od složky Přehled 42. Bez prefixu Botanika/ nebo Sharan/ se bere složka Byty/.
const cestaDok = p => /^(Botanika|Sharan)\//.test(p) ? p : "Byty/" + p;

function linkRow(pairs){
  return `<div class="links">${pairs.map(([t,p])=>{
    const ext=/^https?:/.test(p);
    return ext
      ? `<a href="${p}" title="${p}" target="_blank" rel="noopener">${t} ↗</a>`
      : `<span class="nolink" title="Dokument je uložen jen v počítači: ${p}">${t}</span>`;
  }).join("")}</div>`;
}

/* Bloky karty nesou kategorii. Při filtrování se ukáže jen ta, která odpovídá.
   Klíče musí sedět s CATS: smlouva / vyuct / zalohy / hypo.              */
function renderCards(){
  const box=document.getElementById("cards");
  const list=BYTY.filter(b=>fFlat==="all"||b.id===fFlat);
  const cards=list.map(b=>{
    let head, money, sprava, spravceBlok="", zalohyBlok="";
    const portalSpravce = b.portalSpravce
      ? `<a href="${b.portalSpravce[1]}" target="_blank" rel="noopener" title="${b.portalSpravce[1]}">${b.portalSpravce[0]} ↗</a>`
      : `<span style="color:var(--muted)">odkaz zatím nezadán</span>`;

    if(b.stav==="pronajato"){
      const total=(new Date(b.do)-new Date(b.od))/DAY;
      const done=Math.min(Math.max((TODAY-new Date(b.od))/DAY,0),total);
      const left=dayDiff(b.do);
      const cls=left<=90?"crit":left<=180?"warn":"";
      head=`<div class="block blk-smlouva">
        <div class="btitle">Nájemník</div>
        <div class="rows">
          <div class="row"><span>Kdo</span><span class="big">${b.najemnik}</span></div>
          <div class="row"><span>Od – do</span><span>${czDate(b.od)} – ${czDate(b.do)}</span></div>
        </div>
        <div class="bar ${cls}"><i style="width:${(done/total*100).toFixed(1)}%"></i></div>
        <div class="row"><span>Zbývá</span><span>${relText(left)}
          ${left<=90?'<span class="badge b-red">řešit prodloužení</span>':''}</span></div>
      </div>`;
      money=`<div class="block blk-smlouva">
        <div class="btitle">Nájem měsíčně</div>
        <div class="rows">
          <div class="row"><span>Nájem</span><span class="big">${kc(b.najem)}</span></div>
          ${b.garaz?`<div class="row"><span>Garáž</span><span>${kc(b.garaz)}</span></div>`:""}
          <div class="row"><span>Kauce</span><span>${kc(b.kauce)}</span></div>
        </div>
      </div>`;
      spravceBlok=`<div class="block blk-dok">
        <div class="btitle">Správce</div>
        <div class="rows">
          <div class="row"><span>Správce</span><span class="big">${b.spravce}</span></div>
          <div class="row"><span>SVJ</span><span>${b.svj}</span></div>
          <div class="row"><span>Kontakt</span><span>${b.spravceMail}<br>${b.spravceTel}</span></div>
          <div class="row"><span>Portál</span><span>${portalSpravce}</span></div>
        </div>
      </div>`;
      zalohyBlok=`<div class="block blk-zalohy">
        <div class="btitle">Služby měsíčně</div>
        <div class="rows">
          <div class="row key"><span>Ve smlouvě</span><span>${kc(b.zalohySmlouva)}</span></div>
          <hr class="sep">
          <div class="row key"><span>Aktuální vyúčtování celkem</span><span>${kcH(b.predpisCelkem||b.zalohy)}</span></div>
          ${b.fondOprav!=null?`<div class="row minor sub"><span>z toho Fond oprav (FO)</span><span>${kcH(b.fondOprav)}${b.plocha?` · ${(b.fondOprav/b.plocha).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})} Kč/m²`:""}</span></div>
          <div class="row key"><span>Aktuální vyúčtování bez FO</span><span>${kcH((b.predpisCelkem||b.zalohy)-b.fondOprav)}</span></div>`:""}
          <hr class="sep">
          <div class="row minor"><span></span><span>${(()=>{
            // rozdíl se počítá z aktuálního vyúčtování bez FO proti záloze uvedené ve smlouvě
            const zaklad = b.fondOprav!=null ? (b.predpisCelkem||b.zalohy)-b.fondOprav : b.zalohy;
            const rozdil = Math.round((zaklad-b.zalohySmlouva)*100)/100;
            return rozdil>0
              ? `<span class="badge b-amber" style="margin-left:0;font-weight:400">Nájemníkovi se má zvýšit platba za služby o: ${kcH(rozdil)}</span>`
              : rozdil<0
              ? `<span class="badge b-amber" style="margin-left:0;font-weight:400">Nájemníkovi se má snížit platba za služby o: ${kcH(-rozdil)}</span>`
              : `<span class="badge b-green" style="margin-left:0;font-weight:400">Nájemníkovi se platba za služby nemění (0 Kč)</span>`;})()}</span></div>
          <div class="row minor"><span>platné od</span><span>${czDate(b.zalohyOd)}</span></div>
          ${b.predpisCelkem && b.predpisCelkem!==b.zalohy?`<div class="row minor"><span>nájemník platí</span><span>${kc(b.zalohy)}, zbytek vlastník</span></div>`:""}
          <div class="row minor"><span>zdroj</span><span>${b.fondOprav!=null?"smlouva, evidenční / výpočtový list správce":"smlouva, nové vyúčtování"}</span></div>
          <div class="row minor"><span>Platit na účet SVJ / VS</span><span>${b.ucet}<br>${b.vs}</span></div>
        </div>
      </div>`;
      sprava=`<div class="block blk-vyuct">
        <div class="btitle">Služby vyúčtování</div>
        <div class="rows">
          <div class="row"><span>Zúčtovací období</span><span>${b.obdobi}</span></div>
          <div class="row"><span>Vyúčtování přijde</span><span>${czDate(b.vyuctovaniOcek)} (za ${b.vyuctovaniZa})</span></div>
          <div class="row"><span>Nedoplatek splatný</span><span>${b.splatnost}</span></div>
          ${b.vyuctovaniHistorie?(()=>{const h=b.vyuctovaniHistorie, p=h[0]; const txt=([r,v,s])=>`${r}: ${v<0?"přeplatek":"nedoplatek"} ${kc(Math.abs(v))}`;
            return `<div class="row"><span>Poslední (${p[0]})</span><span class="big">${p[1]<0?"přeplatek":"nedoplatek"} ${kc(Math.abs(p[1]))}<br><span style="font-weight:400;font-size:12px;color:var(--muted)">${p[2]}</span></span></div>
          <div class="row"><span>Dřívější roky</span><span style="font-size:12.5px">${h.slice(1).map(txt).join("<br>")}</span></div>`;})():""}
        </div>
      </div>`;
    } else if(b.stav==="pred-prevzetim"){
      head=`<div class="block blk-hypo">
        <div class="btitle">Stav</div>
        <div class="rows">
          <div class="row"><span>Fáze</span><span class="big">Před převzetím</span></div>
          ${b.kolaudacePM?`<div class="row"><span>Kolaudace</span><span>pravomocná od ${czDate(b.kolaudacePM)}</span></div>`:""}
          <div class="row"><span>Plánovaný pronájem od</span><span>${czDate(b.planOd)}</span></div>
        </div>
      </div>`;
      money=`<div class="block blk-hypo">
        <div class="btitle">Čerpání úvěru</div>
        <div class="rows">
          <div class="row"><span>Výše úvěru</span><span class="big">${kc(b.hypoCastka)}</span></div>
          <div class="row"><span>Čerpat do</span><span>${czDate(b.hypoCerpaniDo)}
            <span class="badge b-amber">${relText(dayDiff(b.hypoCerpaniDo))}</span></span></div>
        </div>
      </div>`;
      sprava=`<div class="block blk-smlouva">
        <div class="btitle">Plánované nájemné</div>
        <div class="rows">
          <div class="row"><span>Nájem</span><span>${kc(b.najem)}</span></div>
          <div class="row"><span>Garáž</span><span>${kc(b.garaz)}</span></div>
        </div>
      </div>`;
      spravceBlok=`<div class="block blk-dok">
        <div class="btitle">Správce</div>
        <div class="rows">
          <div class="row"><span>Správce</span><span>zatím neznámý</span></div>
          <div class="row"><span>Portál</span><span>${portalSpravce}</span></div>
        </div>
      </div>`;
      zalohyBlok=`<div class="block blk-zalohy">
        <div class="btitle">Služby měsíčně</div>
        <div class="rows">
          ${(()=>{
            // Lužiny: stejné rozvržení jako u pronajatých bytů, hodnoty se doplní, až budou (smlouva s nájemníkem, evidenční list správce)
            const nic = '<span class="nic">zatím neověřeno</span>';
            const zs = b.zalohySmlouva, pc = b.predpisCelkem, fo = b.fondOprav;
            const bezFO = (pc!=null && fo!=null) ? pc-fo : null;
            const rozdil = (bezFO!=null && zs!=null) ? Math.round((bezFO-zs)*100)/100 : null;
            const stitek = rozdil==null ? "" : rozdil>0
              ? `<span class="badge b-amber" style="margin-left:0;font-weight:400">Nájemníkovi se má zvýšit platba za služby o: ${kcH(rozdil)}</span>`
              : rozdil<0
              ? `<span class="badge b-amber" style="margin-left:0;font-weight:400">Nájemníkovi se má snížit platba za služby o: ${kcH(-rozdil)}</span>`
              : `<span class="badge b-green" style="margin-left:0;font-weight:400">Nájemníkovi se platba za služby nemění (0 Kč)</span>`;
            return `<div class="row key"><span>Ve smlouvě</span>${zs!=null?`<span>${kc(zs)}</span>`:nic}</div>
          <hr class="sep">
          <div class="row key"><span>Aktuální vyúčtování celkem</span>${pc!=null?`<span>${kcH(pc)}</span>`:nic}</div>
          <div class="row minor sub"><span>z toho Fond oprav (FO)</span><span>${fo!=null?kcH(fo)+(b.plocha?` · ${(fo/b.plocha).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})} Kč/m²`:""):"zatím neověřeno"}</span></div>
          <div class="row key"><span>Aktuální vyúčtování bez FO</span>${bezFO!=null?`<span>${kcH(bezFO)}</span>`:nic}</div>
          <hr class="sep">
          ${stitek?`<div class="row minor"><span></span><span>${stitek}</span></div>`:""}
          <div class="row minor"><span>plánováno měsíčně (odhad)</span><span>${kc(b.zalohy)}</span></div>
          <div class="row minor"><span>Platit na účet SVJ / VS</span><span>${b.ucet?`${b.ucet}<br>${b.vs}`:"zatím neověřeno"}</span></div>`;})()}
        </div>
      </div>`;
    }

    const warn = b.chybi.length ? `<div class="warnbox"><b>Chybí nebo ověřit</b>
      <ul>${b.chybi.map(x=>`<li>${x}</li>`).join("")}</ul></div>` : "";

    const identifikaceBlok = b.identifikace ? `<div class="block blk-dok"><div class="btitle">Identifikace</div>
      <div class="rows">
        <div class="row"><span>Byt</span><span>${b.identifikace.byt}</span></div>
        <div class="row"><span>Sklep</span><span>${b.identifikace.sklep}</span></div>
        <div class="row"><span>Parkovací stání</span><span>${b.identifikace.parkovaciStani}</span></div>
      </div>
    </div>` : "";

    const rozsahBlok = b.rozsah ? `<div class="block blk-pojisteni"><div class="btitle">Rozsah a škody</div>
      <div class="rows">
        ${b.rozsah.map(([n,v])=>`<div class="row"><span>${n}</span><span>${kc(v)}</span></div>`).join("")}
        <div class="row"><span>Škodní události</span><span>${b.skody.length}× uzavřené</span></div>
        <div class="row"><span>Poslední škoda</span><span>${czDate(b.skody[b.skody.length-1])}</span></div>
      </div>
    </div>` : "";

    const energieBlok = b.energie ? (()=>{
      const e=b.energie, el=e.elektrina, pl=e.plyn;
      const hr=`<div style="border-top:1px solid var(--line);margin:10px 0"></div>`;
      return `<div class="block blk-energie"><div class="btitle">Energie – ${e.dodavatel}</div>
        <div class="btitle btitle-komodita">Elektřina</div>
        <div class="rows">
          <div class="row"><span>Produkt</span><span class="big">${el.produkt}</span></div>
          <div class="row"><span>Smlouva č.</span><span>${el.smlouva}</span></div>
          <div class="row"><span>Platnost</span><span>${czDate(el.platnostOd)} – ${czDate(el.platnostDo)}
            <span class="badge b-green">${relText(dayDiff(el.platnostDo))}</span><br>doba určitá, pak neurčitá</span></div>
          <div class="row"><span>Zákaznický účet</span><span>${el.ucet}</span></div>
          <div class="row"><span>Sazba a jistič</span><span>${el.sazba} · ${el.jistic}</span></div>
          <div class="row"><span>Měsíční plat</span><span>${kc(el.mesicniPlat)}</span></div>
          <div class="row"><span>Elektroměr č.</span><span>${el.elektromer}</span></div>
          <div class="row"><span>Poslední odečet</span><span>${czDate(el.odecet)} · ${el.stav}</span></div>
          <div class="row"><span>Poslední vyúčtování</span><span>${czDate(el.vyuctovani)} · ${kc(el.castka)}<br>za ${el.vyuctovaniZa}</span></div>
          <div class="row"><span></span><span style="color:var(--muted);font-size:12px">${el.pozn}</span></div>
        </div>${hr}
        <div class="btitle btitle-komodita">Plyn</div>
        <div class="rows">
          <div class="row"><span>Produkt</span><span class="big">${pl.produkt}</span></div>
          <div class="row"><span>Smlouva č.</span><span>${pl.smlouva}</span></div>
          <div class="row"><span>Platnost</span><span>${czDate(pl.platnostOd)} – ${czDate(pl.platnostDo)}
            <span class="badge b-green">${relText(dayDiff(pl.platnostDo))}</span><br>doba určitá, pak neurčitá</span></div>
          <div class="row"><span>Zákaznický účet</span><span>${pl.ucet}</span></div>
          <div class="row"><span>Odběr / plynoměr č.</span><span>${pl.odber} · ${pl.plynomer}</span></div>
          <div class="row"><span>Předpokládaná spotřeba</span><span>${pl.rocniSpotreba}</span></div>
          <div class="row"><span>Cena plynu</span><span>${kc(pl.cenaMWh)} / MWh<br>+ ${kc(pl.mesicniPlat)} měsíčně</span></div>
          <div class="row"><span>Poslední odečet</span><span>${czDate(pl.odecet)} · ${pl.stav}</span></div>
          <div class="row"><span>Poslední vyúčtování</span><span>${czDate(pl.vyuctovani)} · ${kc(pl.castka)}<br>za ${pl.vyuctovaniZa}</span></div>
          <div class="row"><span>Záloha</span><span class="big">${kc(pl.zaloha)} měsíčně</span></div>
          <div class="row"><span>Další splatná</span><span>${czDate(dalsiDenVMesici(pl.splatnostDen))}
            <span class="badge b-amber">${relText(dayDiff(dalsiDenVMesici(pl.splatnostDen)))}</span></span></div>
          <div class="row"><span></span><span style="color:var(--muted);font-size:12px">${pl.pozn}</span></div>
        </div>${hr}
        <div class="rows">
          <div class="row"><span>Odběrné místo č.</span><span>${e.odberneMisto}</span></div>
          <div class="row"><span>Pevná cena do</span><span>${czDate(e.pevnaCenaDo)}</span></div>
          <div class="row"><span></span><span style="color:var(--muted);font-size:12px">${e.pokuta}</span></div>
        </div>
        <div class="btitle" style="margin-top:12px">Dokumenty</div>${linkRow(e.odkazy)}
      </div>`;
    })() : "";

    const vodaBlok = b.voda ? (()=>{
      const v=b.voda, dalsi=dalsiDenVMesici(v.splatnostDen);
      const hr=`<div style="border-top:1px solid var(--line);margin:10px 0"></div>`;
      return `<div class="block blk-voda"><div class="btitle">Voda – vodné a stočné</div>
        <div class="rows">
          <div class="row"><span>Záloha</span><span class="big">${kc(v.zaloha)} měsíčně</span></div>
          <div class="row"><span>Další splatná</span><span>${czDate(dalsi)}
            <span class="badge b-amber">${relText(dayDiff(dalsi))}</span></span></div>
          <div class="row"><span>Úhrada</span><span>${v.uhrada}, k ${v.splatnostDen}. dni v měsíci</span></div>
          <div class="row"><span>Plán záloh</span><span>${czDate(v.zalohyOd)} – ${czDate(v.zalohyDo)}</span></div>
        </div>${hr}
        <div class="btitle btitle-komodita" style="color:var(--c-pojisteni)">Poslední vyúčtování</div>
        <div class="rows">
          <div class="row"><span>Vystaveno</span><span>${czDate(v.vyuctovani)}<br>za ${v.vyuctovaniZa}</span></div>
          <div class="row"><span>Celkem s DPH</span><span class="big">${kc(v.castka)}</span></div>
          <div class="row"><span>Zahrnuté zálohy</span><span>${kc(v.zahrnuteZalohy)}</span></div>
          <div class="row"><span>Doplatek</span><span>${kc(v.doplatek)} <span class="badge b-green">${v.doplatekStav}</span></span></div>
          <div class="row"><span>Spotřeba</span><span>${v.spotreba}</span></div>
          <div class="row"><span>Cena</span><span>${v.cena}</span></div>
        </div>${hr}
        <div class="btitle btitle-komodita" style="color:var(--c-pojisteni)">Vodoměry</div>
        <div class="rows">
          <div class="row"><span>Hlavní vodoměr</span><span>${v.vodomer}</span></div>
          <div class="row"><span>Podružný (zálivka)</span><span>${v.podruzny}</span></div>
          <div class="row"><span>Odběrné místo č.</span><span>${v.odberneMisto}</span></div>
          <div class="row"><span>Zákaznický účet</span><span>${v.ucet}</span></div>
          <div class="row"><span></span><span style="color:var(--muted);font-size:12px">${v.pozn}</span></div>
        </div>
        <div class="btitle" style="margin-top:12px">Dokumenty</div>${linkRow(v.odkazy)}
      </div>`;
    })() : "";

    const pojBlok = (b.pojisteni && b.pojisteni.length)
      ? `<div class="block blk-pojisteni"><div class="btitle">Pojištění</div>
          ${b.pojisteni.map(p=>`
            <div class="rows" style="margin-bottom:10px">
              <div class="row"><span>${DRUH[p.druh]}</span><span class="big">${kc(p.rocne)} / rok</span></div>
              <div class="row"><span>Pojišťovna</span><span>${p.pojistovna}</span></div>
              <div class="row"><span>Smlouva č.</span><span>${p.cislo}</span></div>
              ${p.platnostOd?`<div class="row"><span>Platnost</span><span>od ${czDate(p.platnostOd)}<br>na dobu neurčitou</span></div>`:""}
              <div class="row"><span>Výročí</span><span>${p.vyrociDen}. ${p.vyrociMesic}.
                <span class="badge b-amber">${relText(dayDiff(dalsiVyroci(p.vyrociDen,p.vyrociMesic)))}</span></span></div>
              ${p.zaplacenoDo?`<div class="row"><span>Zaplaceno do</span><span>${czDate(p.zaplacenoDo)}</span></div>`:""}
              ${p.ucet?`<div class="row"><span>Účet / VS</span><span>${p.ucet}<br>${p.vs}</span></div>`:""}
              ${p.pozn?`<div class="row"><span></span><span style="color:var(--muted);font-size:12px">${p.pozn}</span></div>`:""}
              ${p.pojistovna==="Kooperativa" && b.stav!=="dum" && b.portaly && b.portaly.length ? linkRow(b.portaly) : ""}
            </div>`).join('<div style="border-top:1px solid var(--line);margin:10px 0"></div>')}
        </div>` : "";

    const h = b.hypo;
    const hypoBlok = h ? `<div class="block blk-hypo"><div class="btitle">Hypotéka</div>
        <div class="rows">
          ${h.castka != null?`<div class="row"><span>Výše úvěru</span><span class="big">${kc(h.castka)}</span></div>`:""}
          <div class="row"><span>Splátka</span><span class="big">${h.splatka != null ? kc(h.splatka) : "zatím neověřeno"}</span></div>
          <div class="row"><span>Splatná</span><span>${h.den ? `vždy k ${h.den}. dni v měsíci` : "zatím neověřeno"}</span></div>
          <div class="row"><span>Odkud se platí</span><span>${h.ucet || "zatím neověřeno"}</span></div>
          <div class="row"><span>Banka a úvěr</span><span>${h.banka || "zatím neověřeno"}<br>${h.cislo ? `č. ${h.cislo}` : "číslo smlouvy neuvedeno"}</span></div>
          <div class="row"><span>Sazba</span><span>${h.sazba || "zatím neověřeno"}</span></div>
          <div class="row"><span>Fixace do</span><span>${h.fixaceDo ? `${czDate(h.fixaceDo)}
            <span class="badge b-amber">${relText(dayDiff(h.fixaceDo))}</span>` : "zatím neověřeno"}</span></div>
          <div class="row"><span>${h.splatnostPopis || "Splatnost do"}</span><span>${h.splatnostDo ? czDate(h.splatnostDo) : "zatím neověřeno"}</span></div>
          ${h.pocetSplatek?`<div class="row"><span>Počet splátek</span><span>${h.pocetSplatek}</span></div>`:""}
          ${h.prvniSplatka?`<div class="row"><span>První splátka</span><span>${czDate(h.prvniSplatka)}</span></div>`:""}
        </div>
        ${h.pozn?`<div class="warnbox" style="margin-top:8px">${h.pozn}</div>`:""}
      </div>` : "";

    const patri = c => fCat==="all" || (Array.isArray(c) ? c.includes(fCat) : c===fCat);
    const hlavicka = `<div class="cardhead">
        <h3>${b.nazev}</h3>
        <div class="addr">${b.adresa}</div>
      </div>`;
    const dokumenty = fCat==="all" && b.odkazy.length
      ? `<div class="block blk-dok"><div class="btitle">Dokumenty</div>${linkRow(b.odkazy)}</div>` : "";

    /* Dům (Botanika) nemá nájem ani zálohy, takže nemá pevné pozice jako byty:
       sekce Pojištění, Energie a Voda jsou samostatné karty vedle sebe, každá stejně široká
       jako ostatní karty (zabírají dva, resp. tři sloupce mřížky). */
    if(b.stav==="dum"){
      const levy = patri("pojisteni") ? pojBlok + rozsahBlok : "";
      const pravy = patri("energie") ? energieBlok : "";
      const voda = patri("energie") ? vodaBlok : "";
      if(!levy && !pravy && !voda && !warn) return "";
      const kartaLeva = (levy || warn) ? `<div class="card c-${b.id}">
          <div class="cardhead">
            <h3>${b.nazev} · Pojištění</h3>
            <div class="addr">${(b.pojisteni && b.pojisteni[0] && b.pojisteni[0].pojistovna) || ""}</div>
            ${b.portaly && b.portaly.length ? linkRow(b.portaly) : ""}
          </div>
          ${levy}
          ${dokumenty}
          ${warn}
        </div>` : "";
      const kartaPrava = pravy ? `<div class="card c-${b.id}">
          <div class="cardhead">
            <h3>${b.nazev} · Energie</h3>
            <div class="addr">${b.energie.dodavatel}</div>
            ${b.portalyEnergie && b.portalyEnergie.length ? linkRow(b.portalyEnergie) : ""}
          </div>
          ${pravy}
        </div>` : "";
      const kartaVoda = voda ? `<div class="card c-${b.id}">
          <div class="cardhead">
            <h3>${b.nazev} · Voda (PVK)</h3>
            <div class="addr">${b.voda.dodavatel}</div>
            ${b.portalyVoda && b.portalyVoda.length ? linkRow(b.portalyVoda) : ""}
          </div>
          ${voda}
        </div>` : "";
      const vyvoj = patri("energie") && b.vyvojCen ? vyvojCenKarta(b) : "";
      const vyvojVody = patri("energie") && b.vyvojVody ? vyvojVodyKarta(b) : "";
      const pocet = [kartaLeva,kartaPrava,kartaVoda].filter(Boolean).length;
      return `<div class="house-row${pocet===3?" tri":""}">${kartaLeva}${kartaPrava}${kartaVoda}</div>${vyvoj}${vyvojVody}`;
    }

    /* Pevné pozice: stejný druh bloku je u všech bytů ve stejném řádku mřížky.
       Pořadí: nájemník, nájem, služby, vyúčtování (u Lužin čerpání úvěru), správce, pojištění, hypotéka.
       Každý blok nese kategorii (nebo seznam kategorií) pro filtr; prázdná pozice zůstane prázdná. */
    const sloty = b.stav==="pronajato"
      ? [["smlouva",head],["smlouva",money],["zalohy",zalohyBlok],["vyuct",sprava],
         [["zalohy","vyuct"],spravceBlok],["pojisteni",pojBlok],["hypo",hypoBlok]]
      : [["hypo",head],["smlouva",sprava],["zalohy",zalohyBlok],["hypo",money],
         [["zalohy","vyuct"],spravceBlok],["pojisteni",pojBlok],["hypo",hypoBlok]];

    const zobraz = ([c,html]) => html && patri(c) ? html : "<div></div>";
    const vybrane = sloty.filter(([c,html]) => html && patri(c));

    // byt, který v téhle kategorii nic nemá: zobraz jen když má upozornění
    if(!vybrane.length && !warn) return "";

    const poznamka = `<div class="block blk-dok"><div class="btitle">Poznámka</div>
        <div class="row"><span>Pro tuhle kategorii tu zatím nic není.</span><span></span></div></div>`;
    const bloky = sloty.map(zobraz);
    if(!vybrane.length) bloky[0] = poznamka;

    return `<div class="card slots c-${b.id}">
      ${hlavicka}
      ${fCat==="all" && identifikaceBlok ? identifikaceBlok : "<div></div>"}
      ${bloky.join("")}
      ${dokumenty || "<div></div>"}
      ${warn || "<div></div>"}
    </div>`;
  }).filter(Boolean);

  box.innerHTML = cards.join("") ||
    '<div class="empty">Pro tenhle výběr nejsou žádné nemovitosti.</div>';

  if(fFlat==="all" && fCat==="all"){
    box.insertAdjacentHTML("beforeend",
      `<div class="card common"><div class="cardhead"><h3>Společné</h3>
       <div class="addr">Formuláře, šablony a přehledy pro všechny nemovitosti</div></div>
       <div class="block blk-dok">${linkRow(OBECNE)}</div></div>`);
  }
}

/* --- sbalení celé sekce s úkoly --- */
const KEY_SBAL = "byty-ukoly-sbalene-v1";
let sbaleno = false;
try { sbaleno = localStorage.getItem(KEY_SBAL) === "1"; } catch(e){}

function renderCollapse(){
  const box = document.getElementById("ukoly");
  const btn = document.getElementById("collapse");
  box.style.display = sbaleno ? "none" : "";
  const n = events.filter(e =>
    (fFlat==="all"||e.flat===fFlat) && (fCat==="all"||e.cat===fCat) &&
    vOkne(e) && !done[e.id]).length;
  btn.textContent = sbaleno
    ? (n ? `Zobrazit úkoly (${n})` : "Zobrazit úkoly")
    : "Skrýt úkoly";
}

function render(){ renderFilters(); renderTimeline(); renderCards(); renderCollapse(); renderPlatby(); renderAuto(); }

/* --- Auto ---------------------------------------------------------------- */
function renderAuto(){
  const a=AUTO, v=a.vozidlo, s=a.stk;
  const row = (k,val) => `<div class="row"><span>${k}</span><span>${val}</span></div>`;
  const warn = a.chybi.length ? `<div class="warnbox"><b>Chybí nebo ověřit</b>
      <ul>${a.chybi.map(x=>`<li>${x}</li>`).join("")}</ul></div>` : "";
  document.getElementById("auto").innerHTML = `<div class="card c-auto">
    <div class="cardhead">
      <h3>${a.nazev}</h3>
      <div class="addr">${a.popis}</div>
      ${linkRow(a.portaly)}
    </div>
    <div class="block blk-pojisteni"><div class="btitle">Technická prohlídka (STK)</div>
      <div class="rows">
        <div class="row"><span>Platí do</span><span class="big">${czDate(s.dalsi)}
          <span class="badge b-${tone(dayDiff(s.dalsi))}">${relText(dayDiff(s.dalsi))}</span></span></div>
        ${row("Poslední", `${czDate(s.posledni)} · ${s.stanice}`)}
        ${row("Výsledek", s.vysledek)}
        ${row("Tachometr", `${s.km} (k ${czDate(s.posledni)})`)}
      </div>
    </div>
    <div class="block blk-pojisteni"><div class="btitle">Dálniční známka</div>
      <div class="rows">
        <div class="row"><span>Platí do</span><span class="big">${czDate(a.znamka.do)}
          <span class="badge b-${tone(dayDiff(a.znamka.do))}">${relText(dayDiff(a.znamka.do))}</span></span></div>
        ${row("Druh", `${a.znamka.druh}, od ${czDate(a.znamka.od)}`)}
        ${row("Cena roční", kc(a.znamka.cena))}
        ${row("Ověřeno", `${czDate(a.znamka.overeno)} na eDálnice`)}
      </div>
      ${linkRow([a.znamka.odkaz])}
    </div>
    <div class="block blk-pojisteni"><div class="btitle">Pojištění – stávající smlouva (${a.pojisteni.pojistovna} ${a.pojisteni.produkt})</div>
      <div class="rows">
        <div class="row"><span>Celkem</span><span class="big">${kc(a.pojisteni.rocne)} / rok</span></div>
        ${row("Splátka", `${kc(a.pojisteni.splatka)} čtvrtletně`)}
        ${row("Smlouva č.", a.pojisteni.cislo)}
        ${row("Platnost", `od ${czDate(a.pojisteni.od)}<br>na dobu neurčitou`)}
        <div class="row"><span>Výročí</span><span>${a.pojisteni.vyrociDen}. ${a.pojisteni.vyrociMesic}.
          <span class="badge b-${tone(dayDiff(dalsiVyroci(a.pojisteni.vyrociDen,a.pojisteni.vyrociMesic)))}">${relText(dayDiff(dalsiVyroci(a.pojisteni.vyrociDen,a.pojisteni.vyrociMesic)))}</span></span></div>
        ${row("Pojistník", a.pojisteni.pojistnik)}
      </div>
      <div style="border-top:1px solid var(--line);margin:10px 0"></div>
      <div class="rows">
        ${a.pojisteni.slozky.map(([n,c,pz])=>`<div class="row"><span>${n}</span><span>${c?kc(c)+" / rok":"v ceně"}<br><span style="color:var(--muted);font-size:12px">${pz}</span></span></div>`).join("")}
        <div class="row"><span></span><span style="color:var(--muted);font-size:12px">Částky podle smlouvy z 22. 11. 2019 – bude nahrazena novou smlouvou.</span></div>
      </div>
    </div>
    <div class="block blk-pojisteni"><div class="btitle">Pojištění – návrh nové smlouvy (modelace ${czDate(a.navrh.vytvoreno)})</div>
      <div class="rows">
        <div class="row"><span>Celkem</span><span class="big">${kc(a.navrh.rocne)} / rok</span></div>
        ${row("Před slevou", kc(a.navrh.rocneBezSlevy))}
        ${row("Pojistné období", `${a.navrh.obdobiMesicu} měsíců`)}
        ${row("Počátek", `${czDate(a.navrh.zacatek)}<br>na dobu neurčitou
          <span class="badge b-${tone(dayDiff(a.navrh.zacatek))}">${relText(dayDiff(a.navrh.zacatek))}</span>`)}
        <div class="row"><span>Fotky auta do</span><span>${czDate(a.navrh.fotkyRadny)}
          <span class="badge b-${tone(dayDiff(a.navrh.fotkyRadny))}">${relText(dayDiff(a.navrh.fotkyRadny))}</span><br>
          <span style="color:var(--muted);font-size:12px">náhradní termín ${czDate(a.navrh.fotkyNahradni)}</span></span></div>
        ${row("Pojistník", AUTO.navrh.pojistnik||"")}
      </div>
      <div style="border-top:1px solid var(--line);margin:10px 0"></div>
      <div class="rows">
        ${a.navrh.slozky.map(([n,c,pz])=>`<div class="row"><span>${n}</span><span>${c?kc(c)+" / rok":"v ceně"}<br><span style="color:var(--muted);font-size:12px">${pz}</span></span></div>`).join("")}
        <div class="row"><span></span><span style="color:var(--muted);font-size:12px">${a.navrh.poznamka}</span></div>
      </div>
    </div>
    <div class="block blk-dok"><div class="btitle">Vozidlo</div>
      <div class="rows">
        ${row("Vůz", v.znacka)}
        ${row("SPZ", v.spz)}
        ${row("VIN", v.vin)}
        ${row("Motor", v.motor)}
        ${row("První registrace", `${czDate(v.prvniRegistrace)} (Německo)<br>v ČR od ${czDate(v.registraceCR)}`)}
        ${row("Vlastník", v.vlastnik)}
        ${row("TP / ORV č.", `${v.tp} · ${v.orv}`)}
        ${row("Spotřeba", v.spotreba)}
        ${row("Pneumatiky", v.pneu)}
        ${row("Přívěs max.", v.privesMax)}
      </div>
    </div>
    <div class="block blk-dok"><div class="btitle">Dokumenty</div>${linkRow(a.odkazy)}</div>
    ${warn}
  </div>`;
}

/* --- Platby na příští OKNO_MESICU měsíců ---------------------------------
   Pravidelné odchozí platby z dat v BYTY. Způsob: "csob" (trvalý příkaz z ČSOB) | "marekkb" (Marek KB) | "ansporka" (An – Spořka) | "prevod" | null (neověřeno).
   Hypotéky, záloha za vodu a záloha za plyn se sem nezařazují – platí se samy (převod, trvalý příkaz, inkaso).
   ----------------------------------------------------------------------- */
function renderPlatby(){
  const rows=[];
  BYTY.forEach(b=>{
    if(b.stav==="pronajato" && (b.predpisCelkem||b.zalohy))
      rows.push({den:99, kdy:"měsíčně", co:"Zálohy správci", kde:`${b.kratky} · ${b.spravce||"správce"}`, kc:b.predpisCelkem||b.zalohy, zp:b.zalohyZpusob||null});
    if(b.energie){
      const e=b.energie;
      rows.push({den:98, kdy:"měsíčně", co:"Elektřina – vyúčtování", kde:`${b.kratky} · PRE · podle spotřeby`, kc:e.elektrina.castka, pribl:true, zp:"csob"});
    }
    (b.pojisteni||[]).forEach(p=>{
      const v=dalsiVyroci(p.vyrociDen,p.vyrociMesic);
      if(v<=KONEC_OKNA) rows.push({den:0, datum:v, kdy:czDate(v), co:"Pojistné za rok", kde:`${b.kratky} · ${p.pojistovna}`, kc:p.rocne, zp:null, jednou:true});
    });
  });
  if(AUTO.znamka && AUTO.znamka.do<=KONEC_OKNA)
    rows.push({den:0, kdy:`do ${czDate(AUTO.znamka.do)}`, co:"Dálniční známka na rok", kde:"Auto · edalnice.gov.cz", kc:AUTO.znamka.cena, zp:null, jednou:true});
  // pojistné auta: po přechodu na novou smlouvu jedna roční platba, jinak čtvrtletní splátky staré smlouvy
  if(AUTO.navrh){
    const n=AUTO.navrh;
    if(dayDiff(n.zacatek)>=0 && n.zacatek<=KONEC_OKNA)
      rows.push({den:0, kdy:czDate(n.zacatek), co:"Pojištění auta – nová smlouva (rok)", kde:"Auto · Kooperativa · částka z návrhu, splatnost ověřit", kc:n.rocne, pribl:true, zp:null, jednou:true});
  } else if(AUTO.pojisteni){
    const p=AUTO.pojisteni;
    let d=new Date(dalsiVyroci(p.vyrociDen,p.vyrociMesic)+"T00:00:00");
    while(d > TODAY) d.setMonth(d.getMonth()-p.obdobiMesicu);
    d.setMonth(d.getMonth()+p.obdobiMesicu);
    for(; ; d.setMonth(d.getMonth()+p.obdobiMesicu)){
      const s=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
      if(s>KONEC_OKNA) break;
      rows.push({den:0, kdy:czDate(s), co:"Pojištění auta (čtvrtletně)", kde:"Auto · Kooperativa · částka ze smlouvy 2019", kc:p.splatka, pribl:true, zp:null, jednou:true});
    }
  }
  rows.sort((a,b)=> (a.jednou?0:1)-(b.jednou?0:1) || a.den-b.den);
  const ZP = { csob:'<span class="zp zp-ink">trvalý příkaz z ČSOB</span>', marekkb:'<span class="zp zp-ink">Marek KB</span>',
               ansporka:'<span class="zp zp-ink">An – Spořka</span>', prevod:'<span class="zp zp-prev">převod</span>' };
  // platby s trvalým příkazem z ČSOB se v seznamu neukazují (platí se samy), do souhrnu níže se ale počítají
  const videt = rows.filter(r=>r.zp!=="csob");
  const tr = videt.map(r=>`<tr>
      <td style="white-space:nowrap">${r.kdy}</td>
      <td>${r.co}<span class="kde">${r.kde}</span></td>
      <td class="num">${r.pribl?"≈ ":""}${kc(r.kc)}</td>
      <td>${ZP[r.zp]||'<span class="zp zp-nev">neověřeno</span>'}</td></tr>`).join("");
  const mesicne = rows.filter(r=>!r.jednou);
  const sum = f => mesicne.filter(f).reduce((s,r)=>s+r.kc,0);
  document.getElementById("platby").innerHTML = (videt.length
    ? `<table class="pt"><thead><tr>
      <th>Kdy</th><th>Co</th><th class="num">Kolik</th><th>Jak</th></tr></thead><tbody>${tr}</tbody></table>`
    : `<div class="empty">Žádná platba k ručnímu zaplacení.</div>`) + `
    <div class="pt-sum">Měsíčně celkem <b>${kc(sum(()=>true))}</b>, z toho trvalým příkazem z ČSOB ${kc(sum(r=>r.zp==="csob"))} (v seznamu nejsou).
      Do ${czDate(KONEC_OKNA)} ${rows.some(r=>r.jednou)?"je navíc výše jednorázová platba.":"nepřipadá žádné roční pojistné."}</div>`;
}

document.getElementById("collapse").onclick = () => {
  sbaleno = !sbaleno;
  try { localStorage.setItem(KEY_SBAL, sbaleno ? "1" : "0"); } catch(e){}
  renderCollapse();
};

document.getElementById("toggledone").onclick = () => {
  hideDone = !hideDone;
  try { localStorage.setItem("p42-skryt-hotove", hideDone ? "1" : "0"); } catch(e){}
  renderTimeline();
};
document.getElementById("resetdone").onclick = async () => {
  if(!confirm("Opravdu zrušit odškrtnutí všech úkolů? Platí i v Myší úkolárně.")) return;
  const r = await sb.from("tasks").update({ done:false }).like("ref","p42|%");
  if(r.error){ renderNote("Odškrtnutí se nepodařilo zrušit: " + r.error.message); return; }
  done = {}; renderTimeline(); renderCollapse();
};

document.getElementById("today").textContent =
  "dnes " + TODAY.toLocaleDateString("cs-CZ",{day:"numeric",month:"long",year:"numeric"});
render();
inicializujUkoly();
