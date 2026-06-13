// WhatDatBird? Quiz Engine v5.63
// Shared engine for all quiz pages.
// Each page calls: initEngine(config)
const APP_VERSION = 'v5.95';
window.__engineLoaded = true;

// ── Config ────────────────────────────────────────────────────────────────
let CFG = {};
let _swipeX = 0;

// ── Constants ─────────────────────────────────────────────────────────────
const STREAK_TARGET = 10;
const CONFETTI_COLORS = ['#1a5940','#2a7a58','#6dba9a','#d4a84b','#2c5f8a','#7aaed4','#8a6020','#d47a7a'];
const CORRECT_MSGS = ['Amazing!','Brilliant!','Yes!','On fire!','Super!','Spot on!','Nailed it!','Perfect!','Woohoo!','Awesome!','Great job!','Fantastic!'];
const STREAK_MSGS  = {3:'3 in a row!', 5:'5 streak - flying!', 7:'Lucky 7!', 9:'One more!!!'};
const GH_TOKEN = ['github','pat','11CD5YDQQ0BqwCXNYdVbgz_5iHfac6fd0MNVZZLhiPrnFnFTzcTj8N7l1MQ7ro9gn6CNE4N7VHlt7DOCis'].join('_');
const GH_REPO  = 'rutherfordecology/WhatDatBird';
const GH_FILE  = 'quizzes.json';
const LB_FILE  = 'leaderboard.json';

// Expand ISO country codes in iNat place names e.g. "Milne Bay, PG" → "Milne Bay, Papua New Guinea"
const ISO_TO_COUNTRY = {
  'AF':'Afghanistan','AL':'Albania','DZ':'Algeria','AO':'Angola','AR':'Argentina',
  'AU':'Australia','AT':'Austria','BD':'Bangladesh','BE':'Belgium','BO':'Bolivia',
  'BW':'Botswana','BR':'Brazil','BG':'Bulgaria','CA':'Canada','CL':'Chile',
  'CN':'China','CO':'Colombia','CR':'Costa Rica','HR':'Croatia','CU':'Cuba',
  'CZ':'Czech Republic','DK':'Denmark','DO':'Dominican Republic','EC':'Ecuador',
  'EG':'Egypt','SV':'El Salvador','ET':'Ethiopia','FI':'Finland','FR':'France',
  'DE':'Germany','GH':'Ghana','GR':'Greece','GT':'Guatemala','HT':'Haiti',
  'HN':'Honduras','HU':'Hungary','IS':'Iceland','IN':'India','ID':'Indonesia',
  'IE':'Ireland','IT':'Italy','JP':'Japan','KE':'Kenya','MY':'Malaysia',
  'MG':'Madagascar','MX':'Mexico','MN':'Mongolia','MA':'Morocco','MZ':'Mozambique',
  'MM':'Myanmar','NP':'Nepal','NL':'Netherlands','NZ':'New Zealand','NI':'Nicaragua',
  'NG':'Nigeria','NO':'Norway','PK':'Pakistan','PA':'Panama','PY':'Paraguay',
  'PE':'Peru','PH':'Philippines','PL':'Poland','PT':'Portugal','RO':'Romania',
  'RU':'Russia','WS':'Samoa','SN':'Senegal','RS':'Serbia','SG':'Singapore',
  'SK':'Slovakia','ZA':'South Africa','KR':'South Korea','ES':'Spain','LK':'Sri Lanka',
  'SE':'Sweden','CH':'Switzerland','TW':'Taiwan','TZ':'Tanzania','TH':'Thailand',
  'TT':'Trinidad and Tobago','UG':'Uganda','UA':'Ukraine','GB':'United Kingdom',
  'US':'United States','UY':'Uruguay','VE':'Venezuela','VN':'Vietnam','ZM':'Zambia',
  'ZW':'Zimbabwe','FJ':'Fiji','PG':'Papua New Guinea','SB':'Solomon Islands',
  'TO':'Tonga','VU':'Vanuatu','KI':'Kiribati','MH':'Marshall Islands',
  'FM':'Micronesia','NR':'Nauru','PW':'Palau','TV':'Tuvalu',
};
function expandPlaceName(name) {
  // Replace trailing ISO code(s): "Nakaseke, LW, UG" → "Nakaseke, Uganda"
  return name.replace(/(,\s*[A-Z]{2,3})*,\s*([A-Z]{2})$/, (m, _states, code) =>
    ISO_TO_COUNTRY[code] ? `, ${ISO_TO_COUNTRY[code]}` : m
  );
}

// ── Image fetching ────────────────────────────────────────────────────────
const inatPhotoCache    = {};
const wikiCache         = {};
const colorVarianceCache = new Map();

function checkColorVariance(url) {
  if (colorVarianceCache.has(url)) return Promise.resolve(colorVarianceCache.get(url));
  return new Promise(resolve => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const done = v => { colorVarianceCache.set(url, v); resolve(v); };
    const timer = setTimeout(() => done(true), 4000);
    img.onerror = () => { clearTimeout(timer); done(true); };
    img.onload = () => {
      clearTimeout(timer);
      try {
        const S = 40, c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data, n = d.length >> 2;
        let sR=0,sG=0,sB=0;
        for(let i=0;i<d.length;i+=4){sR+=d[i];sG+=d[i+1];sB+=d[i+2];}
        const mR=sR/n,mG=sG/n,mB=sB/n;
        let v=0;
        for(let i=0;i<d.length;i+=4) v+=(d[i]-mR)**2+(d[i+1]-mG)**2+(d[i+2]-mB)**2;
        const stdDev=Math.sqrt(v/(n*3));
        const lo=Math.floor(S*0.3),hi=Math.floor(S*0.7);
        let cR=0,cG=0,cB=0,cN=0,eR=0,eG=0,eB=0,eN=0;
        for(let y=0;y<S;y++) for(let x=0;x<S;x++){
          const i=(y*S+x)*4;
          if(x>=lo&&x<hi&&y>=lo&&y<hi){cR+=d[i];cG+=d[i+1];cB+=d[i+2];cN++;}
          else{eR+=d[i];eG+=d[i+1];eB+=d[i+2];eN++;}
        }
        const ced=Math.sqrt(((cR/cN)-(eR/eN))**2+((cG/cN)-(eG/eN))**2+((cB/cN)-(eB/eN))**2);
        done(stdDev>42||(stdDev>26&&ced>12));
      } catch { done(true); }
    };
    img.src = url;
  });
}

// Cache of latin name → iNat taxon ID (looked up lazily per bird shown)
const inatIdCache = {};
async function lookupInatId(latin, commonName) {
  if (inatIdCache[latin] !== undefined) return inatIdCache[latin];
  try {
    const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(latin)}&rank=species&per_page=5`);
    if (!r.ok) { inatIdCache[latin] = null; return null; }
    const d = await r.json();
    const epithet = latin.split(' ')[1]?.toLowerCase();

    // Exact latin name match first (highest priority)
    let taxon = d.results?.find(t => t.name.toLowerCase() === latin.toLowerCase());

    // Fall back to epithet match only (covers taxonomy revision synonyms)
    if (!taxon) {
      taxon = d.results?.find(t => {
        const tEpi = t.name.split(' ')[1]?.toLowerCase();
        return epithet && tEpi === epithet;
      });
    }

    inatIdCache[latin] = taxon?.id || null;
  } catch { inatIdCache[latin] = null; }
  return inatIdCache[latin];
}

async function fetchInatImage(bird) {
  const latin = typeof bird === 'string' ? bird : (bird.latin || bird.name);
  const commonName = typeof bird === 'object' ? bird.name : null;
  const cacheKey = latin;

  if (!inatPhotoCache[cacheKey]) {
    try {
      const preloaded = typeof bird === 'object' ? bird.defaultPhoto : null;

      // Look up inatId lazily (cached) for exact taxon_id queries — prevents same-genus photo bleed
      const inatId = (typeof bird === 'object' && bird.inatId)
        ? bird.inatId
        : await lookupInatId(latin, commonName);

      // One photo per observation (the first/best), sorted by faves — avoids multi-photo same-bird runs
      const obsPhotos = [];
      const taxonParam = inatId ? `taxon_id=${inatId}` : `taxon_name=${encodeURIComponent(latin)}`;
      const or = await fetch(`https://api.inaturalist.org/v1/observations?${taxonParam}&photos=true&per_page=20&quality_grade=research&order_by=faves&iconic_taxa=Aves`);
      if (or.ok) {
        const od = await or.json();
        for (const o of (od.results || [])) {
          const src = o.photos?.[0]?.url?.replace('/square.', '/medium.');
          if (src) obsPhotos.push({ src, faves: o.faves_count || 0 });
        }
      }

      // Sort by faves desc, dedupe
      obsPhotos.sort((a, b) => b.faves - a.faves);
      const seen = new Set(preloaded ? [preloaded] : []);
      const sorted = obsPhotos.map(p => p.src).filter(src => { if (seen.has(src)) return false; seen.add(src); return true; });

      // Always try to get taxa default_photo if not already preloaded
      let taxonPhoto = preloaded;
      if (!taxonPhoto) {
        const taxaUrl = inatId
          ? `https://api.inaturalist.org/v1/taxa/${inatId}`
          : `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(latin)}&rank=species&per_page=3`;
        try {
          const tr = await fetch(taxaUrl);
          if (tr.ok) {
            const td = await tr.json();
            const commonName = typeof bird === 'object' ? bird.name : null;
            const commonWords = new Set((commonName||'').toLowerCase().split(/\s+/).filter(w => w.length > 2));
            const taxon = inatId ? td.results?.[0] : td.results?.find(t => {
              if (t.name.toLowerCase() === latin.toLowerCase()) return true;
              if (!commonWords.size || !t.preferred_common_name) return false;
              return t.preferred_common_name.toLowerCase().split(/\s+/).some(w => commonWords.has(w));
            });
            if (taxon) {
              const dp = taxon.default_photo?.url?.replace('/square.', '/medium.');
              if (dp) taxonPhoto = dp;
              if (taxon.id && !inatId && !sorted.length) {
                const or2 = await fetch(`https://api.inaturalist.org/v1/observations?taxon_id=${taxon.id}&photos=true&per_page=10&quality_grade=research&order_by=faves&iconic_taxa=Aves`);
                if (or2.ok) {
                  const od2 = await or2.json();
                  for (const o of (od2.results || [])) {
                    const src = o.photos?.[0]?.url?.replace('/square.', '/medium.');
                    if (src && !seen.has(src)) { seen.add(src); sorted.push(src); }
                  }
                }
              }
            }
          }
        } catch {}
      }

      // Build carousel: taxon photo always in first 3 positions
      const photos = [...sorted];
      if (taxonPhoto) {
        const existingIdx = photos.indexOf(taxonPhoto);
        if (existingIdx > 2) {
          photos.splice(existingIdx, 1);
          photos.splice(1, 0, taxonPhoto); // second slot — best obs first, then curated
        } else if (existingIdx === -1) {
          photos.unshift(taxonPhoto); // not in list at all — put it first
        }
        // if already in positions 0-2, leave it there
      }

      inatPhotoCache[cacheKey] = photos;
    } catch { inatPhotoCache[cacheKey] = []; }
  }

  const urls = inatPhotoCache[cacheKey];
  if (!urls.length) return null;
  return urls[0]; // default_photo always first
}

