import sharp from "sharp";
const SCRATCH = "/tmp/claude-0/-home-user-FOOCCI/a70cbc28-95df-5419-a31c-b76bce4daf91/scratchpad";
const TOL = Number(process.argv[2] ?? 22);
const FLOOR = Number(process.argv[3] ?? 175);
const ERODE = Number(process.argv[4] ?? 1);
const SRC = "public/brand/foocci/foocci-mascot.png";

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels, N = W * H;
const ch = (i,k)=>data[i*C+k];
const light = (i)=> Math.min(ch(i,0),ch(i,1),ch(i,2)) > FLOOR;

const bg = new Uint8Array(N);
const st = [];
const seed = (i)=>{ if(light(i)&&!bg[i]){ bg[i]=1; st.push(i);} };
for(let x=0;x<W;x++){ seed(x); seed((H-1)*W+x); }
for(let y=0;y<H;y++){ seed(y*W); seed(y*W+W-1); }
while(st.length){
  const i = st.pop(), x=i%W, y=(i/W)|0;
  const r=ch(i,0),g=ch(i,1),b=ch(i,2);
  const nb=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of nb){
    const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
    const j=ny*W+nx; if(bg[j]||!light(j)) continue;
    if(Math.abs(ch(j,0)-r)<=TOL && Math.abs(ch(j,1)-g)<=TOL && Math.abs(ch(j,2)-b)<=TOL){ bg[j]=1; st.push(j); }
  }
}
// mask = foreground
let mask = new Uint8Array(N);
for(let i=0;i<N;i++) mask[i] = bg[i]?0:1;
// erode to kill the thin light fringe
function erode(src){ const o=new Uint8Array(N);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ let m=1;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H||!src[ny*W+nx]) m=0; } o[y*W+x]=m; } return o; }
for(let k=0;k<ERODE;k++) mask=erode(mask);
// feather 1px
const alpha=new Uint8ClampedArray(N);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){ let s=0,c=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=W||ny>=H)continue; s+=mask[ny*W+nx]; c++; } alpha[y*W+x]=Math.round(255*s/c); }

let kept=0; for(let i=0;i<N;i++) if(mask[i]) kept++;
const out=Buffer.alloc(N*4);
for(let i=0;i<N;i++){ out[i*4]=ch(i,0); out[i*4+1]=ch(i,1); out[i*4+2]=ch(i,2); out[i*4+3]=alpha[i]; }
await sharp(out,{raw:{width:W,height:H,channels:4}}).png().trim().toFile(SCRATCH+"/mascot-flood.png");
const m=await sharp(SCRATCH+"/mascot-flood.png").metadata();
await sharp({create:{width:m.width+100,height:m.height+100,channels:4,background:{r:0xF9,g:0x73,b:0x16,alpha:1}}})
  .composite([{input:SCRATCH+"/mascot-flood.png",gravity:"center"}]).png().toFile(SCRATCH+"/mascot-flood-on-orange.png");
console.log(`TOL=${TOL} FLOOR=${FLOOR} ERODE=${ERODE} kept=${(100*kept/N).toFixed(1)}% trimmed=${m.width}x${m.height}`);
