(async function(){
  var $=function(i){return document.getElementById(i)};
  function val(k){var e=$(k);return e?e.value:''}
  function set(k,v){var e=$(k);if(e)e.value=v==null?'':v}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function msg(id,t,keep){var e=$(id);e.textContent=t;if(!keep)setTimeout(function(){if(e.textContent===t)e.textContent=''},3000)}
  function today(){var d=new Date(),m=d.getMonth()+1,dd=d.getDate();return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd}
  function pad3(n){n=String(n);while(n.length<3)n='0'+n;return n}
  function flat(v){return String(v||'').trim().replace(/\s*\n\s*/g,' ')}
  function one(v){return String(v||'').trim().replace(/\s*\n\s*/g,', ')}
  function clone(o){return JSON.parse(JSON.stringify(o))}
  function indent(v){return String(v).trim().split('\n').join('\n  ')}

  var BAK='';

  var FIELDS=['id','datum','ansvarig','initialer','fabrik','maskin','plc','progblock','datablock','hmi','fplc','komm','ovrigt','beskrivning','orsak','annat','saf','kval','saf_txt','kval_txt','bak_efter','verifierad','status','kommentar'];
  var OV=['ov_block','ov_besk','ov_orsak','ov_komm','ov_verif','ov_godk'];
  var PFIELDS=['fabrik','maskin','plc'];
  var LABEL={id:'Ändrings-ID',datum:'Datum',ansvarig:'Ansvarig',initialer:'Initialer',fabrik:'Fabrik',maskin:'Maskin',plc:'PLC-plattform',progblock:'Programblock',datablock:'Datablocker',hmi:'HMI',fplc:'Säkerhetslogik (F-PLC)',komm:'Kommunikation/nätverk',ovrigt:'Övrigt',beskrivning:'Beskrivning',orsak:'Orsak',annat:'Övrigt (motivering)',saf:'Säkerhetspåverkan',kval:'Kvalitépåverkan',saf_txt:'Motivering säkerhet',kval_txt:'Motivering kvalité',sim:'Simulering',mtest:'Maskintest',teststeg:'Teststeg',resultat:'Resultat',bak_fore:'Backup före',bak_efter:'Backup efter',verifierad:'Verifierad av',status:'Status',kommentar:'Kommentarer',qsync:'Synkad med Q',motiv:'Motivering',procName:'Process',images:'Bilder'};
  var OPEN_STATUS=['','Utkast','Under test','Väntar på godkännande'];

  // ---------- state ----------
  var curImages=[],sessionUploads={};
  var db=null,rootHandle=null,canWrite=true,me={name:'',initials:''};
  var procs=[],changes=[],loaded={procs:false,changes:false};
  var editing=null,orig=null,histUnsub=null,editingProc=null,chip='alla',confirmDel=false;

  function banner(t){var b=$('banner');if(!t){b.hidden=true;b.innerHTML='';return}b.hidden=false;b.innerHTML='<p>'+esc(t)+'</p>'}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}

  // ---------- vem är jag (sparas i den här webbläsaren) ----------
  var ME_KEY='andringslogg-jag-v1',prefs={ansvarig:'',initialer:''};
  function loadMe(){
    try{var m=JSON.parse(localStorage.getItem(ME_KEY)||'{}');prefs={ansvarig:m.ansvarig||'',initialer:m.initialer||''}}catch(e){}
    me={name:prefs.ansvarig,initials:prefs.initialer};
  }
  function meName(){return me.name||'Okänd användare'}
  function showWho(){$('who').textContent=me.name?('Du: '+me.name+(me.initials?' ('+me.initials+')':'')):'Fyll i ditt namn i en ny ändring'}
  function savePrefs(){
    if(editing)return;
    var a=val('ansvarig').trim(),i=val('initialer').trim();
    if(a===prefs.ansvarig&&i===prefs.initialer)return;
    prefs={ansvarig:a,initialer:i};me={name:a,initials:i};
    try{localStorage.setItem(ME_KEY,JSON.stringify(prefs))}catch(e){}
    showWho();
  }

  // ---------- Process-/hjälpfunktioner ----------
  function byOrder(a,b){return (a.order||0)-(b.order||0)}
  function procById(id){for(var i=0;i<procs.length;i++)if(procs[i]._id===id)return procs[i];return null}
  function procName(){var s=$('procSel');var p=procById(s.value);if(p)return p.name;var o=s.options[s.selectedIndex];return o?o.textContent:''}
  function fillProcSel(keep){
    var s=$('procSel'),cur=(keep!==undefined)?keep:s.value;s.innerHTML='';
    var o0=document.createElement('option');o0.value='';o0.textContent='Välj process …';s.appendChild(o0);
    procs.forEach(function(p){var o=document.createElement('option');o.value=p._id;o.textContent=p.name;s.appendChild(o)});
    if(cur&&!procById(cur)&&orig&&orig.procId===cur){var o=document.createElement('option');o.value=cur;o.textContent=orig.procName||cur;s.appendChild(o)}
    s.value=cur||'';
    var f=$('f_proc'),fc=f.value;f.innerHTML='<option value="">Alla</option>';
    procs.forEach(function(p){var o=document.createElement('option');o.value=p.name;o.textContent=p.name;f.appendChild(o)});
    f.value=fc;
  }
  function applyProc(){
    var p=procById($('procSel').value);if(!p)return;
    PFIELDS.forEach(function(k){if(p[k])set(k,p[k])});
    render();
  }

  // ---------- backup-/länkhjälp ----------
  function clean(s){return String(s||'').trim().replace(/^["']+|["']+$/g,'')}
  function isUrl(s){return /^(https?|file):/i.test(s)}
  function isPath(s){return /^[A-Za-z]:[\\\/]/.test(s)||/^\\\\/.test(s)}
  function linkable(s){return isUrl(s)||isPath(s)||/\.[A-Za-z0-9]{1,6}$/.test(s)}
  function fullPath(s){
    s=clean(s);if(!s)return '';
    if(isUrl(s)||isPath(s))return s;
    var b=clean(BAK).replace(/[\\\/]+$/,'');
    return b?b+'\\'+s:s;
  }
  function bakText(v){v=clean(v);if(!v)return '';return linkable(v)?fullPath(v):v}

  // ---------- ändringstext ----------
  function motivList(){
    var l=[];document.querySelectorAll('#motiv input:checked').forEach(function(c){l.push(c.value)});
    var a=val('annat').trim();if(a)l.push('Övrigt: '+a);return l;
  }
  function short(s,n){
    s=flat(s);if(s.length<=n)return s;
    var m=s.match(/^.*?[.!?](\s|$)/);
    if(m&&m[0].trim().length<=n)return m[0].trim().replace(/[.]$/,'');
    var c=s.slice(0,n),i=c.lastIndexOf(' ');
    return (i>n*0.6?c.slice(0,i):c).replace(/[,;:\s]+$/,'')+'…';
  }
  // Initialer = första bokstaven i varje namn
  function autoInit(name){return String(name||'').trim().split(/\s+/).filter(Boolean).map(function(w){return w[0].toUpperCase()}).join('')}
  var initTouched=false;
  function initials(){return val('initialer').trim()||autoInit(val('ansvarig'))}
  function auto(){
    var comps=[val('progblock'),val('datablock'),val('hmi'),val('fplc'),val('komm'),val('ovrigt')].map(one).filter(Boolean);
    return {
      ov_block:comps.join(', '),
      ov_besk:short(val('beskrivning'),90),
      ov_orsak:short(val('orsak'),70)||motivList().join(', '),
      ov_komm:flat(val('kommentar')),
      ov_verif:val('verifierad').trim(),
      ov_godk:''
    };
  }
  function render(){
    var kv=val('kval')==='Ja';
    $('qrow').hidden=!kv;
    var lines=[];
    if(kv)lines.push('Kvalitépåverkan kan påverka slutkund. Synka med Q.');
    if(val('saf')==='Ej bedömd'||val('kval')==='Ej bedömd')lines.push('Risk- och konsekvensanalysen är inte klar.');
    var n=$('riskNote');n.hidden=!lines.length;n.innerHTML=lines.map(function(l){return '<p>'+esc(l)+'</p>'}).join('');
    var a=auto();
    OV.forEach(function(k){var e=$(k);if(e.dataset.touched!=='1')e.value=a[k]});
  }

  // ---------- formulär <-> data ----------
  function getData(){
    var d={};
    FIELDS.forEach(function(k){d[k]=val(k).trim()});
    d.initialer=initials();
    d.qsync=$('qsync').checked;
    d.motiv=[];document.querySelectorAll('#motiv input:checked').forEach(function(c){d.motiv.push(c.value)});
    d.procId=$('procSel').value;d.procName=procName();
    d.images=curImages.slice();
    OV.forEach(function(k){d[k]=val(k)});
    d.ovTouched=OV.filter(function(k){return $(k).dataset.touched==='1'});
    return d;
  }
  function setForm(c){
    FIELDS.forEach(function(k){set(k,c[k])});
    initTouched=!!c.initialer&&c.initialer!==autoInit(c.ansvarig);
    $('qsync').checked=!!c.qsync;
    document.querySelectorAll('#motiv input').forEach(function(x){x.checked=(c.motiv||[]).indexOf(x.value)>=0});
    orig=c;fillProcSel(c.procId||'');
    curImages=(c.images||[]).slice();sessionUploads={};renderImages();
    var t=c.ovTouched||[];
    OV.forEach(function(k){$(k).dataset.touched=t.indexOf(k)>=0?'1':'0';set(k,c[k])});
    render();
  }
  function newForm(){
    editing=null;orig=null;
    FIELDS.forEach(function(k){set(k,'')});
    set('datum',today());set('saf','Nej');set('kval','Nej');set('status','Utkast');
    $('qsync').checked=false;
    document.querySelectorAll('#motiv input').forEach(function(c){c.checked=false});
    OV.forEach(function(k){$(k).dataset.touched='0';set(k,'')});
    curImages=[];sessionUploads={};renderImages();
    set('ansvarig',prefs.ansvarig);set('initialer',prefs.initialer||autoInit(prefs.ansvarig));
    initTouched=!!prefs.initialer&&prefs.initialer!==autoInit(prefs.ansvarig);
    applyProc();
    setEditing(null);
  }
  function setEditing(id){
    editing=id;
    $('formTitle').textContent=id?('Ändring '+id):'Ny ändring';
    $('formMsg').hidden=true;
    if(id)renderHist((orig&&orig.history)||[],'hist');
    else $('hist').innerHTML='<li class="hint">Historiken visas när ändringen är sparad.</li>';
  }
  function openChange(id){
    var c=null;changes.forEach(function(x){if(x._id===id)c=x});if(!c)return;
    setForm(Object.assign({},c));setEditing(id);show('ny');
  }
  function renderHist(items,target,noun){
    var box=$(target||'hist');
    items=(items||[]).slice().reverse();
    if(!items.length){box.innerHTML='<li class="hint">Ingen historik ännu.</li>';return}
    box.innerHTML=items.slice(0,80).map(function(h){
      var who=(h.by&&h.by!=='system')?h.by:(h.note||'Okänd användare');
      var when=h.at?new Date(h.at).toLocaleString('sv-SE'):'';
      var body=h.kind==='import'?'<p class="chg">Importerades från OneNote.</p>':h.kind==='create'?'<p class="chg">'+(noun||'Ändringen')+' skapades.</p>':(h.changes||[]).map(function(c){
        return '<p class="chg"><b>'+esc(LABEL[c.f]||c.f)+':</b> <i>'+esc(c.from||'(tomt)')+'</i> → '+esc(c.to||'(tomt)')+'</p>'}).join('');
      return '<li><div><b>'+esc(who)+'</b> <span class="when">'+esc(when)+'</span></div>'+body+'</li>';
    }).join('');
  }

  // ---------- spara ----------
  function sv(v){return Array.isArray(v)?v.join(', '):String(v==null?'':v)}
  function diff(a,b){
    var out=[];
    FIELDS.concat(['qsync','motiv','procName']).forEach(function(k){
      if(k==='id')return;
      var x=sv(a[k]),y=sv(b[k]);
      if(x!==y)out.push({f:k,from:x.slice(0,300),to:y.slice(0,300)});
    });
    var ai=(a.images||[]).map(function(i){return i.id}).join(','),bi=(b.images||[]).map(function(i){return i.id}).join(',');
    if(ai!==bi)out.push({f:'images',from:(a.images||[]).length+' st',to:(b.images||[]).length+' st'});
    return out;
  }
  async function claimId(data){
    var col=db.collection('changes');
    await col.poll();
    var maxN=0;
    Object.keys(col.cache).forEach(function(k){var n=parseInt(k,10)||0;if(n>maxN)maxN=n});
    for(var n=maxN+1;n<maxN+40;n++){
      var key=pad3(n),ref=db.doc('changes/'+key);
      if(await ref.exists())continue;
      data.id=key;
      data.history=(data.history||[]).concat([{at:data.createdAt,by:meName(),kind:data.imported?'import':'create',changes:[]}]);
      await ref.set(data);
      // Kontrollera att ingen annan hann skriva samma nummer samtidigt (synkfördröjning)
      await sleep(700);
      var chk=await ref.get();
      if(chk.exists&&chk.data().createdAt===data.createdAt&&chk.data().createdBy===data.createdBy)return key;
    }
    throw new Error('Kunde inte tilldela ett ID. Försök igen.');
  }
  async function save(){
    if(!db||!canWrite)return;
    var fm=$('formMsg');fm.hidden=true;
    var d=getData();
    if(!d.procId){msg('saveMsg','Välj en process först.');return}
    if(!d.beskrivning){msg('saveMsg','Skriv en beskrivning i avsnitt 3 först.');return}
    $('saveBtn').disabled=true;msg('saveMsg','Sparar …',true);
    var now=new Date().toISOString();
    try{
      if(editing){
        var ref=db.doc('changes/'+editing),cur=await ref.get();
        var cd=cur.exists?cur.data():null;
        if(cd&&orig&&cd.updatedAt!==orig.updatedAt){
          fm.hidden=false;
          fm.innerHTML='<p>Någon annan har sparat ändringen sedan du öppnade den. Dina ändringar är inte sparade.</p><div class="row"><button type="button" id="reloadLatest">Ladda senaste versionen (dina ändringar går förlorade)</button></div>';
          $('reloadLatest').onclick=function(){openChange(editing)};
          msg('saveMsg','');return;
        }
        var base=Object.assign({},cd||orig);delete base._id;
        var full=Object.assign(base,d,{id:editing,updatedAt:now,updatedBy:meName()});
        var changesList=diff(orig||{},d);
        full.history=((cd&&cd.history)||(orig&&orig.history)||[]).slice();
        if(changesList.length)full.history.push({at:now,by:meName(),kind:'update',changes:changesList});
        await ref.set(full);
        orig=Object.assign({_id:editing},full);renderHist(full.history,'hist');
        msg('saveMsg','Sparad.');
      }else{
        var data=Object.assign({},d,{createdAt:now,createdBy:meName(),updatedAt:now,updatedBy:meName()});
        var key=await claimId(data);
        orig=Object.assign({_id:key},data);
        setEditing(key);set('id',key);render();
        msg('saveMsg','Sparad som ändring '+key+'.');
      }
    }catch(e){
      msg('saveMsg','Det gick inte att spara'+(e&&e.message?': '+e.message:'')+'. Försök igen.',true);
    }finally{$('saveBtn').disabled=!canWrite}
  }

  // ---------- lista / uppföljning ----------
  function isOpen(c){return OPEN_STATUS.indexOf(c.status||'')>=0}
  function qMissing(c){return c.kval==='Ja'&&!c.qsync&&isOpen(c)}
  var CHIPS=[
    {k:'alla',t:'Alla',f:function(){return true}},
    {k:'oppna',t:'Öppna',f:isOpen},
    {k:'vantar',t:'Väntar på godkännande',f:function(c){return c.status==='Väntar på godkännande'}},
    {k:'q',t:'Q ej synkad',f:qMissing},
    {k:'risk',t:'Säkerhet/kvalité',f:function(c){return c.saf==='Ja'||c.kval==='Ja'}}
  ];
  function num(c){return parseInt(c._id,10)||0}
  function filtered(){
    var q=val('f_q').trim().toLowerCase(),fa=val('f_fabrik'),fp=val('f_proc'),fn=val('f_ans'),fs=val('f_status');
    var ch=CHIPS.filter(function(x){return x.k===chip})[0]||CHIPS[0];
    return changes.filter(function(c){
      if(!ch.f(c))return false;
      if(fa&&c.fabrik!==fa)return false;
      if(fp&&c.procName!==fp)return false;
      if(fn&&c.initialer!==fn)return false;
      if(fs&&c.status!==fs)return false;
      if(q){
        var hay=[c._id,c.procName,c.fabrik,c.maskin,c.ov_block,c.progblock,c.datablock,c.hmi,c.beskrivning,c.orsak,c.ov_besk,c.ov_orsak,c.initialer,c.ansvarig,c.kommentar].join(' ').toLowerCase();
        if(hay.indexOf(q)<0)return false;
      }
      return true;
    }).sort(function(a,b){return num(b)-num(a)});
  }
  function pill(s){
    var cls=s==='Godkänd'?'ok':(s==='Avslagen'||s==='Makulerad')?'bad':(s==='Väntar på godkännande'||s==='Under test')?'warn':'';
    return '<span class="pill '+cls+'">'+esc(s||'Ej angiven')+'</span>';
  }
  function renderList(){
    var box=$('chips');
    box.innerHTML=CHIPS.map(function(x){
      var n=changes.filter(x.f).length;
      return '<button type="button" class="chip" data-chip="'+x.k+'" aria-pressed="'+(chip===x.k)+'"><b>'+n+'</b><span>'+esc(x.t)+'</span></button>';
    }).join('');
    // ansvarig- och statusval
    var fa=$('f_ans'),cur=fa.value,seen={};
    changes.forEach(function(c){if(c.initialer)seen[c.initialer]=1});
    fa.innerHTML='<option value="">Alla</option>'+Object.keys(seen).sort().map(function(k){return '<option>'+esc(k)+'</option>'}).join('');fa.value=cur;
    var fs=$('f_status');if(!fs.options.length||fs.options.length<2){fs.innerHTML='<option value="">Alla</option>'+['Utkast','Under test','Väntar på godkännande','Godkänd','Avslagen','Makulerad'].map(function(s){return '<option>'+s+'</option>'}).join('')}
    var rows=filtered(),t=$('tbl');
    $('listCount').textContent=changes.length?(rows.length+' av '+changes.length+' ändringar'):'';
    if(!loaded.changes){t.innerHTML='<tr><td class="empty">Laddar ändringar …</td></tr>';return}
    if(!changes.length){t.innerHTML='<tr><td class="empty">Inga ändringar ännu. Tryck Ny ändring för att skriva den första.</td></tr>';return}
    if(!rows.length){t.innerHTML='<tr><td class="empty">Inga ändringar matchar filtren.</td></tr>';return}
    t.innerHTML='<thead><tr><th>ID</th><th>Datum</th><th>Ans.</th><th>Process</th><th>Maskin</th><th>Fabrik</th><th>Påverkat</th><th>Beskrivning</th><th>Orsak</th><th>Status</th><th>Flaggor</th></tr></thead><tbody>'+
      rows.map(function(c){
        var fl=[];
        if(c.saf==='Ja')fl.push('<span class="pill warn">Säkerhet</span>');
        if(c.kval==='Ja')fl.push('<span class="pill warn">Kvalité</span>');
        if(qMissing(c))fl.push('<span class="pill bad">Q ej synkad</span>');
        return '<tr data-open="'+esc(c._id)+'"><td><button type="button" class="idbtn" data-open="'+esc(c._id)+'">'+esc(c._id)+'</button></td><td>'+esc(c.datum)+'</td><td>'+esc(c.initialer)+'</td><td>'+esc(c.procName)+'</td><td>'+esc(c.maskin)+'</td><td>'+esc(c.fabrik)+'</td><td class="w">'+esc(c.ov_block||'')+'</td><td class="w">'+esc(c.ov_besk||short(c.beskrivning,90))+'</td><td class="w">'+esc(c.ov_orsak||short(c.orsak,70))+'</td><td>'+pill(c.status)+'</td><td><div class="flags">'+fl.join('')+'</div></td></tr>';
      }).join('')+'</tbody>';
  }
  // ---------- skrivskyddad visning ----------
  var viewing=null;
  function kv(rows){
    var h=rows.filter(function(r){return r[1]!=null&&String(r[1]).trim()!==''}).map(function(r){
      return '<dt>'+esc(r[0])+'</dt><dd>'+(r[2]?r[1]:esc(String(r[1]).trim()))+'</dd>';
    }).join('');
    return h?'<dl class="kv">'+h+'</dl>':'';
  }
  function dsec(n,title,body){return body?'<section class="card"><h2><span class="n">'+n+'</span>'+esc(title)+'</h2>'+body+'</section>':''}
  function renderDetail(){
    var c=null;changes.forEach(function(x){if(x._id===viewing)c=x});
    if(!c){$('detail').innerHTML='<section class="card"><p class="empty">Ändringen hittades inte.</p></section>';$('dTitle').textContent='Ändring';$('dStatus').innerHTML='';$('dMeta').textContent='';$('dWarn').hidden=true;return}
    $('dTitle').textContent='Ändring '+c._id;
    $('dStatus').innerHTML=pill(c.status);
    $('dEdit').disabled=!canWrite||!db;
    var w=[];
    if(qMissing(c))w.push('Kvalitépåverkan är markerad men ändringen är inte synkad med Q.');
    var dw=$('dWarn');dw.hidden=!w.length;dw.innerHTML=w.map(function(t){return '<p>'+esc(t)+'</p>'}).join('');
    var ans=c.ansvarig?(c.ansvarig+(c.initialer?' ('+c.initialer+')':'')):(c.initialer||'');
    var motiv=(c.motiv||[]).slice();if(c.annat)motiv.push('Övrigt: '+c.annat);
    var saf=c.saf?(c.saf+(c.saf_txt?' - '+c.saf_txt:'')):'';
    var kv_=c.kval?(c.kval+(c.kval_txt?' - '+c.kval_txt:'')+(c.kval==='Ja'?' (Synkad med Q: '+(c.qsync?'ja':'nej')+')':'')):'';
    $('detail').innerHTML=
      dsec('1','Allmän information',kv([['Ändrings-ID',c._id],['Datum',c.datum],['Ansvarig',ans],['Fabrik',c.fabrik],['Process',c.procName],['Maskin',c.maskin],['PLC-plattform',c.plc]]))+
      dsec('2','Påverkade komponenter',kv([['Programblock',c.progblock],['Datablocker',c.datablock],['HMI-sidor eller taggar',c.hmi],['Säkerhetslogik (F-PLC)',c.fplc],['Kommunikationsmoduler / nätverk',c.komm],['Övrigt',c.ovrigt]]))+
      dsec('3','Beskrivning och anledning',kv([['Beskrivning',c.beskrivning],['Orsak',c.orsak],['Motivering',motiv.join(', ')]])+(c.images&&c.images.length?'<div class="gallery">'+galleryHtml(c.images,false)+'</div>':''))+
      dsec('4','Risk- och konsekvensanalys',kv([['Säkerhetspåverkan',saf],['Kvalitépåverkan',kv_]]))+
      dsec('5','Backup-referenser',kv([['Backup efter ändring',bakText(c.bak_efter)]]))+
      dsec('6','Godkännande',kv([['Verifierad av',c.verifierad],['Status',pill(c.status),true],['Kommentarer',c.kommentar]]))+
      dsec('Ö','Översiktsrad',kv([['Påverkat program/block',c.ov_block],['Beskrivning',c.ov_besk],['Orsak',c.ov_orsak],['Kommentar',c.ov_komm],['Godkännande',c.ov_godk]]));
    var when=function(t){return t?new Date(t).toLocaleString('sv-SE'):''};
    var t=(c.imported?'Importerad':'Skapad')+' '+when(c.createdAt)+(c.createdBy&&c.createdBy!=='anon'?' av '+c.createdBy:'');
    if(c.updatedAt&&c.updatedAt!==c.createdAt)t+='. Senast ändrad '+when(c.updatedAt)+(c.updatedBy?' av '+c.updatedBy:'');
    $('dMeta').textContent=t+'.';
    renderHist(c.history,'dhist');
    hydrateImages($('detail'));
  }
  function showDetail(id){
    viewing=id;
    renderDetail();
    show('visa');
  }
  function csvCell(v){v=String(v==null?'':v).replace(/\r?\n/g,' ');return '"'+v.replace(/"/g,'""')+'"'}
  async function exportCsv(){
    var head=['ID','Datum','Ansvarig','Initialer','Process','Fabrik','Maskin','PLC','Programblock','Datablocker','HMI','F-PLC','Kommunikation','Övrigt','Beskrivning','Orsak','Säkerhetspåverkan','Kvalitépåverkan','Synkad med Q','Backup efter','Verifierad av','Status','Kommentar'];
    var rows=filtered().map(function(c){
      return [c._id,c.datum,c.ansvarig,c.initialer,c.procName,c.fabrik,c.maskin,c.plc,c.progblock,c.datablock,c.hmi,c.fplc,c.komm,c.ovrigt,c.beskrivning,c.orsak,c.saf,c.kval,c.qsync?'Ja':'',bakText(c.bak_efter),c.verifierad,c.status,c.kommentar].map(csvCell).join(';');
    });
    var csv='﻿'+head.map(csvCell).join(';')+'\r\n'+rows.join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='andringar-'+today()+'.csv';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href)},3000);
    msg('listMsg','Filen hämtades till din hämtningsmapp.')
  }

  // ---------- processer ----------
  function renderProcs(){
    var t=$('procTbl');
    if(!loaded.procs){t.innerHTML='<tr><td class="empty">Laddar …</td></tr>'}
    else if(!procs.length){t.innerHTML='<tr><td class="empty">Inga processer ännu. Lägg till processer längre ned på sidan.</td></tr>'}
    else t.innerHTML='<thead><tr><th>Process</th><th>Fabrik</th><th>Maskin</th><th>PLC‑plattform</th></tr></thead><tbody>'+
      procs.map(function(p){return '<tr><td><button type="button" class="idbtn" data-proc="'+esc(p._id)+'" style="font-family:inherit">'+esc(p.name)+'</button></td><td>'+esc(p.fabrik)+'</td><td>'+esc(p.maskin)+'</td><td>'+esc(p.plc)+'</td></tr>'}).join('')+'</tbody>';
  }
  function editProc(p){
    editingProc=p?p._id:null;
    $('pEditTitle').textContent=p?('Redigera process: '+p.name):'Ny process';
    ['name','fabrik','maskin','plc'].forEach(function(k){set('p_'+k,p?p[k]:'')});
    $('delProc').hidden=!p;confirmDel=false;$('delProc').textContent='Ta bort process';
  }
  async function saveProc(){
    if(!db||!canWrite)return;
    var d={name:val('p_name').trim(),fabrik:val('p_fabrik'),maskin:val('p_maskin').trim(),plc:val('p_plc').trim()};
    if(!d.name){msg('procMsg','Ange ett namn på processen.');return}
    try{
      if(editingProc){var p=procById(editingProc);d.order=p?p.order:999;await db.doc('processes/'+editingProc).set(d)}
      else{var mx=0;procs.forEach(function(p){if((p.order||0)>mx)mx=p.order});d.order=mx+1;var r=await db.collection('processes').add(d);editingProc=r.id;$('delProc').hidden=false}
      msg('procMsg','Process sparad.');
    }catch(e){msg('procMsg','Det gick inte att spara processen.')}
  }
  // ---------- import från OneNote ----------
  var IMP_TARGETS=[['','(hoppa över)'],['id','Ändrings-ID'],['datum','Datum'],['init','Ansvarig (initialer)'],['proc','Process'],['fabrik','Fabrik'],['block','Påverkat program/block'],['besk','Beskrivning'],['orsak','Orsak'],['vf','Version före'],['ve','Version efter'],['verif','Verifierad av'],['godk','Godkännande'],['komm','Kommentar']];
  var IMP_ORDER=['id','datum','init','proc','fabrik','block','besk','orsak','vf','ve','verif','godk','komm'];
  var HDR={andringsid:'id',id:'id',datum:'datum',ansvarig:'init',process:'proc',fabrik:'fabrik',paverkatprogramblock:'block',paverkat:'block',beskrivning:'besk',orsak:'orsak',versionfore:'vf',versionefter:'ve',verifieradav:'verif',verifierad:'verif',godkannande:'godk',godkand:'godk',kommentar:'komm'};
  var impRows=[],impMap=[],impBusy=false;
  function norm(s){return String(s||'').toLowerCase().replace(/[åä]/g,'a').replace(/ö/g,'o').replace(/é/g,'e').replace(/[^a-z0-9]/g,'')}
  function parseTSV(t){
    var rows=[],row=[],cur='',q=false;
    for(var i=0;i<t.length;i++){
      var ch=t[i];
      if(q){if(ch==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}
      else if(ch==='"'&&cur===''){q=true}
      else if(ch==='\t'){row.push(cur);cur=''}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cur);cur='';rows.push(row);row=[]}
      else cur+=ch;
    }
    if(cur!==''||row.length){row.push(cur);rows.push(row)}
    return rows.filter(function(r){return r.some(function(c){return c.trim()})});
  }
  function parseHtmlTable(html){
    try{
      var doc=new DOMParser().parseFromString(html,'text/html'),tb=doc.querySelector('table');if(!tb)return null;
      var rows=[];
      tb.querySelectorAll('tr').forEach(function(tr){
        var cells=[];
        tr.querySelectorAll(':scope > td, :scope > th').forEach(function(td){
          td.querySelectorAll('br').forEach(function(b){b.replaceWith('\n')});
          td.querySelectorAll('p,div').forEach(function(p){p.append('\n')});
          cells.push(td.textContent.replace(/ /g,' ').trim());
        });
        if(cells.some(function(c){return c}))rows.push(cells);
      });
      return rows.length?rows:null;
    }catch(e){return null}
  }
  function setImp(rows){
    var ncol=rows.reduce(function(m,r){return Math.max(m,r.length)},0);
    rows=rows.map(function(r){var o=[];for(var i=0;i<ncol;i++)o.push(String(r[i]==null?'':r[i]).trim());return o});
    var first=rows[0].map(function(h){return HDR[norm(h)]||''});
    if(first.filter(Boolean).length>=3){impMap=first;impRows=rows.slice(1)}
    else{impMap=IMP_ORDER.slice(0,ncol);while(impMap.length<ncol)impMap.push('');impRows=rows}
    $('imp_paste').value=rows.map(function(r){return r.map(flat).join('\t')}).join('\n');
    renderImp();
  }
  function impGet(r,t){var i=impMap.indexOf(t);return i<0?'':flat(r[i]||'')}
  function normDate(s){
    var m=String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+'-'+pad3(m[2]).slice(1)+'-'+pad3(m[3]).slice(1);
    m=String(s).match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);if(m)return m[3]+'-'+pad3(m[2]).slice(1)+'-'+pad3(m[1]).slice(1);
    return s;
  }
  function impRecords(){
    var existing={};changes.forEach(function(c){existing[c._id]=1});
    var seen={},now=new Date().toISOString(),defStat=val('imp_stat');
    return impRows.map(function(r){
      var g=function(t){return impGet(r,t)};
      var m=g('id').match(/\d+/),id=m?pad3(parseInt(m[0],10)):'';
      var besk=g('besk'),block=g('block'),orsak=g('orsak');
      var state='ok',note='Ny';
      if(!besk&&!block&&!orsak){state='tom';note='Tom rad, hoppas över'}
      else if(id&&seen[id]){state='dup';note='ID finns två gånger i inklistret, hoppas över'}
      else if(id&&existing[id]){state=val('imp_dup')==='over'?'over':'dup';note=state==='over'?'Skriver över befintlig':'Finns redan, hoppas över'}
      else if(!id)note='Nytt ID tilldelas';
      if(id)seen[id]=1;
      var pn=g('proc'),p=null;
      procs.forEach(function(x){if(norm(x.name)===norm(pn))p=x});
      if(state==='ok'||state==='over'){if(pn&&!p)note+=' (okänd process: '+pn+')';else if(!pn)note+=' (process saknas)'}
      var fabrikV=g('fabrik');if(!/^(chain|bars)$/i.test(fabrikV))fabrikV=p?p.fabrik||'':'';else fabrikV=/^chain$/i.test(fabrikV)?'Chain':'Bars';
      var ovT=['ov_block','ov_besk','ov_orsak','ov_komm','ov_verif','ov_godk'];
      var rec={id:id,datum:normDate(g('datum')),ansvarig:'',initialer:g('init'),fabrik:fabrikV,maskin:p?p.maskin||'':'',plc:p?p.plc||'':'',
        progblock:block,datablock:'',hmi:'',fplc:'',komm:'',ovrigt:'',beskrivning:besk,orsak:orsak,annat:'',saf:'Ej bedömd',kval:'Ej bedömd',saf_txt:'',kval_txt:'',
        bak_fore:g('vf'),bak_efter:g('ve'),verifierad:g('verif'),status:g('godk')?'Godkänd':defStat,kommentar:g('komm'),
        qsync:false,motiv:[],procId:p?p._id:'',procName:p?p.name:pn,
        ov_block:block,ov_besk:besk,ov_orsak:orsak,ov_komm:g('komm'),ov_verif:g('verif'),ov_godk:g('godk'),ovTouched:ovT,
        imported:true,importedAt:now,createdAt:now,createdBy:meName(),updatedAt:now,updatedBy:meName()};
      return {row:r,rec:rec,state:state,note:note};
    });
  }
  function renderImp(){
    var card=$('imp_card');
    if(!impRows.length){card.hidden=true;$('imp_go').disabled=true;return}
    card.hidden=false;
    var recs=impRecords();
    var go=recs.filter(function(x){return x.state==='ok'||x.state==='over'}).length;
    var skip=recs.length-go;
    $('imp_sum').textContent=impRows.length+' rader inlästa. '+go+' importeras'+(skip?', '+skip+' hoppas över':'')+'. Ändra kolumnkopplingen i tabellens översta rad om något är fel.';
    $('imp_go').disabled=!(go&&db&&canWrite)||impBusy;
    var head='<thead><tr>'+impMap.map(function(t,i){
      return '<th><select data-col="'+i+'" aria-label="Kolumn '+(i+1)+'">'+IMP_TARGETS.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===t?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select></th>';
    }).join('')+'<th>Resultat</th></tr></thead>';
    var body='<tbody>'+recs.slice(0,300).map(function(x){
      var cls=(x.state==='ok'||x.state==='over')?'':'bad';
      return '<tr>'+x.row.map(function(c){return '<td>'+esc(flat(c))+'</td>'}).join('')+'<td><span class="pill '+cls+'">'+esc(x.note)+'</span></td></tr>';
    }).join('')+'</tbody>';
    $('imp_prev').innerHTML=head+body;
  }
  async function runImport(){
    if(!db||!canWrite||impBusy)return;
    var recs=impRecords().filter(function(x){return x.state==='ok'||x.state==='over'});
    if(!recs.length)return;
    impBusy=true;$('imp_go').disabled=true;
    var maxN=0;changes.forEach(function(c){var n=parseInt(c._id,10)||0;if(n>maxN)maxN=n});
    recs.forEach(function(x){var n=parseInt(x.rec.id,10)||0;if(n>maxN)maxN=n});
    var done=0,failed=0;
    for(var i=0;i<recs.length;i++){
      var x=recs[i],rec=x.rec;
      if(!rec.id){maxN++;rec.id=pad3(maxN)}
      msg('imp_msg','Importerar '+(i+1)+' av '+recs.length+' …',true);
      try{
        rec.history=[{at:new Date().toISOString(),by:meName(),kind:'import',changes:[]}];
        await db.doc('changes/'+rec.id).set(rec);
        done++;
      }catch(e){failed++}
    }
    impBusy=false;
    msg('imp_msg',done+' ändringar importerade'+(failed?', '+failed+' misslyckades. Importera om dem.':'.'),true);
    impRows=[];impMap=[];$('imp_paste').value='';renderImp();
  }
  $('imp_paste').addEventListener('paste',function(e){
    var cd=e.clipboardData;if(!cd)return;
    var html=cd.getData('text/html'),rows=null;
    if(html&&/<table/i.test(html))rows=parseHtmlTable(html);
    if(!rows){var tx=cd.getData('text/plain');if(tx)rows=parseTSV(tx)}
    if(rows&&rows.length){e.preventDefault();setImp(rows)}
  });
  $('imp_paste').addEventListener('input',function(){var t=$('imp_paste').value;if(!t.trim()){impRows=[];impMap=[];renderImp();return}setImp(parseTSV(t))});
  $('imp_prev').addEventListener('change',function(e){var s=e.target.closest('select[data-col]');if(s){impMap[+s.dataset.col]=s.value;renderImp()}});
  $('imp_dup').addEventListener('change',renderImp);
  $('imp_stat').addEventListener('change',renderImp);
  $('imp_go').onclick=runImport;
  $('imp_clear').onclick=function(){impRows=[];impMap=[];$('imp_paste').value='';$('imp_msg').textContent='';renderImp()};

  // ---------- bilder (filer i mappen images/) ----------
  var IMG_EXT={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp'};
  function galleryHtml(list,editable){
    if(!list||!list.length)return '';
    return list.map(function(im){
      return '<figure><img data-fid="'+esc(im.id)+'" data-zoom="1" alt="'+esc(im.name||'Bild')+'">'+
        (editable?'<button type="button" data-imgdel="'+esc(im.id)+'">Ta bort</button>':'')+'</figure>';
    }).join('');
  }
  function hydrateImages(root){
    if(!db)return;
    [].slice.call((root||document).querySelectorAll('img[data-fid]')).forEach(function(im){
      if(im.dataset.loaded)return;im.dataset.loaded='1';
      db.fileUrl('images',im.dataset.fid).then(function(u){im.src=u},function(){im.dataset.loaded='';im.alt='Bilden saknas (har OneDrive hunnit synka den?)'});
    });
  }
  function renderImages(){
    $('imgList').innerHTML=galleryHtml(curImages,canWrite&&db);
    hydrateImages($('imgList'));
    var up=!!(canWrite&&db);
    $('imgPick').hidden=!up;$('imgDrop').hidden=!up;
    $('imgMeta').textContent=up?'Stora bilder förminskas automatiskt till högst 1600 px. Bilderna sparas som filer i mappen images.':'';
    $('imgBox').hidden=!up&&!curImages.length;
  }
  function loadImg(file){return new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){URL.revokeObjectURL(u);res(im)};im.onerror=function(){URL.revokeObjectURL(u);rej()};im.src=u})}
  async function shrink(file){
    if(file.type==='image/gif')return file;
    if(file.size<=400*1024&&/^image\/(png|jpeg|webp)$/.test(file.type))return file;
    var im=await loadImg(file),max=1600,s=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
    var c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);
    var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
    return await new Promise(function(r){c.toBlob(function(b){r(b||file)},'image/jpeg',0.85)});
  }
  async function addImagesTo(files,arr,done,msgId,session){
    if(!canWrite||!db)return;
    files=[].slice.call(files||[]).filter(function(f){return /^image\//.test(f.type)});
    if(!files.length){msg(msgId,'Välj bildfiler (png, jpg, gif eller webp).');return}
    for(var i=0;i<files.length;i++){
      var f=files[i];
      msg(msgId,'Sparar bild '+(i+1)+' av '+files.length+' …',true);
      try{
        var blob=await shrink(f),name=AL.rid()+(IMG_EXT[blob.type]||'.png');
        await db.putFile('images',name,blob);
        arr.push({id:name,name:f.name||'Skärmdump',size:blob.size});
        session[name]=1;done();
      }catch(e){
        msg(msgId,'Det gick inte att spara bilden. Kontrollera att du har skrivrättighet till mappen.',true);return;
      }
    }
    msg(msgId,files.length+' bild'+(files.length>1?'er':'')+' tillagd'+(files.length>1?'a':'')+'. Spara för att behålla dem.');
  }
  function addImages(files){return addImagesTo(files,curImages,renderImages,'img_msg',sessionUploads)}
  $('imgFile').addEventListener('change',function(){addImages($('imgFile').files);$('imgFile').value=''});
  $('imgDrop').addEventListener('click',function(){$('imgDrop').focus()});
  $('imgDrop').addEventListener('paste',function(e){
    var fs=[].slice.call((e.clipboardData&&e.clipboardData.files)||[]);
    if(fs.length){e.preventDefault();addImages(fs)}
  });
  $('imgDrop').addEventListener('dragover',function(e){e.preventDefault();$('imgDrop').classList.add('over')});
  $('imgDrop').addEventListener('dragleave',function(){$('imgDrop').classList.remove('over')});
  $('imgDrop').addEventListener('drop',function(e){e.preventDefault();$('imgDrop').classList.remove('over');addImages(e.dataTransfer&&e.dataTransfer.files)});
  $('imgList').addEventListener('click',async function(e){
    var b=e.target.closest('[data-imgdel]');if(!b)return;
    var id=b.dataset.imgdel;
    curImages=curImages.filter(function(x){return x.id!==id});
    if(sessionUploads[id]){try{await db.removeFile('images',id)}catch(err){}delete sessionUploads[id]}
    renderImages();
  });
  document.addEventListener('click',function(e){
    var im=e.target.closest('img[data-zoom]');
    if(im&&im.src){$('lbImg').src=im.src;$('lb').hidden=false;return}
    if(e.target.closest('#lb'))$('lb').hidden=true;
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')$('lb').hidden=true});

  // ---------- Tech Foundation (loggbok) ----------
  var techEntries=[],techEdit=null,techLoaded=false,tfParsed=[];
  function sortTech(a,b){return a.date<b.date?1:a.date>b.date?-1:((b.createdAt||'')>(a.createdAt||'')?1:-1)}
  function entryCard(e){
    return '<section class="card tf"><div class="row"><h3>'+esc(e.date)+'</h3><span class="hint" data-by="'+esc(e.updatedBy||'')+'" data-at="'+esc(e.updatedAt||'')+'"></span>'+
      (canWrite&&db?'<button type="button" data-tedit="'+esc(e._id)+'">Redigera</button>':'')+'</div><div class="tftext">'+esc(e.text)+'</div></section>';
  }
  function editorCard(){
    var d=techEdit;
    return '<section class="card tf"><div class="row"><label style="flex:0 1 200px">Datum<input type="date" id="t_date" value="'+esc(d.date)+'"></label></div>'+
      '<label>Anteckning<textarea id="t_text" style="min-height:200px">'+esc(d.text)+'</textarea></label>'+
      '<div class="callout" id="t_conf" hidden></div>'+
      '<div class="row"><button type="button" class="primary" data-tsave="1">Spara</button><button type="button" data-tcancel="1">Avbryt</button>'+
      (d.id?'<button type="button" class="danger" data-tdel="1">Ta bort</button>':'')+'<span class="status" id="t_msg" role="status"></span></div></section>';
  }
  function renderTech(force){
    if(techEdit&&!force)return;
    var q=val('t_q').trim().toLowerCase(),h='';
    var list=techEntries.slice().sort(sortTech);
    if(techEdit&&!techEdit.id)h+=editorCard();
    var shown=list.filter(function(e){return (techEdit&&techEdit.id===e._id)||!q||(e.date+' '+e.text).toLowerCase().indexOf(q)>=0});
    if(!techLoaded&&!h)h='<section class="card"><p class="empty">Laddar …</p></section>';
    else if(!techEntries.length&&!h)h='<section class="card"><p class="empty">Inga anteckningar ännu. Tryck Ny anteckning för att skriva den första, eller importera text från OneNote.</p></section>';
    else if(!shown.length&&!h)h='<section class="card"><p class="empty">Inga anteckningar matchar sökningen.</p></section>';
    else h+=shown.map(function(e){return (techEdit&&techEdit.id===e._id)?editorCard():entryCard(e)}).join('');
    $('techList').innerHTML=h;
    fillBy();
  }
  function fillBy(){
    document.querySelectorAll('#techList [data-by]').forEach(function(el){
      var at=el.dataset.at?new Date(el.dataset.at).toLocaleString('sv-SE'):'';
      el.textContent=at?('Senast ändrad '+at.slice(0,16)+(el.dataset.by&&el.dataset.by!=='anon'?' av '+el.dataset.by:'')):'';
    });
  }
  function openTechEditor(){
    renderTech(true);
    var t=$('t_text');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}
  }
  $('techNew').onclick=function(){
    if(!db||!canWrite)return;
    var td=today(),ex=techEntries.filter(function(e){return e.date===td})[0];
    techEdit=ex?{id:ex._id,date:ex.date,text:ex.text.replace(/\s+$/,'')+'\n\n',updatedAt:ex.updatedAt}:{id:null,date:td,text:''};
    openTechEditor();
  };
  var tdelArm=false;
  async function saveTech(){
    var date=val('t_date'),text=val('t_text').trim();
    if(!date){msg('t_msg','Välj ett datum.');return}
    if(!text){msg('t_msg','Skriv något först.');return}
    var now=new Date().toISOString();msg('t_msg','Sparar …',true);
    try{
      if(techEdit.id){
        var ref=db.doc('techlog/'+techEdit.id),cur=await ref.get();
        if(cur.exists&&cur.data().updatedAt!==techEdit.updatedAt){
          var c=$('t_conf');c.hidden=false;c.innerHTML='<p>Någon annan har ändrat den här anteckningen sedan du öppnade den. Kopiera din text, tryck Avbryt och öppna anteckningen igen.</p>';
          msg('t_msg','');return;
        }
        await ref.set(Object.assign({},cur.exists?cur.data():{},{date:date,text:text,updatedAt:now,updatedBy:meName()}));
      }else{
        await db.collection('techlog').add({date:date,text:text,createdAt:now,createdBy:meName(),updatedAt:now,updatedBy:meName()});
      }
      techEdit=null;renderTech(true);
    }catch(e){msg('t_msg','Det gick inte att spara. Försök igen.',true)}
  }
  $('techList').addEventListener('click',async function(e){
    var b=e.target.closest('button');if(!b)return;
    if(b.dataset.tedit){
      var en=techEntries.filter(function(x){return x._id===b.dataset.tedit})[0];if(!en)return;
      techEdit={id:en._id,date:en.date,text:en.text,updatedAt:en.updatedAt};openTechEditor();
    }else if(b.dataset.tsave)saveTech();
    else if(b.dataset.tcancel){techEdit=null;renderTech(true)}
    else if(b.dataset.tdel){
      if(!tdelArm){tdelArm=true;b.textContent='Bekräfta borttagning';setTimeout(function(){tdelArm=false;if(b.isConnected)b.textContent='Ta bort'},4000);return}
      tdelArm=false;
      try{await db.doc('techlog/'+techEdit.id).delete();techEdit=null;renderTech(true)}catch(err){msg('t_msg','Det gick inte att ta bort.')}
    }
  });
  $('t_q').addEventListener('input',function(){renderTech()});
  function parseTech(t){
    var cur=null,entries=[],pre=[];
    t.replace(/\r/g,'').split('\n').forEach(function(l){
      var m=l.match(/^\s*(\d{4}-\d{2}-\d{2})\s*$/);
      if(m){cur={date:m[1],lines:[]};entries.push(cur)}else if(cur)cur.lines.push(l);else pre.push(l);
    });
    entries.forEach(function(e){e.text=e.lines.join('\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()});
    return {entries:entries.filter(function(e){return e.text}),pre:pre.join('\n').trim()};
  }
  function renderTfImp(){
    var r=parseTech(val('tf_paste'));tfParsed=r.entries;
    var s='';
    if(val('tf_paste').trim()){
      if(!tfParsed.length)s='Hittade inga rader som bara innehåller ett datum (ÅÅÅÅ-MM-DD).';
      else{
        var ds=tfParsed.map(function(e){return e.date}).sort();
        s=tfParsed.length+' anteckningar hittades ('+ds[0]+' till '+ds[ds.length-1]+').'+(r.pre?' Text före första datumet ('+r.pre.length+' tecken) importeras inte.':'');
      }
    }
    $('tf_sum').textContent=s;
    $('tf_go').disabled=!(tfParsed.length&&db&&canWrite);
  }
  $('tf_paste').addEventListener('input',renderTfImp);
  $('tf_go').onclick=async function(){
    if(!db||!canWrite||!tfParsed.length)return;
    $('tf_go').disabled=true;
    var have={};techEntries.forEach(function(e){have[e.date+'\n'+e.text]=1});
    var todo=tfParsed.filter(function(e){return !have[e.date+'\n'+e.text]}),skipped=tfParsed.length-todo.length,done=0,failed=0;
    var now=new Date().toISOString();
    for(var i=0;i<todo.length;i++){
      msg('tf_msg','Importerar '+(i+1)+' av '+todo.length+' …',true);
      try{await db.collection('techlog').add({date:todo[i].date,text:todo[i].text,imported:true,createdAt:now,createdBy:meName(),updatedAt:now,updatedBy:meName()});done++}catch(e){failed++}
    }
    msg('tf_msg',done+' importerade'+(skipped?', '+skipped+' fanns redan':'')+(failed?', '+failed+' misslyckades':'')+'.',true);
    if(!failed){$('tf_paste').value='';tfParsed=[];$('tf_sum').textContent=''}
    else $('tf_go').disabled=false;
  };

  // ---------- vyer ----------
  // ---------- Felsökning ----------
  var FF_DEFAULT=[
    {id:'id',label:'Felsöknings-ID',type:'auto',on:true,list:true,fixed:true},
    {id:'datum',label:'Datum',type:'date',on:true,list:true},
    {id:'ansvarig',label:'Ansvarig',type:'text',on:true,list:true},
    {id:'process',label:'Process',type:'process',on:true,list:true},
    {id:'maskin',label:'Maskin',type:'text',on:true,list:true},
    {id:'fabrik',label:'Fabrik',type:'text',on:true,list:false},
    {id:'symtom',label:'Felbeskrivning (symptom)',type:'long',on:true,list:true},
    {id:'felkod',label:'Larm- eller felkod',type:'text',on:true,list:false},
    {id:'orsak',label:'Orsak',type:'long',on:true,list:true},
    {id:'atgard',label:'Åtgärd',type:'long',on:true,list:true},
    {id:'stillestand',label:'Stillestånd (minuter)',type:'number',on:false,list:false},
    {id:'andring',label:'Kopplad ändring (ID)',type:'text',on:true,list:false},
    {id:'status',label:'Status',type:'select',opts:['Öppen','Under utredning','Åtgärdad','Stängd'],on:true,list:true},
    {id:'prioritet',label:'Prioritet',type:'select',opts:['Låg','Normal','Hög'],on:false,list:false},
    {id:'utrustning',label:'Utrustning (givare, ventil, motor …)',type:'text',on:false,list:false},
    {id:'bilder',label:'Bilder',type:'images',on:true,list:false},
    {id:'kommentar',label:'Kommentarer',type:'long',on:true,list:false}
  ];
  var FF_TYPES={text:'Text',long:'Lång text',date:'Datum',number:'Tal',select:'Val',auto:'Automatiskt',process:'Process (rullista)',images:'Bilder'};
  var FF=clone(FF_DEFAULT);
  var fsFormStale=false,fsRecs=[],fsLoaded=false,fsViewing=null,fsEdit=null,fsOrig=null,fsImages=[],fsSession={},fsChip='alla',ffTimer=null;
  function ffOn(){return FF.filter(function(f){return f.on})}
  function ffById(id){return FF.filter(function(f){return f.id===id})[0]}
  function fsNum(r){return parseInt(String(r._id).replace(/\D/g,''),10)||0}
  function fsValue(r,f){
    if(f.type==='process')return r.procName||'';
    if(f.type==='images')return (r.images&&r.images.length)?r.images.length+' st':'';
    if(f.type==='auto')return r._id||r.id||'';
    return r[f.id]==null?'':String(r[f.id]);
  }
  function fsCell(r,f){var v=fsValue(r,f);return f.id==='ansvarig'&&v?(autoInit(v)||v):v}
  function fsPill(v){
    var cls=/stängd|åtgärdad/i.test(v)?'ok':/öppen/i.test(v)?'bad':v?'warn':'';
    return '<span class="pill '+cls+'">'+esc(v||'Ej angiven')+'</span>';
  }

  // formulär
  function fsFieldHtml(f){
    var id='fx_'+f.id,l=esc(f.label);
    if(f.type==='auto')return '<label>'+l+'<input type="text" id="'+id+'" readonly placeholder="Tilldelas när du sparar"></label>';
    if(f.type==='date')return '<label>'+l+'<input type="date" id="'+id+'"></label>';
    if(f.type==='number')return '<label>'+l+'<input type="number" id="'+id+'"></label>';
    if(f.type==='select')return '<label>'+l+'<select id="'+id+'"><option value=""></option>'+(f.opts||[]).map(function(o){return '<option>'+esc(o)+'</option>'}).join('')+'</select></label>';
    if(f.type==='process')return '<label>'+l+'<select id="'+id+'"><option value="">Välj process …</option>'+procs.map(function(p){return '<option value="'+esc(p._id)+'">'+esc(p.name)+'</option>'}).join('')+'</select></label>';
    if(f.type==='images')return '<div class="stack" style="grid-column:1/-1"><h2>'+l+'</h2><div class="row"><label class="chk" id="fsImgPick"><input type="file" id="fsImgFile" accept="image/*" multiple hidden> Välj bilder</label><div class="drop" id="fsImgDrop" tabindex="0" role="button" aria-label="Klistra in eller släpp skärmdump här">Klicka här och klistra in en skärmdump (Ctrl+V), eller släpp bilder här</div></div><div class="gallery" id="fsImgList"></div><span class="status" id="fsImg_msg" role="status"></span></div>';
    if(f.type==='long')return '<label style="grid-column:1/-1">'+l+'<textarea id="'+id+'"></textarea></label>';
    return '<label>'+l+'<input type="text" id="'+id+'"></label>';
  }
  function fsRenderImages(){
    var el=$('fsImgList');if(!el)return;
    el.innerHTML=galleryHtml(fsImages,canWrite&&db);hydrateImages(el);
  }
  function fsBuildForm(rec){
    var on=ffOn();
    $('fForm').innerHTML=on.map(fsFieldHtml).join('');
    on.forEach(function(f){
      var el=$('fx_'+f.id);if(!el)return;
      if(f.type==='process')el.value=rec.procId||'';
      else if(f.type==='auto')el.value=rec._id||'';
      else el.value=rec[f.id]==null?'':rec[f.id];
    });
    fsImages=(rec.images||[]).slice();fsSession={};fsRenderImages();
    var ps=$('fx_process');
    if(ps)ps.onchange=function(){
      var p=procById(ps.value);if(!p)return;
      ['fabrik','maskin'].forEach(function(k){var el=$('fx_'+k);if(el&&p[k])el.value=p[k]});
    };
    if($('fsImgFile')){
      $('fsImgFile').addEventListener('change',function(){addImagesTo($('fsImgFile').files,fsImages,fsRenderImages,'fsImg_msg',fsSession);$('fsImgFile').value=''});
      var dz=$('fsImgDrop');
      dz.addEventListener('click',function(){dz.focus()});
      dz.addEventListener('paste',function(e){var fs=[].slice.call((e.clipboardData&&e.clipboardData.files)||[]);if(fs.length){e.preventDefault();addImagesTo(fs,fsImages,fsRenderImages,'fsImg_msg',fsSession)}});
      dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over')});
      dz.addEventListener('dragleave',function(){dz.classList.remove('over')});
      dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');addImagesTo(e.dataTransfer&&e.dataTransfer.files,fsImages,fsRenderImages,'fsImg_msg',fsSession)});
      $('fsImgList').addEventListener('click',async function(e){
        var b=e.target.closest('[data-imgdel]');if(!b)return;var id=b.dataset.imgdel;
        fsImages=fsImages.filter(function(x){return x.id!==id});
        if(fsSession[id]){try{await db.removeFile('images',id)}catch(err){}delete fsSession[id]}
        fsRenderImages();
      });
    }
  }
  function fsSetTitle(id){
    $('fFormTitle').textContent=id?('Felsökning '+id):'Ny felsökning';
    $('fFormMsg').hidden=true;
    if(id)renderHist((fsOrig&&fsOrig.history)||[],'fHistForm','Felsökningen');
    else $('fHistForm').innerHTML='<li class="hint">Historiken visas när felsökningen är sparad.</li>';
  }
  function fsNew(){
    fsEdit=null;fsOrig=null;
    var rec={datum:today(),ansvarig:me.name||prefs.ansvarig||''};
    var st=ffById('status');if(st&&st.opts&&st.opts.length)rec.status=st.opts[0];
    fsBuildForm(rec);fsSetTitle(null);
  }
  function fsRefreshForm(){
    if(!fsFormStale)return;fsFormStale=false;
    if(fsEdit&&fsOrig){fsBuildForm(fsOrig);fsSetTitle(fsEdit)}else fsNew();
  }
  function fsOpen(id){
    var r=fsRecs.filter(function(x){return x._id===id})[0];if(!r)return;
    fsEdit=id;fsOrig=Object.assign({},r);
    fsBuildForm(fsOrig);fsSetTitle(id);show('fny');
  }
  function fsCollect(){
    var d={};
    ffOn().forEach(function(f){
      var el=$('fx_'+f.id);if(!el||f.type==='auto'||f.type==='images')return;
      if(f.type==='process'){d.procId=el.value;var p=procById(el.value);d.procName=p?p.name:'';return}
      d[f.id]=el.value.trim();
    });
    d.images=fsImages.slice();
    return d;
  }
  function fsDiff(a,b){
    var out=[];
    ffOn().forEach(function(f){
      if(f.type==='auto')return;
      if(f.type==='images'){
        var x=(a.images||[]).map(function(i){return i.id}).join(','),y=(b.images||[]).map(function(i){return i.id}).join(',');
        if(x!==y)out.push({f:f.label,from:(a.images||[]).length+' st',to:(b.images||[]).length+' st'});return;
      }
      var p=fsValue(a,f),q=fsValue(b,f);
      if(p!==q)out.push({f:f.label,from:p.slice(0,300),to:q.slice(0,300)});
    });
    return out;
  }
  async function fsClaimId(data){
    var col=db.collection('felsokning');await col.poll();
    var maxN=0;
    Object.keys(col.cache).forEach(function(k){var m=k.match(/^F(\d+)/),n=m?parseInt(m[1],10):0;if(n>maxN)maxN=n});
    for(var n=maxN+1;n<maxN+40;n++){
      var key='F'+pad3(n),ref=db.doc('felsokning/'+key);
      if(await ref.exists())continue;
      data.id=key;
      data.history=[{at:data.createdAt,by:meName(),kind:'create',changes:[]}];
      await ref.set(data);
      await sleep(700);
      var chk=await ref.get();
      if(chk.exists&&chk.data().createdAt===data.createdAt&&chk.data().createdBy===data.createdBy)return key;
    }
    throw new Error('Kunde inte tilldela ett ID. Försök igen.');
  }
  async function fsSave(){
    if(!db||!canWrite)return;
    var fm=$('fFormMsg');fm.hidden=true;
    var d=fsCollect();
    var pf=ffById('process');
    if(pf&&pf.on&&!d.procId){msg('fSaveMsg','Välj en process först.');return}
    var fl=ffOn().filter(function(f){return f.type==='long'})[0];
    if(fl&&!d[fl.id]){msg('fSaveMsg','Fyll i '+fl.label.toLowerCase()+' först.');return}
    $('fSave').disabled=true;msg('fSaveMsg','Sparar …',true);
    var now=new Date().toISOString();
    try{
      if(fsEdit){
        var ref=db.doc('felsokning/'+fsEdit),cur=await ref.get(),cd=cur.exists?cur.data():null;
        if(cd&&fsOrig&&cd.updatedAt!==fsOrig.updatedAt){
          fm.hidden=false;
          fm.innerHTML='<p>Någon annan har sparat felsökningen sedan du öppnade den. Dina ändringar är inte sparade.</p><div class="row"><button type="button" id="fReload">Ladda senaste versionen (dina ändringar går förlorade)</button></div>';
          $('fReload').onclick=function(){fsOpen(fsEdit)};
          msg('fSaveMsg','');return;
        }
        var base=Object.assign({},cd||fsOrig);delete base._id;
        var full=Object.assign(base,d,{id:fsEdit,updatedAt:now,updatedBy:meName()});
        var ch=fsDiff(fsOrig||{},d);
        full.history=((cd&&cd.history)||(fsOrig&&fsOrig.history)||[]).slice();
        if(ch.length)full.history.push({at:now,by:meName(),kind:'update',changes:ch});
        await ref.set(full);
        fsOrig=Object.assign({_id:fsEdit},full);renderHist(full.history,'fHistForm','Felsökningen');
        msg('fSaveMsg','Sparad.');
      }else{
        var data=Object.assign({},d,{createdAt:now,createdBy:meName(),updatedAt:now,updatedBy:meName()});
        var key=await fsClaimId(data);
        fsOrig=Object.assign({_id:key},data);fsEdit=key;
        var idEl=$('fx_id');if(idEl)idEl.value=key;
        fsSetTitle(key);
        msg('fSaveMsg','Sparad som felsökning '+key+'.');
      }
    }catch(e){
      msg('fSaveMsg','Det gick inte att spara'+(e&&e.message?': '+e.message:'')+'. Försök igen.',true);
    }finally{$('fSave').disabled=!canWrite}
  }

  // lista
  function fsChips(){
    var st=ffById('status'),list=[{k:'alla',t:'Alla',f:function(){return true}}];
    if(st&&st.on)(st.opts||[]).forEach(function(o){list.push({k:'s:'+o,t:o,f:function(r){return r.status===o}})});
    return list;
  }
  function fsFiltered(){
    var q=val('ff_q').trim().toLowerCase(),fa=val('ff_fabrik'),fp=val('ff_proc'),fn=val('ff_ans'),fs=val('ff_status');
    var ch=fsChips().filter(function(x){return x.k===fsChip})[0]||fsChips()[0];
    return fsRecs.filter(function(r){
      if(!ch.f(r))return false;
      if(fa&&r.fabrik!==fa)return false;
      if(fp&&r.procName!==fp)return false;
      if(fn&&autoInit(r.ansvarig)!==fn)return false;
      if(fs&&r.status!==fs)return false;
      if(q){
        var hay=[r._id].concat(ffOn().map(function(f){return fsValue(r,f)})).join(' ').toLowerCase();
        if(hay.indexOf(q)<0)return false;
      }
      return true;
    }).sort(function(a,b){return fsNum(b)-fsNum(a)});
  }
  function fsRenderList(){
    var chips=fsChips();
    $('fchips').innerHTML=chips.map(function(x){
      return '<button type="button" class="chip" data-fchip="'+esc(x.k)+'" aria-pressed="'+(fsChip===x.k)+'"><b>'+fsRecs.filter(x.f).length+'</b><span>'+esc(x.t)+'</span></button>';
    }).join('');
    var fp=$('ff_proc'),pv=fp.value;
    fp.innerHTML='<option value="">Alla</option>'+procs.map(function(p){return '<option>'+esc(p.name)+'</option>'}).join('');fp.value=pv;
    var fa=$('ff_ans'),av=fa.value,seen={};
    fsRecs.forEach(function(r){var i=autoInit(r.ansvarig);if(i)seen[i]=1});
    fa.innerHTML='<option value="">Alla</option>'+Object.keys(seen).sort().map(function(k){return '<option>'+esc(k)+'</option>'}).join('');fa.value=av;
    var fs=$('ff_status'),sv_=fs.value,st=ffById('status');
    fs.innerHTML='<option value="">Alla</option>'+((st&&st.opts)||[]).map(function(o){return '<option>'+esc(o)+'</option>'}).join('');fs.value=sv_;
    var rows=fsFiltered(),t=$('ftbl');
    $('flistCount').textContent=fsRecs.length?(rows.length+' av '+fsRecs.length+' felsökningar'):'';
    if(!fsLoaded){t.innerHTML='<tr><td class="empty">Laddar felsökningar …</td></tr>';return}
    if(!fsRecs.length){t.innerHTML='<tr><td class="empty">Inga felsökningar ännu. Tryck Ny felsökning för att skriva den första.</td></tr>';return}
    if(!rows.length){t.innerHTML='<tr><td class="empty">Inga felsökningar matchar filtren.</td></tr>';return}
    var cols=ffOn().filter(function(f){return f.list});
    t.innerHTML='<thead><tr>'+cols.map(function(f){return '<th>'+esc(f.id==='ansvarig'?'Ans.':f.label)+'</th>'}).join('')+'</tr></thead><tbody>'+
      rows.map(function(r){
        return '<tr data-fopen="'+esc(r._id)+'">'+cols.map(function(f){
          if(f.type==='auto')return '<td class="nw"><button type="button" class="idbtn" data-fopen="'+esc(r._id)+'">'+esc(r._id)+'</button></td>';
          if(f.id==='status')return '<td>'+fsPill(r.status)+'</td>';
          var v=fsCell(r,f);
          return '<td class="'+(f.type==='long'?'w':(f.type==='date'||f.id==='fabrik'||f.id==='ansvarig')?'nw':'')+'">'+esc(f.type==='long'?short(v,120):v)+'</td>';
        }).join('')+'</tr>';
      }).join('')+'</tbody>';
  }
  function fsExport(){
    var cols=ffOn().filter(function(f){return f.type!=='images'||true});
    var head=cols.map(function(f){return f.label}),rows=fsFiltered().map(function(r){return cols.map(function(f){return fsValue(r,f)}).map(csvCell).join(';')});
    var csv='﻿'+head.map(csvCell).join(';')+'\r\n'+rows.join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='felsokningar-'+today()+'.csv';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href)},3000);
    msg('flistMsg','Filen hämtades till din hämtningsmapp.');
  }

  // visa
  function fsRenderDetail(){
    var r=fsRecs.filter(function(x){return x._id===fsViewing})[0];
    if(!r){$('fdetail').innerHTML='<section class="card"><p class="empty">Felsökningen hittades inte.</p></section>';$('fTitle').textContent='Felsökning';$('fStatus').innerHTML='';$('fMeta').textContent='';return}
    $('fTitle').textContent='Felsökning '+r._id;
    $('fStatus').innerHTML=r.status?fsPill(r.status):'';
    $('fEditBtn').disabled=!canWrite||!db;
    var rows=[];
    ffOn().forEach(function(f){if(f.type==='images')return;rows.push([f.label,fsValue(r,f)])});
    var gal=(r.images&&r.images.length)?'<div class="gallery">'+galleryHtml(r.images,false)+'</div>':'';
    $('fdetail').innerHTML='<section class="card"><h2>Uppgifter</h2>'+kv(rows)+gal+'</section>';
    var when=function(t){return t?new Date(t).toLocaleString('sv-SE'):''};
    var t=(r.imported?'Importerad':'Skapad')+' '+when(r.createdAt)+(r.createdBy?' av '+r.createdBy:'');
    if(r.updatedAt&&r.updatedAt!==r.createdAt)t+='. Senast ändrad '+when(r.updatedAt)+(r.updatedBy?' av '+r.updatedBy:'');
    $('fMeta').textContent=t+'.';
    renderHist(r.history,'fhist','Felsökningen');
    hydrateImages($('fdetail'));
  }
  function fsShowDetail(id){fsViewing=id;fsRenderDetail();show('fvisa')}

  // fältredigerare (Inställningar)
  function ffRender(){
    var h='<div class="frow fhead"><span>Med</span><span>Namn</span><span>Typ</span><span>I listan</span><span>Ordning</span></div>';
    h+=FF.map(function(f,i){
      return '<div class="frow" data-f="'+esc(f.id)+'"><input type="checkbox" data-on aria-label="Ta med '+esc(f.label)+'"'+(f.on?' checked':'')+(f.fixed?' disabled':'')+'>'+
        '<input type="text" data-label value="'+esc(f.label)+'" aria-label="Namn">'+
        '<span class="hint">'+esc(FF_TYPES[f.type]||f.type)+(f.opts?': '+esc(f.opts.join(', ')):'')+'</span>'+
        '<label class="chk"><input type="checkbox" data-list'+(f.list?' checked':'')+(f.on?'':' disabled')+'> Kolumn</label>'+
        '<span class="row" style="gap:4px"><button type="button" class="small" data-up aria-label="Flytta upp"'+(i===0?' disabled':'')+'>▲</button><button type="button" class="small" data-down aria-label="Flytta ned"'+(i===FF.length-1?' disabled':'')+'>▼</button>'+
        (f.custom?'<button type="button" class="small danger" data-del>Ta bort</button>':'')+'</span></div>';
    }).join('');
    $('ffields').innerHTML=h;
  }
  function ffSave(){
    clearTimeout(ffTimer);
    ffTimer=setTimeout(async function(){
      if(!db||!canWrite)return;
      try{await db.doc('settings/felsokning').set({fields:clone(FF)})}catch(e){msg('procMsg','Det gick inte att spara fälten.')}
    },500);
  }
  function ffChanged(rebuildForm){
    ffRender();fsRenderList();ffSave();
    fsFormStale=true;
  }
  $('ffields').addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;var row=b.closest('[data-f]');if(!row)return;
    var i=FF.indexOf(ffById(row.dataset.f));
    if(b.hasAttribute('data-up')&&i>0){var t=FF[i];FF[i]=FF[i-1];FF[i-1]=t;ffChanged()}
    if(b.hasAttribute('data-down')&&i<FF.length-1){var u=FF[i];FF[i]=FF[i+1];FF[i+1]=u;ffChanged()}
    if(b.hasAttribute('data-del')){FF.splice(i,1);ffChanged()}
  });
  $('ffields').addEventListener('change',function(e){
    var row=e.target.closest('[data-f]');if(!row)return;var f=ffById(row.dataset.f);
    if(e.target.hasAttribute('data-on')){f.on=e.target.checked;ffChanged()}
    if(e.target.hasAttribute('data-list')){f.list=e.target.checked;ffChanged()}
  });
  $('ffields').addEventListener('input',function(e){
    if(!e.target.hasAttribute('data-label'))return;
    ffById(e.target.closest('[data-f]').dataset.f).label=e.target.value;ffSave();
  });
  $('nf_add').onclick=function(){
    var name=val('nf_name').trim();if(!name)return;
    var type=val('nf_type'),f={id:'x'+Date.now().toString(36),label:name,type:type,on:true,list:false,custom:true};
    if(type==='select')f.opts=val('nf_opts').split(',').map(function(x){return x.trim()}).filter(Boolean);
    FF.push(f);set('nf_name','');set('nf_opts','');ffChanged();
  };
  $('nf_reset').onclick=function(){FF=clone(FF_DEFAULT);ffChanged()};

  $('fGoNew').onclick=function(){fsNew();show('fny')};
  $('fNewBtn').onclick=function(){fsNew()};
  $('fCancel').onclick=function(){show('flog')};
  $('fSave').onclick=fsSave;
  $('fExport').onclick=fsExport;
  $('fBack').onclick=function(){show('flog')};
  $('fEditBtn').onclick=function(){if(fsViewing)fsOpen(fsViewing)};
  $('fchips').onclick=function(e){var b=e.target.closest('[data-fchip]');if(b){fsChip=b.dataset.fchip;fsRenderList()}};
  $('ftbl').onclick=function(e){var b=e.target.closest('[data-fopen]');if(b)fsShowDetail(b.dataset.fopen)};
  ['ff_q','ff_fabrik','ff_proc','ff_ans','ff_status'].forEach(function(id){$(id).addEventListener('input',fsRenderList)});

  var MENU=[
    {id:'a',label:'Ändringar',items:[['andringar','Ändringslogg'],['ny','Ny / Redigera'],['tech','Tech Foundation']]},
    {id:'f',label:'Felsökning',items:[['flog','Felsökningslogg'],['fny','Ny felsökning']]},
    {id:'i',label:'Inställningar',items:[['processer','Processer'],['import','Importera']]}
  ];
  var VIEWS=['setup','andringar','visa','ny','tech','flog','fvisa','fny','processer','import'];
  function renderMenu(v){
    var main=$('mainNav'),sub=$('subNav');
    main.hidden=sub.hidden=!db||v==='setup';
    var cur=v==='visa'?'andringar':v==='fvisa'?'flog':v;
    var g=MENU.filter(function(m){return m.items.some(function(i){return i[0]===cur})})[0];
    main.innerHTML=MENU.map(function(m){return '<button type="button" data-g="'+m.id+'"'+(g&&g.id===m.id?' aria-current="page"':'')+'>'+esc(m.label)+'</button>'}).join('');
    sub.innerHTML=g?g.items.map(function(i){return '<button type="button" data-v="'+i[0]+'"'+(i[0]===cur?' aria-current="page"':'')+'>'+esc(i[1])+'</button>'}).join(''):'';
  }
  function show(v){
    if(VIEWS.indexOf(v)<0)v='andringar';
    if(!db)v='setup';
    if(v==='visa'&&!viewing)v='andringar';
    if(v==='fvisa'&&!fsViewing)v='flog';
    VIEWS.forEach(function(x){$('v-'+x).hidden=x!==v});
    renderMenu(v);
    if(location.hash!=='#'+v)location.hash=v;
    if(v==='ny'&&!editing&&!orig&&!$('datum').value)newForm();
    if(v==='fny'){fsRefreshForm();if(!fsEdit&&!fsOrig&&!$('fForm').children.length)fsNew()}
  }
  window.addEventListener('hashchange',function(){show(location.hash.replace('#',''))});
  $('mainNav').addEventListener('click',function(e){
    var b=e.target.closest('button[data-g]');if(!b)return;
    var m=MENU.filter(function(x){return x.id===b.dataset.g})[0];if(m)show(m.items[0][0]);
  });
  $('subNav').addEventListener('click',function(e){var b=e.target.closest('button[data-v]');if(b)show(b.dataset.v)});

  // ---------- händelser ----------
  $('goNew').onclick=function(){newForm();show('ny')};
  $('cancelBtn').onclick=function(){show('andringar')};
  $('saveBtn').onclick=save;
  $('newBtn').onclick=function(){newForm()};
  $('procSel').onchange=function(){applyProc()};
  $('ovReset').onclick=function(){OV.forEach(function(k){$(k).dataset.touched='0'});render()};
  $('exportCsv').onclick=exportCsv;
  $('chips').onclick=function(e){var b=e.target.closest('[data-chip]');if(b){chip=b.dataset.chip;renderList()}};
  $('tbl').onclick=function(e){var b=e.target.closest('[data-open]');if(b)showDetail(b.dataset.open)};
  $('dBack').onclick=function(){show('andringar')};
  $('dEdit').onclick=function(){if(viewing)openChange(viewing)};
  $('procTbl').onclick=function(e){var b=e.target.closest('[data-proc]');if(b)editProc(procById(b.dataset.proc))};
  ['f_q','f_fabrik','f_proc','f_ans','f_status'].forEach(function(id){$(id).addEventListener('input',renderList)});
  $('saveProc').onclick=saveProc;
  $('newProc').onclick=function(){editProc(null)};
  $('delProc').onclick=async function(){
    if(!confirmDel){confirmDel=true;$('delProc').textContent='Bekräfta borttagning';setTimeout(function(){confirmDel=false;$('delProc').textContent='Ta bort process'},4000);return}
    try{await db.doc('processes/'+editingProc).delete();editProc(null);msg('procMsg','Process borttagen.')}catch(e){msg('procMsg','Det gick inte att ta bort.')}
  };
  $('saveSet').onclick=async function(){
    if(!db||!canWrite)return;
    var v=val('s_bak').trim();
    try{await db.doc('settings/app').set({bakmapp:v});msg('setMsg','Inställning sparad.')}catch(e){msg('setMsg','Det gick inte att spara.')}
  };
  document.addEventListener('input',function(e){
    var t=e.target,id=t.id||'';
    if(id.indexOf('ov_')===0)t.dataset.touched='1';
    if(id==='ansvarig'&&!initTouched)set('initialer',autoInit(val('ansvarig')));
    if(id==='initialer')initTouched=val('initialer').trim()!==autoInit(val('ansvarig'));
    if(!$('v-ny').contains(t))return;
    render();
  });
  document.addEventListener('change',function(e){
    var t=e.target;
    if($('v-ny').contains(t))render();
    if(t.id==='ansvarig'||t.id==='initialer')savePrefs();
  });

  function copyPlain(text,msgId,selEl){
    function fallback(){
      if(selEl){var r=document.createRange();r.selectNodeContents(selEl);var s=getSelection();s.removeAllRanges();s.addRange(r)}
      msg(msgId,'Markerad. Tryck Ctrl+C.');
    }
    try{navigator.clipboard.writeText(text).then(function(){msg(msgId,'Kopierad.')},fallback)}catch(e){fallback()}
  }
  $('copyFolder').onclick=function(){if(!clean(BAK)){msg('folderMsg','Ingen backupmapp är angiven. Fyll i den under Processer.');return}copyPlain(clean(BAK),'folderMsg',null)};

  // ---------- konfliktkopior (OneDrive) ----------
  var conflicts=[],cdelArm=null;
  function renderConflicts(){
    var box=$('conflictBox');
    if(!conflicts.length){box.hidden=true;box.innerHTML='';return}
    box.hidden=false;
    box.innerHTML='<p><b>Konfliktkopior hittades.</b> Två personer har sparat samma ändring samtidigt, och OneDrive har skapat en extra fil. Granska varje kopia och lägg till den som en ny ändring, eller ta bort den.</p>'+
      conflicts.map(function(c){
        return '<div class="row" style="align-items:center"><span style="flex:1 1 260px">'+esc(c._id)+' - '+esc(short(c.beskrivning||'',80))+'</span>'+
          '<button type="button" data-cadd="'+esc(c._id)+'">Lägg till som ny ändring</button>'+
          '<button type="button" class="danger" data-cdel="'+esc(c._id)+'">Ta bort kopian</button></div>';
      }).join('');
  }
  $('conflictBox').addEventListener('click',async function(e){
    var b=e.target.closest('button');if(!b||!db||!canWrite)return;
    var cid=b.dataset.cadd||b.dataset.cdel,c=conflicts.filter(function(x){return x._id===cid})[0];if(!c)return;
    if(b.dataset.cadd){
      var rec=Object.assign({},c);delete rec._id;rec.id='';rec.createdAt=new Date().toISOString();
      try{await claimId(rec);await db.doc('changes/'+cid).delete()}catch(err){banner('Det gick inte att lägga till kopian. Försök igen.')}
    }else{
      if(cdelArm!==cid){cdelArm=cid;b.textContent='Bekräfta borttagning';setTimeout(function(){if(cdelArm===cid){cdelArm=null;b.textContent='Ta bort kopian'}},4000);return}
      cdelArm=null;try{await db.doc('changes/'+cid).delete()}catch(err){banner('Det gick inte att ta bort kopian.')}
    }
  });

  // ---------- säkerhetskopia ----------
  $('backupNow').onclick=async function(){
    if(!db||!canWrite)return;
    try{var n=await db.backup('manuell');msg('backupMsg','Sparade '+n+' i mappen backup.')}catch(e){msg('backupMsg','Det gick inte att skapa säkerhetskopian.')}
  };

  // ---------- koppla till datamapp ----------
  var started=false,pendingHandle=null,backedUp=false;
  function dbError(){banner('Kunde inte läsa datamappen. Kontrollera att mappen finns kvar och att OneDrive har synkat den.')}
  function updateSync(){
    if(!db||!db.lastPoll){$('sync').textContent='';return}
    var t=db.lastPoll,p=function(n){return (n<10?'0':'')+n};
    $('sync').textContent='Mapp: '+rootHandle.name+' · uppdaterad '+p(t.getHours())+':'+p(t.getMinutes())+':'+p(t.getSeconds());
  }
  async function startData(){
    if(started)return;
    var d=new AL.FileDB(rootHandle);
    await d.init();
    started=true;db=d;
    loadMe();showWho();banner('');
    loaded.procs=false;loaded.changes=false;
    db.collection('processes').onSnapshot(function(snap){
      procs=snap.docs.map(function(x){return Object.assign({},x.data(),{_id:x.id})}).sort(byOrder);
      loaded.procs=true;fillProcSel();renderProcs();
    },dbError);
    db.collection('changes').onSnapshot(function(snap){
      var all=snap.docs.map(function(x){return Object.assign({},x.data(),{_id:x.id})});
      changes=all.filter(function(c){return /^\d+$/.test(c._id)});
      conflicts=all.filter(function(c){return !/^\d+$/.test(c._id)});
      loaded.changes=true;renderList();renderConflicts();updateSync();
      if(viewing&&!$('v-visa').hidden)renderDetail();
      if(!backedUp&&canWrite){backedUp=true;db.hasBackupToday().then(function(has){if(!has)db.backup('auto')}).catch(function(){})}
    },dbError);
    db.collection('felsokning').onSnapshot(function(snap){
      var all=snap.docs.map(function(x){return Object.assign({},x.data(),{_id:x.id})});
      fsRecs=all.filter(function(r){return /^F\d+$/.test(r._id)});
      var fc=all.length-fsRecs.length,box=$('fconflictBox');
      box.hidden=!fc;box.innerHTML=fc?'<p><b>Konfliktkopior hittades i mappen felsokning.</b> Två personer har sparat samma felsökning samtidigt. Öppna mappen i SharePoint eller Utforskaren, jämför filerna och ta bort kopian.</p>':'';
      fsLoaded=true;fsRenderList();
      if(fsViewing&&!$('v-fvisa').hidden)fsRenderDetail();
    },dbError);
    db.doc('settings/felsokning').onSnapshot(function(x){
      var v=x.exists?x.data():null;
      FF=(v&&v.fields&&v.fields.length)?clone(v.fields):clone(FF_DEFAULT);
      var typing=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#ffields');
      if(!typing)ffRender();
      fsRenderList();
      fsFormStale=true;
      if($('v-fny').hidden)fsRefreshForm();
    },function(){});
    db.collection('techlog').onSnapshot(function(snap){
      techEntries=snap.docs.map(function(x){return Object.assign({},x.data(),{_id:x.id})});
      techLoaded=true;renderTech();
    },dbError);
    db.doc('settings/app').onSnapshot(function(x){var v=x.exists?x.data():null;BAK=(v&&v.bakmapp)||'';set('s_bak',BAK);render()},function(){});
    db.startPolling();
    setInterval(updateSync,5000);updateSync();
    renderProcs();renderList();renderTech();
    newForm();fillProcSel();fsNew();ffRender();fsRenderList();
    var h=location.hash.replace('#','');
    show(h&&h!=='setup'?h:'andringar');
  }
  async function connectNow(){
    msg('setup_msg','Öppnar mappen …',true);
    try{await startData()}catch(e){started=false;db=null;msg('setup_msg','Kunde inte öppna mappen: '+((e&&e.message)||e)+'. Välj mappen igen.',true);show('setup')}
  }
  $('setupPick').onclick=async function(){
    try{rootHandle=await AL.pick();await connectNow()}
    catch(e){if(!e||e.name!=='AbortError')msg('setup_msg','Mappen kunde inte väljas: '+((e&&e.message)||e),true)}
  };
  $('setupResume').onclick=async function(){
    try{
      var perm=await AL.request(pendingHandle);
      if(perm==='granted'){rootHandle=pendingHandle;await connectNow()}else msg('setup_msg','Åtkomst till mappen nekades. Tryck Fortsätt och välj Tillåt, eller välj mappen på nytt.',true);
    }catch(e){msg('setup_msg','Det gick inte att återanvända mappen. Välj den på nytt.',true)}
  };
  $('changeFolder').onclick=async function(){
    try{await AL.pick();location.reload()}catch(e){}
  };
  async function boot(){
    show('setup');
    if(!AL.supported){$('setupUnsupported').hidden=false;$('setupPick').hidden=true;return}
    var r=null;try{r=await AL.restore()}catch(e){}
    if(r&&r.permission==='granted'){rootHandle=r.handle;await connectNow();return}
    if(r){pendingHandle=r.handle;$('setupResume').hidden=false;$('setupResume').textContent='Fortsätt med mappen "'+r.handle.name+'"'}
  }
  boot();

})();