async function fetchWikiImage(bird) {
  const common = typeof bird === 'string' ? bird : bird.name;
  const latin  = typeof bird === 'object' ? (bird.latin || null) : null;
  const cacheKey = common;
  if (wikiCache[cacheKey] !== undefined) return wikiCache[cacheKey];
  const bad = ['distribution','range','map','blank','locator','svg','silhouette','outline','flag','clade','tree'];
  const tryTitle = async (title) => {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=800&format=json&origin=*`);
    if (!r.ok) return null;
    const d = await r.json();
    const src = Object.values(d.query.pages)[0]?.thumbnail?.source || null;
    return src && !bad.some(p => src.toLowerCase().includes(p)) ? src : null;
  };
  try {
    const result = (await tryTitle(common)) || (latin ? await tryTitle(latin) : null);
    wikiCache[cacheKey] = result;
    return result;
  } catch { wikiCache[cacheKey] = null; return null; }
}

async function fetchImage(bird, mode) {
  if (mode === 'easy' && CFG.easyUseWiki) return fetchWikiImage(bird);
  const url = await fetchInatImage(bird);
  if (url) return url;
  return fetchWikiImage(bird); // fallback
}

function getPhotoUrls(bird, mode) {
  const name = (mode === 'easy' && CFG.easyUseWiki) ? null : (bird.latin || bird.name);
  const cached = name ? (inatPhotoCache[name] || []).slice(0,5) : [];
  const first = state.imgUrl;
  if (!first) return cached;
  return [first, ...cached.filter(u => u !== first)].slice(0,5);
}

// ── Wikipedia ID notes ────────────────────────────────────────────────────
const wikiSummaryCache = {};
const ID_SECTIONS = /^(description|identification|appearance|plumage|characteristics|field marks|field identification|morphology)/i;

async function fetchIDNote(wikiUrl) {
  if (!wikiUrl) return null;
  if (wikiSummaryCache[wikiUrl] !== undefined) return wikiSummaryCache[wikiUrl];
  try {
    const rawTitle = decodeURIComponent(wikiUrl.split('/wiki/').pop());
    // Step 1: resolve redirects and get section list
    const secR = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(rawTitle)}&prop=sections&redirects=1&format=json&origin=*`);
    if (!secR.ok) throw new Error();
    const secD = await secR.json();
    const title = secD.parse?.title || rawTitle;
    const sections = secD.parse?.sections || [];

    // Find the best ID-relevant section
    const idSec = sections.find(s => ID_SECTIONS.test(s.line?.replace(/<[^>]+>/g, '')));

    let text = '';
    if (idSec) {
      // Step 2a: fetch that specific section's wikitext, strip markup
      const secR2 = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&section=${idSec.index}&prop=wikitext&format=json&origin=*`);
      if (secR2.ok) {
        const secD2 = await secR2.json();
        const wikitext = secD2.parse?.wikitext?.['*'] || '';
        // Strip wiki markup: templates, refs, links, bold/italic, headers
        text = wikitext
          .replace(/{{[^}]*}}/g, '')
          .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
          .replace(/'{2,}/g, '')
          .replace(/==+[^=]+==+/g, '')
          .replace(/\n+/g, ' ')
          .trim();
        // Take first 3 meaningful sentences
        text = text.replace(/([.!?])\s+/g,'$1\n').split('\n')
          .filter(s => s.trim().length > 30).slice(0,3).join(' ').trim();
      }
    }

    if (!text) {
      // Step 2b: fall back to intro — fetch full plain-text extract, pick ID-rich sentences
      const extR = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&redirects=1&prop=extracts&explaintext=true&exsectionformat=plain&format=json&origin=*`);
      if (extR.ok) {
        const extD = await extR.json();
        const extract = Object.values(extD.query.pages)[0]?.extract || '';
        const skipPat = /\b(found in|native to|endemic to|range[sd]?( from| across| throughout)?|distribut|taxonom|classif|synonym|named (after|by|for)|family \w+idae|order \w+iformes|conspecific|iucn)\b/i;
        const idPat = /\b(cm|mm|inch|length|wingspan|plumage|feather|crown|mantle|breast|belly|throat|nape|back|wing|tail|bill|beak|eye|leg|foot|colour|color|white|black|brown|grey|gray|green|blue|red|yellow|orange|rufous|chestnut|olive|buff|pale|dark|bright|glossy|streak|spot|stripe|band|patch|underpart|upperpart|adult|male|female|juvenile|immature)\b/i;
        const sentences = extract.replace(/\n+/g,' ').split(/(?<=[.!?])\s+/);
        const long = sentences.filter(s => s.trim().length > 40);
        const idSents = long.filter(s => idPat.test(s) && !skipPat.test(s));
        const fallback = long.filter(s => !skipPat.test(s));
        text = (idSents.length ? idSents.slice(0,3) : fallback.length ? fallback.slice(0,2) : long.slice(0,2)).join(' ').trim();
      }
    }

    wikiSummaryCache[wikiUrl] = text || null;
    return wikiSummaryCache[wikiUrl];
  } catch { wikiSummaryCache[wikiUrl] = null; return null; }
}

