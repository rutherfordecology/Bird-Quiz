// WhatDatBird? Quiz Engine v5.1
// Shared engine for all quiz pages.
// Each page calls: initEngine(config)
const APP_VERSION = 'v5.1';

// ── Config ────────────────────────────────────────────────────────────────
let CFG = {};

// ── Constants ─────────────────────────────────────────────────────────────
const STREAK_TARGET = 10;
const CONFETTI_COLORS = ['#1a5940','#2a7a58','#6dba9a','#d4a84b','#2c5f8a','#7aaed4','#8a6020','#d47a7a'];
const CORRECT_MSGS = ['Amazing!','Brilliant!','Yes!','On fire!','Super!','Spot on!','Nailed it!','Perfect!','Woohoo!','Awesome!','Great job!','Fantastic!'];
const STREAK_MSGS  = {3:'3 in a row!', 5:'5 streak - flying!', 7:'Lucky 7!', 9:'One more!!!'};
const GH_TOKEN = ['github','pat','11CD5YDQQ0BqwCXNYdVbgz_5iHfac6fd0MNVZZLhiPrnFnFTzcTj8N7l1MQ7ro9gn6CNE4N7VHlt7DOCis'].join('_');
const GH_REPO  = 'rutherfordecology/WhatDatBird';
const GH_FILE  = 'quizzes.json';
const LB_FILE  = 'leaderboard.json';

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

