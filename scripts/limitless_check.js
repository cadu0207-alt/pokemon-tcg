// Valida cobertura de imagens da Limitless (tpci) por set/carta/idioma (HEAD em PT e EN de cada carta).
// Usado na troca de fonte de imagens (19/11/2026). Mantenha o MAP igual ao LMT_CODES do app.js.
// Uso: node check_limitless.js [setId ...]   (sem args = todos)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', 'cards') + path.sep;
const MAP = {me06:'DLR',me05:'PBL',me04:'CRI',me03:'POR',me02:'PFL',meg:'MEG',me2pt5:'ASC',mep:'MEP',
  zsv10pt5:'BLK',rsv10pt5:'WHT',pgo:'PGO',svp:'SVP',sv10:'DRI',sv9:'JTG',sv8pt5:'PRE',sv8:'SSP',sv7:'SCR',
  sv6pt5:'SFA',sv6:'TWM',sv5:'TEF',sv4pt5:'PAF',sv4:'PAR',sv3pt5:'MEW',sv3:'OBF',sv2:'PAL',sv1:'SVI'};
const B = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/';
function num(n){ return /^\d+$/.test(n) ? String(parseInt(n,10)).padStart(3,'0') : n; }
function url(code,n,lang,size){ return `${B}${code}/${code}_${num(n)}_R_${lang}_${size||'SM'}.png`; }
async function head(u){ for(let a=0;a<3;a++){ try{ const r=await fetch(u,{method:'HEAD',headers:{'User-Agent':'Mozilla/5.0'}}); return r.status; }catch(e){} } return 0; }
function load(setId){
  const f = ROOT+'cards_'+setId+'.js';
  if(!fs.existsSync(f)) return null;
  const src = fs.readFileSync(f,'utf8');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src+";this.__c=(typeof CARDS_"+setId.toUpperCase()+"!==\"undefined\")?CARDS_"+setId.toUpperCase()+":((typeof CARDS!==\"undefined\")?CARDS:null);", ctx);
  return ctx.__c;
}
(async()=>{
  const sets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MAP);
  for(const s of sets){
    const cards = load(s); if(!cards){ console.log(s,'sem cards'); continue; }
    const code = MAP[s]; const miss = {PT:[],EN:[]};
    const jobs = [];
    for(const c of cards) for(const L of ['PT','EN']) jobs.push([c,L]);
    let i=0;
    async function w(){ while(i<jobs.length){ const [c,L]=jobs[i++]; const st=await head(url(code,c.n,L)); if(st!==200) miss[L].push(c.n+(st!==403&&st!==404?'('+st+')':'')); } }
    await Promise.all(Array.from({length:16},w));
    console.log(`${s} [${code}] cartas=${cards.length} faltaPT=${miss.PT.length} faltaEN=${miss.EN.length}`+(miss.PT.length?' PT:'+miss.PT.slice(0,12).join(','):'')+(miss.EN.length?' EN:'+miss.EN.slice(0,12).join(','):''));
  }
})();