// ── Xeno-canto bird calls (via Cloudflare Worker proxy — keeps API key secret) ──
const XC_PROXY = 'https://whatdatbird-xc-proxy.rutherfordecology.workers.dev';
const xenoCantoCache = {}; // latin → array of {file, recordist, url} or null
async function fetchXenoCanto(latin) {
  if (!latin) return null;
  if (xenoCantoCache[latin] !== undefined) return xenoCantoCache[latin]?.[0] || null;
  try {
    const [gen, sp] = latin.trim().split(/\s+/);
    if (!gen || !sp) { xenoCantoCache[latin]=null; return null; }
    const r = await fetch(`${XC_PROXY}/?gen=${encodeURIComponent(gen)}&sp=${encodeURIComponent(sp)}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    const proto = u => u && (u.startsWith('//') ? 'https:'+u : u);
    const pool = (d.recordings||[])
      .filter(rec => rec.file)
      .map(rec => ({ file: proto(rec.file), recordist: rec.rec || 'Unknown', url: proto(rec.url) || 'https://xeno-canto.org' }));
    xenoCantoCache[latin] = pool.length ? pool : null;
    return xenoCantoCache[latin]?.[0] || null;
  } catch { xenoCantoCache[latin]=null; return null; }
}
function randomXenoRec(latin, currentFile) {
  const pool = xenoCantoCache[latin];
  if (!pool?.length) return null;
  const others = pool.filter(r => r.file !== currentFile);
  const pick = others.length ? others : pool;
  return pick[Math.floor(Math.random() * pick.length)];
}

let currentAudio = null;
function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.onended=null; currentAudio=null; }
}
function playRecording(rec) {
  stopAudio();
  currentAudio = new Audio(rec.file);
  currentAudio.onended = () => setState({audioPlaying:false, audioRec:null});
  currentAudio.play().catch(() => setState({audioPlaying:false, audioRec:null}));
  setState({audioPlaying:true, audioLoading:false, audioRec:rec});
}
function toggleAudio() {
  const bird = state.current;
  if (!bird) return;
  if (state.audioPlaying) { stopAudio(); setState({audioPlaying:false, audioRec:null}); return; }
  const latin = bird.latin || bird.name;
  const cached = xenoCantoCache[latin];
  if (cached === undefined) {
    setState({audioLoading:true});
    fetchXenoCanto(latin).then(rec => {
      if (state.current !== bird) return;
      if (rec) playRecording(rec);
      else setState({audioLoading:false});
    });
    return;
  }
  if (cached) playRecording(randomXenoRec(latin, null));
}
function nextAudio() {
  const bird = state.current;
  if (!bird) return;
  const latin = bird.latin || bird.name;
  const rec = randomXenoRec(latin, state.audioRec?.file);
  if (rec) playRecording(rec);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function scoreByAncestry(candidates, correctIds, correctSet) {
  return candidates.map(b => {
    const shared = (b.ancestorIds || []).filter(id => correctSet.has(id));
    const depth = shared.length > 0
      ? Math.max(...shared.map(id => correctIds.indexOf(id)))
      : -1;
    return { b, depth, shared: shared.length };
  }).sort((a, b) => b.depth - a.depth || b.shared - a.shared);
}

function getOptions(correct, pool) {
  if (!correct) return [];
  const correctIds = correct.ancestorIds || [];
  const correctSet = new Set(correctIds);
  // Always draw distractors from the full species list so choices aren't limited to the active tier
  const fullPool = CFG.completeBirds?.length ? CFG.completeBirds : pool;
  const notCorrect = b => {
    if (b.name === correct.name) return false;
    if (correct.latin && b.latin && b.latin === correct.latin) return false;
    // Exclude partial-name duplicates e.g. "Fernbird" vs "New Zealand Fernbird"
    const a = correct.name.toLowerCase(), bn = b.name.toLowerCase();
    if (a.includes(bn) || bn.includes(a)) return false;
    return true;
  };

  if (correctSet.size > 0) {
    const others = shuffle(fullPool.filter(notCorrect));
    const scored = others.length >= 3 ? scoreByAncestry(others, correctIds, correctSet) : [];

    if (scored.length >= 3) {
      // Always include the closest relative, fill remaining 2 from next closest
      const closest = scored[0];
      const rest    = shuffle(scored.slice(1, Math.min(10, scored.length)));
      const picks   = [closest, ...rest.slice(0, 2)];
      return shuffle([correct.name, ...picks.map(s => s.b.name)]);
    }
  }

  // Fallback: same genus first, then rest
  const others   = shuffle(fullPool.filter(notCorrect));
  const genus    = correct.latin?.split(' ')[0] || '';
  const sameGenus = others.filter(b => b.latin?.split(' ')[0] === genus);
  const rest      = others.filter(b => b.latin?.split(' ')[0] !== genus);
  return shuffle([correct.name, ...[...sameGenus, ...rest].slice(0, 3).map(b => b.name)]);
}

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  phase:'loading', mode:'easy', loadError:null, buffer:0,
  queue:[], wrongBin:[], current:null,
  streak:0, streakHistory:[], totalSeen:0, totalCorrect:0,
  selected:null, options:[], imgUrl:null, imgLoading:false,
  photoUrls:[], photoIdx:0,
  audioPlaying:false, audioLoading:false, audioRec:null,
};
function setState(p) { Object.assign(state,p); render(); }

function getPool() {
  if (state.mode==='rarity')   return CFG.rarityBirds || CFG.easyBirds;
  if (state.mode==='complete') return CFG.completeBirds || CFG.hardBirds || CFG.easyBirds;
  if (state.mode==='hard')     return CFG.hardBirds || CFG.easyBirds;
  return CFG.easyBirds;
}

// ── Celebrations ──────────────────────────────────────────────────────────
function showEncouragement(text) {
  const el=document.getElementById('encourage'); if(el) el.remove();
  const div=document.createElement('div'); div.id='encourage'; div.textContent=text;
  document.body.appendChild(div); setTimeout(()=>div.remove(),1300);
}
function burstStars(x,y) {
  const emojis=['&#11088;','&#10024;','&#128171;','&#127775;'];
  for(let i=0;i<8;i++) {
    const el=document.createElement('div'); el.className='star-burst';
    el.innerHTML=emojis[Math.floor(Math.random()*emojis.length)];
    const angle=(i/8)*Math.PI*2, dist=60+Math.random()*60;
    el.style.cssText=`left:${x}px;top:${y}px;--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist}px;animation-duration:${0.6+Math.random()*0.3}s`;
    document.body.appendChild(el); setTimeout(()=>el.remove(),1000);
  }
}
function launchConfetti() {
  for(let i=0;i<60;i++) setTimeout(()=>{
    const el=document.createElement('div'); el.className='confetti-piece';
    const size=8+Math.random()*10;
    el.style.cssText=`left:${Math.random()*100}vw;width:${size}px;height:${size}px;background:${CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)]};animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*0.5}s;transform:rotate(${Math.random()*360}deg)`;
    document.body.appendChild(el); setTimeout(()=>el.remove(),3000);
  },i*30);
}

function starsForScore(pct) {
  if(pct>=95) return'&#11088;&#11088;&#11088;&#11088;&#11088;';
  if(pct>=85) return'&#11088;&#11088;&#11088;&#11088;';
  if(pct>=70) return'&#11088;&#11088;&#11088;';
  if(pct>=55) return'&#11088;&#11088;';
  return'&#11088;';
}

function badge(label, cls) { return `<span class="badge ${cls}">${label}</span>`; }
function birdBadges(bird) {
  const p=[];
  if(bird.endemic)    p.push(badge('Endemic','badge-green'));
  if(bird.introduced) p.push(badge('Introduced','badge-orange'));
  if(bird.seabird)    p.push(badge('Seabird','badge-blue'));
  return p.join('');
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  const isQuiz = state.phase==='quiz';

  const brandBtn = `<div class="header-brand"><a href="https://www.rutherfordecology.co.nz/" target="_blank"><span class="by-word">by </span><span class="re-bold">Rutherford</span> <span class="re-light">ecology</span></a></div>`;
  const header = isQuiz ? '' : state.phase === 'about' ? `
    <div class="header fade">
      <img src="logo-transparent.png" alt="WhatDatBird logo" style="height:80px;width:auto;margin:0 auto 8px;display:block;">
      <div class="eyebrow">WHATDATBIRD?</div>
      <h1>WhatDatBird?</h1>
      ${brandBtn}
    </div>` : `
    <div class="header fade">
      ${CFG.headerPhotoHtml ? CFG.headerPhotoHtml() : ''}
      <div class="eyebrow">${CFG.eyebrow || CFG.placeName.toUpperCase()}</div>
      <h1>${CFG.title || 'WhatDatBird?<br><span style="font-size:1.3rem;font-weight:700;color:#2a7a58;">' + CFG.placeName + '</span>'}</h1>
      <p>Can you get ${STREAK_TARGET} in a row?</p>
      ${brandBtn}
    </div>`;

  // Loading
  if (state.phase==='loading') {
    app.innerHTML = header + `
      <div class="loading-wrap fade">
        <div class="spinner"></div>
        <div class="loading-text">Loading birds for ${CFG.placeName}...</div>
        <div class="loading-sub">${state.buffer>0?`Searching within ${state.buffer}km radius`:'Fetching species from iNaturalist'}</div>
      </div>`;
    return;
  }

  // Error
  if (state.phase==='error') {
    app.innerHTML = header + `
      <div class="error-box fade">
        <p>${state.loadError||'Could not load species for this location.'}</p>
        <button class="btn-primary" onclick="window.location.href='${CFG.backUrl}'">&#8592; WhatDatBird?</button>
      </div>`;
    return;
  }

  // About
  if (state.phase==='about') {
    renderAbout(app, header);
    return;
  }

  // Species list
  if (state.phase==='species') {
    if (CFG.onSpeciesPhase) CFG.onSpeciesPhase();
    renderSpeciesList(app, header);
    return;
  }

  // Intro
  if (state.phase==='intro') {
    renderIntro(app, header);
    return;
  }

  // Celebrate (win — choose to finish or keep going)
  if (state.phase==='celebrate') {
    renderCelebrate(app, header);
    return;
  }

  // Result
  if (state.phase==='result') {
    renderResult(app, header);
    return;
  }

  // Quiz
  renderQuiz(app);
}

let introLbLoaded = false;
async function toggleIntroLeaderboard() {
  const panel = document.getElementById('introLbPanel');
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  if (introLbLoaded) return;
  introLbLoaded = true;
  panel.innerHTML = '<p style="text-align:center;color:#9b9890;font-size:0.85rem">Loading…</p>';
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${LB_FILE}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    const data = JSON.parse(atob(d.content.replace(/\n/g,'')));
    const MODES = [{key:'easy',label:'Common'},{key:'hard',label:'Birder'},{key:'complete',label:'Complete'},{key:'rarity',label:'Rarity'}];
    const html = MODES.map(({key, label}) => {
      const lbKey = CFG.placeId ? `${CFG.placeId}_${key}` : `coord_${CFG.coordLat.toFixed(3)}_${CFG.coordLng.toFixed(3)}_${key}`;
      const entries = data.boards?.[lbKey] || [];
      if (!entries.length) return '';
      return `<div style="margin-bottom:14px">
        <div class="lb-title" style="margin-bottom:6px">&#127942; ${label}</div>
        ${entries.map((e,i) => `<div class="lb-row-item">
          <span class="lb-rank">${i+1}</span>
          <span class="lb-name">${e.name}</span>
          <span class="lb-score">${e.pts ?? e.score} pts / ${e.score} birds</span>
          <span class="lb-date">${e.date}</span>
        </div>`).join('')}
      </div>`;
    }).join('');
    panel.innerHTML = html || '<p style="text-align:center;color:#9b9890;font-size:0.85rem">No scores yet for this place.</p>';
  } catch {
    panel.innerHTML = '<p style="text-align:center;color:#9b9890;font-size:0.85rem">Could not load leaderboards.</p>';
  }
}

function renderIntro(app, header) {
  const easy     = CFG.easyBirds;
  const hard     = CFG.hardBirds;
  const complete = CFG.completeBirds;
  const rarity   = CFG.rarityBirds;
  const hasHard     = hard && hard.length > easy.length;
  const hasComplete = complete && complete.length > (hard||easy).length;
  const hasRarity   = rarity && rarity.length >= 8;

  const modeGrid = `<div class="mode-grid">
    <button class="mode-btn ${state.mode==='easy'?'active':''}" onclick="setMode('easy')">
      <div class="mode-emoji">&#129414;</div>
      <div class="mode-count" id="mc-easy">${easy.length} SPECIES</div>
      <div class="mode-title">Common</div>
      <div class="mode-desc">The most frequently recorded birds here.</div>
    </button>
    <button class="mode-btn ${state.mode==='hard'?'active':''}" ${hasHard?'':'disabled'} onclick="setMode('hard')">
      <div class="mode-emoji">&#128247;</div>
      <div class="mode-count" id="mc-hard">${hasHard?hard.length+' SPECIES':'Loading...'}</div>
      <div class="mode-title">Birder</div>
      <div class="mode-desc">The 90% of species you're likely to encounter here.</div>
    </button>
    <button class="mode-btn ${state.mode==='complete'?'active':''}" ${hasComplete?'':'disabled'} onclick="setMode('complete')">
      <div class="mode-emoji">&#128301;</div>
      <div class="mode-count" id="mc-complete">${hasComplete?complete.length+' SPECIES':'Loading...'}</div>
      <div class="mode-title">Complete</div>
      <div class="mode-desc">Everything ever recorded. Gets progressively harder.</div>
    </button>
    <button class="mode-btn ${state.mode==='rarity'?'active':''}" ${hasRarity?'':'disabled'} ${hasRarity?`onclick="setMode('rarity')"`:''}>
      <div class="mode-emoji">&#128269;</div>
      <div class="mode-count" id="mc-rarity">${hasRarity?rarity.length+' SPECIES':'Not enough species'}</div>
      <div class="mode-title">Rarity</div>
      <div class="mode-desc">The least-recorded birds in this area.</div>
    </button>
  </div>`;

  const rarityNote = state.mode === 'rarity' ? `
    <div class="info-box" style="margin-bottom:12px;border-color:#d47a7a;background:#faf0f0;">
      <p style="color:#8a2c2c;"><strong>Rarity mode:</strong> These species have very few recorded occurrences in this area. Some may be genuine rarities, but others could represent misidentifications, data entry errors, or escaped captive birds. Treat them with appropriate scepticism.</p>
    </div>` : '';

  const bufferNote = state.buffer>0 ? `<p class="note-text">&#x1F4E1; Area expanded to ${state.buffer}km radius to find enough species</p>` : '';

  app.innerHTML = header + modeGrid + rarityNote + `
    <button class="btn-primary" onclick="startQuiz()">Let's Go! &#128640;</button>
    ${bufferNote}
    <div class="info-box" style="margin-top:12px;">
      <p>&#127919; Get your score to <strong>${STREAK_TARGET} to win!</strong> Each correct answer scores +1, wrong answers cost -2. Tricky birds keep coming back.</p>
    </div>
    <button class="btn-secondary" onclick="setState({phase:'species'})">&#128203; Species List</button>
    <button class="btn-secondary" onclick="toggleIntroLeaderboard()">&#127942; Leaderboards</button>
    <div id="introLbPanel" style="display:none;margin-top:12px"></div>
    <button class="btn-back" onclick="setState({phase:'about'})">&#8505; About WhatDatBird?</button>
    <button class="btn-back" onclick="window.location.href='${CFG.backUrl}'">&#8592; All Quizzes</button>`;
}