async function fetchInatImage(bird) {
  const latin = typeof bird === 'string' ? bird : (bird.latin || bird.name);
  const inatId = typeof bird === 'object' ? bird.inatId : null;
  const cacheKey = latin;

  if (!inatPhotoCache[cacheKey]) {
    try {
      const photos = [];
      const preloaded = typeof bird === 'object' ? bird.defaultPhoto : null;
      if (preloaded) photos.push(preloaded);

      // Fetch carousel photos from observations (single API call)
      const or = await fetch(`https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(latin)}&photos=true&per_page=20&quality_grade=research&order_by=faves&iconic_taxa=Aves`);
      if (or.ok) {
        const od = await or.json();
        for (const o of (od.results || [])) {
          if ((o.faves_count || 0) >= 0) {
            for (const p of (o.photos || [])) {
              const src = p.url?.replace('/square.', '/medium.');
              if (src && !photos.includes(src)) photos.push(src);
            }
          }
        }
      }

      // If no defaultPhoto, fall back to taxa endpoint
      if (!photos.length) {
        const taxaUrl = inatId
          ? `https://api.inaturalist.org/v1/taxa/${inatId}`
          : `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(latin)}&rank=species&per_page=1`;
        const tr = await fetch(taxaUrl);
        if (tr.ok) {
          const td = await tr.json();
          const taxon = inatId ? td.results?.[0] : td.results?.find(t => t.name.toLowerCase() === latin.toLowerCase());
          const dp = taxon?.default_photo?.url?.replace('/square.', '/medium.');
          if (dp) photos.push(dp);
        }
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
async function fetchIDNote(wikiUrl) {
  if (!wikiUrl) return null;
  if (wikiSummaryCache[wikiUrl] !== undefined) return wikiSummaryCache[wikiUrl];
  try {
    const title = decodeURIComponent(wikiUrl.split('/wiki/').pop());
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&redirects=1&prop=extracts&explaintext=true&exsectionformat=plain&format=json&origin=*`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    const extract = Object.values(d.query.pages)[0]?.extract || '';
    const sectionMatch = extract.match(/\n=+\s*(description|identification|appearance|plumage)\s*=+\s*\n([\s\S]+?)(?=\n=+\s|\s*$)/i);
    let text;
    if (sectionMatch) {
      text = sectionMatch[2].replace(/\n+/g,' ').trim().split(/(?<=[.!?])\s+/).slice(0,3).join(' ').trim();
    } else {
      const intro = extract.split('\n').find(l => l.trim().length > 40) || '';
      text = intro.split(/(?<=[.!?])\s+/).slice(0,2).join(' ').trim();
    }
    wikiSummaryCache[wikiUrl] = text || null;
    return wikiSummaryCache[wikiUrl];
  } catch { wikiSummaryCache[wikiUrl]=null; return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function getOptions(correct, pool) {
  const others     = shuffle(pool.filter(b => b.name !== correct.name));
  const correctIds = correct.ancestorIds || [];
  const correctSet = new Set(correctIds);

  if (correctSet.size > 0 && others.length >= 3) {
    // Score by deepest shared ancestor position (later in the array = more specific)
    const scored = others.map(b => {
      const shared = (b.ancestorIds || []).filter(id => correctSet.has(id));
      // Use the highest index of any shared ancestor in the correct bird's ancestor list
      const depth = shared.length > 0
        ? Math.max(...shared.map(id => correctIds.indexOf(id)))
        : -1;
      return { b, depth, shared: shared.length };
    });
    scored.sort((a, b) => b.depth - a.depth || b.shared - a.shared);

    // Build distractors: at least 2 from the top 6, 1 allowed from top 12 for variety
    const top6  = scored.slice(0, Math.min(6,  scored.length));
    const top12 = scored.slice(6, Math.min(12, scored.length));
    const picks = shuffle(top6).slice(0, 3);
    if (picks.length < 3 && top12.length > 0) {
      picks.push(...shuffle(top12).slice(0, 3 - picks.length));
    }
    return shuffle([correct.name, ...picks.slice(0, 3).map(s => s.b.name)]);
  }

  // Fallback: same genus first, then rest
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

  const header = isQuiz ? '' : state.phase === 'about' ? `
    <div class="header fade">
      <div class="eyebrow">WHATDATBIRD?</div>
      <h1>WhatDatBird?</h1>
      <div class="header-brand"><a href="${CFG.homeUrl||'https://rutherfordecology.github.io/WhatDatBird/'}" target="${CFG.homeUrl?'_self':'_blank'}"><span class="by-word">by </span><span class="re-bold">Rutherford</span> <span class="re-light">ecology</span></a></div>
    </div>` : `
    <div class="header fade">
      ${CFG.headerPhotoHtml ? CFG.headerPhotoHtml() : ''}
      <div class="eyebrow">${CFG.eyebrow || CFG.placeName.toUpperCase() + ' - FIELD GUIDE'} <span style="opacity:0.5;font-weight:400;letter-spacing:0.05em;">${APP_VERSION}</span></div>
      <h1>${CFG.title || 'WhatDatBird?<br><span style="font-size:1.3rem;font-weight:700;color:#2a7a58;">' + CFG.placeName + '</span>'}</h1>
      <p>Can you get ${STREAK_TARGET} in a row?</p>
      <div class="header-brand"><a href="${CFG.homeUrl||'https://rutherfordecology.github.io/WhatDatBird/'}" target="${CFG.homeUrl?'_self':'_blank'}"><span class="by-word">by </span><span class="re-bold">Rutherford</span> <span class="re-light">ecology</span></a></div>
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

  // Result
  if (state.phase==='result') {
    renderResult(app, header);
    return;
  }

  // Quiz
  renderQuiz(app);
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
      <div class="mode-desc">Most of the list - dedicated trip territory.</div>
    </button>
    <button class="mode-btn ${state.mode==='complete'?'active':''}" ${hasComplete?'':'disabled'} onclick="setMode('complete')">
      <div class="mode-emoji">&#128301;</div>
      <div class="mode-count" id="mc-complete">${hasComplete?complete.length+' SPECIES':'Loading...'}</div>
      <div class="mode-title">Complete</div>
      <div class="mode-desc">Everything ever recorded - including vagrants.</div>
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
    <div class="info-box">
      <p>&#127919; Get your score to <strong>${STREAK_TARGET} to win!</strong> Each correct answer scores +1, wrong answers cost -2. Tricky birds keep coming back. Photos are real iNaturalist observations. &#127775;</p>
    </div>
    ${bufferNote}
    <button class="btn-primary" onclick="startQuiz()">Let's Go! &#128640;</button>
    <button class="btn-secondary" onclick="setState({phase:'species'})">&#128203; Species List</button>
    <button class="btn-back" onclick="setState({phase:'about'})">&#8505; About WhatDatBird?</button>
    <button class="btn-back" onclick="window.location.href='${CFG.backUrl}'">&#8592; All Quizzes</button>`;
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

  const saveBtn = CFG.placeId ? `
    <button class="btn-save-library" id="saveLibBtn" onclick="saveToLibrary()">&#127757; Add to Quiz Library</button>
    <div id="saveLibMsg" style="font-size:0.8rem;color:#2a7a58;margin-top:8px;min-height:1.2em;text-align:center;font-weight:700;"></div>` : '';

  const lbSection = CFG.placeId ? `
    <div class="lb-entry" id="lbEntry">
      <div class="lb-label">&#127942; Add your score to the leaderboard</div>
      <div class="lb-row">
        <input class="lb-input" id="lbName" type="text" maxlength="24" placeholder="Your name" autocomplete="off">
        <button class="lb-submit" onclick="submitScore(${state.totalSeen})">Submit</button>
      </div>
      <div id="lbMsg" style="font-size:0.78rem;color:#2a7a58;margin-top:6px;min-height:1em;text-align:center;font-weight:700;"></div>
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
  if (CFG.placeId) {
    loadLeaderboard();
    checkInLibrary();
  }
}

async function checkInLibrary() {
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!r.ok) return;
    const d = await r.json();
    const data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))).replace(/^﻿/, ''));
    if (data.quizzes.some(q => String(q.place_id) === String(CFG.placeId))) {
      const btn = document.getElementById('saveLibBtn');
      const msg = document.getElementById('saveLibMsg');
      if (btn) btn.style.display = 'none';
      if (msg) msg.style.display = 'none';
    }
  } catch {}
}

function renderQuiz(app) {
  const bird = state.current;
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

  const optionsHtml = state.options.map(opt => {
    let cls='option';
    if(state.selected){if(opt===bird.name)cls+=' correct';else if(opt===state.selected)cls+=' wrong';else cls+=' dimmed';}
    const safe=opt.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const matchBird=pool.find(b=>b.name===opt);
    const indLabel = matchBird?.[CFG.indigenousField] ? `<span class="opt-indigenous">${matchBird[CFG.indigenousField]}</span>` : '';
    const latinLabel = matchBird?.latin ? `<span class="opt-latin-small">${matchBird.latin}</span>` : '';
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
      <div class="img-box" id="imgBox">${imgContent}${overlay}${carousel}</div>
      <p class="question-text">&#128269; Which bird is this?</p>
      <div class="options">${optionsHtml}</div>
      ${fieldNote}
    </div>`;
}

function renderSpeciesList(app, header) {
  const birds = CFG.completeBirds || CFG.hardBirds || CFG.easyBirds;
  const sorted = [...birds].sort((a,b) => (b.count||0)-(a.count||0));
  const rows = sorted.map(bird => {
    const ebirdUrl=`https://ebird.org/search?q=${encodeURIComponent(bird.name)}`;
    const inatUrl=`https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(bird.latin||bird.name)}`;
    const rarity = CFG.rarity?.[bird.name];
    const rarityPill = rarity ? `<span class="rarity-pill rarity-${rarity}">${rarity.charAt(0).toUpperCase()+rarity.slice(1)}</span>` : '';
    const countBadge = bird.count ? `<span class="obs-count">${bird.count.toLocaleString()} iNat obs</span>` : '';
    const samoanRow = bird[CFG.indigenousField] ? `<div class="sp-samoan">${bird[CFG.indigenousField]}</div>` : '';
    const noteRow = bird.note ? `<div class="sp-note">${bird.note}</div>` : '';
    const badges = birdBadges(bird);
    return `<div class="sp-item">
      <div class="sp-name-row">
        <a class="sp-name" href="${ebirdUrl}" target="_blank">${bird.name}</a>
        <span class="sp-latin">${bird.latin||''}</span>
      </div>
      ${samoanRow}
      <div class="sp-meta-row">${rarityPill}${countBadge}<a href="${inatUrl}" target="_blank" style="font-size:0.7rem;color:#9b9890;">iNat &#8594;</a></div>
      ${noteRow}
      ${badges?`<div class="sp-badges">${badges}</div>`:''}
    </div>`;
  }).join('');

  app.innerHTML = header + `
    <div class="fade">
      <button class="btn-secondary" style="margin-bottom:12px" onclick="goIntro()">&#8592; Back</button>
      <div class="info-box"><p>&#128203; <strong>${birds.length} species</strong> - sorted by iNaturalist observation count. Click any name to open its eBird page.</p></div>
      ${rows}
    </div>`;
}

function renderAbout(app, header) {
  app.innerHTML = header + `
    <div class="fade">
      <button class="btn-secondary" style="margin-bottom:16px" onclick="goIntro()">&#8592; Back</button>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">WHAT IS THIS?</div>
        <p class="fn-main">WhatDatBird? is a photo identification quiz for birds. Pick a location, get 10 correct in a row to win. Wrong answers keep coming back until you nail them. Photos are real observations from iNaturalist contributors worldwide.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">THE DATA</div>
        <p class="fn-main"><strong>Species lists</strong> come from iNaturalist research-grade observations, filtered to the last 15 years and ordered by observation count. This means you see the birds people actually encounter, not historical-only records.</p>
        <p class="fn-main" style="margin-top:8px"><strong>Photos</strong> are iNaturalist observations ordered by community faves (likes). They are quality-filtered using pixel colour variance analysis - the app checks a 40x40 pixel sample of each image, measuring overall colour variance and comparing the centre of the image to the edges to reject habitat-only shots and distant specks.</p>
        <p class="fn-main" style="margin-top:8px"><strong>Field notes</strong> are pulled from the Description or Identification section of each species' Wikipedia article - not the intro paragraph, which is usually general facts rather than ID tips.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">DIFFICULTY TIERS</div>
        <p class="fn-main"><strong>Common</strong> - the top 25 most-observed species. Birds you'd expect to see on a casual walk.</p>
        <p class="fn-main" style="margin-top:6px"><strong>Birder</strong> - 90% of the species list (max 150). Requires a dedicated trip. For megadiverse places like Colombia this is genuinely hard.</p>
        <p class="fn-main" style="margin-top:6px"><strong>Complete</strong> - every species with an iNaturalist record in the last 15 years, including rare vagrants.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">WRONG ANSWERS</div>
        <p class="fn-main">Wrong answer options are chosen by taxonomic relatedness. Each species carries an array of iNaturalist ancestor taxon IDs. The app finds the 6 most closely related species in the pool (most shared ancestors = closest relatives), then randomly picks 3 from that group. This ensures you're distinguishing visually similar birds rather than comparing a heron with a parrot.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">AREA BUFFER</div>
        <p class="fn-main">If fewer than 15 species are recorded within a location's boundaries, the app automatically expands the search radius (5km, 10km, 25km, 50km) until it finds enough species. It fetches the place's centroid coordinates from iNaturalist and switches from a place_id search to a lat/lng/radius search.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">THE QUIZ LIBRARY</div>
        <p class="fn-main">When you complete a dynamic quiz, you can add it to the shared library. The app writes directly to quizzes.json in the GitHub repository using the GitHub Contents API - no server required. The iNaturalist ancestor hierarchy is used to automatically detect continent and country for grouping. Changes appear on the dashboard within about a minute after GitHub Pages redeploys.</p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">BUILT WITH</div>
        <p class="fn-main">
          <a href="https://www.gbif.org" target="_blank" style="color:#2a7a58">GBIF</a> - species lists and occurrence data (includes eBird)<br>
          <a href="https://www.inaturalist.org" target="_blank" style="color:#2a7a58">iNaturalist</a> - photos and common names (CC licensed)<br>
          <a href="https://en.wikipedia.org" target="_blank" style="color:#2a7a58">Wikipedia</a> - field notes<br>
          <a href="https://ebird.org" target="_blank" style="color:#2a7a58">eBird</a> - species page links<br>
          GitHub Pages - free static hosting<br>
          No backend, no database, no login.
        </p>
      </div>

      <div class="field-note" style="margin-bottom:12px">
        <div class="fn-label">KNOWN LIMITATIONS</div>
        <p class="fn-main">iNaturalist coverage varies enormously by region - well-studied areas have rich data, remote areas may have very few records. Photo quality filtering is heuristic and will occasionally let through bad images or reject good ones. Wikipedia ID sections exist for common species but may be absent for obscure ones.</p>
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
function prevPhoto() { const i=(state.photoIdx-1+state.photoUrls.length)%state.photoUrls.length; setState({photoIdx:i,imgUrl:state.photoUrls[i]}); }
function nextPhoto() { const i=(state.photoIdx+1)%state.photoUrls.length; setState({photoIdx:i,imgUrl:state.photoUrls[i]}); }
function goPhoto(i)  { setState({photoIdx:i,imgUrl:state.photoUrls[i]}); }
function setMode(m)  { setState({mode:m}); }
function goIntro()   { setState({phase:'intro'}); }

function startQuiz() {
  const pool=getPool();
  const queue=shuffle([...pool]);
  const first=queue.shift();
  setState({phase:'quiz',queue,wrongBin:[],current:first,streak:0,streakHistory:[],totalSeen:0,totalCorrect:0,selected:null,imgUrl:null,imgLoading:true,photoUrls:[],photoIdx:0,options:getOptions(first,pool)});
  fetchImage(first, state.mode).then(url => {
    const all=(inatPhotoCache[first.latin||first.name]||[]).slice(0,5);
    const photoUrls=url?[url,...all.filter(u=>u!==url)].slice(0,5):all;
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
  if(newStreak>=STREAK_TARGET) setTimeout(()=>setState({phase:'result'}),2000);
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
  setState({current:next,queue,wrongBin,selected:null,imgUrl:null,imgLoading:true,photoUrls:[],photoIdx:0,options:getOptions(next,pool)});
  fetchImage(next, state.mode).then(url => {
    const all=(inatPhotoCache[next.latin||next.name]||[]).slice(0,5);
    const photoUrls=url?[url,...all.filter(u=>u!==url)].slice(0,5):all;
    setState({imgUrl:url,imgLoading:false,photoUrls,photoIdx:0});
  });
  // Prefetch current bird's field note and next bird's photos + note
  if (next.wikiUrl && !next.note) fetchIDNote(next.wikiUrl).catch(() => {});
  const prefetchBird = queue[0] || wrongBin[0]?.bird;
  if (prefetchBird) {
    fetchInatImage(prefetchBird).catch(() => {});
    if (prefetchBird.wikiUrl && !prefetchBird.note) fetchIDNote(prefetchBird.wikiUrl).catch(() => {});
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
        <span class="lb-score">${e.score} birds</span>
        <span class="lb-date">${e.date}</span>
      </div>`).join('');
  } catch { board.innerHTML = ''; }
}

async function submitScore(totalSeen) {
  const nameEl = document.getElementById('lbName');
  const msgEl  = document.getElementById('lbMsg');
  const entry  = document.getElementById('lbEntry');
  const name   = nameEl?.value?.trim();
  if (!name) { if (msgEl) { msgEl.style.color='#8a2c2c'; msgEl.textContent='Please enter your name.'; } return; }
  if (msgEl) { msgEl.style.color='#2a7a58'; msgEl.textContent='Saving...'; }

  try {
    const { sha, data } = await readLB();
    if (!data.boards) data.boards = {};
    const key = `${CFG.placeId}_${state.mode}`;
    if (!data.boards[key]) data.boards[key] = [];
    data.boards[key].push({ name, score: totalSeen, date: new Date().toISOString().split('T')[0] });
    data.boards[key].sort((a, b) => a.score - b.score);
    data.boards[key] = data.boards[key].slice(0, 10);

    const body = JSON.stringify({
      message: `Leaderboard: ${name} scored ${totalSeen} at ${CFG.placeName}`,
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
  const btn = document.getElementById('saveLibBtn');
  const msg = document.getElementById('saveLibMsg');
  if (!btn || !CFG.placeId) return;
  btn.disabled = true;
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

  if (data.quizzes.some(q => String(q.place_id) === String(CFG.placeId))) {
    msg.textContent = 'Already in the library!';
    btn.style.display = 'none';
    return;
  }

  // 2. Fetch place metadata from iNat
  msg.textContent = 'Fetching place info...';
  let continent = 'Other', country = CFG.placeName, photoTaxon = null;
  try {
    const placeR = await fetch(`https://api.inaturalist.org/v1/places/${CFG.placeId}`);
    const placeD = await placeR.json();
    const place  = placeD.results?.[0];
    const ancestorIds = (place?.ancestor_place_ids || []).join(',');
    if (ancestorIds) {
      const ancR = await fetch(`https://api.inaturalist.org/v1/places?id=${ancestorIds}&per_page=100`);
      const ancD = await ancR.json();
      const ancs = ancD.results || [];
      continent = ancs.find(a => a.place_type === 1)?.display_name || 'Other';
      country   = ancs.find(a => a.place_type === 12)?.display_name
               || ancs.find(a => a.place_type === 2)?.display_name
               || CFG.placeName;
    }
    const spR = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?place_id=${CFG.placeId}&iconic_taxa=Aves&quality_grade=research&per_page=1&order_by=observations_count&order=desc`);
    const spD = await spR.json();
    photoTaxon = spD.results?.[0]?.taxon?.name || null;
  } catch (e) {
    // Non-fatal — save with defaults
    console.warn('iNat metadata fetch failed:', e.message);
  }

  // 3. Write updated quizzes.json to GitHub
  msg.textContent = 'Saving...';
  data.quizzes.push({
    name:        `WhatDatBird? - ${CFG.placeName}`,
    continent,
    country,
    description: `${CFG.placeName} - ${country}`,
    species:     null,
    type:        'dynamic',
    url:         `quiz.html?place_id=${CFG.placeId}&place_name=${encodeURIComponent(CFG.placeName)}`,
    place_id:    Number(CFG.placeId),
    photo_taxon: photoTaxon,
    added:       new Date().toISOString().split('T')[0],
  });
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
    msg.textContent = 'Added! Will appear in ~1 minute.';
    btn.style.display = 'none';
  } catch (e) {
    msg.style.color = '#8a2c2c';
    msg.textContent = `Save failed: ${e.message}`;
    btn.disabled = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
function initEngine(config) {
  CFG = config;
  CFG.indigenousField = config.indigenousField || 'samoan';
  CFG.easyUseWiki = config.easyUseWiki || false;

  // Compute tiers if not provided
  if (!CFG.easyBirds) CFG.easyBirds = [];

  // Default mode to easy
  state.mode = 'easy';

  // Footer bar
  const footer = document.createElement('div');
  footer.className = 'footer-bar';
  footer.innerHTML = `<a href="${CFG.backUrl}" style="color:#2a7a58;font-weight:700;">WhatDatBird?</a> - by <a href="https://www.rutherfordecology.co.nz/" target="_blank" style="color:#9b9890;">Rutherford Ecology</a> - <a href="https://buymeacoffee.com/rutherfordecology" target="_blank" style="color:#d4a84b;font-weight:700;">&#x2615; Buy me a coffee</a>`;
  document.body.appendChild(footer);

  render();
}
