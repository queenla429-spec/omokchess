/*! 티어 엠블럼 (직접 그린 SVG). 날개·보석·왕관이 티어가 높을수록 커지는 구성 */
(function(root){
  // w=날개(밝음,중간,어두움)  g=보석  glow=후광  wings=날개 겹 수  crown=왕관 가시 수  extra=장식
  const T={
    bronze:{w:['#e8b48a','#b5703b','#5e3318'],g:['#ffe0c0','#e29a5b','#8a4a1e'],glow:'#e29a5b',wings:1,crown:0,s:.82},
    silver:{w:['#f1f5fa','#aeb9c7','#59667a'],g:['#ffffff','#cfdbec','#7b8aa3'],glow:'#cfdbec',wings:2,crown:0,s:.88},
    gold:{w:['#fff0a8','#f0b92e','#8f5f00'],g:['#fffbe0','#ffd54f','#b8860b'],glow:'#ffd54f',wings:3,crown:0,s:.94},
    platinum:{w:['#b8fff5','#3fc9bb','#0b5f59'],g:['#e8fffb','#7ff0e2','#169488'],glow:'#5eead4',wings:3,crown:0,s:1,plume:1},
    diamond:{w:['#d4e6ff','#5b9bff','#1e3f9e'],g:['#ffffff','#a9d1ff','#3b6fe0'],glow:'#7fb2ff',wings:3,crown:0,s:1.04,sparkle:1},
    master:{w:['#e9c9ff','#a45cf0','#4a1580'],g:['#fff0ff','#e09bff','#8a2fd0'],glow:'#c084fc',wings:4,crown:3,s:1.06},
    challenger:{w:['#fff0a8','#f2b21a','#8a5a00'],g:['#e6fbff','#58d6ff','#1479c9'],glow:'#4fc3f7',wings:4,crown:5,s:1.1,flame:1},
    champion:{w:['#ffe9a0','#ff9d2e','#a23a00'],g:['#fff0f0','#ff6a86','#b3123a'],glow:'#ff8a3d',wings:4,crown:5,s:1.1,stars:1,ball:1},
    placement:{w:['#e5e7eb','#9ca3af','#4b5563'],g:['#ffffff','#d1d5db','#6b7280'],glow:'#9ca3af',wings:1,crown:0,s:.8,q:1}
  };
  const WING='M22 28 L19 22 L11 16 L4 8 L7 17 L1 15 L7 22 L1 24 L8 28 L3 33 L11 32 L8 39 L16 34 L20 37 Z';
  let seq=0;   // [수정] 그림마다 고유 id — 숨겨진 화면에 먼저 그려진 엠블럼 때문에 다른 엠블럼 색이 사라지던 문제
  function svg(id){
    const n=++seq;
    if(id==='ai')return `<svg class="emb" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="t_ai${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect x="6" y="8" width="36" height="32" rx="9" fill="url(#t_ai${n})" stroke="#1e3a8a" stroke-width="1.6"/><circle cx="17" cy="22" r="3.4" fill="#fff"/><circle cx="31" cy="22" r="3.4" fill="#fff"/><path d="M16 32h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M24 8V3" stroke="#1e3a8a" stroke-width="2.2"/><circle cx="24" cy="3" r="2" fill="#ffd24a"/></svg>`;
    const c=T[id];
    if(!c)return `<svg class="emb" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="12" fill="#c5c9bd" stroke="#8d9583" stroke-width="2"/></svg>`;
    const u=id+n,d=[];
    d.push(`<defs><linearGradient id="w_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.w[0]}"/><stop offset=".55" stop-color="${c.w[1]}"/><stop offset="1" stop-color="${c.w[2]}"/></linearGradient>`+
      `<linearGradient id="g_${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.g[0]}"/><stop offset=".5" stop-color="${c.g[1]}"/><stop offset="1" stop-color="${c.g[2]}"/></linearGradient>`+
      `<radialGradient id="l_${u}"><stop offset="0" stop-color="${c.glow}" stop-opacity=".6"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient></defs>`);
    if(c.wings>=3||c.flame)d.push(`<circle cx="24" cy="26" r="${c.flame?22:19}" fill="url(#l_${u})"/>`);
    const stroke=`stroke="${c.w[2]}" stroke-width=".7" stroke-linejoin="round"`;
    for(let l=0;l<c.wings;l++){const s=(1-l*.17)*c.s,dy=l*1.2;
      const g=`<g transform="translate(22 ${28-dy}) scale(${s.toFixed(3)}) translate(-22 -28)"><path d="${WING}" fill="${l===0?`url(#w_${u})`:(l%2?c.w[0]:`url(#w_${u})`)}" ${stroke} opacity="${l?.95:1}"/></g>`;
      d.push(g);d.push(`<g transform="translate(48 0) scale(-1 1)">${g}</g>`)}
    if(c.plume)d.push(`<path d="M24 15 L20 4 L24 9 L28 4 Z" fill="url(#g_${u})" ${stroke}/>`);
    if(c.flame)d.push(`<path transform="translate(0 2)" d="M24 14 C18 10 21 6 20 1 C23 4 24 5 24 5 C24 5 25 4 28 1 C27 6 30 10 24 14 Z" fill="#7fe3ff" stroke="#0b5f8a" stroke-width=".7"/>`);
    if(c.crown){const n=c.crown,pts=[];const w=14,x0=24-w/2;
      let p=`M${x0} 15`;for(let i=0;i<n;i++){const xa=x0+w*(i+.5)/n,xb=x0+w*(i+1)/n,h=(i===(n-1)/2)?3:6;p+=` L${xa.toFixed(1)} ${h} L${xb.toFixed(1)} 14`}
      p+=` L${x0+w} 15 Z`;d.push(`<path d="${p}" fill="url(#w_${u})" ${stroke}/>`);
      if(c.ball)for(let i=0;i<n;i++){const xa=x0+w*(i+.5)/n,h=(i===(n-1)/2)?3:6;d.push(`<circle cx="${xa.toFixed(1)}" cy="${h}" r="1.3" fill="#fff6c0" stroke="${c.w[2]}" stroke-width=".5"/>`)}}
    const gt=c.crown?15:13;
    d.push(`<path d="M24 ${gt} L31 24 L24 41 L17 24 Z" fill="url(#g_${u})" stroke="${c.w[2]}" stroke-width="1" stroke-linejoin="round"/>`);
    d.push(`<path d="M24 ${gt} L31 24 L24 28 L17 24 Z" fill="#fff" opacity=".28"/><path d="M17 24 L31 24 M24 ${gt} L24 41" stroke="#fff" stroke-width=".6" opacity=".5"/>`);
    if(c.sparkle)for(const[x,y,r]of[[11,10,3],[38,8,2.2],[40,30,2]])d.push(`<path d="M${x} ${y-r} L${x+r*.3} ${y-r*.3} L${x+r} ${y} L${x+r*.3} ${y+r*.3} L${x} ${y+r} L${x-r*.3} ${y+r*.3} L${x-r} ${y} L${x-r*.3} ${y-r*.3} Z" fill="#fff" opacity=".95"/>`);
    if(c.stars)for(const[x,y]of[[9,8],[39,8]])d.push(`<path d="M${x} ${y-3} L${x+1} ${y-1} L${x+3} ${y} L${x+1} ${y+1} L${x} ${y+3} L${x-1} ${y+1} L${x-3} ${y} L${x-1} ${y-1} Z" fill="#ffe27a" stroke="#a23a00" stroke-width=".4"/>`);
    if(c.q)d.push(`<text x="24" y="31" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="900" fill="#4b5563">?</text>`);
    return `<svg class="emb" viewBox="0 0 48 48" aria-hidden="true">${d.join('')}</svg>`;
  }
  const api={svg,ids:Object.keys(T)};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TierEmblem=api;
})(typeof window!=='undefined'?window:globalThis);