function renderCelebrate(app, header) {
  launchConfetti();
  const birdsLeft = state.queue.length + state.wrongBin.length;
  const canContinue = birdsLeft > 0;
  app.innerHTML = header + `
    <div class="fade" style="text-align:center;padding:32px 20px;">
      <div style="font-size:3rem;margin-bottom:12px;">🎉</div>
      <h2 style="font-size:1.8rem;font-weight:900;color:#1a5940;margin-bottom:8px;">10 points!</h2>
      <p style="color:#6b6960;margin-bottom:28px;">Amazing work — you nailed it!</p>
      ${canContinue ? `
        <button class="btn-primary" onclick="keepPlaying()" style="margin-bottom:12px;">Keep going for 10 more! 🚀</button>
        <br>` : ''}
      <button class="btn-secondary" onclick="setState({phase:'result'})">Save score &amp; see results</button>
    </div>`;
}

function keepPlaying() {
  // Reset streak but keep queue and wrongBin — birds already mastered won't repeat
  // since they've been removed from queue naturally
  setState({ phase: 'quiz', streak: 0, streakHistory: [], selected: null, imgUrl: null, imgLoading: true, photoUrls: [], photoIdx: 0 });
  // Advance to next bird
  _advance();
}

function renderResult(app, header) {
  const acc = state.totalSeen>0 ? Math.round((state.totalCorrect/state.totalSeen)*100) : 0;
  const stars = starsForScore(acc);
  const msg = [
    acc>=95?'Absolutely flawless! You know these birds! &#127942;':null,
    acc>=85?'Brilliant work! You really know your birds! &#127775;':null,
    acc>=70?'Great job! A few tricky ones but you got there! &#127881;':null,
    acc>=55?'Well done! Keep practising! &#128170;':null,
    'You did it! Those wrong ones kept coming back until you nailed them! &#128038;',
  ].find(m=>m!==null);

  const canSave = CFG.placeId || CFG.coordLat;
  const defaultQuizName = CFG.placeName;
  const saveBtn = canSave ? `
    <div id="saveLibSection">
      <button class="btn-save-library" id="saveLibBtn" onclick="showRenameForm()">&#127757; Add to Quiz Library</button>
      <div id="saveLibRename" style="display:none;margin-top:10px;">
        <div style="font-size:0.8rem;color:#6b6960;margin-bottom:6px;text-align:center;">Name this quiz in the library:</div>
        <div style="display:flex;gap:8px;max-width:380px;margin:0 auto;">
          <input id="saveLibName" type="text" maxlength="60" value="${defaultQuizName.replace(/"/g,'&quot;')}"
            style="flex:1;padding:8px 12px;font-size:0.88rem;border:1.5px solid #dddbd3;border-radius:8px;outline:none;font-family:inherit;"
            onfocus="this.style.borderColor='#2a7a58'" onblur="this.style.borderColor='#dddbd3'">
          <button onclick="saveToLibrary()" style="padding:8px 16px;background:#1a5940;color:#fff;border:none;border-radius:8px;font-weight:800;cursor:pointer;font-family:inherit;font-size:0.88rem;">Save</button>
          <button onclick="hideRenameForm()" style="padding:8px 12px;background:none;border:1.5px solid #dddbd3;border-radius:8px;cursor:pointer;font-family:inherit;font-size:0.88rem;color:#6b6960;">✕</button>
        </div>
      </div>
      <div id="saveLibMsg" style="font-size:0.8rem;color:#2a7a58;margin-top:8px;min-height:1.2em;text-align:center;font-weight:700;"></div>
    </div>` : '';

  const lbSection = canSave ? `
    <div class="lb-entry" id="lbEntry">
      <div id="lbLocked" style="text-align:center;color:#9b9890;font-size:0.85rem;padding:8px 0">&#128274; Add this quiz to the library to unlock the leaderboard</div>
      <div id="lbUnlocked" style="display:none">
        <div class="lb-label">&#127942; Add your score to the leaderboard</div>
        <div class="lb-row">
          <input class="lb-input" id="lbName" type="text" maxlength="24" placeholder="Your name" autocomplete="off">
          <button class="lb-submit" onclick="submitScore()">Submit</button>
        </div>
        <div id="lbMsg" style="font-size:0.78rem;color:#2a7a58;margin-top:6px;min-height:1em;text-align:center;font-weight:700;"></div>
      </div>
    </div>
    <div class="lb-board" id="lbBoard"></div>` : '';

  app.innerHTML = header + `
    <div class="result">
      <span class="trophy">&#127942;</span>
      <h2>${STREAK_TARGET} points!</h2>
      <div class="star-row">${stars}</div>
      <p class="stat">${state.totalCorrect} correct from ${state.totalSeen} attempts (${acc}%)</p>
      <p class="msg">${msg}</p>
      <button class="btn-primary" onclick="goIntro()">Play Again &#127919;</button>
      ${saveBtn}
      ${lbSection}
      <button class="btn-back" onclick="window.location.href='${CFG.backUrl}'">&#8592; All Quizzes</button>
    </div>`;
  launchConfetti();
  if (CFG.placeId || CFG.coordLat) {
    loadLeaderboard();
    checkInLibrary();
  }
}

function showRenameForm() {
  document.getElementById('saveLibBtn').style.display = 'none';
  document.getElementById('saveLibRename').style.display = 'block';
  document.getElementById('saveLibName').focus();
  document.getElementById('saveLibName').select();
}
function hideRenameForm() {
  document.getElementById('saveLibBtn').style.display = '';
  document.getElementById('saveLibRename').style.display = 'none';
}

function unlockLeaderboard() {
  const locked   = document.getElementById('lbLocked');
  const unlocked = document.getElementById('lbUnlocked');
  if (locked)   locked.style.display   = 'none';
  if (unlocked) unlocked.style.display = 'block';
}

async function checkInLibrary() {
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!r.ok) return;
    const d = await r.json();
    const data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))).replace(/^﻿/, ''));
    const alreadyIn = CFG.placeId
      ? data.quizzes.some(q => String(q.place_id) === String(CFG.placeId))
      : data.quizzes.some(q => q.coord_lat && Math.abs(q.coord_lat - CFG.coordLat) < 0.001 && Math.abs(q.coord_lng - CFG.coordLng) < 0.001);
    if (alreadyIn) {
      const btn = document.getElementById('saveLibBtn');
      const msg = document.getElementById('saveLibMsg');
      if (btn) btn.style.display = 'none';
      if (msg) msg.style.display = 'none';
      unlockLeaderboard();
    }
  } catch {}
}

