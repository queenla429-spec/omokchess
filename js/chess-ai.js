/*! © 2026 삼대710 계열 프로젝트 — 체스 AI: 자체 엔진(0x88) + 반복심화 알파-베타 + 정지탐색. chess.js 없이 동작 */
(function(){
  const FILES='abcdefgh', VAL=[0,100,320,330,500,900,0], MATE=30000, INF=1e6;
  const NO=[14,18,31,33,-14,-18,-31,-33], KO=[1,-1,16,-16,15,17,-15,-17], RO=[1,-1,16,-16], BO=[15,17,-15,-17];
  // 위치 점수표 (백 기준, 위쪽 줄 = 8랭크)
  const PST=[null,
   [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
   [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
   [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
   [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
   [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
   [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]];
  const KEND=[-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
  const RM=new Uint8Array(128).fill(15);RM[0]=13;RM[7]=14;RM[4]=12;RM[112]=7;RM[119]=11;RM[116]=3;
  let nodes=0,stop=false,deadline=0;const killers=[],hist=new Int32Array(128*128);

  class Pos{
    constructor(){this.b=new Int8Array(128);this.side=1;this.cs=0;this.ep=-1;this.ks=[4,116];this.st=[]}
    static fromFen(f){const p=new Pos(),[pl,s,c,e]=f.split(' ');let r=7,fl=0;
      for(const ch of pl){if(ch==='/'){r--;fl=0}else if(/\d/.test(ch))fl+=+ch;else{const t='pnbrqk'.indexOf(ch.toLowerCase())+1,w=ch===ch.toUpperCase(),sq=r*16+fl;p.b[sq]=w?t:-t;if(t===6)p.ks[w?0:1]=sq;fl++}}
      p.side=s==='b'?-1:1;p.cs=(c.includes('K')?1:0)|(c.includes('Q')?2:0)|(c.includes('k')?4:0)|(c.includes('q')?8:0);
      p.ep=(e&&e!=='-')?(+e[1]-1)*16+FILES.indexOf(e[0]):-1;return p}
    static start(){return Pos.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}
    static fromMoves(ms){const p=Pos.start();for(const u of ms||[]){const f=FILES.indexOf(u[0])+(+u[1]-1)*16,t=FILES.indexOf(u[2])+(+u[3]-1)*16,pr=u[4]?'pnbrqk'.indexOf(u[4])+1:0;
        const m=p.legal().find(m=>(m&255)===f&&((m>>8)&255)===t&&((m>>16)&15)===pr);if(!m)throw new Error('illegal '+u);p.make(m)}return p}
    att(sq,by){const b=this.b,pd=by>0?-16:16;
      for(const dx of[-1,1]){const a=sq+pd+dx;if(!(a&0x88)&&b[a]===by)return true}
      for(const o of NO){const a=sq+o;if(!(a&0x88)&&b[a]===by*2)return true}
      for(const o of KO){const a=sq+o;if(!(a&0x88)&&b[a]===by*6)return true}
      for(const o of RO){let a=sq+o;while(!(a&0x88)){const x=b[a];if(x){if(x===by*4||x===by*5)return true;break}a+=o}}
      for(const o of BO){let a=sq+o;while(!(a&0x88)){const x=b[a];if(x){if(x===by*3||x===by*5)return true;break}a+=o}}
      return false}
    gen(caps){const out=[],b=this.b,s=this.side;
      for(let sq=0;sq<128;sq++){if(sq&0x88){sq+=7;continue}const p=b[sq];if(!p||(p>0)!==(s>0))continue;const t=p>0?p:-p;
        if(t===1){const d=s>0?16:-16,st=s>0?1:6,last=s>0?7:0,to=sq+d;
          if(!(to&0x88)&&!b[to]){if((to>>4)===last){for(const pr of[5,4,3,2])out.push(sq|to<<8|pr<<16)}else if(!caps){out.push(sq|to<<8);if((sq>>4)===st&&!b[to+d])out.push(sq|(to+d)<<8|4<<20)}}
          for(const dx of[-1,1]){const c=sq+d+dx;if(c&0x88)continue;
            if(b[c]&&(b[c]>0)!==(s>0)){if((c>>4)===last){for(const pr of[5,4,3,2])out.push(sq|c<<8|pr<<16)}else out.push(sq|c<<8)}
            else if(c===this.ep)out.push(sq|c<<8|1<<20)}}
        else if(t===2||t===6){for(const o of(t===2?NO:KO)){const to=sq+o;if(to&0x88)continue;const x=b[to];if(!x||(x>0)!==(s>0)){if(caps&&!x)continue;out.push(sq|to<<8)}}
          if(t===6&&!caps){const h=s>0?4:116;if(sq===h){
            if((this.cs&(s>0?1:4))&&!b[h+1]&&!b[h+2]&&b[h+3]===s*4&&!this.att(h,-s)&&!this.att(h+1,-s)&&!this.att(h+2,-s))out.push(sq|(h+2)<<8|2<<20);
            if((this.cs&(s>0?2:8))&&!b[h-1]&&!b[h-2]&&!b[h-3]&&b[h-4]===s*4&&!this.att(h,-s)&&!this.att(h-1,-s)&&!this.att(h-2,-s))out.push(sq|(h-2)<<8|2<<20)}}}
        else{for(const o of(t===3?BO:t===4?RO:KO)){let to=sq+o;while(!(to&0x88)){const x=b[to];if(!x){if(!caps)out.push(sq|to<<8)}else{if((x>0)!==(s>0))out.push(sq|to<<8);break}to+=o}}}}
      return out}
    make(m){const b=this.b,f=m&255,t=(m>>8)&255,pr=(m>>16)&15,fl=(m>>20)&15,p=b[f],s=this.side;
      this.st.push([m,b[t],this.cs,this.ep]);b[t]=pr?s*pr:p;b[f]=0;
      if(fl&1)b[t-(s>0?16:-16)]=0;
      if(fl&2){if(t>f){b[t-1]=b[t+1];b[t+1]=0}else{b[t+1]=b[t-2];b[t-2]=0}}
      if((p>0?p:-p)===6)this.ks[s>0?0:1]=t;
      this.cs&=RM[f]&RM[t];this.ep=(fl&4)?(f+t)>>1:-1;this.side=-s;
      return !this.att(this.ks[s>0?0:1],-s)}
    undo(){const[m,cap,cs,ep]=this.st.pop(),b=this.b,f=m&255,t=(m>>8)&255,pr=(m>>16)&15,fl=(m>>20)&15;this.side=-this.side;const s=this.side;
      const p=pr?s:b[t];b[f]=pr?s:p;b[t]=cap;
      if(fl&1)b[t-(s>0?16:-16)]=-s;
      if(fl&2){if(t>f){b[t+1]=b[t-1];b[t-1]=0}else{b[t-2]=b[t+1];b[t+1]=0}}
      if((b[f]>0?b[f]:-b[f])===6)this.ks[s>0?0:1]=f;
      this.cs=cs;this.ep=ep}
    legal(){const o=[];for(const m of this.gen(false)){if(this.make(m))o.push(m);this.undo()}return o}
    perft(d){if(!d)return 1;let n=0;for(const m of this.gen(false)){if(this.make(m))n+=this.perft(d-1);this.undo()}return n}
    evalPos(){const b=this.b;let s=0,mat=0,bw=0,bb=0;
      for(let q=0;q<128;q++){if(q&0x88){q+=7;continue}const p=b[q];if(p){const t=p>0?p:-p;if(t>1&&t<6)mat+=VAL[t]}}
      const eg=mat<2600;
      for(let q=0;q<128;q++){if(q&0x88){q+=7;continue}const p=b[q];if(!p)continue;const t=p>0?p:-p,r=q>>4,f=q&7,i=p>0?(7-r)*8+f:r*8+f,tb=t===6?(eg?KEND:PST[6]):PST[t],v=VAL[t]+tb[i];
        if(p>0){s+=v;if(t===3)bw++}else{s-=v;if(t===3)bb++}}
      if(bw>1)s+=30;if(bb>1)s-=30;return this.side>0?s:-s}
    order(ms,ply){const b=this.b,sc=[];
      for(const m of ms){const f=m&255,t=(m>>8)&255,pr=(m>>16)&15,fl=(m>>20)&15,v=(fl&1)?1:Math.abs(b[t]);let s=0;
        if(v)s=10000+10*VAL[v]-VAL[Math.abs(b[f])]/10;if(pr)s+=9000+VAL[pr];
        if(!v&&!pr){const k=killers[ply];s=(k&&(k[0]===m||k[1]===m))?8000:hist[f*128+t]}sc.push(s)}
      return ms.map((_,i)=>i).sort((x,y)=>sc[y]-sc[x]).map(i=>ms[i])}
    qs(alpha,beta,ply){nodes++;if((nodes&2047)===0&&Date.now()>deadline)stop=true;if(stop)return 0;
      const st=this.evalPos();if(st>=beta)return st;if(st>alpha)alpha=st;if(ply>24)return alpha;
      for(const m of this.order(this.gen(true),ply)){if(!this.make(m)){this.undo();continue}const sc=-this.qs(-beta,-alpha,ply+1);this.undo();if(stop)return 0;if(sc>=beta)return sc;if(sc>alpha)alpha=sc}
      return alpha}
    search(d,alpha,beta,ply){nodes++;if((nodes&2047)===0&&Date.now()>deadline)stop=true;if(stop)return 0;
      const chk=this.att(this.ks[this.side>0?0:1],-this.side);if(chk&&ply<30)d++;
      if(d<=0||ply>=60)return this.qs(alpha,beta,ply);
      let legal=0;
      for(const m of this.order(this.gen(false),ply)){if(!this.make(m)){this.undo();continue}legal++;
        const sc=-this.search(d-1,-beta,-alpha,ply+1);this.undo();if(stop)return 0;
        if(sc>alpha){alpha=sc;if(alpha>=beta){if(!this.b[(m>>8)&255]&&!((m>>16)&15)){const k=killers[ply]||(killers[ply]=[0,0]);if(k[0]!==m){k[1]=k[0];k[0]=m}hist[(m&255)*128+((m>>8)&255)]+=d*d}return alpha}}}
      if(!legal)return chk?-MATE+ply:0;return alpha}
  }
  const uci=m=>{const f=m&255,t=(m>>8)&255,pr=(m>>16)&15;return FILES[f&7]+((f>>4)+1)+FILES[t&7]+((t>>4)+1)+(pr?'pnbrqk'[pr-1]:'')};
  // 난이도: easy ≈ 입문, normal ≈ 중급, hard ≈ 고급
  const LV={easy:{depth:1,noise:150,rand:.22,ms:80},normal:{depth:3,noise:20,rand:0,ms:350},hard:{depth:12,noise:0,rand:0,ms:1400}};
  function pick(moves,level,opt){
    opt=opt||{};moves=moves||[];let cfg=Object.assign({},LV[level]||LV.normal);
    if(level==='hard'&&!opt.pos&&moves.length<6)cfg=Object.assign({},LV.normal,{noise:25});          // 오프닝 다양하게
    const ms=opt.ms!=null?opt.ms:cfg.ms,pos=opt.pos||Pos.fromMoves(moves),legal=pos.legal();
    if(!legal.length)return null;if(legal.length===1)return uci(legal[0]);
    if(cfg.rand&&Math.random()<cfg.rand)return uci(legal[(Math.random()*legal.length)|0]);
    deadline=Date.now()+ms;stop=false;nodes=0;killers.length=0;hist.fill(0);
    let done=null;
    for(let d=1;d<=cfg.depth;d++){
      const ord=done?done.slice().sort((a,b)=>b.s-a.s).map(x=>x.m):pos.order(legal,0),res=[];let a=-INF;
      for(const m of ord){pos.make(m);const sc=-pos.search(d-1,-INF,cfg.noise?INF:-a,1);pos.undo();if(stop)break;res.push({m,s:sc});if(!cfg.noise&&sc>a)a=sc}
      if(stop||res.length<ord.length){if(!done&&res.length)done=res;break}
      done=res;if(res.some(r=>r.s>MATE-100))break;
    }
    if(!done||!done.length)return uci(legal[0]);
    let best=done[0],bs=-INF;for(const r of done){const v=r.s+(cfg.noise?(Math.random()*2-1)*cfg.noise:0);if(v>bs){bs=v;best=r}}
    if(opt.debug)opt.debug(done.map(r=>[uci(r.m),r.s]));return uci(best.m);
  }
  window.ChessAI={pick,Pos,uci,stats:()=>({nodes})};
})();
