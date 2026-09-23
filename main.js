'use strict';
/* =================================================================
   ほしぞらさんぽ — 画面の描画と操作
   読み込み順: astro.js（天文計算）→ data.js（星座・解説）→ catalog.js（実在の星）→ この main.js
   ================================================================= */
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const smooth= (a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const $ = id=>document.getElementById(id);

/* ---------------- 保存（使えない環境でも動くように） ---------------- */
function lsGet(k){ try{return localStorage.getItem(k);}catch(e){return null;} }
function lsSet(k,v){ try{localStorage.setItem(k,v);}catch(e){} }

/* ---------------- 星をならべる ----------------
   座標は読み込み時に今日の春分点へ歳差をかける（時間たびの範囲では差は無視できる） */
const prec = precessor(Date.now());
const stars = []; // {raRad,sinD,cosD,mag,bv,name,ly,con,conName,flag,twk,sx,sy,vis,alt}
function addStar(raH, decD, mag, bv, name, ly, con, conName, flag){
  const [ra,dec]=prec(raH*15*DEG, decD*DEG);
  stars.push({raRad:ra, sinD:Math.sin(dec), cosD:Math.cos(dec), mag, bv:(bv==null?0.3:bv),
    name:name||'', ly:ly||0, con:con||null, conName:conName||'', flag:flag||'',
    twk:Math.random()*TAU, sx:0, sy:0, vis:false, alt:0});
  return stars.length-1;
}
CONS.forEach(c=>{ c.idx=c.ss.map(s=>addStar(s[0],s[1],s[2],s[3],s[4],s[5],c,'',s[6])); });
LONE.forEach(s=>addStar(s[0],s[1],s[2],s[3],s[4],s[5],null,s[6]));
(function addCatalog(){
  // 星座の星と重なるカタログの星は入れない（星団・星雲の印は実在の星と重ねたままにする）
  const near=Math.cos(0.2*DEG), known=stars.filter(s=>!s.flag).map(s=>
    [s.cosD*Math.cos(s.raRad), s.cosD*Math.sin(s.raRad), s.sinD]);
  for(let i=0;i<CATALOG.length;i+=4){
    const raH=CATALOG[i]/1000, decD=CATALOG[i+1]/100, mag=CATALOG[i+2]/100, bv=CATALOG[i+3]/100;
    const cd=Math.cos(decD*DEG), v=[cd*Math.cos(raH*15*DEG), cd*Math.sin(raH*15*DEG), Math.sin(decD*DEG)];
    if(mag<4.2 && known.some(k=>k[0]*v[0]+k[1]*v[1]+k[2]*v[2]>near)) continue;
    addStar(raH, decD, mag, bv);
  }
})();
/** 星座の中心（星の方向の平均） */
CONS.forEach(c=>{
  let x=0,y=0,z=0;
  for(const i of c.idx){ const s=stars[i]; x+=s.cosD*Math.cos(s.raRad); y+=s.cosD*Math.sin(s.raRad); z+=s.sinD; }
  const n=Math.hypot(x,y,z); c.center={raRad:Math.atan2(y,x), sinD:z/n, cosD:Math.hypot(x,y)/n};
});
const MW_PTS = MW.map(m=>{ const [ra,dec]=prec(m[0]*15*DEG,m[1]*DEG); return {raRad:ra,sinD:Math.sin(dec),cosD:Math.cos(dec),w:m[2],k:m[3]}; });
const DSO_PTS = DSO.map(d=>{ const [ra,dec]=prec(d.ra*15*DEG,d.dec*DEG); return {...d,raRad:ra,sinD:Math.sin(dec),cosD:Math.cos(dec)}; });
const ASTER_PTS = ASTER.map(a=>({...a, pts:a.pts.map(p=>{ const [ra,dec]=prec(p[0]*15*DEG,p[1]*DEG); return {raRad:ra,sinD:Math.sin(dec),cosD:Math.cos(dec)}; })}));

/* ---------------- 状態 ---------------- */
let loc = LOCS[1];                     // 東京
let offsetMs=0, scrubBase=0, playing=false, scrubbing=false;
const SPEEDS=[60,600,3600]; let speedIdx=1;
let az0=180*DEG, alt0=32*DEG, fov=80;
let showLines=true, showNames=true, showAster=false, kids=false, red=false;
let selected=null;                     // 強調する星座
let quiz=null, quizSeq=0;              // {id,list,i,score,lockUntil,reveal}
let flash=null;                        // {x,y,ok,until}
let anim=null;                         // 視点の移動アニメーション
let bodies=[];                         // この瞬間の太陽・月・惑星（画面座標つき）
const meteors=[]; let nextMeteor=performance.now()+9000;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tx = (adult, kid)=>kids?kid:adult;

/* ---------------- 時刻（その土地の時刻で表示する） ---------------- */
const fmtCache={};
function localParts(ms,tz){
  const f=fmtCache[tz]||(fmtCache[tz]=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}));
  const o={}; for(const p of f.formatToParts(new Date(ms))) o[p.type]=p.value;
  return o;
}
const WEEK=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], YOBI='日月火水木金土';
function fmt(ms){
  const p=localParts(ms,loc.tz);
  return `${p.year}/${p.month}/${p.day}（${YOBI[WEEK.indexOf(p.weekday)]}）${p.hour}:${p.minute}`;
}
/** その土地で次に「hh 時」になる時刻（すでに過ぎていれば翌日。backMin 分前までは今日とみなす） */
function nextLocalHour(ms,hh,backMin=0){
  const p=localParts(ms,loc.tz);
  let d=hh*60-(+p.hour*60 + +p.minute);
  if(d< -backMin) d+=1440;
  return ms - ms%60000 + d*60000;
}
const simNow=()=>Date.now()+offsetMs;

