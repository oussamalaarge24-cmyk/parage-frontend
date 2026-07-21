/* ===========================================================
   KPH — Atelier de Parage
   Frontend data engine — talks to http://localhost:3000/api
   =========================================================== */

const API_URL = (window.location.port === '3000')
  ? '/api'                         // served by the backend itself
  : 'http://localhost:3000/api';   // opened from file:// or different port

// ── Auth helpers ───────────────────────────────────────────────

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null'); }
  catch { return null; }
}

function checkAuth(allowedRoles) {
  const user = getCurrentUser();
  if (!user) { window.location.replace('index.html'); return null; }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    alert('Accès non autorisé. Vous allez être redirigé.');
    window.location.replace('index.html');
    return null;
  }
  return user;
}

function logout() {
  sessionStorage.removeItem('currentUser');
  window.location.replace('index.html');
}

// ── UI helpers ─────────────────────────────────────────────────

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function buildTopbar(roleLabel) {
  const user = getCurrentUser();
  const userName = user ? user.nom : '';
  return `
  <div class="topbar">
    <div class="brand">
      <span class="mark">KPH</span>
      <span class="sub">ATELIER&nbsp;DE&nbsp;PARAGE</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;">
      ${userName ? `<div style="font-size:13px;color:#a9c9c6;font-weight:500;">👤 ${userName}</div>` : ''}
      <div class="role-chip">
        <span class="badge">${roleLabel}</span>
        <button onclick="logout()" style="
          background:transparent;
          border:1px solid rgba(255,255,255,.25);
          cursor:pointer;
          font-family:inherit;
          font-size:13px;
          color:#bfe0dd;
          border-radius:var(--radius-sm);
          padding:7px 14px;
          margin-left:6px;
          transition:background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,.1)'"
           onmouseout="this.style.background='transparent'">
          Déconnexion
        </button>
      </div>
    </div>
  </div>`;
}

// ── Date / time helpers ────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }

