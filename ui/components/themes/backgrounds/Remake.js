const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { cancelSceneFrame, fitCanvas, readThemeColors, sceneFrame, sceneQuality } from '../lib.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, a = 1) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const hash = (s) => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
function rng(seed) { let x = seed || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 1 | x), x ^= x + Math.imul(x ^ (x >>> 7), 61 | x), ((x ^ (x >>> 14)) >>> 0) / 4294967296)); }
const natural = {
  starfield:[126,166,255], void:[132,82,255], clouds:[120,180,235], nebula:[188,94,255], aurora:[42,235,180], particles:[80,188,255],
  matrix:[35,235,105], grid:[27,205,245], rain:[24,196,255], glitch:[255,43,164], fireflies:[255,202,72],
  lyria:[190,32,59], castle:[133,83,172], blood:[178,17,38], ash:[139,116,101], fog:[148,166,184], ravens:[94,83,145],
  abyss:[10,137,190], depths:[21,167,135], hellfire:[255,91,23], lava:[255,118,22],
  sakura:[246,118,176], autumn:[218,112,39], moonlit:[120,146,225], luna:[166,178,230], blizzard:[168,225,245], tundra:[102,214,226],
};

function palette(scene, mode, theme = readThemeColors()) {
  const base = natural[scene] || theme.accent;
  const accent = mix(base, theme.accent, .32);
  const light = mode === 'light';
  return {
    light,
    accent,
    accent2: mix(accent, scene === 'blood' || scene === 'hellfire' || scene === 'lava' ? [255,188,70] : [214,120,255], .38),
    sky0: light ? mix([252,253,255], accent, .055) : mix([4,6,14], accent, .055),
    sky1: light ? mix([235,242,249], accent, .12) : mix([8,12,24], accent, .16),
    sky2: light ? mix([216,227,238], accent, .18) : mix([13,16,30], accent, .25),
    ink: light ? mix([30,37,51], accent, .15) : mix([218,230,244], accent, .18),
    silhouette: light ? mix([35,45,60], accent, .18) : mix([0,2,7], accent, .075),
    mist: light ? [255,255,255] : mix([24,30,43], accent, .22),
  };
}

