(()=>{document.documentElement.classList.remove('no-js');
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));
// nav highlight
const links=[...document.querySelectorAll('.nav a.nl')];const map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
const so=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(l=>l.classList.remove('active'));const a=map.get(e.target.id);a&&a.classList.add('active')}}),{rootMargin:'-45% 0px -50% 0px'});
document.querySelectorAll('section[id]').forEach(s=>so.observe(s));
// only one video at a time
const vids=[...document.querySelectorAll('video')];vids.forEach(v=>v.addEventListener('play',()=>vids.forEach(o=>o!==v&&o.pause())));
// screenshot toggles + lightbox
const lb=document.querySelector('dialog.lb'),lbImg=lb.querySelector('img'),lbCap=lb.querySelector('.cap');let cur=null,idx=0;
function show(i){const imgs=cur.querySelectorAll('img');idx=(i+imgs.length)%imgs.length;lbImg.src=imgs[idx].src;lbImg.alt=imgs[idx].alt;lbCap.textContent=imgs[idx].alt}
document.querySelectorAll('.shots').forEach(s=>{
  const imgs=[...s.querySelectorAll('img')];
  const dots=[...s.querySelectorAll('.dots button')];
  const pair=s.classList.contains('pair');
  const set=i=>{if(pair)return;s.classList.toggle('alt',i===1);dots.forEach((d,j)=>d.setAttribute('aria-pressed',String(i===j)))};
  dots.forEach((d,j)=>d.addEventListener('click',e=>{e.stopPropagation();set(j)}));
  if(!pair){s.addEventListener('mouseenter',()=>set(1));s.addEventListener('mouseleave',()=>set(0))}
  const open=i=>{cur=s;show(typeof i==='number'?i:(s.classList.contains('alt')?1:0));lb.showModal()};
  s.addEventListener('click',()=>open());s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
  if(pair)imgs.forEach((img,i)=>img.addEventListener('click',e=>{e.stopPropagation();open(i)}));
});
lb.querySelector('[data-prev]').addEventListener('click',()=>show(idx-1));
lb.querySelector('[data-next]').addEventListener('click',()=>show(idx+1));
lb.querySelector('[data-close]').addEventListener('click',()=>lb.close());
lb.addEventListener('click',e=>{if(e.target===lb)lb.close()});
lb.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(idx-1);if(e.key==='ArrowRight')show(idx+1)});
})();