function renderQuiz(app) {
  const bird = state.current;
  if (!bird) return;
  const pool = getPool();
  const modePill = state.mode==='complete'?'pill-complete':state.mode==='hard'?'pill-hard':state.mode==='rarity'?'pill-complete':'pill-easy';
  const modeLabel = state.mode==='complete'?'Complete':state.mode==='hard'?'Birder':state.mode==='rarity'?'Rarity':'Common';

  const dots = Array.from({length:STREAK_TARGET},(_,i) => {
    const h=state.streakHistory[i];
    return `<div class="${h===true?'dot correct':h===false?'dot wrong':'dot'}">${h===true?'&#11088;':h===false?'&#10005;':''}</div>`;
  }).join('');

  let imgContent;
  if(state.imgLoading) imgContent=`<div class="img-placeholder"><div class="icon">&#128247;</div><span>Loading...</span></div>`;
  else if(state.imgUrl) imgContent=`<img src="${state.imgUrl}" alt="mystery bird" onerror="imgFailed()" onload="adjustImgPosition(this)"/>`;
  else imgContent=`<div class="img-placeholder"><div class="icon">&#128247;</div><span>No photo available</span></div>`;

  const multi = state.photoUrls.length>1 && !state.imgLoading;
  const carousel = multi ? `
    <button class="carousel-btn carousel-prev" onclick="prevPhoto()">&#8249;</button>
    <button class="carousel-btn carousel-next" onclick="nextPhoto()">&#8250;</button>
    <div class="carousel-dots">${state.photoUrls.map((_,i)=>`<div class="carousel-dot ${i===state.photoIdx?'active':''}" onclick="goPhoto(${i})"></div>`).join('')}</div>` : '';

  let overlay='';
  if(state.selected) {
    const ok=state.selected===bird.name;
    const samoLabel = ok && bird[CFG.indigenousField] ? `<span class="overlay-samoan">${bird[CFG.indigenousField]}</span>` : '';
    overlay=`<div class="img-overlay ${ok?'overlay-correct':'overlay-wrong'}">
      <span>${ok?'&#10003;':'&#10007;'}</span>
      <span class="overlay-msg">${ok?CORRECT_MSGS[Math.floor(Math.random()*CORRECT_MSGS.length)]:`It's the ${bird.name}`}</span>
      ${samoLabel}
      <button class="btn-next-overlay" onclick="advance()">Next &#8594;</button>
    </div>`;
  }

  const fullPool = CFG.completeBirds?.length ? CFG.completeBirds : pool;
  const optBirds = state.options.map(opt => fullPool.find(b=>b.name===opt) || pool.find(b=>b.name===opt));
  const showLatin = optBirds.every(b => b?.latin);
  const optionsHtml = state.options.map((opt, i) => {
    let cls='option';
    if(state.selected){if(opt===bird.name)cls+=' correct';else if(opt===state.selected)cls+=' wrong';else cls+=' dimmed';}
    const safe=opt.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const matchBird=optBirds[i];
    const indLabel = matchBird?.[CFG.indigenousField] ? `<span class="opt-indigenous">${matchBird[CFG.indigenousField]}</span>` : '';
    const latinLabel = showLatin && matchBird?.latin ? `<span class="opt-latin-small">${matchBird.latin}</span>` : '';
    return `<button class="${cls}" ${state.selected?'disabled':''} onclick="selectAnswer('${safe}',event)"><span class="opt-english">${opt}</span>${indLabel}${latinLabel}</button>`;
  }).join('');

  let fieldNote='';
  if(state.selected) {
    const ok=state.selected===bird.name;
    const noteText=bird.note||'<em style="color:#9b9890">Loading field note...</em>';
    const wrongMsg=ok?'':`<div class="wrong-note"><p>&#128204; -2 points. This one will come back after a few birds.</p></div>`;
    fieldNote=`
      <div class="field-note">
        <div class="fn-head">
          <div class="fn-species-name">${bird.name}</div>
          ${bird[CFG.indigenousField]?`<div class="fn-species-samoan">${bird[CFG.indigenousField]}</div>`:''}
          <div class="fn-species-latin">${bird.latin||''}</div>
        </div>
        <div class="fn-label">&#128269; HOW TO IDENTIFY</div>
        <p class="fn-main">${noteText}</p>
        ${bird.count?`<p class="fn-count">&#128202; ${bird.count.toLocaleString()} iNat obs in area</p>`:''}
        <p class="inat-credit" style="margin-top:6px">
          <a href="https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(bird.name)}" target="_blank">Photo: iNaturalist</a> - CC licensed &nbsp;|&nbsp;
          <a href="https://www.gbif.org/species/search?q=${encodeURIComponent(bird.latin||bird.name)}" target="_blank">Location data: GBIF</a>
        </p>
      </div>${wrongMsg}`;
    if(!bird.note && bird.wikiUrl) {
      fetchIDNote(bird.wikiUrl).then(text => {
        if(text && state.current?.name===bird.name) { bird.note=text; if(state.selected) render(); }
      });
    }
  }

  let audioBtnHtml='', audioCreditHtml='';
  const audioLatin = bird.latin || bird.name;
  const audioRecAvailable = audioLatin ? xenoCantoCache[audioLatin] : null;
  if (audioRecAvailable) {
    const icon = state.audioPlaying ? '&#9208;&#65039;' : '&#128266;';
    const hasMultiple = xenoCantoCache[audioLatin]?.length > 1;
    const nextBtn = hasMultiple ? `<button class="audio-btn" onclick="nextAudio()" title="Different recording" aria-label="Next recording" style="margin-left:4px;font-size:0.75rem;">&#8635;</button>` : '';
    audioBtnHtml = `<button class="audio-btn${state.audioPlaying?' playing':''}" onclick="toggleAudio()" title="${state.audioPlaying?'Stop call':'Play call'}" aria-label="Play bird call">${icon}</button>${nextBtn}`;
    const displayRec = state.audioRec || audioRecAvailable[0];
    audioCreditHtml = `<p class="audio-credit">&#127925; Recording by <a href="${displayRec.url}" target="_blank">${displayRec.recordist}</a> via <a href="https://xeno-canto.org" target="_blank">xeno-canto.org</a></p>`;
  }

  app.innerHTML = `
    <div>
      <div class="meta-row">
        <span class="q-label">${state.totalSeen} seen - ${state.totalCorrect} correct
          <span class="mode-pill ${modePill}">${modeLabel}</span>
        </span>
        <div class="badges">${birdBadges(bird)}</div>
      </div>
      <div class="streak-row">
        <div class="streak-dots">${dots}</div>
        <span class="streak-label">&#128293; ${state.streak}/${STREAK_TARGET}</span>
      </div>
      <div class="img-box" id="imgBox" ontouchstart="_swipeX=event.touches[0].clientX" ontouchend="if(Math.abs(event.changedTouches[0].clientX-_swipeX)>40){event.changedTouches[0].clientX<_swipeX?nextPhoto():prevPhoto()}">${imgContent}${overlay}${carousel}</div>
      <p class="question-text">&#128269; Which bird is this?${audioBtnHtml}</p>
      ${audioCreditHtml}
      <div class="options">${optionsHtml}</div>
      ${fieldNote}
    </div>`;
}

let _spSortMode = 'count'; // 'count' or 'taxonomy'
let _spHeader = '';