function nowHM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function computeDateProduction() {
  const now = new Date();
  if (now.getHours() < 7) now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

function fmt(n, d = 2) {
  return (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toFixed(d);
}

// ── Select / option helpers ────────────────────────────────────

function lotOptions(selectedId) {
  const lots = DB.get('lot');
  const last3 = lots.slice(-3).reverse();
  return last3.map(l =>
    `<option value="${l.id}" ${l.id === selectedId ? 'selected' : ''}>${l.certificat} · ${l.espece || '—'} · T.${l.taille || '—'}</option>`
  ).join('');
}

function operatriceOptions(selectedId) {
  return DB.get('operatrice').map(o =>
    `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>#${o.num} — ${o.nomPrenom} (grp ${o.groupe})</option>`
  ).join('');
}

function operatriceOptionsByNum(selectedId) {
  return DB.get('operatrice').sort((a, b) => a.num - b.num).map(o =>
    `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>N° ${o.num}</option>`
  ).join('');
}

function operatriceNameDatalist() {
  return DB.get('operatrice').map(o => `<option value="${o.nomPrenom}"></option>`).join('');
}

function findOperatriceByName(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return DB.get('operatrice').find(o => o.nomPrenom.trim().toLowerCase() === n) || null;
}

// ── Analytics helpers ──────────────────────────────────────────

function computeResultats(filterDate, filterGroupe) {
  const prod = DB.get('production').filter(p =>
    (!filterDate || p.dateProduction === filterDate) &&
    (!filterGroupe || String(p.groupe) === String(filterGroupe))
  );
  const cuit = DB.get('poidscuit').filter(c =>
    (!filterDate || c.dateProduction === filterDate) &&
    (!filterGroupe || String(c.groupe) === String(filterGroupe))
  );
  const heuresRows = DB.get('heures').filter(h =>
    (!filterDate || h.dateProduction === filterDate) &&
    (!filterGroupe || String(h.groupe) === String(filterGroupe))
  );

  const preciseFilter = !!(filterDate && filterGroupe);
  const moyenFraisRate = preciseFilter
    ? DB.get('moyenfrais').find(m =>
        m.dateProduction === filterDate && String(m.groupe) === String(filterGroupe))
    : null;

  const byOperatrice = {};
  prod.forEach(p => {
    const op = DB.get('operatrice').find(o => o.id === p.idOperatrice);
    const key = op ? op.id : ('?' + (p.idOperatrice || 'inconnu'));
    byOperatrice[key] = byOperatrice[key] || {
      operatrice: op ? op.nomPrenom : '—', num: op ? op.num : null,
      poidsFilet: 0, nbrCaisse: 0, groupe: p.groupe
    };
    byOperatrice[key].poidsFilet  += Number(p.poidsFilet)  || 0;
    byOperatrice[key].nbrCaisse   += Number(p.nombreCaisse)|| 0;
  });

  const totalCuit    = cuit.reduce((s, c) => s + (Number(c.poidsGrille) || 0), 0);
  const totalHeures  = heuresRows.reduce((s, h) => s + (Number(h.heures) || 0), 0);
  const totalFilet   = Object.values(byOperatrice).reduce((s, o) => s + o.poidsFilet, 0);
  const totalCaisses = Object.values(byOperatrice).reduce((s, o) => s + o.nbrCaisse, 0);
  let totalFrais = preciseFilter
    ? totalFraisFor(filterDate, filterGroupe)
    : sumTotalFrais(filterDate, filterGroupe);

  // Fallback: If totalFrais is 0 but we have a Moyen Frais rate and caisses, compute it
  if (!totalFrais && filterDate) {
    let fallbackMf = DB.get('moyenfrais').find(m => m.dateProduction === filterDate && (!filterGroupe || String(m.groupe) === String(filterGroupe)));
    if (!fallbackMf) fallbackMf = DB.get('moyenfrais').find(m => m.dateProduction === filterDate);
    if (fallbackMf && fallbackMf.moyenFrais) {
      totalFrais = totalCaisses * Number(fallbackMf.moyenFrais);
    }
  }

  const rows = Object.values(byOperatrice).map(data => {
    const heuresOp = data.num !== null
      ? heuresRows.filter(h => h.num === data.num && String(h.groupe) === String(data.groupe)).reduce((s, h) => s + (Number(h.heures) || 0), 0)
      : 0;
    const kph      = heuresOp ? (data.poidsFilet / heuresOp) : null;
    let yieldVal = null;
    if (filterDate && data.nbrCaisse > 0) {
      let mf = DB.get('moyenfrais').find(m => m.dateProduction === filterDate && String(m.groupe) === String(data.groupe));
      if (!mf) mf = DB.get('moyenfrais').find(m => m.dateProduction === filterDate);
      if (mf && mf.moyenFrais) {
        yieldVal = data.poidsFilet / data.nbrCaisse / mf.moyenFrais;
      }
    }
    return { operatrice: data.operatrice, groupe: data.groupe,
             poidsFilet: data.poidsFilet, nbrCaisse: data.nbrCaisse,
             heures: heuresOp, kph, yieldVal };
  });

  return {
    rows, totalFilet, totalCuit, totalHeures, totalCaisses, totalFrais,
    globalKph   : totalHeures ? (totalFilet / totalHeures)  : null,
    globalYield : totalFrais  ? (totalFilet / totalFrais)   : null
  };
}

function computeCertificatDashboard(filterDate, filterGroupe) {
  const cuit = DB.get('poidscuit').filter(c =>
    (!filterDate || c.dateProduction === filterDate) &&
    (!filterGroupe || String(c.groupe) === String(filterGroupe))
  );
  const byCert = {};
  cuit.forEach(c => {
    const key = c.certificat + '|' + c.espece;
    byCert[key] = byCert[key] || { certificat: c.certificat, espece: c.espece, poids: 0, groupe: c.groupe };
    byCert[key].poids += Number(c.poidsGrille) || 0;
  });
  return Object.values(byCert);
}

function computeMoyenFraisDashboard() {
  return DB.get('moyenfrais').slice().sort((a, b) => (a.dateProduction < b.dateProduction ? 1 : -1));
}

function totalFraisFor(dateProduction, groupe) {
  const m = DB.get('moyenfrais').find(x =>
    x.dateProduction === dateProduction && String(x.groupe) === String(groupe));
  return m ? (Number(m.totalFrais) || 0) : null;
}

function sumTotalFrais(filterDate, filterGroupe) {
  const rows = DB.get('moyenfrais').filter(m =>
    (!filterDate || m.dateProduction === filterDate) &&
    (!filterGroupe || String(m.groupe) === String(filterGroupe))
  );
  if (!rows.length) return null;
  return rows.reduce((s, r) => s + (Number(r.totalFrais) || 0), 0);
}

function computePertesDashboard(filterDate, filterGroupe) {
  const cuitTotal = DB.get('poidscuit')
    .filter(c => (!filterDate || c.dateProduction === filterDate) && (!filterGroupe || String(c.groupe) === String(filterGroupe)))
    .reduce((s, c) => s + (Number(c.poidsGrille) || 0), 0);
  const dechetTotal = DB.get('dechets')
    .filter(d => (!filterDate || d.dateProduction === filterDate) && (!filterGroupe || String(d.groupe) === String(filterGroupe)))
    .reduce((s, d) => s + (Number(d.poidsNet) || 0), 0);
  const totalFrais = (filterDate && filterGroupe)
    ? totalFraisFor(filterDate, filterGroupe)
    : sumTotalFrais(filterDate, filterGroupe);
  const perteEau = totalFrais !== null ? (totalFrais - cuitTotal) : null;
  return {
    perteEau, dechetTotal, totalFrais, cuitTotal,
    pctPerteEau: totalFrais ? (perteEau / totalFrais * 100) : null,
    pctDechets : totalFrais ? ((dechetTotal / totalFrais) * 100) : null
  };
}

// ── DB: async CRUD via REST API ────────────────────────────────

const DB = {
  cache: {},

  async init(silent = false) {
    const tables = ['operatrice','lot','production','poidscuit','dechets','heures','moyenfrais','users'];
    try {
      await Promise.all(tables.map(async (table) => {
        const res = await fetch(`${API_URL}/${table}`);
        if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
        this.cache[table] = await res.json();
      }));
      if (!silent) console.log('✅ DB cache ready');
    } catch (e) {
      if (!silent) console.error('⚠️  DB init failed:', e.message);
      tables.forEach(t => { if (!this.cache[t]) this.cache[t] = []; });
    }
  },

  get(table) { return this.cache[table] || []; },

  async add(table, record) {
    const res = await fetch(`${API_URL}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!res.ok) throw new Error(`add ${table}: HTTP ${res.status}`);
    const saved = await res.json();
    if (!this.cache[table]) this.cache[table] = [];
    this.cache[table].push(saved);
    return saved;
  },

  async update(table, id, patch) {
    const res = await fetch(`${API_URL}/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(`update ${table}: HTTP ${res.status}`);
    const updated = await res.json();
    const rows = this.cache[table] || [];
    const idx = rows.findIndex(r => r.id === id);
    if (idx > -1) rows[idx] = Object.assign({}, rows[idx], patch);
    return updated;
  },

  async remove(table, id) {
    const res = await fetch(`${API_URL}/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`remove ${table}: HTTP ${res.status}`);
    this.cache[table] = (this.cache[table] || []).filter(r => r.id !== id);
  },

  last(table) {
    const rows = this.get(table);
    return rows.length ? rows[rows.length - 1] : null;
  },

  async savePointage(payload) {
    const res = await fetch(`${API_URL}/heures/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`savePointage: HTTP ${res.status}`);
    // Refresh heures cache
    const r2 = await fetch(`${API_URL}/heures`);
    if (r2.ok) this.cache['heures'] = await r2.json();
  }
};

// ── Delete-button delegation ───────────────────────────────────

window.__renderers = window.__renderers || {};
document.addEventListener('click', async function (e) {
  const btn = e.target.closest('button[data-del]');
  if (!btn) return;
  const table = btn.dataset.del;
  const id    = Number(btn.dataset.id);
  if (!confirm('Supprimer cet élément ?')) return;
  try {
    await DB.remove(table, id);
    toast('Élément supprimé');
    if (typeof window.__renderers[table] === 'function') window.__renderers[table]();
  } catch (err) {
    toast('Erreur lors de la suppression');
  }
});

// ── Bootstrap ──────────────────────────────────────────────────

window.DB_READY = DB.init();

// Auto-actualisation toutes les 5 secondes
setInterval(async () => {
  await DB.init(true);
  if (typeof renderUsers === 'function') renderUsers();
  if (typeof renderProd === 'function') renderProd();
  if (typeof renderLots === 'function') renderLots();
  if (typeof renderCuit === 'function') renderCuit();
  if (typeof renderDechets === 'function') renderDechets();
  if (typeof renderOps === 'function') renderOps();
  if (typeof renderRendement === 'function') renderRendement();
  if (typeof renderCertificats === 'function') renderCertificats();
  if (typeof renderFrais === 'function') renderFrais();
  if (typeof renderPertes === 'function') renderPertes();
}, 5000);