// =====================================================================
//  Sistema de Vinculações de Contratos – Grupo Parceiro Agronegócios
//  Tela principal: contratos, cadastro, frete realizado e parâmetros.
// =====================================================================
import { PRODUTOS as PRODS, NOME_PRODUTO as PNAME, parametrosPadrao, isN, parseBR, kgSaca, creditoPresumido, calcularContrato } from "./calc.js";
import * as api from "./api.js";

let contratos=[], params=parametrosPadrao(), editId=null, loaded=false, usuario=null, pararTempoReal=null;
let fProd="";

const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fR=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const f2=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const f0=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const R=v=>isN(v)?(Math.abs(v)<0.005?"-":fR.format(v)):"";
const N2=v=>isN(v)?f2.format(v):"";
const N0=v=>isN(v)?(v===0?"-":f0.format(v)):"";
const D=s=>{if(!s)return"";const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:esc(s);};
const toBR=(v,d)=>isN(v)?v.toLocaleString("pt-BR",{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d}):"";
const kgS=p=>kgSaca(params,p);
const crd=p=>creditoPresumido(params,p);
const prodTag=p=>`<span class="tag p-${esc(p)}">${esc(PNAME[p]||p)}</span>`;

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2600);}
function banner(html){$("#status").innerHTML=html?`<div class="banner w">${html}</div>`:"";}

/* ---------------- cálculo ---------------- */
const calc=c=>calcularContrato(c,params);

/* ---------------- tabela principal ---------------- */
const HEAD=["PRODUTO","TIPO","DATA","Nº CONTRATO","EMPRESA / PRODUTOR","CIDADE (ENTREGA / RETIRADA)","VOLUME (kg)","VOLUME (sc)","PREÇO (R$/sc)","VALOR TOTAL (R$)","DIFERENÇA (R$/sc)","FRETE PREVISTO (R$/sc)","RESULTADO (R$/sc)","RESULTADO TOTAL (R$)","SALDO A VINCULAR (kg)","CRÉDITO PRESUMIDO (R$)","RESULTADO + CRÉDITO (R$/sc)","FRETE REALIZADO (R$/sc)","FRETE PREVISTO TOTAL (R$)","FRETE REALIZADO TOTAL (R$)","FRETE: PREVISTO − REALIZADO (R$)","LUCRO PREVISTO (R$)","LUCRO REALIZADO (R$)","LUCRO REALIZADO + CRÉDITO (R$)",""];
const FX=`<td class="fx">A FIXAR</td>`;
const cN=(v,fmt,fixar)=>isN(v)?`<td class="n">${fmt(v)}</td>`:(fixar?FX:`<td></td>`);
function lpF(v){ if(!isN(v))return `<td></td>`; const ok=v>=-0.005; return `<td class="n"><span class="tag ${ok?"pill-l":"pill-p"}">${ok?"LUCRO NO FRETE":"PREJUÍZO NO FRETE"}</span> <span class="${ok?"lucro":"prej"}">${Math.abs(v)<0.005?fR.format(0):fR.format(v)}</span></td>`;}
function mv(v,fixar){ if(!isN(v))return fixar?FX:`<td></td>`; return `<td class="n"><b class="${v>=0?"lucro":"prej"}">${R(v)}</b></td>`;}
function lpR(v,pend,partial){ if(pend)return `<td class="note" style="text-align:center">aguardando frete</td>`; if(!isN(v))return FX; const ok=v>=0;
  return `<td class="n"><span class="tag ${ok?"pill-l":"pill-p"}">${ok?"LUCRO":"PREJUÍZO"}</span> <b class="${ok?"lucro":"prej"}">${R(v)}</b>${partial?` <span class="note">(${partial})</span>`:""}</td>`;}
function lp(v){ if(!isN(v))return `<td></td>`; const cls=v>=0?"pill-l":"pill-p"; return `<td class="n"><span class="tag ${cls}">${v>=0?"LUCRO":"PREJUÍZO"}</span> <span class="${v>=0?"lucro":"prej"}">${R(v)}</span></td>`;}