function renderSpeciesList(app, header, sortMode) {
  if (header) _spHeader = header;
  if (sortMode) _spSortMode = sortMode;
  const birds = CFG.completeBirds || CFG.hardBirds || CFG.easyBirds;

  let sorted;
  if (_spSortMode === 'taxonomy') {
    sorted = [...birds].sort((a, b) => {
      const ai = a.ancestorIds || [], bi = b.ancestorIds || [];
      // Compare order → family → genus (indices 1, 2, 3 in ancestorIds)
      for (const i of [1, 2, 3]) {
        const diff = (ai[i] || 0) - (bi[i] || 0);
        if (diff !== 0) return diff;
      }
      return (a.latin || a.name).localeCompare(b.latin || b.name);
    });
  } else {
    sorted = [...birds].sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  const rows = sorted.map((bird, idx) => {
    const inatUrl=`https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(bird.latin||bird.name)}`;
    const rarity = CFG.rarity?.[bird.name];
    const rarityPill = rarity ? `<span class="rarity-pill rarity-${rarity}">${rarity.charAt(0).toUpperCase()+rarity.slice(1)}</span>` : '';
    const countBadge = bird.count ? `<span class="obs-count">${bird.count.toLocaleString()} iNat obs</span>` : '';
    const samoanInline = bird[CFG.indigenousField] ? `<span class="sp-samoan-inline">${bird[CFG.indigenousField]}</span>` : '';
    const badges = birdBadges(bird);
    const detailId = `spd-${idx}`;
    const familyLabel = _spSortMode === 'taxonomy' && bird.family ? `<span class="sp-family">${bird.family}</span>` : '';
    return `<div class="sp-item">
      <div class="sp-name-row">
        <span class="sp-name">${bird.name}</span>
        ${samoanInline}
        <span class="sp-latin">${bird.latin||''}</span>
        <button class="sp-chevron-btn" onclick="toggleSpDetail('${detailId}',this)" data-latin="${encodeURIComponent(bird.latin||bird.name)}" data-wiki="${encodeURIComponent(bird.wikiUrl||'')}" data-inat="${bird.inatId||''}" data-photo="${encodeURIComponent(bird.defaultPhoto||'')}" aria-label="Show details"><span class="sp-chevron-label">Info</span><span class="sp-chevron-arrow">&#8250;</span></button>
      </div>
      <div class="sp-meta-row">${rarityPill}${countBadge}${familyLabel}<a href="${inatUrl}" target="_blank" style="font-size:0.7rem;color:#9b9890;">iNat &#8594;</a></div>
      ${badges?`<div class="sp-badges">${badges}</div>`:''}
      <div class="sp-detail" id="${detailId}"></div>
    </div>`;
  }).join('');

  const sortLabel = _spSortMode === 'taxonomy' ? 'taxonomic order' : 'observation count';
  const toggleLabel = _spSortMode === 'taxonomy' ? '&#128202; Sort by count' : '&#128218; Sort by taxonomy';

  app.innerHTML = _spHeader + `
    <div class="fade">
      <button class="btn-secondary" style="margin-bottom:12px" onclick="goIntro()">&#8592; Back</button>
      <div class="info-box" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <p style="margin:0">&#128203; <strong>${birds.length} species</strong> - sorted by ${sortLabel}.</p>
        <button class="btn-sort-toggle" onclick="renderSpeciesList(document.getElementById('app'),null,_spSortMode==='taxonomy'?'count':'taxonomy')">${toggleLabel}</button>
      </div>
      ${rows}
    </div>`;
}

async function toggleSpDetail(id, btn) {
  const panel = document.getElementById(id);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  if (isOpen || panel.dataset.loaded) return;
  panel.dataset.loaded = '1';

  const latin = decodeURIComponent(btn.dataset.latin || '');
  const wikiUrl = decodeURIComponent(btn.dataset.wiki || '');
  const inatId = btn.dataset.inat ? parseInt(btn.dataset.inat) : null;
  const taxaPhoto = decodeURIComponent(btn.dataset.photo || '');
  panel.innerHTML = `<div class="sp-id-loading">Loading...</div>`;

  // Fetch observation photos and ID note in parallel; taxa photo is already available
  const [obsPhotos, noteText] = await Promise.all([
    fetchInatPhotosByTaxon(inatId, latin),
    wikiUrl ? fetchIDNote(wikiUrl) : Promise.resolve(null),
  ]);

  // Taxa photo always first, then unique observation photos
  const seen = new Set(taxaPhoto ? [taxaPhoto] : []);
  const extra = obsPhotos.filter(u => !seen.has(u) && seen.add(u));
  const photoUrls = [...(taxaPhoto ? [taxaPhoto] : []), ...extra].slice(0, 5);
  // Store photos on panel for carousel nav functions to access
  if (photoUrls.length) panel._spPhotos = photoUrls;
  let carouselHtml = '';
  if (photoUrls.length) {
    const imgId = `spc-img-${id}`;
    const dotsHtml = photoUrls.length > 1
      ? `<div class="sp-dc-dots">${photoUrls.map((_,i)=>`<div class="sp-dc-dot${i===0?' active':''}" id="${imgId}-dot-${i}" onclick="spGoPhoto('${id}','${imgId}',${i})"></div>`).join('')}</div>`
      : '';
    const prevNext = photoUrls.length > 1
      ? `<button class="sp-dc-prev" onclick="spPrevPhoto('${id}','${imgId}')">&#8249;</button><button class="sp-dc-next" onclick="spNextPhoto('${id}','${imgId}')">&#8250;</button>`
      : '';
    carouselHtml = `<div class="sp-detail-carousel" ontouchstart="_swipeX=event.touches[0].clientX" ontouchend="if(Math.abs(event.changedTouches[0].clientX-_swipeX)>40){event.changedTouches[0].clientX<_swipeX?spNextPhoto('${id}','${imgId}'):spPrevPhoto('${id}','${imgId}')}">${prevNext}<img id="${imgId}" src="${photoUrls[0]}" alt="${latin}" onerror="this.parentElement.style.display='none'"/>${dotsHtml}</div>`;
  }

  const noteHtml = noteText
    ? `<div class="sp-id-label">&#128269; How to identify</div><p class="sp-id-text">${noteText}</p>`
    : `<div class="sp-id-label">&#128269; How to identify</div><p class="sp-id-loading">No identification notes available.</p>`;

  panel.innerHTML = carouselHtml + noteHtml;
}

// Fetch up to 5 iNat photos — by taxon_id if available, otherwise by latin name
async function fetchInatPhotosByTaxon(inatId, latin) {
  try {
    const param = inatId ? `taxon_id=${inatId}` : `taxon_name=${encodeURIComponent(latin)}`;
    const r = await fetch(`https://api.inaturalist.org/v1/observations?${param}&quality_grade=research&order_by=votes&per_page=10`);
    if (!r.ok) return [];
    const d = await r.json();
    const urls = [];
    const seen = new Set();
    for (const obs of (d.results||[])) {
      const url = obs.photos?.[0]?.url?.replace('/square.','/medium.');
      if (url && !seen.has(url)) { seen.add(url); urls.push(url); if(urls.length>=5) break; }
    }
    return urls;
  } catch { return []; }
}

function spGoPhoto(detailId, imgId, idx) {
  const img = document.getElementById(imgId);
  const panel = document.getElementById(detailId);
  if (!img || !panel?._spPhotos) return;
  img.src = panel._spPhotos[idx];
  panel.querySelectorAll('.sp-dc-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
  img.dataset.idx = idx;
}
function spPrevPhoto(detailId, imgId) {
  const img = document.getElementById(imgId);
  const panel = document.getElementById(detailId);
  const cur = parseInt(img?.dataset.idx||'0');
  if (panel?._spPhotos) spGoPhoto(detailId, imgId, (cur - 1 + panel._spPhotos.length) % panel._spPhotos.length);
}
function spNextPhoto(detailId, imgId) {
  const img = document.getElementById(imgId);
  const panel = document.getElementById(detailId);
  const cur = parseInt(img?.dataset.idx||'0');
  if (panel?._spPhotos) spGoPhoto(detailId, imgId, (cur + 1) % panel._spPhotos.length);
}

function renderAbout(app, header) {
  app.innerHTML = header + `
    <div class="fade">
      <button class="btn-secondary" style="margin-bottom:16px" onclick="goIntro()">&#8592; Back</button>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">WHAT IS THIS?</div>
        <p class="fn-main">WhatDatBird? is a photo identification quiz for birds. Pick any location in the world, get 10 points to win. Correct answers score +1, wrong answers cost -2, and tricky birds keep coming back until you nail them.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">THE DATA</div>
        <p class="fn-main"><strong>Species lists</strong> come from GBIF occurrence data (which includes eBird), filtered to the last 15 years and ordered by observation count. This means you see the birds people actually encounter, not historical-only records. iNaturalist is used as a fallback for places where GBIF has insufficient coverage.</p>
        <p class="fn-main" style="margin-top:8px"><strong>Photos</strong> come from iNaturalist research-grade observations, fetched by exact taxon ID and sorted by community faves. One photo per observation is used to avoid repetitive shots of the same individual. The carousel shows up to 5 photos per species from different observers — swipe left or right to browse.</p>
        <p class="fn-main" style="margin-top:8px"><strong>Field notes</strong> are pulled from the Wikipedia article for each species — specifically the identification or description section rather than the intro, which tends to be general facts rather than ID tips.</p>
        <p class="fn-main" style="margin-top:8px"><strong>Bird calls</strong> are streamed from Xeno-canto, filtered to quality A and B recordings under 10 seconds. Tap 🔊 to hear a call, ↻ to cycle to a different recording. Attribution is shown for every recording.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">DIFFICULTY MODES</div>
        <p class="fn-main"><strong>Common</strong> - the top 25 most-observed species. Birds you'd expect to see on a casual walk.</p>
        <p class="fn-main" style="margin-top:6px"><strong>Birder</strong> - the 90% of species you're likely to encounter. Requires a dedicated trip. For megadiverse places like Colombia this is genuinely hard.</p>
        <p class="fn-main" style="margin-top:6px"><strong>Complete</strong> - every species recorded in the last 15 years, including rare vagrants. Starts with the most common birds and gets progressively harder as you go.</p>
        <p class="fn-main" style="margin-top:6px"><strong>Rarity</strong> - the least-recorded 15% of species. These are the birds that make listers nervous.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">WRONG ANSWERS</div>
        <p class="fn-main">Distractor options are chosen by taxonomic relatedness using GBIF taxonomy keys (class, order, family, genus). The closest relative in the full species list for that location is always included, with two more picked from the next closest. This means you're distinguishing a Chatham Albatross from a Buller's Albatross, not an albatross from a kiwi.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">AREA BUFFER</div>
        <p class="fn-main">If fewer than 15 species are recorded within a location's boundaries, the app automatically expands the search radius (5km, 10km, 25km, 50km) until it finds enough species. It uses the place's centroid coordinates from iNaturalist and switches from a place_id query to a lat/lng/radius query.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">THE QUIZ LIBRARY</div>
        <p class="fn-main">When you finish a quiz you can add it to the shared library. The app writes directly to a JSON file in the GitHub repository using the GitHub Contents API — no server required. The library map shows all saved quizzes as pins — tap any pin to play. Changes appear within about a minute after GitHub Pages redeploys.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">WHAT ABOUT INDIGENOUS NAMES?</div>
        <p class="fn-main">Species names come from GBIF, which uses the most widely-used common name globally. Tui is Tui — but Pūkeko comes up as Australasian Swamphen. For some places, local names are shown alongside the English name — currently Māori names for New Zealand quizzes and Samoan names for Samoa.</p>
        <p class="fn-main" style="margin-top:8px">The right solution would link indigenous and common names to the geographic origin of each record — so the name you see reflects where the bird actually is. There are over 7,000 languages in the world. That's a problem worth solving.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">BUILT WITH</div>
        <p class="fn-main">
          <a href="https://www.gbif.org" target="_blank" style="color:#2a7a58">GBIF</a> - species lists and occurrence data<br>
          <a href="https://www.inaturalist.org" target="_blank" style="color:#2a7a58">iNaturalist</a> - photos, taxon IDs, and common names (CC licensed)<br>
          <a href="https://en.wikipedia.org" target="_blank" style="color:#2a7a58">Wikipedia</a> - field notes<br>
          <a href="https://xeno-canto.org" target="_blank" style="color:#2a7a58">Xeno-canto</a> - bird call recordings (CC licensed)<br>
          <a href="https://leafletjs.com" target="_blank" style="color:#2a7a58">Leaflet</a> + OpenStreetMap - quiz library map<br>
          GitHub Pages - free static hosting<br>
          No backend, no database, no login.
        </p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">KNOWN LIMITATIONS</div>
        <p class="fn-main">GBIF and iNaturalist coverage varies enormously by region — well-studied areas have rich data, remote areas may have very few records. GBIF and iNaturalist sometimes use different latin names for the same species due to taxonomy revisions; the app tries to reconcile these but will occasionally miss a match. Photo quality depends entirely on what iNaturalist contributors have uploaded for that species. Not all species have Xeno-canto recordings that meet the quality and length criteria, so the audio button won't appear for every bird.</p>
      </div>

      <button class="btn-back" onclick="window.location.href='${CFG.backUrl}'">&#8592; All Quizzes</button>
    </div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────
function adjustImgPosition(img) {
  const isPortrait = img.naturalWidth < img.naturalHeight;
  if(isPortrait) {
    const fullH = img.offsetWidth/(img.naturalWidth/img.naturalHeight);
    img.style.height=(fullH*0.7)+'px'; img.style.objectPosition='center 15%';
  } else {
    img.style.height='auto'; img.style.maxHeight='65vw'; img.style.objectPosition='center center';
  }
}
function imgFailed() {
  const box=document.getElementById('imgBox');
  if(box) box.innerHTML=`<div class="img-placeholder"><div class="icon">&#128247;</div><span>No photo available</span></div>`;
}
let _photoSliding = false;
function slidePhoto(newIdx, dir) {
  if (_photoSliding || state.photoUrls.length <= 1) return;
  const box = document.getElementById('imgBox');
  const curImg = box?.querySelector('img:not(.slide-in)');
  if (!box || !curImg) { setState({photoIdx:newIdx, imgUrl:state.photoUrls[newIdx]}); return; }

  _photoSliding = true;
  box.style.height = box.offsetHeight + 'px';

  const newImg = document.createElement('img');
  newImg.src = state.photoUrls[newIdx];
  newImg.className = 'slide-in';
  newImg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center top;transform:translateX(${dir>0?'100%':'-100%'});`;
  curImg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center top;`;
  // Insert before the overlay so it stays on top of both images
  const overlayEl = box.querySelector('.img-overlay');
  if (overlayEl) box.insertBefore(newImg, overlayEl);
  else box.appendChild(newImg);
  newImg.getBoundingClientRect(); // force reflow so initial transform is established
  newImg.style.transition = curImg.style.transition = 'transform 0.28s ease';
  newImg.style.transform = 'translateX(0)';
  curImg.style.transform = `translateX(${dir>0?'-100%':'100%'})`;

  setTimeout(() => {
    curImg.remove();
    newImg.style.cssText = '';
    newImg.className = '';
    box.style.height = '';
    state.photoIdx = newIdx;
    state.imgUrl = state.photoUrls[newIdx];
    box.querySelectorAll('.carousel-dot').forEach((d,i) => d.classList.toggle('active', i===newIdx));
    _photoSliding = false;
  }, 300);
}
function prevPhoto() { slidePhoto((state.photoIdx-1+state.photoUrls.length)%state.photoUrls.length, -1); }
function nextPhoto() { slidePhoto((state.photoIdx+1)%state.photoUrls.length, 1); }
function goPhoto(i)  { slidePhoto(i, i>=state.photoIdx?1:-1); }
function setMode(m)  { setState({mode:m}); }
function goIntro()   { setState({phase:'intro'}); }

async function logNoPhoto(bird) {
  const entry = { name: bird.name, latin: bird.latin || '', place: CFG.placeName, date: new Date().toISOString().split('T')[0] };
  console.warn('[WhatDatBird] No photo — skipping:', bird.name, bird.latin);
  try {
    const headers = { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' };
    const NP_FILE = 'nophoto.json';
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${NP_FILE}`, { headers });
    let log = [], sha;
    if (r.ok) {
      const d = await r.json();
      sha = d.sha;
      log = JSON.parse(atob(d.content.replace(/\n/g,'')));
    }
    if (log.some(e => e.latin === entry.latin && e.place === entry.place)) return;
    log.push(entry);
    await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${NP_FILE}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Log missing photo: ${entry.name} (${entry.place})`, sha, content: btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2)))) }),
    });
  } catch {}
}

