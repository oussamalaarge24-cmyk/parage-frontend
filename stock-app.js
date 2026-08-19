/* ===========================================================
   KPH — MODULE STOCK (séparé de l'ancien app.js du parage)
   Utilisé par : congelateur.html, reception.html, stock.html
   Tables : congelsession, congelateur, bags, certificats, entree, sortie
   =========================================================== */



/* ---------- helpers génériques ---------- */
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowHM(){ const d = new Date(); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }

/* si l'heure de saisie est avant 7h, la production est rattachée au jour précédent */
function computeDateProduction(){
  const now = new Date();
  if(now.getHours() < 7){ now.setDate(now.getDate() - 1); }
  return now.toISOString().slice(0,10);
}

function fmt(n, d=2){
  if(n===null || n===undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits:d, maximumFractionDigits:d });
}

function toast(msg){
  let el = document.querySelector('.toast');
  if(!el){
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
/*
function buildTopbar(roleLabel){
  return `
  <div class="topbar">
    <div class="brand">
      <span class="mark">KPH</span>
      <span class="sub">ATELIER&nbsp;DE&nbsp;PARAGE</span>
    </div>
    <div class="role-chip">
      <span class="badge">${roleLabel}</span>
      <a class="home-link" href="index.html">← Accueil</a>
    </div>
  </div>`;
}*/

/* petites cartes de pourcentage (taille / espèce...) réutilisables sur plusieurs dashboards */
function chipStatsHtml(rows, labelKey){
  if(!rows || !rows.length) return `<p class="hint">Aucune donnée</p>`;
  return '<div class="chip-stats">' + rows.map(r => `
    <div class="chip-stat"><div class="value">${fmt(r.pct,1)}%</div><div class="sub">${fmt(r.poids)} kg</div><div class="label">${r[labelKey]}</div></div>`
  ).join('') + '</div>';
}



/* ===========================================================
   CONGÉLATEUR
   =========================================================== */

function computeCongelStats(idSession){
  const session = DB.get('congelsession').find(s => s.id === idSession);
  const sacs = DB.get('congelateur').filter(c => c.idSession === idSession);
  const total = sacs.reduce((s,c)=>s+(Number(c.net)||0),0);
  const poidsRecu = session ? (Number(session.poidsRecu)||0) : 0;
  return { session, sacs, total, poidsRecu, ecart: poidsRecu - total };
}

/* ===========================================================
   RÉCEPTION / STOCK
   Tables : bags (numBag, poidsTare), certificats (certificat,
   numContenaire, numCamion, poidsReceptionne), entree (mouvement
   d'entrée en stock : poids brut + poidsTare + poidsNet), sortie
   (mouvement de sortie de stock).
   =========================================================== */

const TAILLES_REF = ["0,5","1-2","2-3","3-5","+5"];
const ESPECES_REF = ["T1","T2","T3"];

function tailleOptions(selected){
  return TAILLES_REF.map(t => `<option value="${t}" ${t===selected?'selected':''}>${t}</option>`).join('');
}
function especeOptions(selected){
  return ESPECES_REF.map(e => `<option value="${e}" ${e===selected?'selected':''}>${e}</option>`).join('');
}

/* ---------- bags / tare ---------- */
function getBagTare(numBag){
  const b = DB.get('bags').find(b => String(b.numBag) === String(numBag));
  return b ? (Number(b.poidsTare)||0) : 0;
}

/* liste des N° de bags actuellement en stock (pour la recherche à la sortie) */
function bagsEnStockList(){
  const seen = new Set();
  return DB.get('entree').filter(e => !isEntreeSorted(e.id)).map(e => e.numBag).filter(n => {
    if(seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

/* ---------- certificats / camions ---------- */
function uniqueCertificatNames(){
  const seen = new Set();
  return DB.get('certificats').map(c => c.certificat).filter(c => {
    if(seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

/* tous les enregistrements "certificats" correspondant exactement à un nom donné
   (un même certificat peut couvrir plusieurs camions/contenaires) */
function certificatRowsByName(certificat){
  return DB.get('certificats').filter(c => c.certificat === certificat);
}

/* ---------- poids net d'une entrée (brut - tare, avec repli si poidsNet absent) ---------- */
function entreeNet(e){
  if(e.poidsNet !== undefined && e.poidsNet !== null) return Number(e.poidsNet)||0;
  return (Number(e.poids)||0) - (Number(e.poidsTare)||0);
}

/* une entrée précise est "sortie" si un mouvement de sortie la référence par son id
   (et non plus seulement par numéro de bag, qui peut être réutilisé sous des
   certificats différents) */
function isEntreeSorted(idEntree){
  return DB.get('sortie').some(s => s.idEntreeRef === idEntree);
}

/* compatibilité : un numéro de bag est "sorti" si plus aucune entrée active ne porte ce numéro */
function isBagSorti(numBag){
  return DB.get('entree').filter(e => String(e.numBag) === String(numBag)).every(e => isEntreeSorted(e.id));
}

/* toutes les entrées actives (non sorties) portant ce numéro de bag —
   plusieurs peuvent exister si le même numéro a été utilisé sous des certificats différents */
function findAllEntreesActive(numBag){
  return DB.get('entree').filter(e => String(e.numBag) === String(numBag) && !isEntreeSorted(e.id));
}

/* dernière entrée active pour un numéro de bag donné (repli quand une seule correspond) */
function findEntreeActive(numBag){
  const matches = findAllEntreesActive(numBag);
  return matches.length ? matches[matches.length - 1] : null;
}

function matchesMovementFilters(row, filters){
  filters = filters || {};
  return (
    (!filters.date || row.date === filters.date) &&
    (!filters.taille || row.taille === filters.taille) &&
    (!filters.espece || row.espece === filters.espece) &&
    (!filters.certificat || row.certificat === filters.certificat) &&
    (!filters.numCamion || String(row.numCamion) === String(filters.numCamion))
  );
}

/* liste unifiée des mouvements (entrée + sortie), triée du plus récent au plus ancien
   — utilisée par l'onglet Stock : une ligne Entrée + une ligne Sortie séparée */
function stockMovements(filters){
  filters = filters || {};
  const entree = DB.get('entree').map(e => ({
    date: e.dateEntree, numBag: e.numBag, taille: e.taille, espece: e.espece,
    certificat: e.certificat, numCamion: e.numCamion, poids: entreeNet(e),
    type: 'Entrée', sorti: isEntreeSorted(e.id)
  }));
  const sortie = DB.get('sortie').map(s => {
    const e = DB.get('entree').find(x => x.id === s.idEntreeRef);
    return {
      date: s.dateSortie, numBag: s.numBag, taille: s.taille, espece: s.espece,
      certificat: s.certificat, numCamion: s.numCamion, poids: e ? entreeNet(e) : 0,
      type: 'Sortie', sorti: true
    };
  });
  let rows = entree.concat(sortie);
  rows = rows.filter(r => matchesMovementFilters(r, filters));
  // Reverse to put newest added items first, then stable sort by date
  rows.reverse();
  rows.sort((a,b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });
  return rows;
}

/* liste des mouvements pour l'onglet Réceptions : une seule ligne par entrée
   (jamais de ligne "Sortie" dupliquée, même si le type diffère) — en rouge si sorti */
function receptionMovements(filters){
  filters = filters || {};
  let rows = DB.get('entree').map(e => {
    const sorti = isEntreeSorted(e.id);
    const sortieRow = sorti ? DB.get('sortie').find(s => s.idEntreeRef === e.id) : null;
    return {
      date: e.dateEntree, dateSortie: sortieRow ? sortieRow.dateSortie : null,
      numBag: e.numBag, taille: e.taille, espece: e.espece,
      certificat: e.certificat, numCamion: e.numCamion, poids: entreeNet(e),
      type: sorti ? 'Sortie' : 'Entrée', sorti
    };
  });
  rows = rows.filter(r => matchesMovementFilters(r, filters));
  // Reverse to put newest added items first, then stable sort by date
  rows.reverse();
  rows.sort((a,b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });
  return rows;
}

/* ---------- Dashboard STOCK (bags actuellement en frigo) ---------- */
function computeStockDashboard(filters){
  filters = filters || {};
  const enStock = DB.get('entree').filter(e => !isEntreeSorted(e.id)).filter(e => matchesMovementFilters({
    date: e.dateEntree,
    taille: e.taille,
    espece: e.espece,
    certificat: e.certificat,
    numCamion: e.numCamion
  }, filters));
  const totalPoids = enStock.reduce((s,e)=>s+entreeNet(e),0);

  const byTaille = {}, byEspece = {};
  enStock.forEach(e => {
    const net = entreeNet(e);
    byTaille[e.taille||'—'] = (byTaille[e.taille||'—']||0) + net;
    byEspece[e.espece||'—'] = (byEspece[e.espece||'—']||0) + net;
  });
  const tailleRows = Object.entries(byTaille).map(([taille,poids]) => ({ taille, poids, pct: totalPoids?poids/totalPoids*100:0 }));
  const especeRows = Object.entries(byEspece).map(([espece,poids]) => ({ espece, poids, pct: totalPoids?poids/totalPoids*100:0 }));

  return {
    totalPoids, nbrBags: enStock.length,
    tailleRows, especeRows,
    movements: stockMovements({ date: filters.date })
  };
}

/* ---------- Dashboard RÉCEPTION (par camion / certificat) ---------- */
function computeReceptionDashboard(filters){
  filters = filters || {};
  const filteredCertifs = DB.get('certificats').filter(c =>
    (!filters.certificat || c.certificat === filters.certificat) &&
    (!filters.numCamion || String(c.numCamion) === String(filters.numCamion))
  );
  const byCamion = {};
  filteredCertifs.forEach(c => { byCamion[c.numCamion] = (byCamion[c.numCamion]||0) + (Number(c.poidsReceptionne)||0); });

  const totalPoidsReceptionne = filteredCertifs.reduce((s,c)=>s+(Number(c.poidsReceptionne)||0),0);

  const filteredEntrees = DB.get('entree').filter(e => matchesMovementFilters({
    date: e.dateEntree,
    taille: e.taille,
    espece: e.espece,
    certificat: e.certificat,
    numCamion: e.numCamion
  }, filters));
  
  const totalPoidsEntree = filteredEntrees.reduce((s,e)=>s+entreeNet(e),0);

  const byTaille = {}, byEspece = {};
  filteredEntrees.forEach(e => {
    const net = entreeNet(e);
    byTaille[e.taille||'—'] = (byTaille[e.taille||'—']||0) + net;
    byEspece[e.espece||'—'] = (byEspece[e.espece||'—']||0) + net;
  });
  const tailleRows = Object.entries(byTaille).map(([taille,poids]) => ({ taille, poids, pct: totalPoidsEntree?poids/totalPoidsEntree*100:0 }));
  const especeRows = Object.entries(byEspece).map(([espece,poids]) => ({ espece, poids, pct: totalPoidsEntree?poids/totalPoidsEntree*100:0 }));

  return {
    totalPoidsReceptionne, totalPoidsEntree,
    byCamionRows: Object.entries(byCamion).map(([numCamion,poids]) => ({ numCamion, poids })),
    tailleRows, especeRows,
    movements: receptionMovements(filters)
  };
}