function sortKey(c){return (c.data||"")+"|"+(c.numero||"");}
function filtered(){
  const q=($("#fBusca").value||"").trim().toLowerCase(), st=$("#fStatus").value;
  return contratos.filter(c=>{
    if(fProd&&c.produto!==fProd)return false;
    if(q){const hay=[c.comprador,c.numero,c.cidade,...(c.vendedores||[]).flatMap(v=>[v.nome,v.numero,v.cidade])].join(" ").toLowerCase(); if(!hay.includes(q))return false;}
    if(st){const k=calc(c);
      if(st==="afixar"&&!(k.Pb==null||k.vs.some(x=>x.P==null)))return false;
      if(st==="saldo"&&!(k.saldoKg>0))return false;
      if(st==="fretepend"&&!k.vs.some(x=>x.fr==null))return false;
      if(st==="freteok"&&!k.vs.some(x=>x.fr!=null))return false;
      if(st==="prejuizo"&&!k.vs.some(x=>isN(x.final)&&x.final<0))return false;}
    return true;
  }).sort((a,b)=>sortKey(b).localeCompare(sortKey(a)));
}
function renderTable(){
  const list=filtered(), t=$("#tbl");
  if(!loaded){t.innerHTML=`<tr><td class="empty">Carregando contratos…</td></tr>`;return;}
  if(!list.length){t.innerHTML=`<tr><td class="empty">${contratos.length?"Nenhum contrato com esses filtros.":"Nenhum contrato ainda. Use “+ Novo contrato” para lançar o primeiro."}</td></tr>`;return;}
  let h=`<thead><tr>${HEAD.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
  list.forEach((c,i)=>{
    const k=calc(c), r=k.r, n=k.vs.length;
    if(i)h+=`<tr class="sp"><td colspan="${HEAD.length}"></td></tr>`;
    h+=`<tr class="buyer"><td>${prodTag(c.produto)}</td><td>COMPRADOR</td><td>${D(c.data)}</td><td>${esc(c.numero)}</td><td>${esc(c.comprador)}</td><td>${esc(c.cidade)}</td>`+
      `<td class="n">${N0(c.volumeKg)}</td><td class="n">${N2(k.bSc)}</td>${cN(k.Pb,R,1)}${cN(k.bValor,R,1)}<td></td><td></td><td></td><td></td>`+
      `<td class="n">${N0(k.saldoKg)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`+
      `<td><div class="actions"><button class="btn sm" data-edit="${esc(c.id)}">Editar</button><button class="btn sm danger" data-del="${esc(c.id)}">Excluir</button></div></td></tr>`;
    k.vs.forEach(x=>{
      const v=x.v;
      h+=`<tr><td></td><td>VENDEDOR</td><td>${D(v.data)}</td><td>${esc(v.numero)}</td><td>${esc(v.nome)}</td><td>${esc(v.cidade||"")}</td>`+
        `<td class="n">${N0(v.volumeKg)}</td><td class="n">${N2(x.sc)}</td>${cN(x.P,R,1)}${cN(x.valor,R,1)}${cN(x.dif,R,1)}`+
        `<td class="n">${x.fp?R(x.fp):"-"}</td>${cN(x.res,R,1)}${cN(x.resTot,R,1)}<td></td>${cN(x.cred,R,1)}${cN(x.resCred,R,1)}`+
        `<td class="n"><input type="text" class="frete-in frIn${x.fr==null?" pend":""}" inputmode="decimal" data-key="${esc(c.id)}|${esc(v.id)}" data-orig="${esc(toBR(x.fr,2))}" value="${esc(toBR(x.fr,2))}" placeholder="digite R$/sc" title="Digite o frete realizado (R$/sc) e tecle Enter"></td>`+
        `${x.fr!=null?`<td class="n">${R(x.fretePrevTot)}</td><td class="n">${R(x.freteRealTot)}</td>`:`<td></td><td></td>`}${lpF(x.desvio)}${mv(x.resTot,1)}${lpR(x.resRealTot,x.fr==null)}${mv(x.final,0)}<td></td></tr>`;
    });
    const lbl=n===1?"TOTAL VENDEDOR":`TOTAL ${n} VENDEDORES – PREÇO MÉDIO PONDERADO`;
    h+=`<tr class="resumo"><td></td><td>RESUMO</td><td></td><td></td><td>${lbl}</td><td></td>`+
      `<td class="n">${N0(r.kgT)}</td><td class="n">${N2(r.scT)}</td>${cN(r.precoM,R,1)}${cN(r.valorT,R,1)}${cN(r.difM,R,1)}`+
      `<td class="n">${r.freteM?R(r.freteM):"-"}</td>${cN(r.resM,R,1)}${cN(r.resTotT,R,1)}<td></td>${cN(r.credT,R,1)}${cN(r.resCredM,R,1)}`+
      `${r.freteRealM!=null?`<td class="n">${R(r.freteRealM)}${r.nReal<n?` <span class="note">(${r.nReal}/${n})</span>`:""}</td>`:`<td></td>`}${r.fretePrevTot!=null?`<td class="n">${R(r.fretePrevTot)}</td><td class="n">${R(r.freteRealTot)}</td>`:`<td></td><td></td>`}${lpF(r.desvioT)}${mv(r.resTotT,1)}${lpR(r.resRealTotT,r.nReal===0,r.nReal&&r.nReal<n?`${r.nReal}/${n} c/ frete`:"")}${mv(r.finalT,0)}<td></td></tr>`;
  });
  const ae=document.activeElement, keep=(ae&&ae.classList&&ae.classList.contains("frIn"))?{key:ae.dataset.key,val:ae.value,dirty:ae.value!==ae.dataset.orig}:null;
  t.innerHTML=h+"</tbody>";
  if(keep){const el=t.querySelector(`input.frIn[data-key="${CSS.escape(keep.key)}"]`);if(el){if(keep.dirty)el.value=keep.val;el.focus();try{el.setSelectionRange(el.value.length,el.value.length);}catch(_){}}}
}
async function saveFreteInline(inp){
  if(inp.value===inp.dataset.orig||inp.classList.contains("saving"))return;
  const [cid,vid]=inp.dataset.key.split("|"); const c=contratos.find(x=>x.id===cid); if(!c||!api.supabase)return;
  const val=parseBR(inp.value); if(Number.isNaN(val)){toast("Frete inválido. Use por exemplo 12,50");inp.value=inp.dataset.orig;return;}
  inp.classList.add("saving"); inp.dataset.orig=inp.value;
  try{await api.salvarFreteRealizado(vid,val);
    const v=(c.vendedores||[]).find(v=>v.id===vid); if(v)v.freteReal=val;
    toast(val==null?"Frete realizado apagado.":"Frete realizado salvo."); renderAll();}
  catch(e){toast(e.message||"Não foi possível salvar o frete.");inp.dataset.orig="";}
  finally{inp.classList.remove("saving");}
}
function renderKpis(){
  let prev=0,cred=0,real=0,nReal=0,nPend=0,saldoSc=0,scT=0,lucroN=0,prejN=0,fPrev=0,fReal=0,lReal=0,lPrevMesmos=0;
  const list=contratos.filter(c=>!fProd||c.produto===fProd);
  list.forEach(c=>{const k=calc(c);prev+=k.r.resTotT||0;cred+=k.r.credT||0;scT+=k.r.scT;fPrev+=k.r.fretePrevTot||0;fReal+=k.r.freteRealTot||0;
    if(k.saldoKg>0)saldoSc+=k.saldoKg/k.kg;
    k.vs.forEach(x=>{if(x.fr!=null){nReal++;if(isN(x.resRealTot)){lReal+=x.resRealTot;lPrevMesmos+=x.resTot||0;x.resRealTot>=0?lucroN++:prejN++;}if(isN(x.final))real+=x.final;}else nPend++;});});
  const tot=prev+cred;
  const porProd={milho:0,soja:0,sorgo:0}, nProd={milho:0,soja:0,sorgo:0};
  contratos.forEach(c=>{if(porProd[c.produto]!=null){porProd[c.produto]+=(c.volumeKg||0)/kgS(c.produto);nProd[c.produto]++;}});
  const totSc=porProd.milho+porProd.soja+porProd.sorgo;
  const cardProd=`<div class="card kpi kprod" tabindex="0"><div class="l">Sacas fechadas por produto <span class="ico">i</span><div class="tip">${esc(TIPS["Sacas fechadas por produto"])}</div></div>`+
    PRODS.map(p=>`<div class="prow">${prodTag(p)}<span class="mono"><b>${f0.format(porProd[p])}</b> sc</span><span class="note">${nProd[p]} contr.</span></div>`).join("")+
    `<div class="prow tot"><span>Total</span><span class="mono"><b>${f0.format(totSc)}</b> sc</span><span></span></div></div>`;
  $("#kpis").innerHTML=cardProd+
    kpi("Lucro previsto",`<span class="${prev>=0?"lucro":"prej"}">${R(prev)}</span>`,`${list.length} contratos · ${f0.format(scT)} sc · com crédito: ${R(tot)}`)+
    kpi("Lucro realizado",nReal?`<span class="${lReal>=0?"lucro":"prej"}">${R(lReal)}</span>`:"-",nReal?`${nReal} vendedores c/ frete real · previsto p/ eles: ${R(lPrevMesmos)} · com crédito: ${R(real)}`:"lance o frete real para ver")+
    kpi("Crédito presumido",R(cred),"")+
    kpiFrete(fPrev,fReal,nReal)+
    kpi("Fretes pendentes",String(nPend),`${nReal} já lançados`)+
    kpi("Saldo a vincular",f0.format(saldoSc)+" sc","volume comprado sem vendedor");
}
function kpiFrete(fPrev,fReal,n){
  if(!n)return kpi("Frete: previsto x realizado","-","nenhum frete realizado lançado");
  const d=fPrev-fReal, ok=d>=-0.005;
  return kpi("Frete: previsto x realizado",`<span class="${ok?"lucro":"prej"}">${fR.format(d)}</span> <span class="tag ${ok?"pill-l":"pill-p"}" style="vertical-align:middle">${ok?"LUCRO NO FRETE":"PREJUÍZO NO FRETE"}</span>`,`Previsto ${fR.format(fPrev)} − realizado ${fR.format(fReal)} (${n} lançados)`);
}
const TIPS={"Sacas fechadas por produto":"Volume total dos contratos de venda fechados com os compradores (volume do comprador ÷ kg por saca do produto), somado por produto. Mostra sempre os três produtos, sem depender do filtro. Inclui contratos com preço a fixar.","Lucro previsto": "Soma do lucro previsto de todos os contratos que têm preço fixado (comprador e vendedor). Para cada vendedor: (preço do comprador − preço do vendedor − frete previsto) × sacas. Não inclui o crédito presumido; o valor “com crédito” embaixo soma o crédito ao lucro previsto. Vendedores ou compradores com preço A FIXAR ficam fora da conta. Respeita o filtro de produto.", "Lucro realizado": "Soma do lucro só dos vendedores que já têm frete realizado lançado. Para cada um: (preço do comprador − preço do vendedor − frete realizado) × sacas. Embaixo: “previsto p/ eles” é o lucro previsto desses mesmos vendedores, para comparar (a diferença é o efeito do frete), e “com crédito” soma o crédito presumido deles. Não inclui o crédito no número principal.", "Crédito presumido": "Soma do crédito presumido dos vendedores com preço fixado: valor total da compra do vendedor (sacas × preço do vendedor) × % de crédito presumido do produto (definido na aba Parâmetros; hoje 2,4%). Vendedores com preço A FIXAR ficam fora.", "Frete: previsto x realizado": "Compara o frete só dos vendedores que já têm frete realizado lançado. Frete previsto total = frete previsto (R$/sc) × sacas; frete realizado total = frete realizado (R$/sc) × sacas. Resultado = previsto − realizado: positivo é LUCRO NO FRETE (gastou menos que o previsto), negativo é PREJUÍZO NO FRETE (gastou mais). Vendedor sem frete previsto conta como previsto R$ 0,00.", "Fretes pendentes": "Quantidade de vendedores que ainda não têm frete realizado lançado. Para lançar, digite o valor (R$/sc) na coluna amarela FRETE REALIZADO da tabela e tecle Enter.", "Saldo a vincular": "Volume comprado que ainda não tem vendedor vinculado: para cada contrato, volume do comprador − soma dos volumes dos vendedores, convertido em sacas. Só entram contratos com saldo positivo."};
const kpi=(l,v,s)=>`<div class="card kpi"${TIPS[l]?` tabindex="0"`:""}><div class="l">${l}${TIPS[l]?` <span class="ico">i</span><div class="tip">${esc(TIPS[l])}</div>`:""}</div><div class="v">${v}</div><div class="s">${s||""}</div></div>`;

/* copiar como TSV */
function copyTable(){
  const rows=[HEAD.slice(0,-1)], num=v=>isN(v)?String(Math.round(v*100)/100).replace(".",","):"";
  const fx=(v)=>isN(v)?num(v):"A FIXAR";
  filtered().forEach(c=>{const k=calc(c),r=k.r;
    rows.push([PNAME[c.produto],"COMPRADOR",D(c.data),c.numero,c.comprador,c.cidade,num(c.volumeKg),num(k.bSc),fx(k.Pb),fx(k.bValor),"","","","",num(k.saldoKg),"","","","","","","","",""]);
    k.vs.forEach(x=>rows.push(["","VENDEDOR",D(x.v.data),x.v.numero||"",x.v.nome,x.v.cidade||"",num(x.v.volumeKg),num(x.sc),fx(x.P),fx(x.valor),fx(x.dif),num(x.fp),fx(x.res),fx(x.resTot),"",fx(x.cred),fx(x.resCred),num(x.fr),x.fr!=null?num(x.fretePrevTot):"",num(x.freteRealTot),num(x.desvio),fx(x.resTot),num(x.resRealTot),num(x.final)]));
    rows.push(["","RESUMO","","",k.vs.length===1?"TOTAL VENDEDOR":`TOTAL ${k.vs.length} VENDEDORES – PREÇO MÉDIO PONDERADO`,"",num(r.kgT),num(r.scT),fx(r.precoM),fx(r.valorT),fx(r.difM),num(r.freteM),fx(r.resM),fx(r.resTotT),"",fx(r.credT),fx(r.resCredM),num(r.freteRealM),num(r.fretePrevTot),num(r.freteRealTot),num(r.desvioT),fx(r.resTotT),num(r.resRealTotT),num(r.finalT)]);
    rows.push([]);});
  const tsv=rows.map(r=>r.map(x=>String(x==null?"":x).replace(/\t|\n/g," ")).join("\t")).join("\n");
  navigator.clipboard.writeText(tsv).then(()=>toast("Tabela copiada. Cole no Excel (Ctrl+V)."),()=>toast("Não foi possível copiar neste navegador."));
}

/* ---------------- formulário ---------------- */
let fProduto="milho";
function vendRow(v){
  v=v||{};
  const tr=document.createElement("tr"); tr.dataset.real=isN(v.freteReal)?String(v.freteReal):""; tr.dataset.vid=v.id||"";
  tr.innerHTML=`<td><input type="date" class="vData" value="${esc(v.data||"")}"></td>`+
    `<td><input type="text" class="vNum" value="${esc(v.numero||"")}"></td>`+
    `<td><input type="text" class="vNome" list="dlVend" value="${esc(v.nome||"")}"></td>`+
    `<td><input type="text" class="vCid" list="dlCid" placeholder="ex.: VARGINHA/MG" value="${esc(v.cidade||"")}"></td>`+
    `<td><input type="text" class="vKg" inputmode="decimal" value="${esc(toBR(v.volumeKg,0))}"></td>`+
    `<td class="mono vSc note"></td>`+
    `<td><input type="text" class="vPreco" inputmode="decimal" placeholder="A FIXAR" value="${esc(toBR(v.preco,2))}"></td>`+
    `<td><input type="text" class="vFrete" inputmode="decimal" placeholder="0,00" value="${esc(toBR(v.fretePrev,2))}"></td>`+
    `<td><button type="button" class="btn sm danger vDel" title="Remover">✕</button></td>`;
  $("#vendBody").appendChild(tr);
}
function readForm(strict){
  const errs=[]; const num=(s,label,req)=>{const n=parseBR(s);if(Number.isNaN(n)){errs.push(`${label}: número inválido`);return null;} if(req&&(n==null||n<=0))errs.push(`${label}: obrigatório`);return n;};
  const c={produto:fProduto,data:$("#cData").value||"",numero:$("#cNum").value.trim(),comprador:$("#cComp").value.trim().toUpperCase(),cidade:$("#cCid").value.trim().toUpperCase(),
    volumeKg:num($("#cKg").value,"Volume do comprador",true),preco:num($("#cPreco").value,"Preço do comprador"),vendedores:[]};
  if(!c.comprador)errs.push("Empresa compradora: obrigatória");
  [...$("#vendBody").children].forEach((tr,i)=>{
    const g=s=>tr.querySelector(s).value;
    const v={id:tr.dataset.vid||null,data:g(".vData")||"",numero:g(".vNum").trim(),nome:g(".vNome").trim().toUpperCase(),cidade:g(".vCid").trim().toUpperCase(),
      volumeKg:num(g(".vKg"),`Vendedor ${i+1} volume`,true),preco:num(g(".vPreco"),`Vendedor ${i+1} preço`),fretePrev:num(g(".vFrete"),`Vendedor ${i+1} frete`),
      freteReal:tr.dataset.real!==""?Number(tr.dataset.real):null};
    if(!v.nome&&!g(".vKg"))return; if(!v.nome)errs.push(`Vendedor ${i+1}: nome obrigatório`);
    c.vendedores.push(v);
  });
  if(strict&&!c.vendedores.length)errs.push("Lance pelo menos um vendedor");
  return {c,errs};
}
function updatePreview(){
  const {c}=readForm(false), k=calc({...c,volumeKg:c.volumeKg||0});
  [...$("#vendBody").children].forEach((tr,i)=>{const kg=parseBR(tr.querySelector(".vKg").value);tr.querySelector(".vSc").textContent=isN(kg)?N2(kg/k.kg):"";});
  $("#cInfo").textContent=isN(c.volumeKg)?`${N2(c.volumeKg/k.kg)} sacas de ${k.kg} kg · crédito presumido ${toBR(k.cr*100,2)}%`+(isN(c.preco)?` · valor total ${R(c.volumeKg/k.kg*c.preco)}`:" · preço A FIXAR"):"";
  const s=$("#saldoInfo"); if(isN(c.volumeKg)){s.textContent=`${N0(k.saldoKg)||"0"} kg (${N2(k.saldoKg/k.kg)} sc)`; s.style.color=k.saldoKg<0?"var(--prej)":k.saldoKg>0?"var(--warn)":"var(--lucro)"; if(k.saldoKg<0)s.textContent+=" · vendedores passam do volume do comprador";} else s.textContent="-";
  const r=k.r;
  let h=`<thead><tr>${["TIPO","EMPRESA / PRODUTOR","VOLUME (sc)","PREÇO (R$/sc)","VALOR TOTAL (R$)","DIFERENÇA (R$/sc)","FRETE (R$/sc)","RESULTADO (R$/sc)","RESULTADO TOTAL (R$)","CRÉDITO PRESUMIDO (R$)","RESULTADO + CRÉDITO (R$/sc)"].map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
  h+=`<tr class="buyer"><td>COMPRADOR</td><td>${esc(c.comprador)}</td><td class="n">${N2(k.bSc)}</td>${cN(k.Pb,R,1)}${cN(k.bValor,R,1)}<td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
  k.vs.forEach(x=>h+=`<tr><td>VENDEDOR</td><td>${esc(x.v.nome)}${x.v.cidade?` <span class="note">· ${esc(x.v.cidade)}</span>`:""}</td><td class="n">${N2(x.sc)}</td>${cN(x.P,R,1)}${cN(x.valor,R,1)}${cN(x.dif,R,1)}<td class="n">${x.fp?R(x.fp):"-"}</td>${cN(x.res,R,1)}${cN(x.resTot,R,1)}${cN(x.cred,R,1)}${cN(x.resCred,R,1)}</tr>`);
  h+=`<tr class="resumo"><td>RESUMO</td><td>${k.vs.length} vendedor(es)</td><td class="n">${N2(r.scT)}</td>${cN(r.precoM,R,1)}${cN(r.valorT,R,1)}${cN(r.difM,R,1)}<td class="n">${r.freteM?R(r.freteM):"-"}</td>${cN(r.resM,R,1)}${cN(r.resTotT,R,1)}${cN(r.credT,R,1)}${cN(r.resCredM,R,1)}</tr></tbody>`;
  $("#preview").innerHTML=h;
}
function setProduto(p){fProduto=p;[...$("#prodPick").children].forEach(b=>b.classList.toggle("on",b.dataset.p===p));updatePreview();}
function resetForm(c){
  editId=c?c.id:null; $("#formTitle").textContent=c?`Editar contrato ${c.numero||""}`:"Novo contrato";
  $("#cData").value=c?c.data||"":new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  $("#cNum").value=c?c.numero||"":""; $("#cComp").value=c?c.comprador||"":""; $("#cCid").value=c?c.cidade||"":"SANTOS/SP";
  $("#cKg").value=c?toBR(c.volumeKg,0):""; $("#cPreco").value=c?toBR(c.preco,2):"";
  $("#vendBody").innerHTML=""; (c&&c.vendedores&&c.vendedores.length?c.vendedores:[null]).forEach(vendRow);
  $("#formMsg").textContent=""; setProduto(c?c.produto||"milho":"milho");
}
async function salvar(){
  const {c,errs}=readForm(true);
  if(errs.length){$("#formMsg").innerHTML=`<span class="prej">${esc(errs.join(" · "))}</span>`;return;}
  if(!api.supabase){$("#formMsg").innerHTML=`<span class="prej">Supabase não configurado (js/config.js).</span>`;return;}
  const btn=$("#btnSalvar"); btn.disabled=true;
  try{
    c.id=editId||null;
    await api.salvarContrato(c);
    const eraEdicao=!!editId;
    await recarregar();
    toast(eraEdicao?"Contrato atualizado.":"Contrato salvo."); resetForm(null); show("contratos");
  }catch(e){ $("#formMsg").innerHTML=`<span class="prej">${esc(e.message||"Não foi possível salvar.")}</span>`; }
  finally{btn.disabled=false;}
}

/* ---------------- parâmetros ---------------- */
function renderParams(){
  $("#paramTbl tbody").innerHTML=PRODS.map(p=>`<tr><td>${prodTag(p)}</td><td><input type="text" data-k="${p}" class="pKg" value="${toBR(kgS(p),0)}" style="width:100px"></td><td><input type="text" data-k="${p}" class="pCr" value="${toBR(crd(p)*100,2)}" style="width:100px"></td></tr>`).join("");
}
async function saveParams(){
  const np=parametrosPadrao(); let bad=false;
  document.querySelectorAll(".pKg").forEach(i=>{const n=parseBR(i.value);if(!isN(n)||n<=0)bad=true;else np.kgSaca[i.dataset.k]=n;});
  document.querySelectorAll(".pCr").forEach(i=>{const n=parseBR(i.value);if(!isN(n)||n<0)bad=true;else np.credito[i.dataset.k]=n/100;});
  if(bad){$("#paramMsg").innerHTML=`<span class="prej">Confira os valores.</span>`;return;}
  if(!api.supabase)return;
  try{await api.salvarParametros(np);params=np;renderAll();$("#paramMsg").textContent="Parâmetros salvos.";}catch(e){$("#paramMsg").innerHTML=`<span class="prej">${esc(e.message||"Não foi possível salvar.")}</span>`;}
}

/* ---------------- navegação / eventos ---------------- */
function show(v){document.querySelectorAll(".view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));[...$("#nav").children].forEach(b=>b.classList.toggle("on",b.dataset.v===v)); if(v==="param")renderParams(); if(v==="contratos"){renderKpis();renderTable();} window.scrollTo(0,0);}
function renderAll(){renderKpis();renderTable();
  $("#dlComp").innerHTML=[...new Set(contratos.map(c=>c.comprador).filter(Boolean))].sort().map(x=>`<option value="${esc(x)}">`).join("");
  $("#dlCid").innerHTML=[...new Set(contratos.flatMap(c=>[c.cidade,...(c.vendedores||[]).map(v=>v.cidade)]).filter(Boolean))].sort().map(x=>`<option value="${esc(x)}">`).join("");
  $("#dlVend").innerHTML=[...new Set(contratos.flatMap(c=>(c.vendedores||[]).map(v=>v.nome)).filter(Boolean))].sort().map(x=>`<option value="${esc(x)}">`).join("");}

$("#nav").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.v==="novo"&&editId===null)resetForm(null);show(b.dataset.v);});
$("#fProd").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;fProd=b.dataset.p;[...$("#fProd").children].forEach(x=>x.classList.toggle("on",x===b));renderKpis();renderTable();});
$("#fStatus").addEventListener("change",renderTable); $("#fBusca").addEventListener("input",renderTable);
$("#btnCopy").addEventListener("click",copyTable);
$("#tbl").addEventListener("click",e=>{
  const ed=e.target.closest("[data-edit]"), dl=e.target.closest("[data-del]");
  if(ed){const c=contratos.find(x=>x.id===ed.dataset.edit);if(c){resetForm(c);show("novo");}}
  if(dl){const c=contratos.find(x=>x.id===dl.dataset.del);if(!c)return;
    $("#mTitle").textContent="Excluir contrato?"; $("#mText").textContent=`${c.comprador} · ${c.numero} e seus ${c.vendedores.length} vendedor(es) serão apagados.`;
    $("#modal").classList.add("on"); $("#mYes").onclick=async()=>{$("#modal").classList.remove("on");try{await api.excluirContrato(c.id);contratos=contratos.filter(x=>x.id!==c.id);renderAll();toast("Contrato excluído.");}catch(e){toast(e.message||"Não foi possível excluir.");}};}
});
$("#tbl").addEventListener("change",e=>{if(e.target.classList.contains("frIn"))saveFreteInline(e.target);});
$("#tbl").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.classList.contains("frIn")){e.preventDefault();saveFreteInline(e.target);
  const all=[...$("#tbl").querySelectorAll("input.frIn")],i=all.indexOf(e.target);if(all[i+1])all[i+1].focus();}});
$("#mNo").addEventListener("click",()=>$("#modal").classList.remove("on"));
$("#prodPick").addEventListener("click",e=>{const b=e.target.closest("button");if(b)setProduto(b.dataset.p);});
$("#addVend").addEventListener("click",()=>{vendRow();updatePreview();});
$("#vendBody").addEventListener("click",e=>{if(e.target.closest(".vDel")){e.target.closest("tr").remove();if(!$("#vendBody").children.length)vendRow();updatePreview();}});
$("#v-novo").addEventListener("input",updatePreview);
$("#btnSalvar").addEventListener("click",salvar);
$("#btnCancelar").addEventListener("click",()=>{resetForm(null);show("contratos");});
$("#btnParam").addEventListener("click",saveParams);

/* ---------------- dados e login ---------------- */
async function recarregar(){
  const [ps,cs]=await Promise.all([api.carregarParametros(),api.carregarContratos()]);
  params=ps; contratos=cs; loaded=true; renderAll(); updatePreview();
  if($("#v-param").classList.contains("on"))renderParams();
}
async function iniciarSessao(sessao){
  usuario=sessao?sessao.user:null;
  if(!usuario){ $("#login").hidden=false; $("#userBox").hidden=true; if(pararTempoReal){pararTempoReal();pararTempoReal=null;} contratos=[]; loaded=false; renderAll(); return; }
  $("#login").hidden=true; $("#userBox").hidden=false; $("#userEmail").textContent=usuario.email||"";
  banner("");
  try{ await recarregar(); }
  catch(e){ loaded=true; banner(esc(e.message||"Não foi possível carregar os contratos.")); renderAll(); }
  if(!pararTempoReal) pararTempoReal=api.acompanharMudancas(()=>recarregar().catch(()=>{}));
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=$("#loginMsg"), b=$("#btnEntrar"); msg.className="note"; msg.textContent=""; b.disabled=true;
  try{ await api.entrar($("#loginEmail").value.trim(),$("#loginSenha").value); }
  catch(err){ msg.className="note err"; msg.textContent=err.message; }
  finally{ b.disabled=false; }
});
$("#btnEsqueci").addEventListener("click",async()=>{
  const email=$("#loginEmail").value.trim(), msg=$("#loginMsg");
  if(!email){msg.className="note err";msg.textContent="Digite seu e-mail acima e clique de novo.";return;}
  try{ await api.enviarRecuperacaoSenha(email); msg.className="note"; msg.textContent="Enviamos um link para trocar a senha no seu e-mail."; }
  catch(err){ msg.className="note err"; msg.textContent=err.message; }
});
$("#btnSair").addEventListener("click",()=>api.sair());

resetForm(null); renderAll();

if(!api.configurado){
  loaded=true; renderAll();
  banner("Supabase ainda não configurado: preencha <b>js/config.js</b> com a URL e a chave anon do projeto (veja o README).");
}else{
  api.aoMudarSessao(async (sessao)=>{
    // link de "esqueci minha senha": pede a nova senha
    if(location.hash.includes("type=recovery")&&sessao){
      const nova=await pedirNovaSenha(); if(nova){ try{await api.definirNovaSenha(nova);toast("Senha alterada.");}catch(e){toast(e.message);} }
      history.replaceState(null,"",location.pathname);
    }
    iniciarSessao(sessao);
  });
}

function pedirNovaSenha(){
  return new Promise(res=>{
    $("#mTitle").textContent="Definir nova senha";
    $("#mText").innerHTML=`<input type="password" id="novaSenha" placeholder="nova senha (mín. 6 caracteres)" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:7px">`;
    const yes=$("#mYes"), no=$("#mNo"), txt=yes.textContent; yes.textContent="Salvar"; yes.classList.remove("danger"); yes.classList.add("pri");
    $("#modal").classList.add("on");
    const fim=v=>{$("#modal").classList.remove("on");yes.textContent=txt;yes.classList.add("danger");yes.classList.remove("pri");no.onclick=null;res(v);};
    yes.onclick=()=>{const v=$("#novaSenha").value; if(v.length<6){toast("Mínimo de 6 caracteres.");return;} fim(v);};
    no.onclick=()=>fim(null);
  });
}