function buildQueue(pool) {
  if (state.mode !== 'complete') return shuffle([...pool]);
  // Sort by obs count desc, then shuffle within each chunk of 10
  const sorted = [...pool].sort((a,b) => (b.count||0)-(a.count||0));
  const queue = [];
  for (let i = 0; i < sorted.length; i += 10) {
    queue.push(...shuffle(sorted.slice(i, i+10)));
  }
  return queue;
}

function startQuiz() {
  const pool=getPool();
  const queue=buildQueue(pool);
  const first=queue.shift();
  setState({phase:'quiz',queue,wrongBin:[],current:first,streak:0,streakHistory:[],totalSeen:0,totalCorrect:0,selected:null,imgUrl:null,imgLoading:true,photoUrls:[],photoIdx:0,options:getOptions(first,pool)});
  fetchImage(first, state.mode).then(url => {
    const all=(inatPhotoCache[first.latin||first.name]||[]).slice(0,5);
    const photoUrls=url?[url,...all.filter(u=>u!==url)].slice(0,5):all;
    if (!url && !photoUrls.length) { logNoPhoto(first); _advance(); return; }
    setState({imgUrl:url,imgLoading:false,photoUrls,photoIdx:0});
  });
}

function selectAnswer(opt, event) {
  if(state.selected) return;
  const bird=state.current;
  const correct=opt===bird.name;
  const newHistory=[...state.streakHistory,correct];
  if(newHistory.length>STREAK_TARGET) newHistory.shift();
  const newStreak=correct?state.streak+1:Math.max(0,state.streak-2);
  setState({selected:opt,streak:newStreak,streakHistory:newHistory,
    totalSeen:state.totalSeen+1,totalCorrect:state.totalCorrect+(correct?1:0),
    wrongBin:correct?state.wrongBin:[...state.wrongBin,{bird,wrongAt:state.totalSeen}]});
  if(correct) {
    if(event) burstStars(event.clientX,event.clientY);
    setTimeout(()=>showEncouragement(STREAK_MSGS[newStreak]||CORRECT_MSGS[Math.floor(Math.random()*CORRECT_MSGS.length)]),150);
  }
  if(newStreak>=STREAK_TARGET) setTimeout(()=>setState({phase:'celebrate'}),2000);
}

function advance() {
  // Fade out current image before re-rendering
  const box = document.getElementById('imgBox');
  if (box) { box.style.opacity='0'; box.style.transition='opacity 0.18s ease'; }
  setTimeout(_advance, box ? 180 : 0);
}
function _advance() {
  const pool=getPool();
  let queue=[...state.queue], wrongBin=[...state.wrongBin];
  if(queue.length===0&&wrongBin.length===0){setState({phase:'result'});return;}

  const WRONG_GAP = 3;
  const eligible = wrongBin.filter(w => state.totalSeen - w.wrongAt >= WRONG_GAP);
  const insertWrong = eligible.length > 0 && (queue.length === 0 || state.totalSeen % 3 === 0);

  stopAudio();
  let next;
  if(insertWrong) {
    const pick = eligible[Math.floor(Math.random()*eligible.length)];
    next = pick.bird;
    wrongBin = wrongBin.filter(w => w !== pick);
  } else {
    next=queue.shift();
    if(eligible.length>0&&Math.random()<0.4) {
      const pick = eligible[Math.floor(Math.random()*eligible.length)];
      wrongBin = wrongBin.filter(w => w !== pick);
      queue.splice(Math.min(Math.floor(Math.random()*4)+1,queue.length),0,pick.bird);
    }
  }
  setState({current:next,queue,wrongBin,selected:null,imgUrl:null,imgLoading:true,photoUrls:[],photoIdx:0,options:getOptions(next,pool),audioPlaying:false,audioLoading:false,audioRec:null});
  fetchImage(next, state.mode).then(url => {
    const all=(inatPhotoCache[next.latin||next.name]||[]).slice(0,5);
    const photoUrls=url?[url,...all.filter(u=>u!==url)].slice(0,5):all;
    if (!url && !photoUrls.length) {
      logNoPhoto(next);
      _advance();
      return;
    }
    setState({imgUrl:url,imgLoading:false,photoUrls,photoIdx:0});
  });
  // Prefetch current bird's field note + call audio, and next bird's photos + note + audio
  if (next.wikiUrl && !next.note) fetchIDNote(next.wikiUrl).catch(() => {});
  fetchXenoCanto(next.latin || next.name).then(rec => { if (rec && state.current === next) render(); }).catch(() => {});
  const prefetchBird = queue[0] || wrongBin[0]?.bird;
  if (prefetchBird) {
    fetchInatImage(prefetchBird).catch(() => {});
    if (prefetchBird.wikiUrl && !prefetchBird.note) fetchIDNote(prefetchBird.wikiUrl).catch(() => {});
    fetchXenoCanto(prefetchBird.latin || prefetchBird.name).catch(() => {});
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────
async function readLB() {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${LB_FILE}`, {
    headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!r.ok) return { sha: null, data: { boards: {} } };
  const d = await r.json();
  const data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))).replace(/^﻿/, ''));
  return { sha: d.sha, data };
}

async function loadLeaderboard() {
  const board = document.getElementById('lbBoard');
  if (!board) return;
  try {
    const { data } = await readLB();
    const entries = (data.boards?.[`${CFG.placeId}_${state.mode}`] || []).slice(0, 10);
    if (!entries.length) { board.innerHTML = ''; return; }
    const modeLabel = state.mode==='complete'?'Complete':state.mode==='hard'?'Birder':state.mode==='rarity'?'Rarity':'Common';
    board.innerHTML = `<div class="lb-title">&#127942; Leaderboard — ${CFG.placeName} · ${modeLabel}</div>` +
      entries.map((e, i) => `<div class="lb-row-item">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${e.name}</span>
        <span class="lb-score">${e.pts ?? e.score} pts / ${e.score} birds</span>
        <span class="lb-date">${e.date}</span>
      </div>`).join('');
  } catch { board.innerHTML = ''; }
}

async function submitScore() {
  const nameEl = document.getElementById('lbName');
  const msgEl  = document.getElementById('lbMsg');
  const entry  = document.getElementById('lbEntry');
  const name   = nameEl?.value?.trim();
  if (!name) { if (msgEl) { msgEl.style.color='#8a2c2c'; msgEl.textContent='Please enter your name.'; } return; }
  if (msgEl) { msgEl.style.color='#2a7a58'; msgEl.textContent='Saving...'; }

  try {
    const { sha, data } = await readLB();
    if (!data.boards) data.boards = {};
    const key = CFG.placeId ? `${CFG.placeId}_${state.mode}` : `coord_${CFG.coordLat.toFixed(3)}_${CFG.coordLng.toFixed(3)}_${state.mode}`;
    if (!data.boards[key]) data.boards[key] = [];
    data.boards[key].push({ name, score: state.totalSeen, pts: state.totalCorrect, date: new Date().toISOString().split('T')[0] });
    data.boards[key].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0) || (a.score ?? 0) - (b.score ?? 0));
    data.boards[key] = data.boards[key].slice(0, 10);

    const body = JSON.stringify({
      message: `Leaderboard: ${name} scored ${state.totalCorrect} pts at ${CFG.placeName}`,
      sha: sha || undefined,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    });
    const putR = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${LB_FILE}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body,
    });
    if (putR.status === 409) {
      if (msgEl) { msgEl.style.color='#8a6020'; msgEl.textContent='Someone else is recording a score — please try again in a moment.'; }
      return;
    }
    if (!putR.ok) throw new Error(`GitHub write ${putR.status}`);
    if (entry) entry.style.display = 'none';
    loadLeaderboard();
  } catch (e) {
    if (msgEl) { msgEl.style.color='#8a2c2c'; msgEl.textContent=`Could not save: ${e.message}`; }
  }
}