/* ---------------- 画面 ---------------- */
const cv=$('sky'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  W=innerWidth; H=innerHeight;
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  cv.style.width=W+'px'; cv.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize',resize); resize();

function bvColor(bv){
  if(bv<-0.05) return '#a8c0ff';
  if(bv<0.2)  return '#d8e2ff';
  if(bv<0.5)  return '#f6f4ff';
  if(bv<0.9)  return '#fff2da';
  if(bv<1.4)  return '#ffd9a4';
  return '#ff9d68';
}
/** 焦点距離（px）。縦長・横長どちらでも見える範囲が偏らないよう、画面の縦横の相乗平均で決める */
function focal(){ return Math.sqrt(W*H)/(4*Math.tan(fov*DEG/4)); }
/** 地平線が画面の下から約2割の高さに来る視点の高度 */
function defaultAlt(){ return 2*Math.atan(0.32*H/(2*focal())); }
function faceDefault(){ az0=(loc.lat>=0?180:0)*DEG; alt0=defaultAlt(); }

/* 高度・方位 → 画面座標（ステレオ投影）。返り値 [x,y,cosc] */
function project(alt,az,f,sinA0,cosA0){
  const dA=az-az0, cA=Math.cos(alt), sA=Math.sin(alt), cd=Math.cos(dA);
  const cosc=sinA0*sA + cosA0*cA*cd;
  if(cosc<-0.2) return null;
  const k=2*f/(1+cosc);
  return [W/2 + k*cA*Math.sin(dA), H/2 - k*(sA*cosA0 - cA*cd*sinA0), cosc];
}
function mixc(a,b,t){ return `${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))}`; }
function hexA(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${clamp(a,0,1)})`;
}
const FONT_M='"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
const FONT_S='"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif';

/* ---------------- 描画 ---------------- */
let lastFrame=performance.now();
function render(now){
  if(W!==innerWidth||H!==innerHeight||W===0) resize();
  if(W===0||H===0){ requestAnimationFrame(render); return; }
  const dt=Math.min(100,now-lastFrame); lastFrame=now;
  if(playing && !scrubbing){ offsetMs+=dt*SPEEDS[speedIdx]; scrubBase=offsetMs; }
  stepAnim(now);

  const simMs=simNow();
  const lst=lstRad(simMs,loc.lon);
  const sinLat=Math.sin(loc.lat*DEG), cosLat=Math.cos(loc.lat*DEG);
  const f=focal(), sinA0=Math.sin(alt0), cosA0=Math.cos(alt0);
  const toHz=(o)=>altAz(o.sinD,o.cosD,o.raRad,lst,sinLat,cosLat);
  const scale=0.8+f/Math.sqrt(W*H)*0.4;

  // 太陽・月・惑星
  const S=sun(simMs);
  const [sAlt,sAz]=altAz(Math.sin(S.dec),Math.cos(S.dec),S.ra,lst,sinLat,cosLat);
  const sAltD=sAlt/DEG;
  const dayF=smooth(-9,5,sAltD);           // 0 夜 → 1 昼
  const starF=1-smooth(-9,-1,sAltD);       // 星の見えやすさ
  const M=moon(simMs);
  let [mAlt,mAz]=altAz(Math.sin(M.dec),Math.cos(M.dec),M.ra,lst,sinLat,cosLat);
  mAlt-=M.parallax*Math.cos(mAlt);          // 地表から見る月は少し低い（視差）
  const moonF=M.illum*smooth(-2,10,mAlt/DEG)*(1-dayF);   // 月明かりの強さ
  bodies=[{id:'sun',alt:sAlt,az:sAz,mag:-26.7},{id:'moon',alt:mAlt,az:mAz,mag:-12*M.illum,M}];
  for(const id of PLANET_IDS){
    const p=planet(id,simMs,prec);
    const [a,z]=altAz(Math.sin(p.dec),Math.cos(p.dec),p.ra,lst,sinLat,cosLat);
    bodies.push({id,alt:a,az:z,mag:p.mag,P:p});
  }

  // 空のグラデーション（高度に合わせる: 地平線付近が明るく、天頂が暗い）
  const yHor=H/2+2*f*Math.tan(alt0/2), yZen=H/2-2*f*Math.tan((Math.PI/2-alt0)/2);
  const zen=mixc([5+14*moonF,8+22*moonF,20+36*moonF],[96,160,215],dayF);
  const hor=mixc([13+18*moonF,23+26*moonF,49+34*moonF],[168,205,235],dayF);
  const g=ctx.createLinearGradient(0,yZen,0,Math.max(yHor,yZen+1));
  g.addColorStop(0,`rgb(${zen})`); g.addColorStop(1,`rgb(${hor})`);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  // 朝焼け・夕焼け
  if(sAltD>-14 && sAltD<8){
    const p=project(Math.max(sAlt,0),sAz,f,sinA0,cosA0);
    if(p){
      const glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],Math.max(W,H)*0.6);
      const a=0.5*(1-Math.abs(sAltD)/14)*(1-dayF*0.4);
      glow.addColorStop(0,`rgba(255,150,80,${a})`); glow.addColorStop(1,'rgba(255,150,80,0)');
      ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);
    }
  }

  // 天の川（月明かりで薄くなる）
  const mwF=starF*(1-0.7*moonF);
  if(mwF>0.05){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const m of MW_PTS){
      const [a,z]=toHz(m);
      if(a<-0.05) continue;
      const p=project(a,z,f,sinA0,cosA0); if(!p||p[2]<0.05) continue;
      const r=m.w*DEG*f*1.35;
      const mg=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],r);
      mg.addColorStop(0,`rgba(200,214,255,${0.055*m.k*mwF})`);
      mg.addColorStop(1,'rgba(200,214,255,0)');
      ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(p[0],p[1],r,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  // 星の画面位置
  for(const s of stars){
    const [a,z]=toHz(s);
    s.alt=a;
    if(a<-0.01){ s.vis=false; continue; }
    const p=project(a,z,f,sinA0,cosA0);
    if(!p||p[0]<-60||p[0]>W+60||p[1]<-60||p[1]>H+60){ s.vis=false; continue; }
    s.vis=true; s.sx=p[0]; s.sy=p[1];
  }
  for(const b of bodies){
    const p=b.alt>-0.02?project(b.alt,b.az,f,sinA0,cosA0):null;
    b.vis=!!p; if(p){ b.sx=p[0]; b.sy=p[1]; }
  }

  // アンドロメダ銀河など
  if(starF>0.1){
    for(const d of DSO_PTS){
      const [a,z]=toHz(d);
      if(a<0) continue; const p=project(a,z,f,sinA0,cosA0); if(!p) continue;
      const r=d.r*DEG*f;
      ctx.save(); ctx.translate(p[0],p[1]); ctx.rotate(d.tilt); ctx.scale(1,0.45);
      const dg=ctx.createRadialGradient(0,0,0,0,0,r);
      dg.addColorStop(0,`rgba(224,225,255,${0.35*mwF})`); dg.addColorStop(1,'rgba(224,225,255,0)');
      ctx.fillStyle=dg; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill(); ctx.restore();
      if(showNames && fov<70 && !quiz){
        ctx.fillStyle=`rgba(154,165,196,${0.8*starF})`; ctx.font='10px '+FONT_S;
        ctx.textAlign='left'; ctx.fillText(tx(d.name,'アンドロメダぎんが'), p[0]+r*0.5+4, p[1]-4);
      }
    }
  }

  // 星座線
  if(showLines && starF>0.05){
    for(const c of CONS){
      const hot=(selected===c)||(quiz&&quiz.reveal===c);
      ctx.strokeStyle=hot?`rgba(240,200,110,${0.9*starF})`:`rgba(127,212,232,${0.34*starF})`;
      ctx.lineWidth=hot?2:1;
      ctx.beginPath();
      for(const [a,b] of c.ln){
        const s1=stars[c.idx[a]], s2=stars[c.idx[b]];
        if(!s1.vis||!s2.vis) continue;
        ctx.moveTo(s1.sx,s1.sy); ctx.lineTo(s2.sx,s2.sy);
      }
      ctx.stroke();
    }
  }else if(quiz&&quiz.reveal){           // 星座線オフでもクイズの答えは見せる
    const c=quiz.reveal; ctx.strokeStyle=`rgba(240,200,110,${0.9*Math.max(starF,0.4)})`; ctx.lineWidth=2;
    ctx.beginPath();
    for(const [a,b] of c.ln){ const s1=stars[c.idx[a]], s2=stars[c.idx[b]];
      if(s1.vis&&s2.vis){ ctx.moveTo(s1.sx,s1.sy); ctx.lineTo(s2.sx,s2.sy); } }
    ctx.stroke();
  }

  // 大三角・大曲線
  if(showAster && starF>0.05){
    ctx.save(); ctx.setLineDash([6,6]);
    ctx.strokeStyle=`rgba(240,200,110,${0.65*starF})`; ctx.lineWidth=1.4;
    for(const a of ASTER_PTS){
      const ps=a.pts.map(pt=>{ const [al,z]=toHz(pt); return al>-0.05?project(al,z,f,sinA0,cosA0):null; });
      if(ps.some(p=>!p||p[2]<0.05)) continue;
      ctx.beginPath(); ctx.moveTo(ps[0][0],ps[0][1]);
      for(let i=1;i<ps.length;i++) ctx.lineTo(ps[i][0],ps[i][1]);
      if(a.close) ctx.closePath();
      ctx.stroke();
      const cx=ps.reduce((s,p)=>s+p[0],0)/ps.length, cy=ps.reduce((s,p)=>s+p[1],0)/ps.length;
      ctx.fillStyle=`rgba(240,200,110,${0.85*starF})`;
      ctx.font='12px '+FONT_M; ctx.textAlign='center';
      ctx.fillText(kids?a.name.replace('夏の大三角','なつの だいさんかく').replace('冬の大三角','ふゆの だいさんかく').replace('春の大曲線','はるの だいきょくせん'):a.name,cx,cy);
    }
    ctx.restore();
  }

  // 星（月明かりがあると暗い星が見えにくくなる）
  const limitMag=Math.min(5.6, 5.1+(80-fov)*0.03) - 1.3*moonF;
  const t=now*0.001;
  for(const s of stars){
    if(!s.vis) continue;
    if(s.mag>limitMag && !s.flag) continue;
    let alpha=starF*clamp((limitMag+0.7-s.mag)/2.6,0.16,1);
    if(alpha<=0.01) continue;
    // 地平線近くは大気で暗くなる
    if(s.alt<12*DEG) alpha*=0.45+0.55*(s.alt/(12*DEG));
    const r=Math.max(0.7,(4.0-s.mag*0.66))*scale;
    if(!reduceMotion && s.mag<2.4) alpha*=0.82+0.18*Math.sin(t*(2.2+s.bv)+s.twk);
    const col=bvColor(s.bv);
    if(s.flag==='cl'){ drawGlow(s,0.9,'170,200,255',alpha*0.55*(1-0.6*moonF)); }
    else if(s.flag==='neb'){ drawGlow(s,0.6,'220,228,255',alpha*0.4*(1-0.6*moonF)); }
    else{
      if(s.mag<1.0){
        const gg=ctx.createRadialGradient(s.sx,s.sy,0,s.sx,s.sy,r*4.5);
        gg.addColorStop(0,hexA(col,alpha*0.5)); gg.addColorStop(1,hexA(col,0));
        ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(s.sx,s.sy,r*4.5,0,TAU); ctx.fill();
      }
      ctx.fillStyle=hexA(col,alpha);
      ctx.beginPath(); ctx.arc(s.sx,s.sy,r,0,TAU); ctx.fill();
    }
  }

  // 惑星
  for(const b of bodies){
    if(!b.vis||!b.P) continue;
    const vis=b.mag<-3.5?Math.max(starF,1-dayF*0.6):starF;   // 金星は夕方の明るい空でも見える
    if(vis<0.05) continue;
    const info=BODY_INFO[b.id];
    const r=Math.max(2.2,(3.9-b.mag*0.55))*scale;
    const gg=ctx.createRadialGradient(b.sx,b.sy,0,b.sx,b.sy,r*4);
    gg.addColorStop(0,hexA(info.col,0.45*vis)); gg.addColorStop(1,hexA(info.col,0));
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(b.sx,b.sy,r*4,0,TAU); ctx.fill();
    ctx.fillStyle=hexA(info.col,vis); ctx.beginPath(); ctx.arc(b.sx,b.sy,r,0,TAU); ctx.fill();
    if(b.id==='saturn'){
      ctx.strokeStyle=hexA(info.col,0.8*vis); ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.ellipse(b.sx,b.sy,r*2.3,r*0.8,-0.35,0,TAU); ctx.stroke();
    }
  }

  // 太陽
  const sb=bodies[0];
  if(sb.vis){
    const r=Math.max(9,0.53*DEG*f*2);
    const sg=ctx.createRadialGradient(sb.sx,sb.sy,0,sb.sx,sb.sy,r*5);
    sg.addColorStop(0,'rgba(255,244,214,0.95)'); sg.addColorStop(0.25,'rgba(255,220,140,0.5)');
    sg.addColorStop(1,'rgba(255,220,140,0)');
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sb.sx,sb.sy,r*5,0,TAU); ctx.fill();
    ctx.fillStyle='#fff6dc'; ctx.beginPath(); ctx.arc(sb.sx,sb.sy,r,0,TAU); ctx.fill();
    sb.r=r;
  }
  // 月
  const mb=bodies[1];
  if(mb.vis){ mb.r=Math.max(9,0.26*DEG*f*2.4); drawMoon(mb,sAlt,sAz,f,sinA0,cosA0,dayF); }

  if(!reduceMotion) drawMeteors(now,starF*(1-moonF*0.5));
  drawGround(f,dayF);

  // 名前
  if(showNames && !quiz){
    if(starF>0.05){
      ctx.font=(kids?'15px ':'13px ')+FONT_M; ctx.textAlign='center';
      for(const c of CONS){
        let sx=0,sy=0,n=0;
        for(const i of c.idx){ const s=stars[i]; if(s.vis){sx+=s.sx;sy+=s.sy;n++;} }
        if(n<Math.max(2,c.idx.length*0.4)) continue;
        const hot=selected===c;
        ctx.fillStyle=hot?`rgba(240,200,110,${0.95*starF})`:`rgba(240,200,110,${0.62*starF})`;
        ctx.fillText(kids?c.kana+'ざ':c.jp, sx/n, sy/n - 10);
      }
      if(fov<62){
        ctx.font='10.5px '+FONT_S; ctx.textAlign='left';
        ctx.fillStyle=`rgba(232,236,247,${0.6*starF})`;
        for(const s of stars){
          if(!s.vis||!s.name||s.mag>2.3) continue;
          ctx.fillText(s.name.split('（')[0], s.sx+7, s.sy+3);
        }
      }
    }
    ctx.font='12px '+FONT_S; ctx.textAlign='left';
    for(const b of bodies){
      if(!b.vis||b.alt<0) continue;
      const lit=b.id==='sun'||b.id==='moon'||b.mag<-3.5;
      const a=lit?1:starF; if(a<0.05) continue;
      const info=BODY_INFO[b.id];
      ctx.fillStyle=dayF>0.5&&lit?'rgba(40,40,60,0.85)':`rgba(255,228,170,${0.9*a})`;
      const off=(b.r||6)+6;
      ctx.fillText(tx(info.jp,info.kana), b.sx+off, b.sy+4);
    }
  }

  drawDirections(f,sinA0,cosA0);
  drawFlash(now);
  updHud(simMs);
  requestAnimationFrame(render);
}

function drawGlow(s,sizeDeg,rgb,alpha){
  const r=sizeDeg*DEG*focal();
  const gg=ctx.createRadialGradient(s.sx,s.sy,0,s.sx,s.sy,r);
  gg.addColorStop(0,`rgba(${rgb},${alpha})`); gg.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(s.sx,s.sy,r,0,TAU); ctx.fill();
}

/* 高度・方位 → 地平座標の単位ベクトル（x=北, y=東, z=上） */
const hzVec=(alt,az)=>[Math.cos(alt)*Math.cos(az), Math.cos(alt)*Math.sin(az), Math.sin(alt)];
/** 月: 太陽のある向きが光る。満ち欠けの形は光っている割合 illum で決まる */
function drawMoon(mb,sAlt,sAz,f,sinA0,cosA0,dayF){
  const M=mb.M, r=mb.r, x=mb.sx, y=mb.sy;
  // 画面上で太陽のある向き: 月から太陽へ少しだけ進んだ点を投影して角度を求める
  const m=hzVec(mb.alt,mb.az), s=hzVec(sAlt,sAz), d=m[0]*s[0]+m[1]*s[1]+m[2]*s[2];
  let tv=[s[0]-d*m[0],s[1]-d*m[1],s[2]-d*m[2]]; const tl=Math.hypot(...tv)||1;
  const q=[m[0]+0.02*tv[0]/tl, m[1]+0.02*tv[1]/tl, m[2]+0.02*tv[2]/tl];
  const qp=project(Math.asin(q[2]/Math.hypot(...q)),Math.atan2(q[1],q[0]),f,sinA0,cosA0);
  const ang=qp?Math.atan2(qp[1]-y,qp[0]-x):0;
  const k=M.illum;
  // ぼんやりした光
  const gl=ctx.createRadialGradient(x,y,r*0.8,x,y,r*6);
  gl.addColorStop(0,`rgba(235,238,255,${0.28*k*(1-dayF*0.7)})`); gl.addColorStop(1,'rgba(235,238,255,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y,r*6,0,TAU); ctx.fill();
  ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
  // 影の部分（地球照でうっすら見える）
  ctx.fillStyle=`rgba(70,78,100,${0.55*(1-dayF*0.6)})`;
  ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
  // 光っている部分: 太陽側の半円 ± 明暗の境目の楕円
  ctx.fillStyle='#f4f1e4';
  ctx.beginPath(); ctx.moveTo(0,-r); ctx.arc(0,0,r,-Math.PI/2,Math.PI/2);
  const ex=Math.abs(1-2*k)*r;
  if(k<0.5) ctx.ellipse(0,0,ex,r,0,Math.PI/2,-Math.PI/2,true);
  else ctx.ellipse(0,0,ex,r,0,Math.PI/2,Math.PI*1.5,false);
  ctx.fill();
  ctx.restore();
}

/** 地面。地平線はステレオ投影では円になる: 中心 (W/2, H/2 − f(1−t²)/t)、半径 f(1+t²)/|t|、t = tan(視点の高度/2) */
function drawGround(f,dayF){
  const t=Math.tan(alt0/2);
  const ground=`rgb(${mixc([5,8,16],[46,58,54],dayF)})`;
  const edge=`rgba(127,212,232,${lerp(0.45,0.2,dayF)})`;
  ctx.save();
  ctx.fillStyle=ground; ctx.strokeStyle=edge; ctx.lineWidth=1.5;
  ctx.shadowColor='rgba(127,212,232,0.55)';
  const r=Math.abs(t)>1e-4?f*(1+t*t)/Math.abs(t):Infinity;
  if(r>2e5){                              // ほぼ真横を見ている: 地平線はほぼ直線
    const yh=H/2+2*f*t;
    ctx.fillRect(0,yh,W,H-yh);
    ctx.shadowBlur=10; ctx.beginPath(); ctx.moveTo(0,yh); ctx.lineTo(W,yh); ctx.stroke();
  }else{
    const cx=W/2, cy=H/2-f*(1-t*t)/t;
    ctx.beginPath();
    if(t>0){ ctx.rect(0,0,W,H); ctx.arc(cx,cy,r,0,TAU); ctx.fill('evenodd'); }   // 上を向いている: 円の外が地面
    else { ctx.arc(cx,cy,r,0,TAU); ctx.fill(); }                                 // 下を向いている: 円の中が地面
    ctx.shadowBlur=10; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.stroke();
  }
  ctx.restore();
}
function drawDirections(f,sinA0,cosA0){
  const dirs=[['北','きた',0],['北東','',45],['東','ひがし',90],['南東','',135],
              ['南','みなみ',180],['南西','',225],['西','にし',270],['北西','',315]];
  ctx.textAlign='center';
  for(const [nm,kn,azd] of dirs){
    const label=kids?kn:nm;
    if(!label) continue;
    const p=project(-3*DEG,azd*DEG,f,sinA0,cosA0);
    if(!p||p[2]<0.05) continue;
    const main=azd%90===0;
    ctx.font=(main?'600 15px ':'11px ')+FONT_M;
    ctx.fillStyle=main?'rgba(240,200,110,0.9)':'rgba(154,165,196,0.75)';
    ctx.fillText(label,p[0],p[1]+5);
  }
}
function drawMeteors(now,starF){
  if(starF>0.4 && now>nextMeteor){
    nextMeteor=now+9000+Math.random()*22000;
    const x=Math.random()*W, y=Math.random()*H*0.4, ang=(Math.random()*40+55)*DEG*(Math.random()<0.5?1:-1);
    meteors.push({x,y,dx:Math.cos(ang),dy:Math.abs(Math.sin(ang)),t0:now,dur:650});
  }
  for(let i=meteors.length-1;i>=0;i--){
    const m=meteors[i], t=(now-m.t0)/m.dur;
    if(t>1){meteors.splice(i,1);continue;}
    const len=90, px=m.x+m.dx*t*220, py=m.y+m.dy*t*220;
    const gr=ctx.createLinearGradient(px,py,px-m.dx*len,py-m.dy*len);
    const a=Math.sin(t*Math.PI)*0.9*starF;
    gr.addColorStop(0,`rgba(255,250,230,${a})`); gr.addColorStop(1,'rgba(255,250,230,0)');
    ctx.strokeStyle=gr; ctx.lineWidth=1.8; ctx.beginPath();
    ctx.moveTo(px,py); ctx.lineTo(px-m.dx*len,py-m.dy*len); ctx.stroke();
  }
}
function drawFlash(now){
  if(!flash) return;
  if(now>flash.until){flash=null;return;}
  ctx.font='600 30px '+FONT_S; ctx.textAlign='center';
  ctx.fillStyle=flash.ok?'rgba(140,230,170,0.95)':'rgba(255,120,120,0.95)';
  ctx.fillText(flash.ok?'○ せいかい！':'✕ ざんねん', flash.x, flash.y);
}

/* ---------------- 視点の移動 ---------------- */
function flyTo(alt,az,dur=900){
  alt=clamp(alt,-10*DEG,80*DEG);
  let dAz=((az-az0)%TAU+TAU)%TAU; if(dAz>Math.PI) dAz-=TAU;   // 近いほうへ回る
  if(reduceMotion){ alt0=alt; az0+=dAz; anim=null; return; }
  anim={a0:alt0,z0:az0,a1:alt,z1:az0+dAz,t0:performance.now(),dur};
}
function stepAnim(now){
  if(!anim) return;
  const u=clamp((now-anim.t0)/anim.dur,0,1), e=u<0.5?2*u*u:1-2*(1-u)*(1-u);
  alt0=lerp(anim.a0,anim.a1,e); az0=lerp(anim.z0,anim.z1,e);
  if(u>=1) anim=null;
}
/** 星座の中心の今の高度・方位 */
function conAltAz(c,ms=simNow()){
  return altAz(c.center.sinD,c.center.cosD,c.center.raRad,lstRad(ms,loc.lon),Math.sin(loc.lat*DEG),Math.cos(loc.lat*DEG));
}
function lookAtCon(c){ const [a,z]=conAltAz(c); flyTo(Math.max(a,defaultAlt()*0.6),z); }

/* ---------------- 上の表示 ---------------- */
const DIRS=['北','北東','東','南東','南','南西','西','北西'];
const DIRS_K=['きた','ほくとう','ひがし','なんとう','みなみ','なんせい','にし','ほくせい'];
let lastHud=0;
function updHud(simMs){
  const n=performance.now(); if(n-lastHud<250) return; lastHud=n;
  const traveling=Math.abs(offsetMs)>90000;
  const local=loc.tz!=='Asia/Tokyo'?tx('（現地時刻）','（げんちの じかん）'):'';
  $('pTime').textContent=fmt(simMs)+local+(traveling?tx('（時間たび中）','（じかんたび ちゅう）'):'');
  const d=Math.round((((az0/DEG)%360+360)%360)/45)%8;
  $('pWhere').textContent=kids?`${loc.kana}の そら ・ ${DIRS_K[d]}を むいているよ`:`${loc.name}の空 ・ ${DIRS[d]}を向いています`;
  $('tpNow').textContent=fmt(simMs);
}

/* ---------------- タップ判定 ---------------- */
function segDist(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay, l=dx*dx+dy*dy;
  const u=l?clamp(((px-ax)*dx+(py-ay)*dy)/l,0,1):0;
  return Math.hypot(px-ax-u*dx, py-ay-u*dy);
}
/** 星座の線・星までの距離（px）。見えている部分だけで測る */
function conDist(c,x,y){
  let d=Infinity;
  for(const i of c.idx){ const s=stars[i]; if(s.vis) d=Math.min(d,Math.hypot(s.sx-x,s.sy-y)); }
  for(const [a,b] of c.ln){
    const s1=stars[c.idx[a]], s2=stars[c.idx[b]];
    if(s1.vis&&s2.vis) d=Math.min(d,segDist(x,y,s1.sx,s1.sy,s2.sx,s2.sy));
  }
  return d;
}
/** 見えている星の凸包（星座の「かたまり」）に点が入っているか。入っていれば面積を返す */
function hullArea(c,x,y){
  const p=c.idx.map(i=>stars[i]).filter(s=>s.vis).map(s=>[s.sx,s.sy]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(p.length<3) return 0;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[],up=[];
  for(const q of p){ while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0) lo.pop(); lo.push(q); }
  for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(up.length>=2&&cross(up[up.length-2],up[up.length-1],q)<=0) up.pop(); up.push(q); }
  const h=lo.slice(0,-1).concat(up.slice(0,-1));
  let area=0;
  for(let i=0;i<h.length;i++){
    const a=h[i], b=h[(i+1)%h.length];
    if(cross(a,b,[x,y])<0) return 0;
    area+=a[0]*b[1]-b[0]*a[1];
  }
  return Math.abs(area)/2;
}
function pickCon(x,y){
  let best=null, bd=40;
  for(const c of CONS){ const d=conDist(c,x,y); if(d<bd){bd=d;best=c;} }
  if(best) return best;
  let ba=Infinity;
  for(const c of CONS){ const a=hullArea(c,x,y); if(a>0&&a<ba){ba=a;best=c;} }
  return best;
}
function pickBody(x,y){
  let best=null, bd=Infinity;
  for(const b of bodies){
    if(!b.vis||b.alt<0) continue;
    const d=Math.hypot(b.sx-x,b.sy-y), lim=(b.r||4)+18;
    if(d<lim&&d<bd){ bd=d; best=b; }
  }
  return best;
}
function handleTap(x,y){
  if(quiz){ quizTap(x,y); return; }
  const b=pickBody(x,y);
  if(b){ openBody(b); return; }
  let bs=null,bd=22;
  for(const s of stars){
    if(!s.vis||!s.name) continue;
    const d=Math.hypot(s.sx-x,s.sy-y);
    if(d<bd){bd=d;bs=s;}
  }
  if(bs){ openStar(bs); return; }
  const c=pickCon(x,y);
  if(c) openCon(c); else { closeSheet(); }
}

/* ---------------- 操作 ---------------- */
const ptrs=new Map(); let pinchD=0, downXY=null, downT=0, moved=false;
cv.addEventListener('pointerdown',e=>{
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  anim=null;
  ptrs.set(e.pointerId,[e.clientX,e.clientY]);
  if(ptrs.size===1){ downXY=[e.clientX,e.clientY]; downT=Date.now(); moved=false; cv.classList.add('drag'); }
  if(ptrs.size===2){ const a=[...ptrs.values()]; pinchD=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]); moved=true; }
});
cv.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId)) return;
  const prev=ptrs.get(e.pointerId); ptrs.set(e.pointerId,[e.clientX,e.clientY]);
  if(ptrs.size===1){
    const dx=e.clientX-prev[0], dy=e.clientY-prev[1];
    if(!downXY || Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1])>8) moved=true;
    const fpx=focal();
    az0-=dx/fpx/Math.max(0.35,Math.cos(alt0));
    alt0=clamp(alt0+dy/fpx, -35*DEG, 89.6*DEG);
  }else if(ptrs.size===2){
    const a=[...ptrs.values()]; const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);
    if(pinchD>0&&d>0) fov=clamp(fov*pinchD/d, 20, 120);
    pinchD=d;
  }
});
function endPtr(e){
  if(!ptrs.delete(e.pointerId)) return;
  pinchD=0;
  if(ptrs.size>0) return;               // ピンチのあとに1本だけ残った指は、そのまま見まわしに使う
  cv.classList.remove('drag');
  if(downXY && !moved && Date.now()-downT<500) handleTap(downXY[0],downXY[1]);
  downXY=null;
}
cv.addEventListener('pointerup',endPtr); cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{ e.preventDefault(); fov=clamp(fov*Math.exp(e.deltaY*0.0012),20,120); },{passive:false});
addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeSheet(); closePanels(); $('help').classList.remove('open'); return; }
  if(e.target!==cv && e.target!==document.body) return;
  const st=4*DEG*fov/80;
  if(e.key==='ArrowLeft') az0-=st; else if(e.key==='ArrowRight') az0+=st;
  else if(e.key==='ArrowUp') alt0=clamp(alt0+st,-35*DEG,89.6*DEG);
  else if(e.key==='ArrowDown') alt0=clamp(alt0-st,-35*DEG,89.6*DEG);
  else if(e.key==='+'||e.key===';') fov=clamp(fov/1.15,20,120);
  else if(e.key==='-') fov=clamp(fov*1.15,20,120);
  else return;
  anim=null; e.preventDefault();
});

/* ---------------- 説明シート ---------------- */
const sheet=$('sheet'), sheetBody=$('sheetBody');
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
let sheetKind=null;                    // 今ひらいているもの（ひらがなモード切りかえで開きなおす）
function showSheet(html,kind){ sheetBody.innerHTML=html; sheetKind=kind; sheet.classList.add('open'); sheet.scrollTop=0; }
function closeSheet(){ sheet.classList.remove('open'); sheetKind=null; selected=null; }
$('sheetClose').addEventListener('click',closeSheet);

function openCon(c){
  selected=c;
  // 時間を動かした直後でも正しいよう、描画を待たずにその場で高度を計算する
  const ms=simNow(), lst=lstRad(ms,loc.lon), sl=Math.sin(loc.lat*DEG), cl=Math.cos(loc.lat*DEG);
  const up=c.idx.filter(i=>{ const s=stars[i]; return altAz(s.sinD,s.cosD,s.raRad,lst,sl,cl)[0]>0; }).length>=c.idx.length/2;
  const season=kids?(SEASON_KANA[c.season]||c.season):c.season;
  const chips=`<span class="chip season">${season}の${tx('星座','せいざ')}</span>`+
    (up?`<span class="chip up">${tx('いま空に見えています','いま みえているよ')}</span>`
       :`<span class="chip">${tx('いまは地平線の下','いまは ちへいせんの した')}</span>`);
  const named=c.ss.filter(s=>s[4]).slice(0,4).map(s=>
    `<div class="star-chip"><span class="dot" style="color:${bvColor(s[3]??0.3)};background:${bvColor(s[3]??0.3)}"></span>
     ${esc(s[4].split('（')[0])}<small>${kids
       ?`${s[2].toFixed(1)}とうせい${s[5]?' ・ やく'+s[5]+'こうねん':''}`
       :`${s[2].toFixed(1)}等${s[5]?' ・ '+s[5]+'光年':''}`}</small></div>`).join('');
  showSheet(`
    <div class="sh-kana">${kids?'せいざ':c.kana+'ざ'}</div>
    <div class="sh-name">${kids?c.kana+'ざ':c.jp}</div>
    <div class="sh-en">${c.en}</div>
    <div class="sh-chips">${chips}</div>
    <div class="sh-story${kids?' kids':''}">${kids?c.kid:c.adl}</div>
    ${kids?'':`<div class="sh-fun"><b>まめちしき</b>　${c.fun}</div>`}
    ${named?`<div class="sh-stars">${named}</div>`:''}
    <a class="sh-link" href="./zukan/${c.id}.html">${tx(`${c.jp}の見つけ方・図鑑ページ →`,'ずかんで もっと みる →')}</a>`,{type:'con',c});
}
function openStar(s){
  const pct=clamp((s.bv+0.4)/2.2,0.02,0.98)*100;
  const lyTxt=s.ly?(s.ly<1000?s.ly:Math.round(s.ly/100)*100):0;
  const story=kids
    ?`${s.ly?`いま みえている ひかりは、やく${lyTxt}ねんまえに この ほしを でた ひかりだよ。`:''}あおい ほしは とっても あつい ほし。あかい ほしは すこし つめたい ほしなんだ。`
    :`${s.ly?`いま見えている光は、約${lyTxt}年前にこの星を出た光です。`:''}星の色は表面温度で決まります。<b style="color:#a8c0ff">青い星ほど高温</b>、<b style="color:#ff9d68">赤い星ほど低温</b>です。`;
  showSheet(`
    <div class="sh-kana">${kids?'ほし':'恒星'}</div>
    <div class="sh-name">${esc(kids?s.name.split('（')[0]:s.name)}</div>
    <div class="sh-en">${s.con?(kids?s.con.kana+'ざ':s.con.jp):esc(kids?(s.conName||'').replace('座','ざ'):(s.conName||''))}</div>
    <div class="sh-chips">
      <span class="chip">${s.mag.toFixed(1)}${kids?'とうせい':'等星'}</span>
      ${s.ly?`<span class="chip">${kids?'やく'+s.ly+'こうねん':'約'+s.ly+'光年'}</span>`:''}
    </div>
    <div class="sh-story${kids?' kids':''}" style="font-size:${kids?'15px':'13px'}">${story}</div>
    <div class="tempbar">
      <div class="bar"><span class="mk" style="left:${pct}%"></span></div>
      <div class="lbl">${kids
        ?'<span>あつい ほし（あおい）</span><span>つめたい ほし（あかい）</span>'
        :'<span>高温（約30,000度〜）</span><span>低温（約3,000度）</span>'}</div>
    </div>
    ${s.con?`<a class="sh-link" href="./zukan/${s.con.id}.html">${tx(`${s.con.jp}の図鑑ページ →`,'ずかんで もっと みる →')}</a>`:''}`,{type:'star',s});
  selected=s.con||null;
}
function moonName(age){ const e=MOON_NAMES.find(m=>age<m[0])||MOON_NAMES[0]; return tx(e[1],e[2]); }
/** 満ち欠けの小さな絵（北半球で見た形。右が太陽側＝満ちていく月） */
function moonSvg(M,size=64){
  const r=size/2-2, c=size/2, k=M.illum, ex=Math.abs(1-2*k)*r, right=M.waxing?1:-1;
  const sweepOuter=right>0?1:0;
  const sweepInner=(k<0.5)===(right>0)?0:1;
  const d=`M${c} ${c-r} A${r} ${r} 0 0 ${sweepOuter} ${c} ${c+r} A${ex} ${r} 0 0 ${sweepInner} ${c} ${c-r}Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="#3a4056"/><path d="${d}" fill="#f4f1e4"/></svg>`;
}
function openBody(b){
  selected=null;
  const info=BODY_INFO[b.id];
  let chips='', extra='';
  if(b.id==='sun'){
    chips=`<span class="chip warn">${tx('ぜったいに直接見ない','ちょくせつ みないでね')}</span><span class="chip">${tx('恒星','こうせい')}</span>`;
  }else if(b.id==='moon'){
    const M=b.M, man=Math.round(M.distKm/1000)/10;
    chips=`<span class="chip season">${moonName(M.age)}</span>
      <span class="chip">${tx(`月齢 ${M.age.toFixed(1)}`,`つきの としは ${M.age.toFixed(0)}`)}</span>
      <span class="chip">${tx(`地球から 約${man}万km`,`ちきゅうから やく${Math.round(man)}まん キロ`)}</span>`;
    extra=`<div class="sh-moon">${moonSvg(M)}<div class="sh-story${kids?' kids':''}" style="margin:0">${
      tx(`いまの月は ${Math.round(M.illum*100)}% が光っています。${M.waxing?'これから満月に向かって、毎日少しずつふくらんでいきます。':'これから新月に向かって、毎日少しずつ細くなっていきます。'}`,
         M.waxing?'これから まいにち すこしずつ ふとって いくよ。':'これから まいにち すこしずつ ほそく なって いくよ。')}</div></div>`;
  }else{
    const P=b.P, oku=(P.dist*1.496).toFixed(1), lmin=Math.round(P.dist*8.317);
    chips=`<span class="chip season">${tx('惑星','わくせい')}</span>
      <span class="chip">${P.mag.toFixed(1)}${tx('等','とうせい')}</span>
      <span class="chip">${tx(`地球から 約${oku}億km（光で約${lmin}分）`,`ちきゅうから やく${oku}おく キロ`)}</span>`;
  }
  const up=b.alt>0;
  chips+=up?`<span class="chip up">${tx('いま空に見えています','いま みえているよ')}</span>`
           :`<span class="chip">${tx('いまは地平線の下','いまは ちへいせんの した')}</span>`;
  showSheet(`
    <div class="sh-kana">${b.id==='moon'?tx('衛星','えいせい'):b.id==='sun'?tx('恒星','こうせい'):tx('惑星','わくせい')}</div>
    <div class="sh-name">${tx(info.jp,info.kana)}</div>
    <div class="sh-en">${info.en}</div>
    <div class="sh-chips">${chips}</div>
    ${extra}
    <div class="sh-story${kids?' kids':''}">${tx(info.adl,info.kid)}</div>
    ${kids?'':`<div class="sh-fun"><b>まめちしき</b>　${info.fun}</div>`}`,{type:'body',id:b.id});
}
function reopenSheet(){
  if(!sheetKind) return;
  if(sheetKind.type==='con') openCon(sheetKind.c);
  else if(sheetKind.type==='star') openStar(sheetKind.s);
  else if(sheetKind.type==='body'){ const b=bodies.find(x=>x.id===sheetKind.id); if(b) openBody(b); }
  else if(sheetKind.type==='quiz') showQuizResult(sheetKind.sc,sheetKind.n);
}

/* ---------------- クイズ ---------------- */
const quizBar=$('quizBar');
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function nightNow(){
  const ms=simNow(), S=sun(ms);
  const [a]=altAz(Math.sin(S.dec),Math.cos(S.dec),S.ra,lstRad(ms,loc.lon),Math.sin(loc.lat*DEG),Math.cos(loc.lat*DEG));
  return a<-6*DEG;
}
function startQuiz(){
  if(!nightNow()){ toast(tx('いまは空が明るくて星が見えません。「時間たび」で夜にしてから挑戦してね','いまは ひるまで ほしが みえないよ。「じかんたび」で よるに してから ちょうせん！')); return; }
  // 画面の中だけでなく、地平線の上に出ている星座から出題する（見まわしてさがすのも遊びのうち）
  const cands=CONS.filter(c=>{
    let n=0; for(const i of c.idx) if(stars[i].alt>8*DEG) n++;
    return n>=Math.max(2,Math.ceil(c.idx.length*0.6));
  });
  if(cands.length<3){ toast(tx('いま空に出ている星座が少ないよ。時間を動かしてみてね','いま でている せいざが すくないよ。じかんを うごかしてみてね')); return; }
  quiz={id:++quizSeq,list:shuffle(cands).slice(0,5),i:0,score:0,lockUntil:0,reveal:null};
  closeSheet(); closePanels();
  quizBar.classList.add('show'); document.body.classList.add('quizzing'); setPressed('bQuiz',true);
  nextQ();
}
function stopQuiz(){
  quiz=null; quizBar.classList.remove('show'); document.body.classList.remove('quizzing'); setPressed('bQuiz',false);
}
function nextQ(){
  const q=quiz;
  if(q.i>=q.list.length){ endQuiz(); return; }
  const c=q.list[q.i];
  $('qNum').textContent=`Q${q.i+1}/${q.list.length}`;
  $('qText').innerHTML=kids?`「<b>${c.kana}ざ</b>」を さがして タップ！`:`「<b>${c.jp}</b>」をさがしてタップ！`;
}
function quizTap(x,y){
  const q=quiz, now=performance.now();
  if(now<q.lockUntil) return;
  const target=q.list[q.i];
  const ok=conDist(target,x,y)<=44 || hullArea(target,x,y)>0;
  if(ok) q.score++;
  flash={x,y:Math.max(50,y-30),ok,until:now+1100};
  q.reveal=target; q.lockUntil=now+1500;
  if(!ok) lookAtCon(target);            // 正解の場所へ視点を動かして見せる
  const id=q.id;
  setTimeout(()=>{ if(!quiz||quiz.id!==id) return; quiz.reveal=null; quiz.i++; nextQ(); },1500);
}
$('qHint').addEventListener('click',()=>{ if(quiz&&quiz.i<quiz.list.length) lookAtCon(quiz.list[quiz.i]); });
function endQuiz(){
  const sc=quiz.score, n=quiz.list.length;
  stopQuiz();
  showQuizResult(sc,n);
}
function showQuizResult(sc,n){
  const msg=kids
    ?(sc===n?'ぜんぶ せいかい！きみは ほしはかせだ！':sc>=n*0.6?'すごい！あと すこしで ぜんぶ せいかい！':'また ちょうせん してみてね！')
    :(sc===n?'パーフェクト！きみは星はかせだ！':sc>=n*0.6?'すごい！あと少しでパーフェクト！':'また挑戦してね。星座線と名まえをONにして予習しよう！');
  const cnt=kids
    ?`${n}もんちゅう <b style="color:var(--gold)">${sc}もん</b> せいかい。`
    :`${n}問中 <b style="color:var(--gold)">${sc}問</b> 正解。`;
  showSheet(`
    <div class="sh-kana">${tx('クイズの結果','クイズの けっか')}</div>
    <div class="sh-name">${'★'.repeat(sc)}${'☆'.repeat(n-sc)}</div>
    <div class="sh-story${kids?' kids':''}">${cnt}${msg}</div>`,{type:'quiz',sc,n});
}

/* ---------------- ボタン ---------------- */
function setPressed(id,on){ $(id).setAttribute('aria-pressed',on?'true':'false'); }
function onClick(id,fn){ $(id).addEventListener('click',fn); }
function closePanels(){
  for(const [p,b] of [['timePanel','bTime'],['locPanel','bLoc']]){ $(p).classList.remove('open'); setPressed(b,false); }
}
function togglePanel(p,b){
  const open=!$(p).classList.contains('open');
  closePanels();
  if(open){ $(p).classList.add('open'); setPressed(b,true); }
}
onClick('bLines',()=>{ showLines=!showLines; setPressed('bLines',showLines); });
onClick('bNames',()=>{ showNames=!showNames; setPressed('bNames',showNames); });
onClick('bAst',()=>{ showAster=!showAster; setPressed('bAst',showAster);
  if(showAster) toast(tx('夏・冬の大三角と春の大曲線。明るい星をつなぐ星さがしの道しるべです','あかるい ほしを つなぐと、おおきな さんかくが できるよ')); });
onClick('bTime',()=>togglePanel('timePanel','bTime'));
onClick('bLoc',()=>togglePanel('locPanel','bLoc'));
onClick('bQuiz',()=>{ if(quiz) stopQuiz(); else startQuiz(); });
function setKids(on){
  kids=on; document.body.classList.toggle('kids',kids); setPressed('bKids',kids); lsSet('hzs_kids',kids?'1':'0');
  updateLabels(); reopenSheet(); if(quiz) nextQ(); lastHud=0;
}
onClick('bKids',()=>{ setKids(!kids);
  toast(tx('おとなモード：くわしい解説に切りかえました','ひらがなモード：かんじを つかわない おはなしに きりかえたよ')); });
function setRed(on){ red=on; document.body.classList.toggle('red',red); setPressed('bRed',red); lsSet('hzs_red',red?'1':'0'); }
onClick('bRed',()=>{ setRed(!red);
  if(red) toast(tx('赤いライト：暗さに慣れた目を守ります。画面の明るさも下げると効果的です','あかい ライト：くらい ところでも めが まぶしく ならないよ')); });

/* 時間たび */
const slider=$('tpSlider');
slider.addEventListener('pointerdown',()=>{ scrubbing=true; });
slider.addEventListener('input',()=>{ scrubbing=true; offsetMs=scrubBase+Number(slider.value)*60000; });
slider.addEventListener('change',()=>{ scrubBase=offsetMs; slider.value=0; scrubbing=false; });
function jumpTo(ms){ offsetMs=ms-Date.now(); scrubBase=offsetMs; slider.value=0; }
document.querySelectorAll('.tbtn[data-d]').forEach(b=>b.addEventListener('click',()=>jumpTo(simNow()+Number(b.dataset.d)*86400000)));
document.querySelectorAll('.tbtn[data-month]').forEach(b=>b.addEventListener('click',()=>{
  const d=new Date(simNow()); d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.month)); jumpTo(d.getTime());
}));
onClick('tpNowBtn',()=>{ jumpTo(Date.now()); setPlaying(false); });
function setPlaying(on){ playing=on; setPressed('tpPlay',on); updateLabels();
  if(on) toast(tx(`時間を${SPEEDS[speedIdx]}倍の速さで進めています。星がまわる「日周運動」を見てみよう`,'じかんを はやおくり ちゅう。ほしが ぐるっと まわるよ')); }
onClick('tpPlay',()=>setPlaying(!playing));
onClick('tpSpeed',()=>{ speedIdx=(speedIdx+1)%SPEEDS.length; updateLabels(); });

/* 場所 */
function locLabel(l){ return kids?(l.kana||l.name):l.name; }
function updateLabels(){
  $('bLoc').textContent=tx('場所: ','ばしょ: ')+locLabel(loc);
  $('tpPlay').textContent=playing?tx('⏸ とめる','⏸ とめる'):tx('▶ 早送り','▶ はやおくり');
  $('tpSpeed').textContent=tx(`はやさ ×${SPEEDS[speedIdx]}`,`はやさ ×${SPEEDS[speedIdx]}`);
  const list=$('locList');
  list.innerHTML='';
  for(const l of LOCS){
    const b=document.createElement('button');
    b.className='tbtn'; b.textContent=locLabel(l); b.setAttribute('aria-pressed',l.id===loc.id?'true':'false');
    b.addEventListener('click',()=>{ setLoc(l); closePanels();
      toast(l.lat<0?tx('シドニー（南半球）！太陽は北の空を通り、星は南の空を中心に回ります。南十字星もさがしてみて','シドニーは みなみはんきゅう。みなみじゅうじせいを さがしてみよう！')
                   :tx(`${l.name}の空に移動しました`,`${l.kana}の そらに いどう したよ`)); });
    list.appendChild(b);
  }
}
function setLoc(l){
  loc=l; lsSet('hzs_loc',JSON.stringify(l.id==='here'?l:{id:l.id}));
  faceDefault(); anim=null; updateLabels(); lastHud=0;
}
onClick('locHere',()=>{
  if(!navigator.geolocation){ toast(tx('この端末では位置情報が使えません','いる ばしょが わからなかったよ')); return; }
  navigator.geolocation.getCurrentPosition(p=>{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Tokyo';
    // 星空には0.1度（約10km）の精度で十分。保存するのも丸めた値だけ
    const lat=Math.round(p.coords.latitude*10)/10, lon=Math.round(p.coords.longitude*10)/10;
    setLoc({id:'here',name:'いまいる場所',kana:'いま いる ばしょ',lat,lon,tz});
    closePanels(); toast(tx('いまいる場所の空にしました','いま いる ばしょの そらに したよ'));
  },()=>toast(tx('位置情報を取得できませんでした。端末の設定で許可してください','いる ばしょが わからなかったよ')),
  {enableHighAccuracy:false,timeout:10000,maximumAge:600000});
});

/* ドックの右端が見えているかで、フェードを消す */
const dock=$('dock');
function dockFade(){ dock.classList.toggle('end',dock.scrollLeft+dock.clientWidth>=dock.scrollWidth-4); }
dock.addEventListener('scroll',dockFade,{passive:true}); addEventListener('resize',dockFade);

/* toast */
let toastTimer=0;
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),4200);
}

/* help */
onClick('helpBtn',()=>$('help').classList.add('open'));
onClick('helpStart',()=>{ $('help').classList.remove('open'); lsSet('hzs_seen','1'); cv.focus({preventScroll:true}); });

/* ---------------- はじまり ---------------- */
(function init(){
  const saved=lsGet('hzs_loc');
  if(saved){ try{ const o=JSON.parse(saved); const l=o.id==='here'?o:LOCS.find(x=>x.id===o.id); if(l&&isFinite(l.lat)&&isFinite(l.lon)) loc=l; }catch(e){} }
  if(lsGet('hzs_kids')==='1'){ kids=true; document.body.classList.add('kids'); setPressed('bKids',true); }
  if(lsGet('hzs_red')==='1') setRed(true);
  faceDefault(); updateLabels(); dockFade();

  const params=new URLSearchParams(location.search);
  const target=CONS.find(c=>c.id===params.get('c'));
  if(target){ focusCon(target); }
  else if(!nightNow()){
    // 昼間に開いたら、今夜21時の空へ
    jumpTo(nextLocalHour(Date.now(),21));
    setTimeout(()=>toast(tx('いまは昼間なので、今夜21時の空にワープしました🌙（「時間たび」→「いまに戻る」で現在へ）','いまは ひるま なので、こんやの 9じの そらに ワープしたよ🌙')),600);
  }
  if(!lsGet('hzs_seen') && !target) $('help').classList.add('open');
  requestAnimationFrame(render);
})();

/** 図鑑からのリンク（?c=ori）: その星座がよく見える夜の21時へワープして、向きを合わせる */
function focusCon(c){
  const maxAlt=90-Math.abs(loc.lat-Math.asin(c.center.sinD)/DEG);
  if(maxAlt<12 && loc.lat>0) setLoc(LOCS.find(l=>l.id==='sydney'));   // 日本からほぼ見えない南の星座
  const best=90-Math.abs(loc.lat-Math.asin(c.center.sinD)/DEG);
  const goal=Math.min(best-6,50)*DEG;
  const base=nextLocalHour(Date.now(),21,180);
  let when=base;
  for(let n=0;n<370;n++){
    const ms=base+n*86400000;
    if(conAltAz(c,ms)[0]>=goal){ when=ms; break; }
  }
  when=nextLocalHour(when,21,180);        // 夏時間の切りかわりをまたいでも「その日の21時」に合わせる
  jumpTo(when);
  const [a,z]=conAltAz(c,when);
  // 説明シートに隠れないよう、星座が画面の上のほうに来る向きにする
  az0=z; alt0=clamp(a-0.22*H/focal(),defaultAlt()*0.8,70*DEG);
  openCon(c);
  const p=localParts(when,loc.tz);
  toast(tx(`${c.jp}がよく見える ${+p.month}月${+p.day}日 21時の${loc.name}の空です`,
           `${c.kana}ざが よく みえる ${+p.month}がつ${+p.day}にち よる9じの そらだよ`));
}

/* オフライン対応（https か localhost で開いたときだけ） */
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){
  addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
