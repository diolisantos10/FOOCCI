import sharp from "sharp";
const SCRATCH="/tmp/claude-0/-home-user-FOOCCI/a70cbc28-95df-5419-a31c-b76bce4daf91/scratchpad";
const ERODE=Number(process.argv[2]??2);

const MASKSRC="public/brand/foocci/foocci-mascot-cutout.png";
const RGBSRC="public/brand/foocci/foocci-mascot.png";
const am=await sharp(MASKSRC).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const W=am.info.width,H=am.info.height,N=W*H;
let M=new Uint8Array(N);
for(let i=0;i<N;i++) M[i]= am.data[i*4+3]>128?1:0;

// 1. Fill interior holes: flood !M from border; any !M not reached is an enclosed hole -> fill.
const reach=new Uint8Array(N), st=[];
const push=(i)=>{ if(!M[i]&&!reach[i]){reach[i]=1;st.push(i);} };
for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}
for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
while(st.length){const i=st.pop(),x=i%W,y=(i/W)|0;
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;push(ny*W+nx);}}
for(let i=0;i<N;i++) if(!M[i]&&!reach[i]) M[i]=1; // fill holes

// 2. Keep largest connected component (drop detached shadow/fringe islands).
const lab=new Int32Array(N).fill(0); let best=0,bestSize=0,cur=0;
for(let s=0;s<N;s++){ if(M[s]&&!lab[s]){ cur++; let size=0; const q=[s]; lab[s]=cur;
    while(q.length){const i=q.pop(),x=i%W,y=(i/W)|0;size++;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const j=ny*W+nx;if(M[j]&&!lab[j]){lab[j]=cur;q.push(j);}}}
    if(size>bestSize){bestSize=size;best=cur;} } }
for(let i=0;i<N;i++) M[i]= lab[i]===best?1:0;

// 3. Erode to tighten fringe.
function erode(src){const o=new Uint8Array(N);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let m=1;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H||!src[ny*W+nx])m=0;}o[y*W+x]=m;}return o;}
for(let k=0;k<ERODE;k++) M=erode(M);

// 4. Feather 1px.
const alpha=new Uint8ClampedArray(N);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){let s=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;s+=M[ny*W+nx];c++;}alpha[y*W+x]=Math.round(255*s/c);}

// 5. Apply to full-detail mascot RGB.
const rgb=await sharp(RGBSRC).removeAlpha().raw().toBuffer();
const out=Buffer.alloc(N*4);
for(let i=0;i<N;i++){out[i*4]=rgb[i*3];out[i*4+1]=rgb[i*3+1];out[i*4+2]=rgb[i*3+2];out[i*4+3]=alpha[i];}
await sharp(out,{raw:{width:W,height:H,channels:4}}).png().trim().toFile(SCRATCH+"/mascot-final.png");
const m=await sharp(SCRATCH+"/mascot-final.png").metadata();
await sharp({create:{width:m.width+110,height:m.height+90,channels:4,background:{r:0xF9,g:0x73,b:0x16,alpha:1}}})
  .composite([{input:SCRATCH+"/mascot-final.png",gravity:"center"}]).png().toFile(SCRATCH+"/mascot-final-on-orange.png");
console.log(`ERODE=${ERODE} largest=${bestSize}px trimmed=${m.width}x${m.height}`);