function gradient(ctx, W, H, p, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [at, c, a = 1] of stops) g.addColorStop(at, rgba(c, a));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function glow(ctx, x, y, r, color, alpha = .3) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(.35, rgba(color, alpha * .42)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function vignette(ctx, W, H, p, strength = .32) {
  const g = ctx.createRadialGradient(W*.5,H*.44,Math.min(W,H)*.12,W*.5,H*.48,Math.max(W,H)*.72);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,p.light ? `rgba(55,65,80,${strength*.18})` : `rgba(0,0,0,${strength})`);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
function star(ctx, x, y, r, c, a, cross=false) {
  ctx.fillStyle=rgba(c,a); ctx.beginPath(); ctx.arc(x,y,r,0,TAU);ctx.fill();
  if (cross && r>1) {ctx.strokeStyle=rgba(c,a*.6);ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-r*4,y);ctx.lineTo(x+r*4,y);ctx.moveTo(x,y-r*4);ctx.lineTo(x,y+r*4);ctx.stroke();}
}
function cloudBlob(ctx, x, y, w, h, c, a) {
  ctx.save();ctx.translate(x,y);
  for(let i=0;i<7;i++){const xx=(-.45+i*.15)*w;const yy=Math.sin(i*1.7)*h*.12;const rr=w*(.18+(i%3)*.035);const g=ctx.createRadialGradient(xx,yy,0,xx,yy,rr);g.addColorStop(0,rgba(c,a));g.addColorStop(1,rgba(c,0));ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(xx,yy,rr,h*(.42+(i%2)*.1),0,0,TAU);ctx.fill();}
  ctx.restore();
}
function fogBand(ctx,W,y,h,c,a,t,phase=0){const g=ctx.createLinearGradient(0,y-h,0,y+h);g.addColorStop(0,rgba(c,0));g.addColorStop(.5,rgba(c,a));g.addColorStop(1,rgba(c,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=W;x+=24)ctx.lineTo(x,y+Math.sin(x*.007+t*.22+phase)*h*.28+Math.sin(x*.017-t*.16)*h*.12);ctx.lineTo(W,y+h);ctx.lineTo(0,y+h);ctx.closePath();ctx.fill();}
function mountain(ctx,W,H,y,c,seed,rough=.13){const r=rng(seed);ctx.fillStyle=rgba(c,1);ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,y);let x=0;while(x<W){const step=45+r()*100;x+=step;ctx.lineTo(x,y-(.2+r())*H*rough);}ctx.lineTo(W,H);ctx.closePath();ctx.fill();}
function drawBranch(ctx,W,H,p,t){ctx.save();ctx.strokeStyle=rgba(p.silhouette,p.light?.72:.9);ctx.lineCap='round';ctx.lineWidth=Math.max(5,W*.009);ctx.beginPath();ctx.moveTo(-20,H*.26);ctx.bezierCurveTo(W*.13,H*.18,W*.18,H*.28,W*.38,H*.08);ctx.stroke();ctx.lineWidth=Math.max(2,W*.003);for(let i=0;i<9;i++){const x=W*(.05+i*.035);ctx.beginPath();ctx.moveTo(x,H*(.22-i*.008));ctx.quadraticCurveTo(x+30,H*(.1+i*.01),x+60,H*(.07+i*.007));ctx.stroke();}ctx.restore();}
function bird(ctx,x,y,s,rot,c,a=1){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.strokeStyle=rgba(c,a);ctx.lineWidth=Math.max(1,s*.08);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-s,0);ctx.quadraticCurveTo(-s*.45,-s*.55,0,0);ctx.quadraticCurveTo(s*.45,-s*.55,s,0);ctx.stroke();ctx.restore();}
function flame(ctx,x,y,w,h,c1,c2,t,phase){ctx.save();ctx.translate(x,y);const sway=Math.sin(t*2.4+phase)*w*.35;const g=ctx.createLinearGradient(0,0,0,-h);g.addColorStop(0,rgba(c1,.95));g.addColorStop(.45,rgba(c2,.72));g.addColorStop(1,rgba(c2,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-w*.5,0);ctx.bezierCurveTo(-w*.9,-h*.32,-w*.2+sway,-h*.58,sway,-h);ctx.bezierCurveTo(w*.15,-h*.58,w*.82,-h*.32,w*.5,0);ctx.closePath();ctx.fill();ctx.restore();}

/* Superficie lunar cacheada: la geología se compone una sola vez por tamaño y
   paleta. El loop sólo dibuja la textura, la corona y una respiración mínima. */
function crimsonMoonTexture(diameter,crimson,light,seed){
  const size=Math.max(128,Math.round(diameter)),moon=document.createElement('canvas');moon.width=size;moon.height=size;
  const c=moon.getContext('2d'),cx=size*.5,cy=size*.5,R=size*.485,r=rng(seed+size+(light?811:0));
  c.save();c.beginPath();c.arc(cx,cy,R,0,TAU);c.clip();
  const base=c.createRadialGradient(cx-R*.08,cy-R*.1,R*.04,cx,cy,R*1.02);
  base.addColorStop(0,rgba(light?mix([248,217,213],crimson,.34):mix(crimson,[244,79,88],.32),1));
  base.addColorStop(.48,rgba(mix(crimson,[210,38,58],.22),1));
  base.addColorStop(.84,rgba(mix(crimson,[118,8,27],.34),1));
  base.addColorStop(1,rgba(light?mix(crimson,[78,20,31],.35):mix(crimson,[48,1,13],.48),1));
  c.fillStyle=base;c.fillRect(0,0,size,size);

  /* Mares: masas blandas e irregulares, no lunares manchas circulares. */
  c.save();c.globalCompositeOperation='multiply';
  for(let i=0;i<12;i++){
    const a=r()*TAU,dist=Math.sqrt(r())*R*.7,x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist*.92;
    const rx=R*(.07+r()*.2),ry=rx*(.34+r()*.5),rot=r()*TAU;
    c.fillStyle=rgba(mix(crimson,[17,0,7],.72),.07+r()*.13);c.beginPath();
    c.ellipse(x,y,rx,ry,rot,0,TAU);c.ellipse(x+Math.cos(rot)*rx*.42,y+Math.sin(rot)*ry*.32,rx*.58,ry*.72,rot+.38,0,TAU);c.fill();
  }
  c.restore();

  /* Tierras altas y vetas minerales a varias escalas. */
  c.save();c.globalCompositeOperation=light?'soft-light':'screen';
  for(let i=0;i<90;i++){
    const a=r()*TAU,dist=Math.sqrt(r())*R*.93,x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist;
    const rr=R*(.003+r()*r()*.038);c.fillStyle=rgba(i%5?mix(crimson,[255,116,112],.42):[255,164,145],.015+r()*.055);
    c.beginPath();c.ellipse(x,y,rr*(1.3+r()*2.4),rr*(.28+r()*.65),r()*TAU,0,TAU);c.fill();
  }
  c.restore();

  /* Cráteres con sombra interior, borde iluminado y algunos sistemas de rayos. */
  for(let i=0;i<22;i++){
    const a=r()*TAU,dist=Math.sqrt(r())*R*.86,x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist;
    const rr=R*(.012+r()*r()*.075),squash=.68+r()*.25;
    c.fillStyle=rgba([22,0,7],.12+r()*.17);c.beginPath();c.ellipse(x+rr*.12,y+rr*.15,rr,rr*squash,r()*.6-.3,0,TAU);c.fill();
    c.strokeStyle=rgba(mix(crimson,[255,163,145],.62),.11+r()*.18);c.lineWidth=Math.max(.65,rr*.09);c.beginPath();c.ellipse(x-rr*.08,y-rr*.1,rr*.94,rr*squash*.9,0,Math.PI*1.02,Math.PI*1.88);c.stroke();
    c.strokeStyle=rgba(mix(crimson,[31,0,8],.8),.16+r()*.15);c.beginPath();c.ellipse(x+rr*.06,y+rr*.08,rr*.72,rr*squash*.67,0,.05,Math.PI*.94);c.stroke();
    if(i<5){c.save();c.globalAlpha=.06;c.strokeStyle=rgba([255,112,104],1);c.lineWidth=Math.max(.45,rr*.035);for(let ray=0;ray<9;ray++){const q=ray*TAU/9+r();c.beginPath();c.moveTo(x+Math.cos(q)*rr*1.1,y+Math.sin(q)*rr*1.1);c.lineTo(x+Math.cos(q)*rr*(2.1+r()*2.8),y+Math.sin(q)*rr*(2.1+r()*2.8));c.stroke();}c.restore();}
  }

  /* Grano fino y caída de luz hacia el limbo. */
  c.save();c.globalCompositeOperation='overlay';for(let i=0;i<250;i++){const a=r()*TAU,dist=Math.sqrt(r())*R*.98,x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist;c.fillStyle=i%2?rgba([255,176,158],.028):rgba([16,0,5],.05);c.fillRect(x,y,1+r()*1.4,1+r()*1.4);}c.restore();
  const limb=c.createRadialGradient(cx-R*.22,cy-R*.22,R*.2,cx,cy,R);limb.addColorStop(0,'rgba(18,0,5,0)');limb.addColorStop(.68,'rgba(18,0,5,.02)');limb.addColorStop(.88,'rgba(12,0,4,.2)');limb.addColorStop(1,'rgba(5,0,2,.62)');c.fillStyle=limb;c.fillRect(0,0,size,size);
  c.restore();
  c.strokeStyle=rgba(mix(crimson,[255,114,111],.42),light?.58:.72);c.lineWidth=Math.max(1,size*.006);c.beginPath();c.arc(cx,cy,R-size*.005,0,TAU);c.stroke();
  return moon;
}

function crimsonGodRays(ctx,W,H,mx,my,mr,crimson,t,light,energy=1,focusX=0){
  const reachY=H*.76,pulse=(.94+.06*Math.sin(t*.32))*energy;
  ctx.save();ctx.globalCompositeOperation=light?'source-over':'screen';
  /* Bloom sin blur: capas superpuestas con alpha decreciente */
  const bloom=ctx.createRadialGradient(mx,my+mr*.55,mr*.1,W*.5,H*.5,Math.max(W,H)*.5);
  bloom.addColorStop(0,rgba(mix(crimson,[255,78,77],.34),light?.08:.16*pulse));bloom.addColorStop(.5,rgba(crimson,light?.025:.055*pulse));bloom.addColorStop(1,rgba(crimson,0));ctx.fillStyle=bloom;ctx.fillRect(0,my,W,H-my);
  /* Capas adicionales para simular blur sin filter */
  for(let layer=0;layer<3;layer++){
    const layerAlpha=layer===0?1:layer===1?.6:.35;
    const layerSpread=layer*mr*.15;
    ctx.globalAlpha=layerAlpha;
    const broad=[[-.72,-.03,.16,.42],[-.22,.22,.65,.3],[.2,.4,.92,.34]];
    for(let i=0;i<broad.length;i++){
      const [from,to,dest,width]=broad[i],sx=mx+mr*from-layerSpread,sy=my+mr*Math.sqrt(Math.max(0,1-from*from))*.72,ex=W*(dest+focusX*.18),ey=reachY;
      const g=ctx.createLinearGradient(sx,sy,ex,ey);g.addColorStop(0,rgba(mix(crimson,[255,105,96],.38),light?.08:.15*pulse));g.addColorStop(.36,rgba(crimson,light?.035:.075*pulse));g.addColorStop(1,rgba(crimson,0));ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(sx-mr*.025-layerSpread,sy);ctx.lineTo(sx+mr*.025+layerSpread,sy);ctx.lineTo(ex+W*(width+layer*.015),ey);ctx.lineTo(ex-W*(width+layer*.015),ey);ctx.closePath();ctx.fill();
    }
  }
  ctx.globalAlpha=1;
  /* Hazes finos sin blur */
  for(let i=0;i<7;i++){
    const n=i/6,from=-.6+n*1.2,sx=mx+mr*from,sy=my+mr*Math.sqrt(Math.max(0,1-from*from))*.78;
    const ex=W*(-.1+n*1.2+focusX*(.08+n*.08))+Math.sin(i*2.13+1.7)*W*.06,ey=H*(.55+(i%3)*.08),half=W*(.008+(i%2)*.006);
    const g=ctx.createLinearGradient(sx,sy,ex,ey);g.addColorStop(0,rgba(mix(crimson,[255,118,105],.44),light?.09:(.12+(i%2)*.015)*pulse));g.addColorStop(.55,rgba(crimson,light?.03:.048*pulse));g.addColorStop(1,rgba(crimson,0));ctx.fillStyle=g;
    ctx.beginPath();ctx.moveTo(sx-mr*.006,sy);ctx.lineTo(sx+mr*.006,sy);ctx.lineTo(ex+half,ey);ctx.lineTo(ex-half,ey);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

class CinematicScene extends Component {
  constructor(props){super(props);this.ref=createRef();this.seed=hash(props.scene);this.data={};this.visible=true;this.pointer={x:.5,y:.5};}
  componentDidMount(){this.mount();}
  componentDidUpdate(prev){if(prev.scene!==this.props.scene){this.seed=hash(this.props.scene);this.init();}}
  componentWillUnmount(){cancelSceneFrame(this.raf);this.ro?.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('pointermove',this.onPointer);}
  mount(){const canvas=this.ref.current;if(!canvas)return;this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.quality=sceneQuality();this.resize=()=>{const s=fitCanvas(canvas,this.ctx,{maxDpr:this.props.scene==='lyria'?(this.quality==='low'?1.2:1.5):this.quality==='low'?1.35:2});this.W=s.width;this.H=s.height;this.init();};this.ro=new ResizeObserver(this.resize);this.ro.observe(canvas);this.onVisibility=()=>{this.visible=!document.hidden;if(this.visible&&!this.raf)this.loop(performance.now());};this.onPointer=e=>{this.pointer.x=e.clientX/Math.max(1,innerWidth);this.pointer.y=e.clientY/Math.max(1,innerHeight);};document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('pointermove',this.onPointer,{passive:true});this.resize();this.loop(performance.now());}
  init(){const W=this.W||1,H=this.H||1,r=rng(this.seed+Math.round(W)+Math.round(H));const q=this.quality==='low'?.48:1;this.data={
    stars:Array.from({length:Math.round((60+W*H/17000)*q)},()=>({x:r()*W,y:r()*H*.8,z:.2+r()*.8,a:.18+r()*.7,p:r()*TAU})),
    motes:Array.from({length:Math.round(130*q)},()=>({x:r()*W,y:r()*H,r:.5+r()*3,vx:(r()-.5)*.32,vy:(r()-.5)*.38,p:r()*TAU,a:.15+r()*.65})),
    drops:Array.from({length:Math.round(150*q)},()=>({x:r()*W,y:r()*H,l:12+r()*46,v:2+r()*5,a:.1+r()*.45})),
    leaves:Array.from({length:Math.round(90*q)},()=>({x:r()*W,y:r()*H,s:2+r()*7,vx:.2+r()*1.2,vy:.15+r()*.75,p:r()*TAU,rot:r()*TAU,a:.3+r()*.65})),
    bubbles:Array.from({length:Math.round(70*q)},()=>({x:r()*W,y:r()*H,r:1+r()*5,v:.15+r()*.7,p:r()*TAU,a:.1+r()*.5})),
    embers:Array.from({length:Math.round(110*q)},()=>({x:r()*W,y:r()*H,r:.5+r()*2.2,v:.3+r()*1.2,p:r()*TAU,a:.2+r()*.7})),
    birds:Array.from({length:Math.round(12*q)},()=>({x:r()*W,y:H*(.08+r()*.45),s:5+r()*13,v:.15+r()*.55,p:r()*TAU})),
  };}
  loop=(now)=>{this.raf=0;if(!this.visible)return;// Optimización: frame skipping adaptativo para lyria
    const isLyria=this.props.scene==='lyria';
    const baseMin=this.quality==='low'?33:16;
    const minFrame=isLyria?Math.min(baseMin,22):baseMin;// Lyria salta frames más agresivo
    if(!this.last||now-this.last>=minFrame){this.last=now;this.draw(now/1000);}
    if(this.quality!=='still')this.raf=sceneFrame(this.loop);};
  draw(t){const {scene,mode='dark'}=this.props,W=this.W,H=this.H,ctx=this.ctx;if(!ctx||!W||!H)return;const themeId=document.documentElement.dataset.tema||'',themeKey=`${themeId}:${mode}`,animated=themeId==='aurora';if(!this.themeColors||this.themeKey!==themeKey||(animated&&t-(this.themeReadAt||0)>.08)){this.themeColors=readThemeColors();this.themeKey=themeKey;this.themeReadAt=t;}const p=palette(scene,mode,this.themeColors);gradient(ctx,W,H,p,[[0,p.sky0],[.55,p.sky1],[1,p.sky2]]);this.drawScene(scene,p,t);vignette(ctx,W,H,p,scene==='clouds'||scene==='blizzard'?.18:.34);}
  drawScene(scene,p,t){const fn=this[`scene_${scene}`]||this.scene_particles;fn.call(this,p,t);}

  stars(p,t,dense=1){const {ctx,W,H}=this;for(const s of this.data.stars){const a=s.a*(.55+.45*Math.sin(t*(.5+s.z)+s.p));star(ctx,s.x,s.y,s.z*1.8,p.light?mix(p.accent,[30,40,60],.65):mix(p.ink,p.accent,.3),a*dense,s.z>.82);}}
  scene_starfield(p,t){const{ctx,W,H}=this;this.stars(p,t,1);for(let i=0;i<4;i++){const x=((t*(18+i*7)+i*W*.29)%(W+300))-150,y=H*(.12+i*.16);ctx.strokeStyle=rgba(p.accent,.12+i*.03);ctx.lineWidth=1+i*.35;ctx.beginPath();ctx.moveTo(x-130,y+28);ctx.lineTo(x,y);ctx.stroke();glow(ctx,x,y,34,p.accent,.22);}ctx.strokeStyle=rgba(p.accent,.09);for(let i=1;i<this.data.stars.length;i+=7){const a=this.data.stars[i-1],b=this.data.stars[i];if(Math.hypot(a.x-b.x,a.y-b.y)<150){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}}
  scene_void(p,t){
    const{ctx,W,H}=this,cx=W*.5,cy=H*.46,R=Math.min(W,H)*.082;
    gradient(ctx,W,H,p,[[0,p.light?mix([242,246,255],p.accent,.08):mix([2,4,14],p.accent,.05)],[.48,p.light?mix([220,228,246],p.accent,.13):mix([8,10,28],p.accent,.16)],[1,p.light?mix([188,200,221],p.accent,.16):mix([3,5,18],p.accent,.08)]]);
    this.stars(p,t,.95);
    for(let i=0;i<4;i++)glow(ctx,W*(.18+i*.22),H*(.12+(i%2)*.18),Math.min(W,H)*(.15+i*.02),i%2?p.accent:p.accent2,p.light?.05:.09);
    ctx.save();
    ctx.globalCompositeOperation=p.light?'multiply':'screen';
    for(let band=0;band<7;band++){
      const rot=-.34+band*.12+t*.01*(band%2?1:-1);
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(rot);
      ctx.scale(1,.28+.018*band);
      const rr=R*(1.8+band*.46);
      const g=ctx.createLinearGradient(-rr*1.2,0,rr*1.2,0);
      g.addColorStop(0,rgba(band%2?p.accent2:p.accent,0));
      g.addColorStop(.22,rgba(band%2?p.accent2:p.accent,p.light?.055:.14));
      g.addColorStop(.5,rgba(mix(p.accent,p.accent2,.5),p.light?.15:.3));
      g.addColorStop(.78,rgba(band%2?p.accent:p.accent2,p.light?.055:.14));
      g.addColorStop(1,rgba(p.accent,0));
      ctx.strokeStyle=g;ctx.lineWidth=2.5+band*1.35;ctx.beginPath();ctx.ellipse(0,0,rr,rr*(.9+.04*Math.sin(t*.8+band)),rot*.4,0,TAU);ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation=p.light?'source-over':'screen';
    for(let arc=0;arc<18;arc++){
      const start=t*.12+arc*.37;
      const rr=R*(1.35+(arc%6)*.22)+Math.sin(t+arc)*3;
      ctx.strokeStyle=rgba(arc%3?p.accent:p.accent2,p.light?.08:.18);
      ctx.lineWidth=1+(arc%4)*.55;
      ctx.beginPath();
      ctx.ellipse(cx,cy,rr,rr*(.34+(arc%3)*.05),-.22+arc*.03,start,start+.65+((arc%5)*.08));
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx,cx,cy,R*6.8,p.accent,p.light?.16:.26);
    glow(ctx,cx,cy,R*3.2,p.accent2,p.light?.12:.18);
    if(p.light){
      const core=ctx.createRadialGradient(cx-R*.22,cy-R*.28,0,cx,cy,R*1.08);
      core.addColorStop(0,'rgba(255,255,255,1)');
      core.addColorStop(.48,'rgba(255,252,236,.98)');
      core.addColorStop(.78,rgba(mix([245,238,255],p.accent,.12),.96));
      core.addColorStop(1,rgba(p.accent,.2));
      ctx.fillStyle=core;
    }else ctx.fillStyle='#010103';
    ctx.beginPath();ctx.arc(cx,cy,R*1.04,0,TAU);ctx.fill();
    ctx.strokeStyle=rgba(mix(p.accent,[255,255,255],p.light?.7:.18),p.light?.68:.72);ctx.lineWidth=p.light?3:1.6;ctx.beginPath();ctx.arc(cx,cy,R*1.16,0,TAU);ctx.stroke();
    ctx.strokeStyle=rgba(p.accent2,p.light?.18:.42);ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(cx,cy,R*1.27,Math.PI*.1,Math.PI*.84);ctx.stroke();
    for(let i=0;i<this.data.motes.length;i++){
      const m=this.data.motes[i];
      const orbit=R*(1.55+(i%18)*.16)+(i%7)*2;
      const drift=(t*(.35+(i%5)*.05))+(i*.57);
      const spiral=1+(Math.sin(t*.9+i)*.08);
      const x=cx+Math.cos(drift)*orbit*spiral;
      const y=cy+Math.sin(drift)*orbit*(.28+.015*(i%9))*spiral;
      const tailX=x-Math.cos(drift)*orbit*.05;
      const tailY=y-Math.sin(drift)*orbit*.015;
      ctx.strokeStyle=rgba(i%4?p.accent:p.accent2,m.a*(p.light?.16:.42));
      ctx.lineWidth=.6+m.r*.18;ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(x,y);ctx.stroke();
      star(ctx,x,y,Math.max(.6,m.r*.42),i%3?p.accent:p.accent2,m.a*(p.light?.32:.66));
    }
    for(let i=0;i<14;i++){
      const ang=t*.18+i*(TAU/14);
      const rr=R*(2.2+(i%4)*.38);
      const sx=cx+Math.cos(ang)*rr, sy=cy+Math.sin(ang)*rr*.28;
      glow(ctx,sx,sy,14+(i%3)*7,i%2?p.accent:p.accent2,p.light?.04:.08);
    }
  }
  scene_clouds(p,t){const{ctx,W,H}=this;const sun=p.light?[255,226,176]:mix(p.ink,p.accent,.18),sx=W*.78,sy=H*.18,sr=Math.min(W,H)*.1;glow(ctx,sx,sy,sr*3.2,sun,p.light?.34:.24);ctx.fillStyle=rgba(sun,p.light?.8:.58);ctx.beginPath();ctx.arc(sx,sy,sr,0,TAU);ctx.fill();for(let i=0;i<18;i++){const layer=i%5,dir=layer<2?1:-1,x=((i*241+t*dir*(5+layer*3))%(W+760))-380,y=H*(.04+(i%7)*.115)+Math.sin(t*.18+i)*12,w=300+layer*105,h=76+layer*20,c=p.light?mix([255,255,255],p.accent,.06+layer*.012):mix(p.sky2,p.accent,.13+layer*.025);cloudBlob(ctx,x,y,w,h,c,p.light?.27+layer*.027:.13+layer*.026);}ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<5;i++){const y=H*(.2+i*.115);ctx.strokeStyle=rgba(i%2?p.accent:p.accent2,p.light?.055:.075);ctx.lineWidth=1+i*.35;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=W;x+=28)ctx.lineTo(x,y+Math.sin(x*.005+t*.11+i)*18);ctx.stroke();}ctx.restore();fogBand(ctx,W,H*.82,H*.19,p.mist,p.light?.3:.15,t,2);}
  scene_nebula(p,t){const{ctx,W,H}=this;this.stars(p,t,.72);ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<7;i++){const x=W*(.18+(i%4)*.22)+Math.sin(t*.08+i)*70,y=H*(.18+(i%3)*.22)+Math.cos(t*.07+i)*55;glow(ctx,x,y,Math.min(W,H)*(.22+(i%3)*.08),i%2?p.accent:p.accent2,p.light?.11:.2);}ctx.restore();ctx.strokeStyle=rgba(p.accent,p.light?.12:.18);for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(-50,H*(i/12));ctx.bezierCurveTo(W*.28,H*(.1+((i*7)%10)/12),W*.68,H*(.9-((i*5)%9)/12),W+50,H*(.15+i/15));ctx.stroke();}}
  scene_aurora(p,t){
    const{ctx,W,H}=this;
    gradient(ctx,W,H,p,[[0,p.light?mix([241,247,255],p.accent,.08):mix([1,8,20],p.accent,.08)],[.46,p.light?mix([212,228,243],p.accent,.12):mix([4,14,31],p.accent,.16)],[1,p.light?mix([170,188,205],p.accent,.14):mix([3,7,16],p.accent,.07)]]);
    this.stars(p,t,.86);
    glow(ctx,W*.64,H*.16,Math.min(W,H)*.16,p.light?[255,245,225]:mix(p.accent,[255,240,220],.18),p.light?.15:.08);
    ctx.save();
    ctx.globalCompositeOperation=p.light?'multiply':'screen';
    const curtainCount=8;
    for(let band=0;band<curtainCount;band++){
      const hue=band%3===0?p.accent2:band%2?p.accent:mix(p.accent,p.ink,.18);
      const top=H*(.035+band*.04);
      const bottom=H*(.58+band*.03);
      const center=W*(.1+band*.11)+Math.sin(t*.22+band)*W*.045;
      const width=W*(.12+(band%4)*.028);
      const g=ctx.createLinearGradient(center,top,center,bottom);
      g.addColorStop(0,rgba(hue,0));
      g.addColorStop(.12,rgba(hue,p.light?.045:.11));
      g.addColorStop(.48,rgba(hue,p.light?.11:.24));
      g.addColorStop(.78,rgba(hue,p.light?.06:.15));
      g.addColorStop(1,rgba(hue,0));
      ctx.fillStyle=g;
      ctx.beginPath();
      for(let side=0;side<2;side++){
        for(let y=0;y<=36;y++){
          const k=y/36;
          const yy=top+k*(bottom-top);
          const fold=Math.sin(yy*.018+t*(2.5+band*.05)+band*1.4)*width*(.22+.48*k);
          const flutter=Math.sin(yy*.052-t*(3.2-band*.08)+band)*width*.08;
          const xx=center+(side?width:-width)*(.28+.58*k)+fold+(side?flutter:-flutter);
          if(side===0&&y===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle=rgba(mix(hue,[255,255,255],.22),p.light?.07:.14);
      ctx.lineWidth=1;
      for(let fil=0;fil<4;fil++){
        ctx.beginPath();
        for(let y=0;y<=28;y++){
          const k=y/28;
          const yy=top+k*(bottom-top);
          const xx=center+(fil-1.5)*width*.18+Math.sin(yy*.024+t*3.5+band+fil)*width*(.08+.24*k);
          if(y===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    mountain(ctx,W,H,H*.66,mix(p.silhouette,p.accent,.12),110,.22);
    mountain(ctx,W,H,H*.76,mix(p.silhouette,p.accent,.07),111,.16);
    const lakeY=H*.76;
    const wg=ctx.createLinearGradient(0,lakeY,0,H);
    wg.addColorStop(0,rgba(mix(p.sky2,p.accent,.08),p.light?.4:.72));
    wg.addColorStop(1,rgba(p.silhouette,.92));
    ctx.fillStyle=wg;ctx.fillRect(0,lakeY,W,H-lakeY);
    ctx.save();ctx.globalCompositeOperation=p.light?'overlay':'screen';
    for(let i=0;i<24;i++){
      const y=lakeY+i*(H-lakeY)/24;
      const spread=W*(.08+i*.012);
      const alpha=(24-i)*(.004)+(p.light?.01:.022);
      ctx.strokeStyle=rgba(i%3?p.accent:p.accent2,alpha);ctx.lineWidth=1+(i%5===0)*.5;
      ctx.beginPath();ctx.moveTo(W*.52-spread,y);ctx.lineTo(W*.52+spread,y+Math.sin(t*1.4+i)*2.4);ctx.stroke();
    }
    ctx.restore();
    for(let x=0;x<W;x+=26){const h=12+(x*13)%36;ctx.strokeStyle=rgba(p.ink,p.light?.14:.24);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+8,H-h*.55,x+Math.sin(t+x*.01)*5,H-h);ctx.stroke();}
    fogBand(ctx,W,lakeY,H*.06,p.mist,p.light?.1:.06,t,2);
  }
  scene_particles(p,t){const{ctx,W,H}=this;for(const m of this.data.motes){m.x+=m.vx;m.y+=m.vy;if(m.x<-10)m.x=W+10;if(m.x>W+10)m.x=-10;if(m.y<-10)m.y=H+10;if(m.y>H+10)m.y=-10;}ctx.lineWidth=.7;for(let i=0;i<this.data.motes.length;i++){const a=this.data.motes[i];for(let j=i+1;j<Math.min(i+9,this.data.motes.length);j++){const b=this.data.motes[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<105){ctx.strokeStyle=rgba(p.accent,(1-d/105)*(p.light?.11:.18));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}glow(ctx,a.x,a.y,a.r*7,p.accent,a.a*(p.light?.12:.25));star(ctx,a.x,a.y,a.r*.65,p.light?p.silhouette:p.ink,a.a*.7);}}
  scene_matrix(p,t){const{ctx,W,H}=this;const horizon=H*.68;ctx.fillStyle=rgba(p.silhouette,p.light?.14:.5);ctx.fillRect(0,horizon,W,H-horizon);ctx.strokeStyle=rgba(p.accent,p.light?.13:.22);ctx.lineWidth=1;for(let i=-12;i<=12;i++){ctx.beginPath();ctx.moveTo(W*.5,horizon);ctx.lineTo(W*.5+i*W*.12,H);ctx.stroke();}for(let i=0;i<16;i++){const k=((i/16+t*.08)%1);const y=horizon+(H-horizon)*k*k;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.font='12px Consolas,monospace';const chars='01アイウエオ{}<>░▒▓';for(let x=12;x<W;x+=24){const off=(t*(28+(x%5)*5)+x*3)%(H+180)-180;for(let y=off;y<H*.72;y+=28){const a=.08+.22*(1-y/H);ctx.fillStyle=rgba(p.accent,a);ctx.fillText(chars[(Math.floor(x+y+t*10)+chars.length)%chars.length],x,y);}}}
  scene_grid(p,t){const{ctx,W,H}=this,h=H*.55;glow(ctx,W*.5,h,Math.min(W,H)*.3,p.accent,p.light?.16:.26);ctx.strokeStyle=rgba(p.accent,p.light?.18:.3);for(let i=-15;i<=15;i++){ctx.beginPath();ctx.moveTo(W*.5,h);ctx.lineTo(W*.5+i*W*.1,H);ctx.stroke();}for(let i=0;i<24;i++){const k=((i/24+t*.055)%1);const y=h+(H-h)*k*k;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.fillStyle=rgba(p.light?mix([255,255,255],p.accent,.1):p.sky0,.72);ctx.fillRect(0,0,W,h);ctx.strokeStyle=rgba(p.accent,.16);for(let y=0;y<H;y+=5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}}
  scene_rain(p,t){const{ctx,W,H}=this;const skyline=H*.56;ctx.fillStyle=rgba(p.silhouette,p.light?.38:.88);for(let x=0;x<W;){const w=25+((x*17)%65),hh=45+((x*31)%210);ctx.fillRect(x,skyline-hh,w,H-skyline+hh);for(let yy=skyline-hh+12;yy<skyline;yy+=18){ctx.fillStyle=rgba((x/20+yy)%3?p.accent:p.accent2,.18);ctx.fillRect(x+7,yy,3,7);}ctx.fillStyle=rgba(p.silhouette,p.light?.38:.88);x+=w+7;}for(const d of this.data.drops){d.y+=d.v;if(d.y>H+50){d.y=-50;d.x=Math.random()*W;}ctx.strokeStyle=rgba(p.accent,d.a*(p.light?.45:.8));ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-5,d.y+d.l);ctx.stroke();}const rg=ctx.createLinearGradient(0,skyline,0,H);rg.addColorStop(0,rgba(p.accent,.12));rg.addColorStop(1,rgba(p.accent,0));ctx.fillStyle=rg;ctx.fillRect(0,skyline,W,H-skyline);}
  scene_glitch(p,t){const{ctx,W,H}=this;this.stars(p,t,.25);ctx.fillStyle=rgba(p.accent,.03);for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1);const r=rng(Math.floor(t*8)+this.seed);for(let i=0;i<18;i++){const y=r()*H,h=1+r()*18,x=(r()-.5)*60,w=W*(.15+r()*.75);ctx.fillStyle=rgba(i%2?p.accent:p.accent2,.025+r()*.08);ctx.fillRect(x,y,w,h);}for(let i=0;i<7;i++){const x=W*(.12+i*.13)+Math.sin(t*1.4+i)*8;ctx.strokeStyle=rgba(i%2?p.accent:p.accent2,.22);ctx.strokeRect(x,H*.2+(i%3)*H*.18,55+i*8,90+i*5);}}
  scene_fireflies(p,t){const{ctx,W,H}=this;mountain(ctx,W,H,H*.72,mix(p.silhouette,[20,42,30],.3),51,.18);ctx.fillStyle=rgba(p.silhouette,.9);for(let x=0;x<W;x+=35){const hh=H*(.12+((x*13)%100)/500);ctx.beginPath();ctx.moveTo(x,H);ctx.lineTo(x+15,H-hh);ctx.lineTo(x+30,H);ctx.fill();}for(const m of this.data.motes){m.p+=.012;m.x+=Math.cos(m.p)*.16;m.y+=Math.sin(m.p*.7)*.11;if(m.x<0)m.x=W;if(m.x>W)m.x=0;if(m.y<0)m.y=H;if(m.y>H)m.y=0;glow(ctx,m.x,m.y,10+m.r*4,p.accent,.2+m.a*.35);star(ctx,m.x,m.y,1.1,p.light?mix(p.accent,[90,60,10],.3):[255,238,130],.45+m.a*.45);}}
  scene_lyria(p,t){
    const{ctx,W,H}=this;
    const crimson=mix(p.accent,[255,0,34],.28), iron=mix(p.silhouette,[25,12,16],.24);
    const presenceState=document.querySelector('.llama-view')?.dataset.lyriaState||'ready';
    const uiEngaged=!!document.querySelector('.lyria-starter-grid button:hover,.chat-input-area textarea:focus,.chat-input-area input:focus');
    const energy=(({offline:.28,ready:.72,listening:1.08,thinking:.9,working:1.32})[presenceState]||.72)*(uiEngaged?1.2:1);
    gradient(ctx,W,H,p,[[0,p.light?mix([244,238,240],crimson,.08):mix([7,1,3],crimson,.055)],[.46,p.light?mix([221,211,216],crimson,.11):mix([14,1,5],crimson,.1)],[1,p.light?mix([188,176,182],crimson,.12):[3,0,1]]]);
    const mx=W*.5,my=Math.min(H*.16,W*.36),mr=Math.min(W*.28,H*.14);
    glow(ctx,mx,my,mr*3.2,crimson,p.light?.17:.23+.09*energy);
    ctx.save();ctx.filter=`blur(${Math.max(13,mr*.13)}px)`;ctx.strokeStyle=rgba(crimson,p.light?.18:.2);ctx.lineWidth=mr*.045;ctx.beginPath();ctx.arc(mx,my,mr*1.025,0,TAU);ctx.stroke();ctx.restore();
    const moonKey=`${Math.round(mr)}:${crimson.join(',')}:${p.light?'l':'d'}`;
    if(!this.data.lyriaMoonOff||this.data.lyriaMoonKey!==moonKey){this.data.lyriaMoonKey=moonKey;const m=crimsonMoonTexture(mr*2,crimson,p.light,this.seed+1701);const o=document.createElement('canvas');o.width=mr*2;o.height=mr*2;o.getContext('2d').drawImage(m,0,0);this.data.lyriaMoonOff=o;}
    ctx.drawImage(this.data.lyriaMoonOff,mx-mr,my-mr,mr*2,mr*2);
    ctx.save();ctx.globalCompositeOperation=p.light?'source-over':'screen';ctx.strokeStyle=rgba(mix(crimson,[255,121,116],.48),.11+.035*Math.sin(t*.45));ctx.lineWidth=Math.max(.8,mr*.006);ctx.beginPath();ctx.arc(mx,my,mr*1.006,-Math.PI*.72,Math.PI*.42);ctx.stroke();ctx.restore();
    // Optimización: cachear god rays en offscreen canvas (75% tamaño para velocidad)
    const raysKey=`${Math.round(mr)}:${crimson.join(',')}:${p.light?'l':'d'}:${Math.round(energy*10)}`;
    if(!this.data.lyriaRaysOff||this.data.lyriaRaysKey!==raysKey){this.data.lyriaRaysKey=raysKey;const rw=Math.round(W*.75),rh=Math.round(H*.75);const ro=document.createElement('canvas');ro.width=rw;ro.height=rh;const rctx=ro.getContext('2d');rctx.scale(rw/W,rh/H);crimsonGodRays(rctx,W,H,mx,my,mr,crimson,t,p.light,energy,(this.pointer?.x||.5)-.5);this.data.lyriaRaysOff=ro;}
    ctx.drawImage(this.data.lyriaRaysOff,0,0,W,H);
    // Optimización: cachear nubes en offscreen canvas (75% tamaño)
    const cloudsKey=`${Math.round(W)}:${Math.round(H)}:${p.light?'l':'d'}:${Math.round(energy*10)}`;
    if(!this.data.lyriaCloudsOff||this.data.lyriaCloudsKey!==cloudsKey){this.data.lyriaCloudsKey=cloudsKey;const cw=Math.round(W*.75),ch=Math.round(H*.75);const co=document.createElement('canvas');co.width=cw;co.height=ch;const cx=co.getContext('2d');cx.scale(cw/W,ch/H);cx.save();cx.beginPath();cx.rect(0,0,W,H);cx.arc(mx,my,mr*.91,0,TAU,true);cx.clip('evenodd');cx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<9;i++){const x=((i*193+t*(2.2+i*.45))%(W+460))-230,y=H*(.025+i*.05),w=250+(i%4)*72;cloudBlob(cx,x,y,w,54+(i%3)*18,mix([45,2,11],crimson,.3),p.light?.07:.1);}cx.restore();if(!p.light){cx.save();cx.beginPath();cx.rect(0,0,W,H);cx.arc(mx,my,mr*.9,0,TAU,true);cx.clip('evenodd');cx.globalCompositeOperation='source-over';for(let i=0;i<10;i++){const x=((i*211-t*(1.2+i*.23))%(W+520))-260,y=H*(.045+i*.045),w=280+(i%4)*78;cloudBlob(cx,x,y,w,58+(i%3)*19,mix([8,0,3],crimson,.045),.12+(i%3)*.018);}cx.restore();}this.data.lyriaCloudsOff=co;}
    ctx.drawImage(this.data.lyriaCloudsOff,0,0,W,H);
    const horizon=ctx.createRadialGradient(W*.5,H*.68,0,W*.5,H*.68,Math.max(W,H)*.58);horizon.addColorStop(0,rgba(crimson,p.light?.1:.13));horizon.addColorStop(.4,rgba(crimson,p.light?.045:.05));horizon.addColorStop(1,rgba(crimson,0));ctx.fillStyle=horizon;ctx.fillRect(0,H*.3,W,H*.7);
    mountain(ctx,W,H,H*.74,mix(iron,crimson,.16),414,.065);mountain(ctx,W,H,H*.82,iron,415,.045);
    const ground=H*.84;
    ctx.fillStyle=rgba(iron,.99);
    // Optimización: cachear torres y rama en offscreen canvas (75% tamaño)
    const towersKey=`${Math.round(W)}:${Math.round(H)}:${iron.join(',')}:${p.light?'l':'d'}`;
    if(!this.data.lyriaTowersOff||this.data.lyriaTowersKey!==towersKey){this.data.lyriaTowersKey=towersKey;const tw=Math.round(W*.75),th=Math.round(H*.75);const to=document.createElement('canvas');to.width=tw;to.height=th;const tx=to.getContext('2d');tx.scale(tw/W,th/H);tx.fillStyle=rgba(iron,.99);const towers=[{x:.02,w:.1,h:.24},{x:.12,w:.13,h:.34},{x:.25,w:.08,h:.27},{x:.76,w:.08,h:.23},{x:.89,w:.13,h:.32},{x:.99,w:.08,h:.25}];for(const q of towers){const x=W*q.x,w=W*q.w,towerH=Math.min(H*q.h,W*(.18+q.h*.42)),top=ground-towerH,spire=Math.min(H*(.055+q.h*.12),W*.12);tx.fillRect(x-w*.5,top,w,ground-top);tx.beginPath();tx.moveTo(x-w*.62,top);tx.lineTo(x,top-spire);tx.lineTo(x+w*.62,top);tx.fill();tx.fillRect(x-w*.7,top+Math.min(H*.055,W*.09),w*1.4,Math.max(2,Math.min(H*.006,W*.01)));tx.fillStyle=rgba(crimson,p.light?.32:.46);tx.beginPath();tx.roundRect(x-2.5,top+Math.min(H*.095,W*.15),5,14,2.5);tx.fill();tx.fillStyle=rgba(iron,.99);}tx.save();tx.strokeStyle=rgba(iron,.98);tx.lineCap='round';tx.lineWidth=Math.max(7,W*.011);tx.beginPath();tx.moveTo(W+18,H*.13);tx.bezierCurveTo(W*.9,H*.18,W*.86,H*.29,W*.72,H*.27);tx.stroke();tx.lineWidth=Math.max(2,W*.0035);for(let i=0;i<8;i++){const x=W*(.84+i*.024),y=H*(.24-i*.014);tx.beginPath();tx.moveTo(x,y);tx.quadraticCurveTo(x-W*.035,y-H*.075,x-W*(.07+i*.004),y-H*(.09+i*.01));tx.stroke();}tx.restore();this.data.lyriaTowersOff=to;}
    ctx.drawImage(this.data.lyriaTowersOff,0,0,W,H);
    // Optimización: solo 6 pájaros en lyria (de 12 globales)
    const lyriaBirds=this.data.birds.slice(0,6);
    for(const b of lyriaBirds){b.x+=b.v*.55;if(b.x>W+35)b.x=-35;b.y+=Math.sin(t*.7+b.p)*.06;bird(ctx,b.x,b.y,b.s*1.15,Math.sin(t+b.p)*.06,iron,.96);}
    // Optimización: solo 40 motes para lyria (de 130 globales)
    const lyriaMotes=this.data.motes.slice(0,40);
    for(const m of lyriaMotes){m.y-=.09+m.r*.035;m.x+=Math.sin(t*.7+m.p)*.12;if(m.y<-8){m.y=H+8;m.x=Math.random()*W;}star(ctx,m.x,m.y,Math.max(.5,m.r*.32),crimson,m.a*.22);}
    fogBand(ctx,W,H*.77,H*.13,mix(p.mist,crimson,.14),p.light?.16:.12,t,4);
  }
  scene_castle(p,t){const{ctx,W,H}=this;this.stars(p,t,.48);const mx=W*.76,my=H*.19,mr=Math.min(W,H)*.105;glow(ctx,mx,my,mr*2.3,p.accent,p.light?.18:.3);ctx.fillStyle=rgba(p.light?[255,248,220]:mix(p.ink,p.accent,.14),p.light?.86:.78);ctx.beginPath();ctx.arc(mx,my,mr,0,TAU);ctx.fill();mountain(ctx,W,H,H*.7,mix(p.silhouette,p.accent,.12),37,.11);const ground=H*.79,stone=mix(p.silhouette,p.accent,p.light?.14:.22);ctx.fillStyle=rgba(stone,.97);ctx.fillRect(W*.2,ground-H*.27,W*.6,H*.27);const towers=[{x:.18,w:.13,h:.31},{x:.36,w:.12,h:.25},{x:.64,w:.12,h:.25},{x:.82,w:.13,h:.33}];for(const q of towers){const x=W*q.x,w=W*q.w,top=ground-H*q.h;ctx.fillRect(x-w*.5,top,w,ground-top);const tooth=w/7;for(let k=0;k<7;k+=2)ctx.fillRect(x-w*.5+k*tooth,top-tooth*.7,tooth,tooth*.8);ctx.beginPath();ctx.moveTo(x-w*.58,top);ctx.lineTo(x,top-H*.075);ctx.lineTo(x+w*.58,top);ctx.fill();}ctx.fillStyle=rgba(p.accent,p.light?.5:.62);for(let x=W*.245;x<W*.77;x+=W*.073)for(let y=ground-H*.19;y<ground-H*.04;y+=H*.055){ctx.beginPath();ctx.roundRect(x,y,5,11,2);ctx.fill();}ctx.fillStyle=rgba(p.sky0,.22);ctx.beginPath();ctx.arc(W*.5,ground,W*.06,Math.PI,TAU);ctx.lineTo(W*.56,ground);ctx.lineTo(W*.44,ground);ctx.fill();ctx.strokeStyle=rgba(p.silhouette,.72);ctx.lineWidth=Math.max(2,W*.004);ctx.beginPath();ctx.moveTo(0,H*.92);ctx.quadraticCurveTo(W*.2,H*.72,W*.44,H*.84);ctx.quadraticCurveTo(W*.7,H*.96,W,H*.83);ctx.stroke();for(const b of this.data.birds){b.x+=b.v;if(b.x>W+30)b.x=-30;bird(ctx,b.x,b.y,b.s,Math.sin(t+b.p)*.05,p.silhouette,.85);}fogBand(ctx,W,ground,H*.15,p.mist,p.light?.3:.13,t,1);fogBand(ctx,W,H*.91,H*.11,p.mist,p.light?.22:.09,t,5);}
  scene_blood(p,t){const{ctx,W,H}=this;ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<13;i++){ctx.strokeStyle=rgba(i%3?p.accent:p.accent2,p.light?.09:.13);ctx.lineWidth=1+(i%4);ctx.beginPath();const y=H*(i/13);ctx.moveTo(0,y);for(let x=0;x<=W;x+=20)ctx.lineTo(x,y+Math.sin(x*.012+t*.65+i)*25+Math.sin(x*.035-t*.4)*8);ctx.stroke();}ctx.restore();for(const m of this.data.motes){m.y+=.18+m.r*.05;if(m.y>H)m.y=0;ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.p+t*.08);ctx.fillStyle=rgba(p.accent,.18+m.a*.28);ctx.beginPath();ctx.ellipse(0,0,m.r*2.3,m.r*.9,0,0,TAU);ctx.fill();ctx.restore();}for(let i=0;i<12;i++){const x=W*(.04+i*.085),len=H*(.05+(i%5)*.025);const g=ctx.createLinearGradient(0,0,0,len);g.addColorStop(0,rgba(p.accent,.24));g.addColorStop(1,rgba(p.accent,0));ctx.fillStyle=g;ctx.fillRect(x,0,2+(i%3),len);}}
  scene_ash(p,t){const{ctx,W,H}=this;glow(ctx,W*.7,H*.72,Math.min(W,H)*.32,p.accent,p.light?.13:.24);const peakX=W*.68,peakY=H*.61;mountain(ctx,W,H,H*.74,mix(p.silhouette,[70,48,36],.25),62,.12);mountain(ctx,W,H,H*.84,p.silhouette,63,.08);ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<8;i++){const y=peakY-H*(.055+i*.07),x=peakX+Math.sin(t*.18+i)*W*.018-i*W*.012,sz=Math.min(W,H)*(.05+i*.018),c=mix(p.mist,[92,78,68],.35);cloudBlob(ctx,x,y,sz*2.7,sz,c,p.light?.08+i*.012:.07+i*.014);}ctx.restore();ctx.strokeStyle=rgba(p.accent,p.light?.16:.24);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(peakX-W*.025,peakY);ctx.lineTo(peakX,peakY-H*.035);ctx.lineTo(peakX+W*.028,peakY);ctx.stroke();for(const m of this.data.motes){m.y-=.15+m.r*.08;m.x+=Math.sin(t+m.p)*.22;if(m.y<-10){m.y=H+10;m.x=Math.random()*W;}ctx.fillStyle=rgba(m.r>2?p.accent:p.ink,.17+m.a*.45);ctx.fillRect(m.x,m.y,m.r*.65,m.r*.65);}fogBand(ctx,W,H*.72,H*.17,mix(p.mist,[80,70,62],.3),p.light?.24:.13,t,4);}
  scene_fog(p,t){const{ctx,W,H}=this;mountain(ctx,W,H,H*.6,mix(p.silhouette,p.accent,.18),53,.11);for(let layer=0;layer<3;layer++){const base=H*(.7+layer*.07),step=64+layer*28;for(let x=-20;x<W+40;x+=step){const h=H*(.15+((x*(7+layer))%110)/520)*(1-layer*.16),c=mix(p.silhouette,p.accent,layer*.08);ctx.strokeStyle=rgba(c,p.light?.28-layer*.04:.78-layer*.13);ctx.lineWidth=Math.max(2,5-layer);ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-h);ctx.stroke();for(let k=0;k<5;k++){const yy=base-h*(.24+k*.14),spread=(h*(.19+k*.025));ctx.beginPath();ctx.moveTo(x-spread,yy+h*.05);ctx.lineTo(x,yy-h*.08);ctx.lineTo(x+spread,yy+h*.05);ctx.stroke();}}}ctx.fillStyle=rgba(p.silhouette,p.light?.19:.65);ctx.fillRect(W*.47,H*.48,W*.06,H*.22);ctx.beginPath();ctx.moveTo(W*.43,H*.49);ctx.lineTo(W*.5,H*.4);ctx.lineTo(W*.57,H*.49);ctx.fill();for(let i=0;i<9;i++)fogBand(ctx,W,H*(.1+i*.105),H*(.075+i*.008),i%2?p.mist:mix(p.mist,p.accent,.22),p.light?.17:.09,t*.58,i);}
  scene_ravens(p,t){const{ctx,W,H}=this;const mx=W*.72,my=H*.21,mr=Math.min(W,H)*.125;glow(ctx,mx,my,mr*2,p.accent,p.light?.17:.3);ctx.fillStyle=rgba(p.light?[250,245,226]:mix(p.ink,p.accent,.08),p.light?.8:.76);ctx.beginPath();ctx.arc(mx,my,mr,0,TAU);ctx.fill();mountain(ctx,W,H,H*.68,mix(p.silhouette,p.accent,.2),58,.1);const ravenInk=p.light?p.silhouette:mix(p.silhouette,p.accent,.32);drawBranch(ctx,W,H,{...p,silhouette:ravenInk},t);ctx.save();ctx.translate(W*.22,H*.19);ctx.fillStyle=rgba(ravenInk,.98);ctx.beginPath();ctx.ellipse(0,0,14,25,-.18,0,TAU);ctx.fill();ctx.beginPath();ctx.moveTo(-5,-21);ctx.lineTo(3,-36);ctx.lineTo(10,-19);ctx.fill();ctx.strokeStyle=rgba(p.accent,p.light?.55:.7);ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(4,-25,1.4,0,TAU);ctx.stroke();ctx.restore();for(const b of this.data.birds){b.x+=b.v*.72;if(b.x>W+40)b.x=-40;b.y+=Math.sin(t*.7+b.p)*.08;bird(ctx,b.x,b.y,b.s*1.35,Math.sin(t+b.p)*.08,ravenInk,.98);}for(let i=0;i<3;i++)bird(ctx,W*(.56+i*.08),H*(.34+i*.045),15+i*3,Math.sin(t+i)*.04,ravenInk,.95);fogBand(ctx,W,H*.77,H*.16,p.mist,p.light?.23:.11,t,3);}
  scene_abyss(p,t){const{ctx,W,H}=this;gradient(ctx,W,H,p,[[0,p.light?mix([210,239,248],p.accent,.1):mix([0,18,35],p.accent,.12)],[.55,p.light?mix([92,170,194],p.accent,.18):mix([0,23,43],p.accent,.24)],[1,p.light?mix([21,72,92],p.accent,.2):mix([0,3,12],p.accent,.08)]]);ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<6;i++){const x=W*(.04+i*.19);const g=ctx.createLinearGradient(x,0,x+W*.12,H);g.addColorStop(0,rgba(p.accent,p.light?.13:.16));g.addColorStop(1,rgba(p.accent,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+W*.12,0);ctx.lineTo(x+W*.28,H);ctx.lineTo(x+W*.08,H);ctx.fill();}ctx.restore();for(const b of this.data.bubbles){b.y-=b.v;if(b.y<-10){b.y=H+10;b.x=Math.random()*W;}ctx.strokeStyle=rgba(p.ink,b.a*.5);ctx.beginPath();ctx.arc(b.x+Math.sin(t+b.p)*4,b.y,b.r,0,TAU);ctx.stroke();}for(let i=0;i<5;i++){const x=W*(.15+i*.18),y=H*(.25+(i%3)*.16);glow(ctx,x,y,35,p.accent,.18);ctx.strokeStyle=rgba(p.accent,.45);ctx.beginPath();ctx.arc(x,y,8+(i%2)*5,0,TAU);ctx.stroke();for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(x-6+k*4,y+8);ctx.quadraticCurveTo(x+Math.sin(t+k)*10,y+36,x+Math.sin(t*1.2+k)*14,y+60);ctx.stroke();}}}
  scene_depths(p,t){this.scene_abyss(p,t);const{ctx,W,H}=this;ctx.fillStyle=rgba(p.silhouette,.86);ctx.fillRect(0,H*.88,W,H*.12);for(let x=0;x<W;x+=36){const h=20+((x*11)%70);ctx.strokeStyle=rgba(mix(p.silhouette,p.accent,.25),.9);ctx.lineWidth=2+(x%3);ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+Math.sin(t+x)*15,H-h*.5,x+Math.sin(t*.7+x)*10,H-h);ctx.stroke();}ctx.strokeStyle=rgba(p.accent,.3);ctx.strokeRect(W*.62,H*.67,W*.16,H*.2);ctx.beginPath();ctx.arc(W*.7,H*.77,W*.035,Math.PI,TAU);ctx.stroke();}
  scene_hellfire(p,t){const{ctx,W,H}=this;glow(ctx,W*.5,H*.92,Math.max(W,H)*.5,p.accent,p.light?.18:.36);for(let x=-20,i=0;x<W+20;x+=18,i++)flame(ctx,x,H+8,24+(i%4)*9,H*(.12+(i%5)*.035),p.accent,p.accent2,t,i*.7);for(const e of this.data.embers){e.y-=e.v;e.x+=Math.sin(t+e.p)*.35;if(e.y<0){e.y=H;e.x=Math.random()*W;}glow(ctx,e.x,e.y,e.r*8,p.accent,.18);star(ctx,e.x,e.y,e.r,p.accent2,e.a);}ctx.fillStyle=rgba(p.silhouette,.75);ctx.beginPath();ctx.moveTo(W*.28,H);ctx.lineTo(W*.32,H*.58);ctx.quadraticCurveTo(W*.5,H*.38,W*.68,H*.58);ctx.lineTo(W*.72,H);ctx.fill();}
  scene_lava(p,t){
    const{ctx,W,H}=this;
    gradient(ctx,W,H,p,[[0,p.light?mix([255,241,230],p.accent,.08):mix([18,5,3],p.accent,.1)],[.45,p.light?mix([233,198,173],p.accent,.12):mix([36,10,5],p.accent,.18)],[1,p.light?mix([135,78,46],p.accent,.18):mix([10,5,3],p.accent,.1)]]);
    glow(ctx,W*.52,H*.58,Math.max(W,H)*.38,p.accent,p.light?.18:.28);
    for(let i=0;i<5;i++)fogBand(ctx,W,H*(.12+i*.1),H*(.05+i*.012),mix([55,32,20],p.accent,.18),p.light?.05:.09,t*.45,i);
    const peakY=H*.58;
    ctx.fillStyle=rgba(mix(p.silhouette,[16,8,5],.2),.96);
    ctx.beginPath();
    ctx.moveTo(0,H*.82);
    ctx.lineTo(W*.23,H*.74);
    ctx.lineTo(W*.37,peakY);
    ctx.lineTo(W*.44,H*.44);
    ctx.lineTo(W*.5,H*.34);
    ctx.lineTo(W*.57,H*.44);
    ctx.lineTo(W*.64,peakY);
    ctx.lineTo(W*.8,H*.74);
    ctx.lineTo(W,H*.82);
    ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
    ctx.fillStyle=rgba(mix([6,6,6],p.silhouette,.2),.98);
    ctx.beginPath();ctx.moveTo(W*.43,H*.44);ctx.quadraticCurveTo(W*.5,H*.37,W*.57,H*.44);ctx.lineTo(W*.54,H*.48);ctx.quadraticCurveTo(W*.5,H*.45,W*.46,H*.48);ctx.closePath();ctx.fill();
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let s=0;s<6;s++){
      ctx.strokeStyle=rgba(s%2?p.accent:p.accent2,p.light?.12:.24);ctx.lineWidth=2+s*.5;ctx.beginPath();
      ctx.moveTo(W*(.485+s*.004),H*.45);
      for(let y=H*.45;y>H*.16;y-=14){const k=(H*.45-y)/(H*.29);const x=W*.5+Math.sin(t*2.4+k*7+s)*W*(.01+.018*k);ctx.lineTo(x,y);}ctx.stroke();
    }
    ctx.restore();
    const smoke=ctx.createLinearGradient(0,H*.18,0,H*.56);smoke.addColorStop(0,rgba(mix([62,48,43],p.accent,.08),0));smoke.addColorStop(.5,rgba(mix([52,38,32],p.accent,.08),p.light?.06:.12));smoke.addColorStop(1,rgba(mix([18,14,13],p.accent,.06),0));ctx.fillStyle=smoke;
    for(let i=0;i<5;i++){ctx.beginPath();const x=W*(.39+i*.045)+Math.sin(t*.4+i)*18;const y=H*(.35-i*.035);ctx.ellipse(x,y,40+i*18,24+i*14,Math.sin(t+i)*.25,0,TAU);ctx.fill();}
    const riverTop=H*.68;
    ctx.fillStyle=rgba(mix(p.silhouette,[14,7,4],.18),.98);ctx.fillRect(0,riverTop,W,H-riverTop);
    const channels=[
      [[0.5,riverTop],[0.48,H*.76],[0.44,H*.88],[0.41,H]],
      [[0.5,riverTop],[0.58,H*.76],[0.64,H*.87],[0.72,H]],
      [[0.5,riverTop],[0.52,H*.78],[0.53,H*.92],[0.56,H]],
      [[0.24,H*.77],[0.32,H*.83],[0.38,H*.94],[0.42,H]],
    ];
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let c=0;c<channels.length;c++){
      const pts=channels[c];
      for(let layer=0;layer<3;layer++){
        ctx.strokeStyle=layer===0?rgba(p.accent2,p.light?.4:.78):layer===1?rgba(p.accent,p.light?.34:.56):rgba([255,244,190],p.light?.22:.34);
        ctx.lineWidth=(layer===0?28:layer===1?16:6)-c*2;
        ctx.beginPath();
        pts.forEach(([nx,ny],i)=>{const xx=(Array.isArray(nx)?nx[0]:nx)*W + Math.sin(t*(1.3+layer*.2)+i+c)*W*.01; if(i===0)ctx.moveTo(xx,ny); else ctx.lineTo(xx,ny);});
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<40;i++){
      const x=(i*91)%W,y=riverTop+((i*37)%100)/100*(H-riverTop),len=18+(i%5)*9;
      ctx.strokeStyle=rgba(i%2?p.accent:p.accent2,p.light?.12:.32);ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len*Math.sin(i*.7+t),y+len*.55);ctx.stroke();
    }
    ctx.restore();
    for(const e of this.data.embers){e.y-=e.v*1.15;e.x+=Math.sin(t*2+e.p)*.8;if(e.y<0){e.y=H;e.x=W*.28+Math.random()*W*.46;}glow(ctx,e.x,e.y,e.r*10,p.accent,.14);star(ctx,e.x,e.y,e.r*.95,p.accent2,e.a*.78);}
    ctx.save();ctx.globalAlpha=p.light?.08:.14;ctx.strokeStyle=rgba(p.ink,1);for(let i=0;i<9;i++){ctx.lineWidth=2;ctx.beginPath();const y=H*(.56+i*.048);ctx.moveTo(0,y);for(let x=0;x<=W;x+=24)ctx.lineTo(x,y+Math.sin(x*.022+t*4+i)*3);ctx.stroke();}ctx.restore();
  }
  scene_sakura(p,t){const{ctx,W,H}=this;glow(ctx,W*.78,H*.2,Math.min(W,H)*.16,p.light?[255,224,233]:p.accent,.22);drawBranch(ctx,W,H,p,t);ctx.strokeStyle=rgba(p.accent,.5);ctx.lineWidth=3;for(let i=0;i<32;i++){const x=W*(.03+(i%10)*.038),y=H*(.07+((i*19)%18)/100);glow(ctx,x,y,12,p.accent,.16);ctx.fillStyle=rgba(mix(p.accent,[255,255,255],.25),.7);ctx.beginPath();ctx.arc(x,y,2+(i%3),0,TAU);ctx.fill();}for(const l of this.data.leaves){l.x+=l.vx;l.y+=l.vy;l.rot+=.02;if(l.x>W+10){l.x=-10;l.y=Math.random()*H*.5;}if(l.y>H+10)l.y=-10;ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rot);ctx.fillStyle=rgba(p.accent,l.a*.65);ctx.beginPath();ctx.ellipse(0,0,l.s,l.s*.45,0,0,TAU);ctx.fill();ctx.restore();}ctx.strokeStyle=rgba(p.silhouette,.5);ctx.lineWidth=3;ctx.strokeRect(W*.45,H*.66,W*.14,H*.14);ctx.fillRect(W*.47,H*.7,W*.1,3);}
  scene_autumn(p,t){const{ctx,W,H}=this;glow(ctx,W*.76,H*.18,Math.min(W,H)*.16,[255,194,95],p.light?.25:.18);mountain(ctx,W,H,H*.69,mix(p.silhouette,p.accent,.08),81,.14);mountain(ctx,W,H,H*.79,p.silhouette,82,.09);for(const l of this.data.leaves){l.x+=l.vx;l.y+=l.vy+Math.sin(t+l.p)*.2;l.rot+=.025;if(l.x>W+15){l.x=-15;l.y=Math.random()*H;}if(l.y>H+15)l.y=-15;ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rot);ctx.fillStyle=rgba(l.p%2?p.accent:p.accent2,l.a*.7);ctx.beginPath();ctx.moveTo(-l.s,0);ctx.quadraticCurveTo(0,-l.s*.65,l.s,0);ctx.quadraticCurveTo(0,l.s*.45,-l.s,0);ctx.fill();ctx.restore();}fogBand(ctx,W,H*.78,H*.12,p.mist,p.light?.16:.07,t,2);}
  scene_moonlit(p,t){const{ctx,W,H}=this;this.stars(p,t,.7);const mx=W*.72,my=H*.19,mr=Math.min(W,H)*.12;glow(ctx,mx,my,mr*2.5,p.accent,p.light?.2:.35);ctx.fillStyle=rgba(p.light?[255,248,220]:mix(p.ink,p.accent,.1),.9);ctx.beginPath();ctx.arc(mx,my,mr,0,TAU);ctx.fill();mountain(ctx,W,H,H*.58,mix(p.silhouette,p.accent,.13),90,.16);mountain(ctx,W,H,H*.66,mix(p.silhouette,p.accent,.07),91,.11);const water=H*.66;const wg=ctx.createLinearGradient(0,water,0,H);wg.addColorStop(0,rgba(mix(p.sky2,p.accent,.12),.82));wg.addColorStop(1,rgba(p.silhouette,.88));ctx.fillStyle=wg;ctx.fillRect(0,water,W,H-water);ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';for(let i=0;i<30;i++){const y=water+i*(H-water)/30,spread=W*(.04+i*.009),alpha=(30-i)*.007+(p.light?.02:.035);ctx.strokeStyle=rgba(i%3?p.accent:mix(p.ink,p.accent,.18),alpha);ctx.lineWidth=1+(i%4===0);ctx.beginPath();ctx.moveTo(mx-spread,y);ctx.lineTo(mx+spread,y+Math.sin(t*.8+i)*2);ctx.stroke();}ctx.restore();for(let x=0;x<W;x+=24){const h=18+(x*13)%75;ctx.strokeStyle=rgba(p.ink,p.light?.28:.38);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+8,H-h*.55,x+Math.sin(t+x)*6,H-h);ctx.stroke();}fogBand(ctx,W,water,H*.09,p.mist,p.light?.15:.07,t,7);}
  scene_luna(p,t){
    const{ctx,W,H}=this;
    gradient(ctx,W,H,p,[[0,p.light?mix([245,247,255],p.accent,.055):mix([3,5,17],p.accent,.08)],[.52,p.light?mix([224,229,244],p.accent,.11):mix([8,9,27],p.accent,.15)],[1,p.light?mix([190,198,218],p.accent,.13):mix([3,4,12],p.accent,.06)]]);
    this.stars(p,t,.72);
    const mx=W*.2,my=H*.2,mr=Math.min(W,H)*.145;
    glow(ctx,mx,my,mr*3,p.accent,p.light?.13:.28);
    const mg=ctx.createRadialGradient(mx-mr*.28,my-mr*.3,mr*.04,mx,my,mr);
    mg.addColorStop(0,p.light?'rgba(255,255,255,.99)':'rgba(255,252,238,.96)');
    mg.addColorStop(.55,p.light?rgba(mix([235,235,244],p.accent,.08),.98):rgba(mix([216,214,225],p.accent,.08),.92));
    mg.addColorStop(1,p.light?rgba(mix([150,158,184],p.accent,.1),.92):rgba(mix([88,82,110],p.accent,.1),.82));
    ctx.fillStyle=mg;ctx.beginPath();ctx.arc(mx,my,mr,0,TAU);ctx.fill();
    for(let i=0;i<11;i++){const a=i*2.31,r=mr*(.1+(i%4)*.17),x=mx+Math.cos(a)*mr*.55,y=my+Math.sin(a)*mr*.5;ctx.fillStyle=rgba(p.light?mix([85,91,112],p.accent,.08):[25,20,34],.08+(i%3)*.025);ctx.beginPath();ctx.ellipse(x,y,r,r*.62,a,0,TAU);ctx.fill();}
    ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';
    for(let i=0;i<7;i++){const x=((i*230+t*(4+i))%(W+500))-250,y=H*(.08+i*.085),w=260+i*45;cloudBlob(ctx,x,y,w,64+i*5,p.light?mix([235,239,248],p.accent,.05):mix([42,40,61],p.accent,.12),p.light?.12:.095);}
    ctx.restore();
    mountain(ctx,W,H,H*.66,mix(p.silhouette,p.accent,.12),301,.19);
    mountain(ctx,W,H,H*.78,p.silhouette,302,.11);
    const towerX=W*.73,base=H*.78;
    ctx.fillStyle=rgba(mix(p.silhouette,p.accent,.08),.95);ctx.fillRect(towerX-W*.055,base-H*.23,W*.11,H*.23);
    ctx.beginPath();ctx.moveTo(towerX-W*.072,base-H*.23);ctx.lineTo(towerX,base-H*.34);ctx.lineTo(towerX+W*.072,base-H*.23);ctx.fill();
    ctx.fillRect(towerX-W*.11,base-H*.16,W*.22,H*.16);
    ctx.fillStyle=rgba(p.accent,p.light?.25:.42);for(let i=-1;i<=1;i++){ctx.beginPath();ctx.roundRect(towerX+i*W*.05-3,base-H*.13,6,18,3);ctx.fill();}
    for(const b of this.data.birds){b.x+=b.v*.45;if(b.x>W+30)b.x=-30;bird(ctx,b.x,b.y,b.s*.85,Math.sin(t+b.p)*.04,p.silhouette,p.light?.5:.9);}
    fogBand(ctx,W,H*.8,H*.13,p.mist,p.light?.16:.08,t,6);
  }
  scene_blizzard(p,t){const{ctx,W,H}=this;mountain(ctx,W,H,H*.63,mix(p.silhouette,p.accent,.14),101,.26);mountain(ctx,W,H,H*.78,p.silhouette,102,.16);for(const d of this.data.drops){d.x+=d.v*.85;d.y+=d.v*.25;if(d.x>W+40){d.x=-40;d.y=Math.random()*H;}ctx.strokeStyle=rgba(p.light?p.silhouette:p.ink,d.a*.65);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.l,d.y+d.l*.18);ctx.stroke();}for(let i=0;i<7;i++)fogBand(ctx,W,H*(.18+i*.1),H*.06,p.mist,p.light?.16:.08,t*1.8,i);}
  scene_tundra(p,t){
    const{ctx,W,H}=this;
    gradient(ctx,W,H,p,[[0,p.light?mix([243,248,255],p.accent,.06):mix([2,12,22],p.accent,.06)],[.45,p.light?mix([215,231,245],p.accent,.1):mix([6,22,36],p.accent,.14)],[1,p.light?mix([188,204,218],p.accent,.14):mix([5,14,24],p.accent,.09)]]);
    this.stars(p,t,.8);
    ctx.save();ctx.globalCompositeOperation=p.light?'multiply':'screen';
    for(let band=0;band<5;band++){
      const top=H*(.05+band*.055), bottom=H*(.42+band*.04), center=W*(.18+band*.16)+Math.sin(t*.16+band)*W*.06, width=W*(.18+(band%3)*.045);
      const g=ctx.createLinearGradient(center,top,center,bottom);
      g.addColorStop(0,rgba(p.accent,0));g.addColorStop(.2,rgba(p.accent,p.light?.04:.09));g.addColorStop(.55,rgba(band%2?p.accent2:p.accent,p.light?.1:.2));g.addColorStop(1,rgba(p.accent,0));
      ctx.fillStyle=g;ctx.beginPath();
      for(let side=0;side<2;side++)for(let y=0;y<=24;y++){const k=y/24,yy=top+k*(bottom-top),flutter=Math.sin(yy*.022+t*3.1+band)*width*(.08+.28*k),xx=center+(side?1:-1)*width*(.22+.5*k)+flutter;if(side===0&&y===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);}ctx.closePath();ctx.fill();
    }
    ctx.restore();
    mountain(ctx,W,H,H*.58,mix(p.silhouette,p.accent,.13),210,.3);
    mountain(ctx,W,H,H*.68,mix(p.silhouette,p.accent,.08),211,.22);
    mountain(ctx,W,H,H*.8,p.silhouette,212,.12);
    const iceY=H*.76;
    const ice=ctx.createLinearGradient(0,iceY,0,H);ice.addColorStop(0,rgba(p.light?mix([238,246,252],p.accent,.1):mix([16,36,48],p.accent,.1),.9));ice.addColorStop(.55,rgba(p.light?mix([210,226,239],p.accent,.12):mix([11,24,35],p.accent,.08),.95));ice.addColorStop(1,rgba(mix(p.silhouette,p.accent,.04),.98));ctx.fillStyle=ice;ctx.fillRect(0,iceY,W,H-iceY);
    ctx.save();ctx.globalCompositeOperation=p.light?'overlay':'screen';
    for(let i=0;i<10;i++){const y=iceY+(i+1)*(H-iceY)/12;ctx.strokeStyle=rgba(i%2?p.accent:p.accent2,p.light?.06:.12);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=W;x+=30)ctx.lineTo(x,y+Math.sin(x*.015+t*1.8+i)*3);ctx.stroke();}
    ctx.restore();
    ctx.strokeStyle=rgba(p.ink,p.light?.2:.28);ctx.lineWidth=1.4;
    for(let i=0;i<7;i++){ctx.beginPath();const sx=W*(.05+i*.12),sy=H*(.8+(i%3)*.03);ctx.moveTo(sx,sy);for(let j=0;j<5;j++){ctx.lineTo(sx+Math.sin(i*3+j+t)*18*j,sy+j*12);}ctx.stroke();}
    for(let i=0;i<22;i++){
      const x=(i*57)%W, base=H*(.77+((i*19)%10)/80), h=18+(i%6)*14, w=4+(i%4)*3;
      const g=ctx.createLinearGradient(x,base,x,base-h);g.addColorStop(0,rgba(mix(p.silhouette,p.accent,.08),.22));g.addColorStop(.55,rgba(mix(p.accent,[255,255,255],.2),.28));g.addColorStop(1,rgba(p.ink,.42));
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-w,base);ctx.lineTo(x-w*.3,base-h*.35);ctx.lineTo(x,base-h);ctx.lineTo(x+w*.4,base-h*.5);ctx.lineTo(x+w,base);ctx.closePath();ctx.fill();
      ctx.strokeStyle=rgba(p.ink,p.light?.15:.24);ctx.lineWidth=.7;ctx.stroke();
    }
    for(const d of this.data.drops){d.x+=d.v*.9;d.y+=d.v*.18+Math.sin(t+d.a)*.18;if(d.x>W+30){d.x=-30;d.y=Math.random()*H;}ctx.strokeStyle=rgba(p.light?[255,255,255]:p.ink,d.a*(p.light?.3:.45));ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.l*.8,d.y+d.l*.14);ctx.stroke();}
    fogBand(ctx,W,H*.79,H*.085,p.mist,p.light?.08:.05,t,5);
  }
  render(){return html`<canvas ref=${this.ref} class="aurora-scene-canvas" aria-hidden="true"></canvas>`;}
}

