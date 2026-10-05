// (Dev tool) Membuat template folder "Intergranular-Piting Corrosion Test": foto contoh pada form dibuang dan diganti `slots`
// (kotak foto + label dari teks di dekatnya); sel sisa data contoh dikosongkan.
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const {convert}=require(ROOT+'tools/xlsx-to-template.js');
const fs=require('fs');
// pemakaian: node tools/build-corrosion-templates.js "<folder Excel Intergranular-Piting Corrosion Test>"
const dir = path.resolve(process.argv[2] || '.') + path.sep;
const file=s=>fs.readdirSync(dir).find(f=>f.includes(s));
const logos=new Set(JSON.parse(fs.readFileSync(ROOT+'lib/reportTemplates/bend-sec.json','utf8')).images.map(i=>i.data));
const jobs=[
 ['17-PITT-CORROSION-MAT','corr-pit-mat','origin'],['17-PITT-CORROSION-MAT','corr-pit-mat-ph1','Sheet1'],['17-PITT-CORROSION-MAT','corr-pit-mat-ph2','Sheet1 (2)'],
 ['17-PITT-CORROSION-Weld','corr-pit-weld','origin'],['17-PITT-CORROSION-Weld','corr-pit-weld-ph1','Sheet1'],['17-PITT-CORROSION-Weld','corr-pit-weld-ph2','Sheet1 (2)'],
 ['18-INT-CORROSION-B-Weld','corr-b-weld','1'],['18-INT-CORROSION-B-Weld','corr-b-weld-ph','2'],
 ['19-INT-CORROSION-C-Weld','corr-c-weld','1.4.1'],['19-INT-CORROSION-C-Weld','corr-c-weld-per','1.4.2'],
 ['28-INT-CORROSION-E-MAT','corr-e-mat','1'],
 ['29-INT-CORROSION-G28','corr-g28','1'],['29-INT-CORROSION-G28','corr-g28-ph1','2'],['29-INT-CORROSION-G28','corr-g28-ph2','3']
];
const BLANK_CELLS={ 'corr-c-weld-per':['J54','J56'] };
for (const [src,key,sheet] of jobs) {
  const t=convert(dir+file(src),sheet);
  const keep=[], photos=[];
  for (const im of t.images) (logos.has(im.data) || im.data.length < 20000 ? keep : photos).push(im);
  t.images=keep;
  photos.sort((a,b)=>(Math.round(a.y/40)-Math.round(b.y/40))||(a.x-b.x));
  t.slots=photos.map((p,i)=>{
    const cap=(t.shapes||[]).filter(s=>s.type==='text'&&s.x<p.x+p.w&&s.x+(s.w||0)>p.x&&Math.abs((s.y)-(p.y+p.h))<45&&!/After Testing/.test(s.text)).sort((a,b)=>Math.abs(a.y-(p.y+p.h))-Math.abs(b.y-(p.y+p.h)))[0];
    return { id:'s'+(i+1), x:p.x, y:p.y, w:p.w, h:p.h, label: cap?cap.text.trim():'Foto '+(i+1) };
  });
  // kotak teks di luar lebar form (mis. "After Testing" di kanan halaman foto) tidak ikut tercetak
  const W=t.cols.reduce((a,b)=>a+b,0);
  t.shapes=(t.shapes||[]).filter(s=>s.type==='line'||s.x<W-10);
  for (const ref of BLANK_CELLS[key]||[]) for (const r of t.rows) for (const c of r.cells) if (c.ref===ref) delete c.v;
  if (key==='corr-b-weld-ph') { t.slots[0].label='Before Testing'; t.slots[1].label='After Testing'; }
  if (key==='corr-e-mat') t.slots[0].label='Specimen Photograph (20X)';
  fs.writeFileSync(ROOT+'lib/reportTemplates/'+key+'.json',JSON.stringify(t));
  console.log(key.padEnd(18),'rows',t.rows.length,'logo/static img',t.images.length,'slots',t.slots.map(s=>s.label).join(' | '));
}