// ── Quiz Library ──────────────────────────────────────────────────────────
async function saveToLibrary() {
  const msg = document.getElementById('saveLibMsg');
  if (!CFG.placeId && !CFG.coordLat) return;
  const nameInput = document.getElementById('saveLibName');
  const quizLabel = nameInput ? nameInput.value.trim() || CFG.placeName : CFG.placeName;
  // Disable the save button inside the rename form
  const saveBtn = document.querySelector('#saveLibRename button');
  if (saveBtn) saveBtn.disabled = true;
  msg.style.color = '#2a7a58';
  msg.textContent = 'Reading library...';

  // 1. Read current quizzes.json from GitHub
  let sha, data;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!r.ok) throw new Error(`GitHub read ${r.status}`);
    const d = await r.json();
    sha  = d.sha;
    data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))).replace(/^﻿/, ''));
  } catch (e) {
    msg.style.color = '#8a2c2c';
    msg.textContent = `Read failed: ${e.message}`;
    btn.disabled = false;
    return;
  }

  const alreadySaved = CFG.placeId
    ? data.quizzes.some(q => String(q.place_id) === String(CFG.placeId))
    : data.quizzes.some(q => q.coord_lat && Math.abs(q.coord_lat - CFG.coordLat) < 0.001 && Math.abs(q.coord_lng - CFG.coordLng) < 0.001);
  if (alreadySaved) {
    msg.textContent = 'Already in the library!';
    btn.style.display = 'none';
    return;
  }

  // 2. Fetch place metadata
  msg.textContent = 'Fetching place info...';
  let continent = 'Other', country = CFG.placeName, photoTaxon = null, lat = null, lng = null;

  // Coord mode: derive country/continent from country code, no iNat place lookup needed
  if (CFG.coordLat && !CFG.placeId) {
    lat = CFG.coordLat;
    lng = CFG.coordLng;
    if (CFG.coordCC && ISO_TO_COUNTRY[CFG.coordCC]) {
      country = ISO_TO_COUNTRY[CFG.coordCC];
    }
    const COUNTRY_CONTINENT = {
      'United States':'North America','Canada':'North America','Mexico':'North America','Guatemala':'North America','Cuba':'North America','Costa Rica':'North America','Panama':'North America','Honduras':'North America','Nicaragua':'North America','El Salvador':'North America','Dominican Republic':'North America','Haiti':'North America','Trinidad and Tobago':'North America',
      'Brazil':'South America','Argentina':'South America','Colombia':'South America','Peru':'South America','Venezuela':'South America','Chile':'South America','Ecuador':'South America','Bolivia':'South America','Paraguay':'South America','Uruguay':'South America','Guyana':'South America',
      'United Kingdom':'Europe','France':'Europe','Germany':'Europe','Spain':'Europe','Italy':'Europe','Portugal':'Europe','Netherlands':'Europe','Belgium':'Europe','Switzerland':'Europe','Austria':'Europe','Sweden':'Europe','Norway':'Europe','Denmark':'Europe','Finland':'Europe','Poland':'Europe','Czech Republic':'Europe','Hungary':'Europe','Romania':'Europe','Greece':'Europe','Ireland':'Europe','Croatia':'Europe','Bulgaria':'Europe','Serbia':'Europe','Russia':'Europe','Ukraine':'Europe','Iceland':'Europe',
      'Australia':'Oceania','New Zealand':'Oceania','Papua New Guinea':'Oceania','Fiji':'Oceania','Samoa':'Oceania','Tonga':'Oceania','Vanuatu':'Oceania','Solomon Islands':'Oceania','New Caledonia':'Oceania','French Polynesia':'Oceania',
      'China':'Asia','Japan':'Asia','India':'Asia','Indonesia':'Asia','Philippines':'Asia','Vietnam':'Asia','Thailand':'Asia','Malaysia':'Asia','South Korea':'Asia','Taiwan':'Asia','Myanmar':'Asia','Cambodia':'Asia','Nepal':'Asia','Sri Lanka':'Asia','Singapore':'Asia','Bangladesh':'Asia','Pakistan':'Asia','Mongolia':'Asia','Kazakhstan':'Asia',
      'South Africa':'Africa','Kenya':'Africa','Tanzania':'Africa','Ethiopia':'Africa','Uganda':'Africa','Ghana':'Africa','Nigeria':'Africa','Cameroon':'Africa','Senegal':'Africa','Madagascar':'Africa','Zambia':'Africa','Zimbabwe':'Africa','Botswana':'Africa','Mozambique':'Africa','Morocco':'Africa','Egypt':'Africa','Rwanda':'Africa','Malawi':'Africa',
    };
    continent = COUNTRY_CONTINENT[country] || 'Other';
    // Get a photo from iNat by coords
    try {
      const spR = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?lat=${CFG.coordLat}&lng=${CFG.coordLng}&radius=25&iconic_taxa=Aves&quality_grade=research&per_page=1&order_by=observations_count&order=desc`);
      const spD = await spR.json();
      photoTaxon = spD.results?.[0]?.taxon?.name || null;
    } catch {}
  } else {
  try {
    const placeR = await fetch(`https://api.inaturalist.org/v1/places/${CFG.placeId}`);
    const placeD = await placeR.json();
    const place  = placeD.results?.[0];
    if (place?.location) {
      const [pLat, pLng] = place.location.split(',').map(Number);
      if (!isNaN(pLat) && !isNaN(pLng)) { lat = pLat; lng = pLng; }
    }
    const ancestorIds = (place?.ancestor_place_ids || []).join(',');
    if (ancestorIds) {
      const ancR = await fetch(`https://api.inaturalist.org/v1/places?id=${ancestorIds}&per_page=100`);
      const ancD = await ancR.json();
      const ancs = ancD.results || [];
      continent = ancs.find(a => a.place_type === 29)?.display_name || '';
      country   = ancs.find(a => a.place_type === 12)?.display_name
               || ancs.find(a => a.place_type === 2)?.display_name
               || CFG.placeName;
      // If country detection failed, extract ISO code from place name e.g. "Rotorua, BP, NZ" → "New Zealand"
      if (country === CFG.placeName) {
        const isoMatch = CFG.placeName.match(/,\s*([A-Z]{2,3})(?:,\s*[A-Z]{2})?$/);
        const code = isoMatch?.[1];
        if (code && ISO_TO_COUNTRY[code]) country = ISO_TO_COUNTRY[code];
      }
      // Fallback: derive continent from country if iNat ancestor missing
      if (!continent) {
        const COUNTRY_CONTINENT = {
          'United States':'North America','Canada':'North America','Mexico':'North America',
          'Guatemala':'North America','Cuba':'North America','Jamaica':'North America',
          'Costa Rica':'North America','Panama':'North America','Honduras':'North America',
          'Nicaragua':'North America','El Salvador':'North America','Belize':'North America',
          'Dominican Republic':'North America','Haiti':'North America','Puerto Rico':'North America',
          'Trinidad and Tobago':'North America','Barbados':'North America','Bahamas':'North America',
          'Brazil':'South America','Argentina':'South America','Colombia':'South America',
          'Peru':'South America','Venezuela':'South America','Chile':'South America',
          'Ecuador':'South America','Bolivia':'South America','Paraguay':'South America',
          'Uruguay':'South America','Guyana':'South America','Suriname':'South America',
          'United Kingdom':'Europe','France':'Europe','Germany':'Europe','Spain':'Europe',
          'Italy':'Europe','Portugal':'Europe','Netherlands':'Europe','Belgium':'Europe',
          'Switzerland':'Europe','Austria':'Europe','Sweden':'Europe','Norway':'Europe',
          'Denmark':'Europe','Finland':'Europe','Poland':'Europe','Czech Republic':'Europe',
          'Hungary':'Europe','Romania':'Europe','Greece':'Europe','Ireland':'Europe',
          'Croatia':'Europe','Slovakia':'Europe','Bulgaria':'Europe','Serbia':'Europe',
          'Russia':'Europe','Ukraine':'Europe','Iceland':'Europe',
          'Australia':'Oceania','New Zealand':'Oceania','Papua New Guinea':'Oceania',
          'Fiji':'Oceania','Samoa':'Oceania','American Samoa':'Oceania','Tonga':'Oceania',
          'Vanuatu':'Oceania','Solomon Islands':'Oceania','Palau':'Oceania',
          'Kiribati':'Oceania','Micronesia':'Oceania','Marshall Islands':'Oceania',
          'Nauru':'Oceania','Tuvalu':'Oceania','New Caledonia':'Oceania',
          'French Polynesia':'Oceania','Hawaii':'North America',
          'China':'Asia','Japan':'Asia','India':'Asia','Indonesia':'Asia','Philippines':'Asia',
          'Vietnam':'Asia','Thailand':'Asia','Malaysia':'Asia','South Korea':'Asia',
          'Taiwan':'Asia','Myanmar':'Asia','Cambodia':'Asia','Nepal':'Asia','Sri Lanka':'Asia',
          'Singapore':'Asia','Bangladesh':'Asia','Pakistan':'Asia','Mongolia':'Asia',
          'South Africa':'Africa','Kenya':'Africa','Tanzania':'Africa','Ethiopia':'Africa',
          'Uganda':'Africa','Ghana':'Africa','Nigeria':'Africa','Cameroon':'Africa',
          'Senegal':'Africa','Madagascar':'Africa','Zambia':'Africa','Zimbabwe':'Africa',
          'Botswana':'Africa','Mozambique':'Africa','Morocco':'Africa','Egypt':'Africa',
        };
        continent = COUNTRY_CONTINENT[country] || COUNTRY_CONTINENT[CFG.placeName] || COUNTRY_CONTINENT[CFG.placeName?.split(',')[0]?.trim()] || 'Other';
      }
    }
    // Final safety net — catches country-level places where iNat has no continent ancestor
    if (!continent || continent === 'Other') {
      continent = COUNTRY_CONTINENT[country] || COUNTRY_CONTINENT[CFG.placeName] || COUNTRY_CONTINENT[CFG.placeName?.split(',')[0]?.trim()] || 'Other';
    }
    const spR = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?place_id=${CFG.placeId}&iconic_taxa=Aves&quality_grade=research&per_page=1&order_by=observations_count&order=desc`);
    const spD = await spR.json();
    photoTaxon = spD.results?.[0]?.taxon?.name || null;
  } catch (e) {
    console.warn('iNat metadata fetch failed:', e.message);
  }
  } // end else (place_id mode)

  // 3. Write updated quizzes.json to GitHub
  msg.textContent = 'Saving...';
  const quizEntry = CFG.placeId ? {
    name:        `WhatDatBird? - ${quizLabel}`,
    continent,
    country,
    description: quizLabel,
    species:     null,
    type:        'dynamic',
    url:         `quiz.html?place_id=${CFG.placeId}&place_name=${encodeURIComponent(CFG.placeName)}`,
    place_id:    Number(CFG.placeId),
    photo_taxon: photoTaxon,
    lat,
    lng,
    added:       new Date().toISOString().split('T')[0],
  } : {
    name:        `WhatDatBird? - ${quizLabel}`,
    continent,
    country,
    description: quizLabel,
    species:     null,
    type:        'dynamic',
    url:         `quiz.html?lat=${CFG.coordLat}&lng=${CFG.coordLng}&place_name=${encodeURIComponent(CFG.placeName)}${CFG.coordCC ? '&country_code='+CFG.coordCC : ''}`,
    coord_lat:   CFG.coordLat,
    coord_lng:   CFG.coordLng,
    photo_taxon: photoTaxon,
    lat,
    lng,
    added:       new Date().toISOString().split('T')[0],
  };
  data.quizzes.push(quizEntry);
  try {
    const body = JSON.stringify({
      message: `Add ${CFG.placeName} to quiz library`,
      sha,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    });
    const putR = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body,
    });
    if (!putR.ok) {
      const errD = await putR.json().catch(() => ({}));
      throw new Error(`GitHub write ${putR.status}: ${errD.message || ''}`);
    }
    msg.textContent = '✓ Added to library! Will appear in ~1 minute.';
    const section = document.getElementById('saveLibSection');
    if (section) section.style.display = 'none';
    unlockLeaderboard();
  } catch (e) {
    msg.style.color = '#8a2c2c';
    msg.textContent = `Save failed: ${e.message}`;
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
function initEngine(config) {
  CFG = config;
  CFG.indigenousField = config.indigenousField || 'indigenousName';
  CFG.easyUseWiki = config.easyUseWiki || false;

  // Compute tiers if not provided
  if (!CFG.easyBirds) CFG.easyBirds = [];

  // Default mode to easy
  state.mode = 'easy';

  // Footer bar
  const footer = document.createElement('div');
  footer.className = 'footer-bar';
  footer.innerHTML = `<a href="${CFG.backUrl}" style="color:#2a7a58;font-weight:700;">WhatDatBird?</a> - by <a href="https://www.rutherfordecology.co.nz/" target="_blank" style="color:#9b9890;">Rutherford Ecology</a> - <a href="https://buymeacoffee.com/rutherfordecology" target="_blank" style="color:#d4a84b;font-weight:700;">&#x2615; Buy me a coffee</a> <span style="opacity:0.4;font-size:0.75em">${APP_VERSION}</span>`;
  document.body.appendChild(footer);

  render();
}