const scene = (name) => function RemakeScene({ mode = 'dark' }) { return html`<${CinematicScene} scene=${name} mode=${mode} />`; };
export const RemakeStarfield=scene('starfield'); export const RemakeVoid=scene('void'); export const RemakeClouds=scene('clouds');
export const RemakeNebula=scene('nebula'); export const RemakeAurora=scene('aurora'); export const RemakeParticles=scene('particles');
export const RemakeMatrix=scene('matrix'); export const RemakeGrid=scene('grid'); export const RemakeRain=scene('rain'); export const RemakeGlitch=scene('glitch'); export const RemakeFireflies=scene('fireflies');
export const RemakeLyria=scene('lyria'); export const RemakeCastle=scene('castle'); export const RemakeBlood=scene('blood'); export const RemakeAsh=scene('ash'); export const RemakeFog=scene('fog'); export const RemakeRavens=scene('ravens');
export const RemakeAbyss=scene('abyss'); export const RemakeDepths=scene('depths'); export const RemakeHellfire=scene('hellfire'); export const RemakeLava=scene('lava');
export const RemakeSakura=scene('sakura'); export const RemakeAutumn=scene('autumn'); export const RemakeMoonlit=scene('moonlit'); export const RemakeLuna=scene('luna'); export const RemakeBlizzard=scene('blizzard'); export const RemakeTundra=scene('tundra');
