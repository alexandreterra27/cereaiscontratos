// =====================================================================
//  Sistema de Vinculações de Contratos – Grupo Parceiro Agronegócios
//  Tela principal: contratos, cadastro, frete realizado e parâmetros.
// =====================================================================
import { PRODUTOS as PRODS, NOME_PRODUTO as PNAME, parametrosPadrao, isN, parseBR, kgSaca, creditoPresumido, calcularContrato, montarContratosVinculados, calcularPosicao, vinculadoPorContrato } from "./calc.js";
import * as api from "./api.js";

let contratos=[], vendas=[], compras=[], vinculos=[], params=parametrosPadrao(), loaded=false, usuario=null, perfil=null, pararTempoReal=null, usuarios=[];
const podeEditar=()=>perfil==="admin"||perfil==="comercial";
const ehAdmin=()=>perfil==="admin";
let fProd="", fProdLista={compras:"",vendas:""};

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
  if(!list.length){t.innerHTML=`<tr><td class="empty">${contratos.length?"Nenhum contrato com esses filtros.":"Nenhum contrato vinculado ainda. Lance compras e vendas nas abas Compras e Vendas e depois use “Vincular”."}</td></tr>`;return;}
  let h=`<thead><tr>${HEAD.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
  list.forEach((c,i)=>{
    const k=calc(c), r=k.r, n=k.vs.length;
    if(i)h+=`<tr class="sp"><td colspan="${HEAD.length}"></td></tr>`;
    h+=`<tr class="buyer"><td>${prodTag(c.produto)}</td><td>COMPRADOR</td><td>${D(c.data)}</td><td>${esc(c.numero)}</td><td>${esc(c.comprador)}</td><td>${esc(c.cidade)}</td>`+
      `<td class="n">${N0(c.volumeKg)}</td><td class="n">${N2(k.bSc)}</td>${cN(k.Pb,R,1)}${cN(k.bValor,R,1)}<td></td><td></td><td></td><td></td>`+
      `<td class="n${k.saldoKg<0?" saldo-neg":""}"${k.saldoKg<0?` title="Vinculado ${f0.format(-k.saldoKg)} kg a mais que o volume da venda"`:""}>${N0(k.saldoKg)}${k.saldoKg<0?" ⚠":""}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`+
      `<td><div class="actions"><button class="btn sm so-edicao" data-edit="${esc(c.id)}">Editar vínculos</button><button class="btn sm danger so-edicao" data-del="${esc(c.id)}">Desvincular</button></div></td></tr>`;
    k.vs.forEach(x=>{
      const v=x.v;
      h+=`<tr><td></td><td>VENDEDOR</td><td>${D(v.data)}</td><td>${esc(v.numero)}</td><td>${esc(v.nome)}</td><td>${esc(v.cidade||"")}</td>`+
        `<td class="n">${N0(v.volumeKg)}</td><td class="n">${N2(x.sc)}</td>${cN(x.P,R,1)}${cN(x.valor,R,1)}${cN(x.dif,R,1)}`+
        `<td class="n">${x.fp?R(x.fp):"-"}</td>${cN(x.res,R,1)}${cN(x.resTot,R,1)}<td></td>${cN(x.cred,R,1)}${cN(x.resCred,R,1)}`+
        `<td class="n"><input type="text" class="frete-in frIn${x.fr==null?" pend":""}" inputmode="decimal" data-key="${esc(c.id)}|${esc(v.id)}" data-orig="${esc(toBR(x.fr,2))}" value="${esc(toBR(x.fr,2))}" placeholder="${podeEditar()?"digite R$/sc":"-"}"${podeEditar()?"":" disabled"} title="Digite o frete realizado (R$/sc) e tecle Enter"></td>`+
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
    const l=vinculos.find(x=>x.id===vid); if(l)l.freteReal=val; montar();
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
  $("#kpis").innerHTML=
    kpi("Lucro previsto",`<span class="${prev>=0?"lucro":"prej"}">${R(prev)}</span>`,`${list.length} contratos · ${f0.format(scT)} sc · com crédito: ${R(tot)}`)+
    kpi("Lucro realizado",nReal?`<span class="${lReal>=0?"lucro":"prej"}">${R(lReal)}</span>`:"-",nReal?`${nReal} vendedores c/ frete real · previsto p/ eles: ${R(lPrevMesmos)} · com crédito: ${R(real)}`:"lance o frete real para ver")+
    kpi("Crédito presumido",R(cred),"")+
    kpiFrete(fPrev,fReal,nReal)+
    kpi("Fretes pendentes",String(nPend),`${nReal} já lançados`);
}
function kpiFrete(fPrev,fReal,n){
  if(!n)return kpi("Frete: previsto x realizado","-","nenhum frete realizado lançado");
  const d=fPrev-fReal, ok=d>=-0.005;
  return kpi("Frete: previsto x realizado",`<span class="${ok?"lucro":"prej"}">${fR.format(d)}</span> <span class="tag ${ok?"pill-l":"pill-p"}" style="vertical-align:middle">${ok?"LUCRO NO FRETE":"PREJUÍZO NO FRETE"}</span>`,`Previsto ${fR.format(fPrev)} − realizado ${fR.format(fReal)} (${n} lançados)`);
}
const TIPS={"Posição por produto":"Em sacas (kg ÷ kg por saca do produto). Comprado = soma de todos os contratos de compra. Vendido = soma de todos os contratos de venda. Comprado sem venda = parte das compras ainda não vinculada a nenhuma venda (o que está na aba Compras). Vendido sem compra = parte das vendas ainda sem compra vinculada (o que está na aba Vendas). Inclui contratos com preço a fixar. Não depende dos filtros.","Lucro previsto": "Soma do lucro previsto de todos os contratos que têm preço fixado (comprador e vendedor). Para cada vendedor: (preço do comprador − preço do vendedor − frete previsto) × sacas. Não inclui o crédito presumido; o valor “com crédito” embaixo soma o crédito ao lucro previsto. Vendedores ou compradores com preço A FIXAR ficam fora da conta. Respeita o filtro de produto.", "Lucro realizado": "Soma do lucro só dos vendedores que já têm frete realizado lançado. Para cada um: (preço do comprador − preço do vendedor − frete realizado) × sacas. Embaixo: “previsto p/ eles” é o lucro previsto desses mesmos vendedores, para comparar (a diferença é o efeito do frete), e “com crédito” soma o crédito presumido deles. Não inclui o crédito no número principal.", "Crédito presumido": "Soma do crédito presumido dos vendedores com preço fixado: valor total da compra do vendedor (sacas × preço do vendedor) × % de crédito presumido do produto (definido na aba Parâmetros; hoje 2,4%). Vendedores com preço A FIXAR ficam fora.", "Frete: previsto x realizado": "Compara o frete só dos vendedores que já têm frete realizado lançado. Frete previsto total = frete previsto (R$/sc) × sacas; frete realizado total = frete realizado (R$/sc) × sacas. Resultado = previsto − realizado: positivo é LUCRO NO FRETE (gastou menos que o previsto), negativo é PREJUÍZO NO FRETE (gastou mais). Vendedor sem frete previsto conta como previsto R$ 0,00.", "Fretes pendentes": "Quantidade de vendedores que ainda não têm frete realizado lançado. Para lançar, digite o valor (R$/sc) na coluna amarela FRETE REALIZADO da tabela e tecle Enter.", "Saldo a vincular": "Volume comprado que ainda não tem vendedor vinculado: para cada contrato, volume do comprador − soma dos volumes dos vendedores, convertido em sacas. Só entram contratos com saldo positivo."};
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

/* ---------------- dados derivados ---------------- */
let saldoVenda=new Map(), saldoCompra=new Map();
function montar(){
  contratos=montarContratosVinculados(vendas,compras,vinculos);
  const vv=vinculadoPorContrato(vinculos);
  saldoVenda=new Map(vendas.map(v=>[v.id,(v.volumeKg||0)-(vv.venda.get(v.id)||0)]));
  saldoCompra=new Map(compras.map(c=>[c.id,(c.volumeKg||0)-(vv.compra.get(c.id)||0)]));
}
const sc=(kg,produto)=>kg/kgS(produto);
const hoje=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
const rotuloVenda=v=>`${v.numero||"s/ nº"} · ${v.comprador} · ${PNAME[v.produto]} · saldo ${f0.format(sc(Math.max(saldoVenda.get(v.id)||0,0),v.produto))} sc`;
const rotuloCompra=c=>`${c.numero||"s/ nº"} · ${c.produtor} · ${PNAME[c.produto]} · saldo ${f0.format(sc(Math.max(vnDisponivelCompra(c.id),0),c.produto))} sc`;
const opt=x=>`<option value="${esc(x)}">`;

/* ---------------- posição por produto ---------------- */
function renderPosicao(){
  const p=calcularPosicao(vendas,compras,vinculos,params), T=p.total;
  const n=v=>f0.format(Math.round(v));
  const linha=(nome,L,cls="")=>`<tr class="${cls}"><td>${nome}</td><td>${n(L.comprado)}</td><td>${n(L.vendido)}</td>`+
    `<td class="${L.compradoSemVenda>0.5?"alerta":""}">${n(L.compradoSemVenda)}${L.nCompras?`<span class="sub">${L.nCompras} contrato(s)</span>`:""}</td>`+
    `<td class="${L.vendidoSemCompra>0.5?"alerta":""}">${n(L.vendidoSemCompra)}${L.nVendas?`<span class="sub">${L.nVendas} contrato(s)</span>`:""}</td></tr>`;
  const exc=T.excesso>0.5?`<p class="note prej" style="margin:8px 0 0">⚠ Há ${n(T.excesso)} sc vinculados além do volume de algum contrato. Procure o ⚠ na aba Contratos e ajuste o volume do vínculo.</p>`:"";
  $("#posicao").innerHTML=`<h3 class="kpi" tabindex="0" style="cursor:help;position:relative;border:0;padding:0;background:none">Posição por produto (sacas) <span class="ico">i</span><div class="tip">${esc(TIPS["Posição por produto"])}</div></h3>
    <table><thead><tr><th>Produto</th><th>Total comprado</th><th>Total vendido</th><th>Comprado sem venda</th><th>Vendido sem compra</th></tr></thead><tbody>
    ${PRODS.map(pr=>linha(prodTag(pr),p.porProduto[pr])).join("")}${linha("<b>Total</b>",T,"tot")}</tbody></table>${exc}`;
  $("#cntCompras").textContent=compras.filter(c=>(saldoCompra.get(c.id)||0)>0).length||"";
  $("#cntVendas").textContent=vendas.filter(v=>(saldoVenda.get(v.id)||0)>0).length||"";
}

function renderDatalists(){
  const uniq=a=>[...new Set(a.filter(Boolean))].sort();
  $("#dlComp").innerHTML=uniq(vendas.map(v=>v.comprador)).map(opt).join("");
  $("#dlProdutor").innerHTML=uniq(compras.map(c=>c.produtor)).map(opt).join("");
  $("#dlCid").innerHTML=uniq([...vendas.map(v=>v.cidade),...compras.map(c=>c.cidade)]).map(opt).join("");
  $("#dlVendasAbertas").innerHTML=vendas.filter(v=>(saldoVenda.get(v.id)||0)>0).sort(porData).map(v=>opt(rotuloVenda(v))).join("");
  const venda=vn.venda&&vendas.find(v=>v.id===vn.venda);
  $("#dlComprasAbertas").innerHTML=venda?compras.filter(c=>c.produto===venda.produto&&vnDisponivelCompra(c.id)>0&&!vn.linhas.some(l=>l.compraId===c.id)).sort(porData).map(c=>opt(rotuloCompra(c))).join(""):"";
}
const porData=(a,b)=>((b.data||"")+(b.numero||"")).localeCompare((a.data||"")+(a.numero||""));

/* ---------------- listas Compras / Vendas ---------------- */
function linhasLista(tipo){
  const lista=tipo==="compras"?compras:vendas, saldos=tipo==="compras"?saldoCompra:saldoVenda;
  const q=($(tipo==="compras"?"#fBuscaCompras":"#fBuscaVendas").value||"").trim().toLowerCase();
  const todas=$(tipo==="compras"?"#todasCompras":"#todasVendas").checked, fp=fProdLista[tipo];
  return lista.filter(x=>{
    if(fp&&x.produto!==fp)return false;
    if(!todas&&(saldos.get(x.id)||0)<=0)return false;
    if(q&&![x.numero,x.produtor,x.comprador,x.cidade].join(" ").toLowerCase().includes(q))return false;
    return true;
  }).sort(porData);
}
function vinculosDe(tipo,id){
  return vinculos.filter(l=>tipo==="compras"?l.compraId===id:l.vendaId===id).map(l=>{
    const o=tipo==="compras"?vendas.find(v=>v.id===l.vendaId):compras.find(c=>c.id===l.compraId);
    return o?`${esc(o.numero||"s/ nº")} <span class="note">(${f0.format(sc(l.volumeKg,o.produto))} sc)</span>`:"";
  }).join("<br>");
}
function renderLista(tipo){
  const t=$(tipo==="compras"?"#tblCompras":"#tblVendas"), saldos=tipo==="compras"?saldoCompra:saldoVenda;
  if(!loaded){t.innerHTML=`<tr><td class="empty">Carregando…</td></tr>`;return;}
  const rows=linhasLista(tipo);
  const todas=$(tipo==="compras"?"#todasCompras":"#todasVendas").checked;
  if(!rows.length){t.innerHTML=`<tr><td class="empty">${todas?"Nenhum contrato.":tipo==="compras"?"Nenhuma compra sem venda. Tudo vinculado! 👍":"Nenhuma venda sem compra. Tudo vinculado! 👍"}</td></tr>`;return;}
  const quem=tipo==="compras"?"PRODUTOR":"COMPRADOR", cid=tipo==="compras"?"CIDADE DE RETIRADA":"CIDADE DE ENTREGA", outro=tipo==="compras"?"VENDAS VINCULADAS":"COMPRAS VINCULADAS";
  let h=`<thead><tr>${[podeEditar()?"":null,"PRODUTO","DATA","Nº CONTRATO",quem,cid,"VOLUME (kg)","VOLUME (sc)","PREÇO (R$/sc)","VALOR TOTAL (R$)","VINCULADO (sc)","SALDO (sc)",outro].filter(x=>x!==null).map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
  let totKg=0,totSaldo=0;
  rows.forEach(x=>{
    const s=saldos.get(x.id)||0, vinc=(x.volumeKg||0)-s; totKg+=x.volumeKg||0; totSaldo+=Math.max(s,0)/kgS(x.produto);
    const acoes=podeEditar()?`<td><div class="actions">${s>0?`<button class="btn sm pri" data-lvincular="${esc(x.id)}">Vincular</button>`:""}<button class="btn sm" data-leditar="${esc(x.id)}">Editar</button><button class="btn sm danger" data-lexcluir="${esc(x.id)}">Excluir</button></div></td>`:"";
    h+=`<tr>${acoes}<td>${prodTag(x.produto)}</td><td>${D(x.data)}</td><td><b>${esc(x.numero||"s/ nº")}</b></td><td>${esc(tipo==="compras"?x.produtor:x.comprador)}</td><td>${esc(x.cidade)}</td>`+
      `<td class="n">${N0(x.volumeKg)}</td><td class="n">${N2(sc(x.volumeKg,x.produto))}</td>${cN(x.preco,R,1)}${cN(isN(x.preco)?sc(x.volumeKg,x.produto)*x.preco:null,R,1)}`+
      `<td class="n">${vinc?N2(sc(vinc,x.produto)):"-"}</td><td class="n ${s>0.0005?"saldo-pos":s<-0.0005?"saldo-neg":"saldo-zero"}">${s<-0.0005?"⚠ ":""}${N2(sc(s,x.produto))}</td>`+
      `<td>${vinculosDe(tipo,x.id)||'<span class="note">—</span>'}</td></tr>`;
  });
  h+=`<tr class="resumo">${podeEditar()?"<td></td>":""}<td></td><td></td><td>${rows.length} contrato(s)</td><td></td><td></td><td class="n">${N0(totKg)}</td><td></td><td></td><td></td><td></td><td class="n">${N2(totSaldo)}</td><td></td></tr>`;
  t.innerHTML=h+"</tbody>";
}
const renderCompras=()=>renderLista("compras"), renderVendas=()=>renderLista("vendas");

/* ---------------- formulários Compras / Vendas ---------------- */
const F={compras:{pre:"cp",nome:"produtor",tit:"#ftCompra",novo:"Novo contrato de compra",edit:"Editar contrato de compra",salvar:api.salvarCompra,excluir:api.excluirCompra},
         vendas:{pre:"vd",nome:"comprador",tit:"#ftVenda",novo:"Novo contrato de venda",edit:"Editar contrato de venda",salvar:api.salvarVenda,excluir:api.excluirVenda}};
const editando={compras:null,vendas:null};
function limparForm(tipo){
  const f=F[tipo], P=f.pre; editando[tipo]=null;
  $("#"+P+"Data").value=hoje(); $("#"+P+"Num").value=""; $("#"+P+"Nome").value=""; $("#"+P+"Kg").value=""; $("#"+P+"Preco").value="";
  $("#"+P+"Cid").value=tipo==="vendas"?"SANTOS/SP":""; $("#"+P+"Produto").disabled=false;
  $(f.tit).textContent=f.novo; $("#"+P+"Cancelar").hidden=true; $("#"+P+"Msg").textContent="";
}
function editarForm(tipo,id){
  const f=F[tipo], P=f.pre, x=(tipo==="compras"?compras:vendas).find(y=>y.id===id); if(!x)return;
  editando[tipo]=id; $("#"+P+"Produto").value=x.produto; $("#"+P+"Data").value=x.data||""; $("#"+P+"Num").value=x.numero||"";
  $("#"+P+"Nome").value=x[f.nome]||""; $("#"+P+"Cid").value=x.cidade||""; $("#"+P+"Kg").value=toBR(x.volumeKg,0); $("#"+P+"Preco").value=toBR(x.preco,2);
  const temVinc=vinculos.some(l=>(tipo==="compras"?l.compraId:l.vendaId)===id); $("#"+P+"Produto").disabled=temVinc;
  $(f.tit).textContent=`${f.edit} ${x.numero||""}`; $("#"+P+"Cancelar").hidden=false;
  $("#"+P+"Msg").textContent=temVinc?"Este contrato já tem vínculos: o produto não pode mudar e o volume não pode ficar menor que o vinculado.":"";
  $(f.tit).scrollIntoView({behavior:"smooth",block:"center"}); $("#"+P+"Num").focus();
}
async function salvarForm(tipo){
  const f=F[tipo], P=f.pre, msg=$("#"+P+"Msg");
  const kg=parseBR($("#"+P+"Kg").value), preco=parseBR($("#"+P+"Preco").value), nome=$("#"+P+"Nome").value.trim().toUpperCase();
  const erros=[]; if(!nome)erros.push(tipo==="compras"?"informe o produtor":"informe a empresa compradora");
  if(!isN(kg)||kg<=0)erros.push("volume inválido"); if(Number.isNaN(preco))erros.push("preço inválido");
  if(erros.length){msg.innerHTML=`<span class="prej">${esc(erros.join(" · "))}</span>`;return;}
  const x={id:editando[tipo],produto:$("#"+P+"Produto").value,data:$("#"+P+"Data").value,numero:$("#"+P+"Num").value.trim().toUpperCase(),
    cidade:$("#"+P+"Cid").value.trim().toUpperCase(),volumeKg:kg,preco};
  x[f.nome]=nome;
  const b=$("#"+P+"Salvar"); b.disabled=true; msg.textContent="Salvando…";
  try{ const eraEdicao=!!x.id; await f.salvar(x); await recarregar(); limparForm(tipo);
    toast(eraEdicao?"Contrato atualizado.":(tipo==="compras"?"Compra lançada. Ela fica nesta aba até ser vinculada.":"Venda lançada. Ela fica nesta aba até ser vinculada.")); }
  catch(e){ msg.innerHTML=`<span class="prej">${esc(e.message)}</span>`; }
  finally{ b.disabled=false; }
}
async function excluirDaLista(tipo,id){
  const x=(tipo==="compras"?compras:vendas).find(y=>y.id===id); if(!x)return;
  const nv=vinculos.filter(l=>(tipo==="compras"?l.compraId:l.vendaId)===id).length;
  const ok=await dialogo({titulo:tipo==="compras"?"Excluir contrato de compra?":"Excluir contrato de venda?",
    html:`<b>${esc(x.numero||"s/ nº")}</b> · ${esc(tipo==="compras"?x.produtor:x.comprador)} será apagado de vez.${nv?`<br><br><b>Atenção:</b> ele tem ${nv} vínculo(s), que também serão apagados (com os fretes lançados).`:""}`,ok:"Excluir",perigo:true});
  if(!ok)return;
  try{ await F[tipo].excluir(id); if(editando[tipo]===id)limparForm(tipo); await recarregar(); toast("Contrato excluído."); }catch(e){ toast(e.message); }
}

/* ---------------- Vincular ---------------- */
const vn={venda:null,linhas:[],compraPendente:null};
function vnDisponivelCompra(compraId){
  // saldo da compra somando de volta o que esta venda já usa dela (será regravado)
  const proprio=vn.venda?vinculos.filter(l=>l.vendaId===vn.venda&&l.compraId===compraId).reduce((s,l)=>s+l.volumeKg,0):0;
  return (saldoCompra.get(compraId)||0)+proprio;
}
function vnLimpar(){
  vn.venda=null; vn.linhas=[]; vn.compraPendente=null;
  $("#vnVendaBusca").value=""; $("#vnVendaBusca").disabled=false; $("#vnPuxarVenda").hidden=false; $("#vnTrocarVenda").hidden=true;
  $("#vnEscolhaVenda").innerHTML=""; $("#vnEscolhaCompra").innerHTML=""; $("#vnMsg").textContent=""; $("#vnTitulo").textContent="1. Contrato de venda";
  vnAtualizar();
}
function vnCarregarVenda(id){
  const v=vendas.find(x=>x.id===id); if(!v)return;
  vn.venda=id; vn.linhas=vinculos.filter(l=>l.vendaId===id).sort((a,b)=>a.ordem-b.ordem).map(l=>({id:l.id,compraId:l.compraId,volumeKg:l.volumeKg,fretePrev:l.fretePrev,freteReal:l.freteReal}));
  $("#vnVendaBusca").value=rotuloVenda(v); $("#vnVendaBusca").disabled=true; $("#vnPuxarVenda").hidden=true; $("#vnTrocarVenda").hidden=false; $("#vnEscolhaVenda").innerHTML="";
  $("#vnTitulo").textContent=vn.linhas.length?"1. Contrato de venda (editando vínculos)":"1. Contrato de venda";
  if(vn.compraPendente){ const c=compras.find(x=>x.id===vn.compraPendente); vn.compraPendente=null; if(c)vnAdicionarCompra(c.id,true); }
  vnAtualizar(); setTimeout(()=>$("#vnCompraBusca").focus(),50);
}
function buscar(lista,texto,rotulo,campoNome){
  const q=texto.trim().toLowerCase(); if(!q)return [];
  const exato=lista.filter(x=>rotulo(x).toLowerCase()===q); if(exato.length)return exato;
  const num=lista.filter(x=>(x.numero||"").toLowerCase()===q); if(num.length)return num;
  return lista.filter(x=>(x.numero||"").toLowerCase().includes(q)||(x[campoNome]||"").toLowerCase().includes(q));
}
function escolha(el,itens,rotulo,acao){
  el.innerHTML=`<div class="escolha"><span class="note">Encontrei ${itens.length} contratos. Escolha um:</span>${itens.slice(0,12).map(x=>`<button type="button" class="btn sm" data-id="${esc(x.id)}">${esc(rotulo(x))}</button>`).join("")}</div>`;
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>{el.innerHTML="";acao(b.dataset.id);});
}
function vnPuxarVenda(){
  const txt=$("#vnVendaBusca").value, el=$("#vnEscolhaVenda");
  const abertas=vendas.filter(v=>(saldoVenda.get(v.id)||0)>0);
  let achou=buscar(abertas,txt,rotuloVenda,"comprador"); if(!achou.length)achou=buscar(vendas,txt,rotuloVenda,"comprador");
  if(!achou.length){el.innerHTML=`<p class="note prej">Nenhum contrato de venda com "${esc(txt)}". Lance a venda na aba Vendas.</p>`;return;}
  if(achou.length===1)return vnCarregarVenda(achou[0].id);
  escolha(el,achou,rotuloVenda,vnCarregarVenda);
}
function vnAdicionarCompra(id,silencioso){
  const c=compras.find(x=>x.id===id), v=vendas.find(x=>x.id===vn.venda); if(!c||!v)return;
  if(c.produto!==v.produto){toast(`A compra ${c.numero||""} é de ${PNAME[c.produto]} e a venda é de ${PNAME[v.produto]}.`);return;}
  if(vn.linhas.some(l=>l.compraId===id)){if(!silencioso)toast("Essa compra já está na lista.");return;}
  const disp=vnDisponivelCompra(id), restante=(v.volumeKg||0)-vn.linhas.reduce((s,l)=>s+(l.volumeKg||0),0);
  if(disp<=0){toast("Essa compra não tem saldo para vincular.");return;}
  vn.linhas.push({id:null,compraId:id,volumeKg:Math.max(Math.min(disp,restante>0?restante:disp),0)||disp,fretePrev:null,freteReal:null});
  $("#vnCompraBusca").value=""; $("#vnEscolhaCompra").innerHTML=""; vnAtualizar();
  const inp=[...document.querySelectorAll("#vnCompras .vnKg")].pop(); if(inp&&!silencioso){inp.focus();inp.select();}
}
function vnPuxarCompra(){
  const v=vendas.find(x=>x.id===vn.venda); if(!v)return;
  const txt=$("#vnCompraBusca").value, el=$("#vnEscolhaCompra");
  const mesmas=compras.filter(c=>c.produto===v.produto&&!vn.linhas.some(l=>l.compraId===c.id));
  let achou=buscar(mesmas.filter(c=>vnDisponivelCompra(c.id)>0),txt,rotuloCompra,"produtor");
  if(!achou.length){const outras=buscar(compras,txt,rotuloCompra,"produtor");
    el.innerHTML=`<p class="note prej">${outras.length?`Achei ${outras.length} compra(s) com "${esc(txt)}", mas sem saldo ou de outro produto (a venda é de ${PNAME[v.produto]}).`:`Nenhum contrato de compra com "${esc(txt)}". Lance a compra na aba Compras.`}</p>`;return;}
  if(achou.length===1)return vnAdicionarCompra(achou[0].id);
  escolha(el,achou,rotuloCompra,vnAdicionarCompra);
}
function vnAtualizar(){
  const v=vn.venda&&vendas.find(x=>x.id===vn.venda);
  $("#vnVenda").hidden=!v; $("#vnCardCompras").hidden=!v; $("#vnCardPrevia").hidden=!v; $("#vnAcoes").hidden=!v;
  renderDatalists();
  if(!v)return;
  const sv=saldoVenda.get(v.id)||0;
  $("#vnVenda").innerHTML=[["Produto",prodTag(v.produto)],["Nº contrato",esc(v.numero||"s/ nº")],["Data",D(v.data)||"-"],["Comprador",esc(v.comprador)],["Cidade de entrega",esc(v.cidade||"-")],
    ["Volume",`${N0(v.volumeKg)} kg · ${N2(sc(v.volumeKg,v.produto))} sc`],["Preço",isN(v.preco)?R(v.preco):'<span class="fx">A FIXAR</span>'],["Saldo hoje",`${N2(sc(sv,v.produto))} sc`]]
    .map(([k,x])=>`<div><div class="k">${k}</div><div class="v">${x}</div></div>`).join("");
  const tb=$("#vnCompras");
  tb.innerHTML=vn.linhas.length?vn.linhas.map((l,i)=>{const c=compras.find(x=>x.id===l.compraId)||{};const disp=vnDisponivelCompra(l.compraId);const passa=(l.volumeKg||0)>disp+0.0005;
    return `<tr data-i="${i}"><td><b>${esc(c.numero||"s/ nº")}</b></td><td>${esc(c.produtor)}</td><td>${esc(c.cidade||"-")}</td><td class="mono">${isN(c.preco)?R(c.preco):'<span class="fx">A FIXAR</span>'}</td>`+
      `<td class="mono ${passa?"prej":""}">${N0(disp)} kg${passa?" ⚠":""}</td>`+
      `<td><input type="text" class="vnKg" inputmode="decimal" value="${esc(toBR(l.volumeKg,0))}"></td><td class="mono note">${N2(sc(l.volumeKg||0,v.produto))}</td>`+
      `<td><input type="text" class="vnFrete" inputmode="decimal" placeholder="0,00" value="${esc(toBR(l.fretePrev,2))}"></td>`+
      `<td><button type="button" class="btn sm danger vnDel" title="Tirar desta vinculação">✕</button></td></tr>`;}).join("")
    :`<tr><td colspan="9" class="note" style="padding:12px">Nenhuma compra ainda. Digite o nº do contrato de compra acima e clique em Puxar.</td></tr>`;
  vnSaldoEPrevia();
}
function vnSaldoEPrevia(){
  const v=vendas.find(x=>x.id===vn.venda); if(!v)return;
  const usado=vn.linhas.reduce((s,l)=>s+(l.volumeKg||0),0), resto=(v.volumeKg||0)-usado, el=$("#vnSaldo");
  el.textContent=`${f0.format(resto)} kg (${N2(sc(resto,v.produto))} sc)`+(resto<0?" · passa do volume da venda":resto>0?" · continua na aba Vendas com esse saldo":" · venda totalmente vinculada");
  el.style.color=resto<0?"var(--prej)":resto>0?"var(--warn)":"var(--lucro)";
  const c={...v,vendedores:vn.linhas.map(l=>{const cp=compras.find(x=>x.id===l.compraId)||{};return {id:l.id,nome:cp.produtor,cidade:cp.cidade,volumeKg:l.volumeKg||0,preco:isN(cp.preco)?cp.preco:null,fretePrev:l.fretePrev,freteReal:l.freteReal};})};
  const k=calc(c), r=k.r;
  let h=`<thead><tr>${["TIPO","EMPRESA / PRODUTOR","VOLUME (sc)","PREÇO (R$/sc)","VALOR TOTAL (R$)","DIFERENÇA (R$/sc)","FRETE (R$/sc)","RESULTADO (R$/sc)","LUCRO PREVISTO (R$)","CRÉDITO PRESUMIDO (R$)","RESULTADO + CRÉDITO (R$/sc)"].map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
  h+=`<tr class="buyer"><td>COMPRADOR</td><td>${esc(v.comprador)}</td><td class="n">${N2(k.bSc)}</td>${cN(k.Pb,R,1)}${cN(k.bValor,R,1)}<td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
  k.vs.forEach(x=>h+=`<tr><td>VENDEDOR</td><td>${esc(x.v.nome)}${x.v.cidade?` <span class="note">· ${esc(x.v.cidade)}</span>`:""}</td><td class="n">${N2(x.sc)}</td>${cN(x.P,R,1)}${cN(x.valor,R,1)}${cN(x.dif,R,1)}<td class="n">${x.fp?R(x.fp):"-"}</td>${cN(x.res,R,1)}${mv(x.resTot,1)}${cN(x.cred,R,1)}${cN(x.resCred,R,1)}</tr>`);
  h+=`<tr class="resumo"><td>RESUMO</td><td>${k.vs.length} compra(s)</td><td class="n">${N2(r.scT)}</td>${cN(r.precoM,R,1)}${cN(r.valorT,R,1)}${cN(r.difM,R,1)}<td class="n">${r.freteM?R(r.freteM):"-"}</td>${cN(r.resM,R,1)}${mv(r.resTotT,1)}${cN(r.credT,R,1)}${cN(r.resCredM,R,1)}</tr></tbody>`;
  $("#preview").innerHTML=h;
}
async function vnSalvar(){
  const v=vendas.find(x=>x.id===vn.venda), msg=$("#vnMsg"); if(!v)return;
  const erros=[];
  vn.linhas.forEach((l,i)=>{const c=compras.find(x=>x.id===l.compraId)||{};
    if(!isN(l.volumeKg)||l.volumeKg<=0)erros.push(`compra ${c.numero||i+1}: volume inválido`);
    else if(l.volumeKg>vnDisponivelCompra(l.compraId)+0.0005)erros.push(`compra ${c.numero||i+1}: passa do saldo (${f0.format(vnDisponivelCompra(l.compraId))} kg)`);
    if(Number.isNaN(l.fretePrev))erros.push(`compra ${c.numero||i+1}: frete inválido`);});
  const usado=vn.linhas.reduce((s,l)=>s+(l.volumeKg||0),0);
  if(usado>(v.volumeKg||0)+0.0005)erros.push(`a soma (${f0.format(usado)} kg) passa do volume da venda (${f0.format(v.volumeKg)} kg)`);
  if(erros.length){msg.innerHTML=`<span class="prej">${esc(erros.join(" · "))}</span>`;return;}
  const tinha=vinculos.some(l=>l.vendaId===v.id);
  if(!vn.linhas.length){ if(!tinha){msg.innerHTML='<span class="prej">Puxe pelo menos um contrato de compra.</span>';return;}
    const ok=await dialogo({titulo:"Desvincular tudo?",html:"Você tirou todas as compras. A venda e as compras voltam para as abas Vendas e Compras.",ok:"Desvincular",perigo:true}); if(!ok)return; }
  const b=$("#vnSalvar"); b.disabled=true; msg.textContent="Salvando…";
  const n=vn.linhas.length;
  try{ await api.salvarVinculos(v.id,vn.linhas); await recarregar(); vnLimpar(); show(n?"contratos":"vendas"); toast(n?"Vinculação salva.":"Contratos desvinculados."); }
  catch(e){ msg.innerHTML=`<span class="prej">${esc(e.message)}</span>`; }
  finally{ b.disabled=false; }
}

/* eventos das novas abas */
document.querySelectorAll(".fprod").forEach(seg=>seg.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const alvo=seg.dataset.alvo;fProdLista[alvo]=b.dataset.p;[...seg.children].forEach(x=>x.classList.toggle("on",x===b));renderLista(alvo);}));
["#fBuscaCompras","#todasCompras"].forEach(s=>$(s).addEventListener("input",renderCompras));
["#fBuscaVendas","#todasVendas"].forEach(s=>$(s).addEventListener("input",renderVendas));
$("#formCompra").addEventListener("submit",e=>{e.preventDefault();salvarForm("compras");});
$("#formVenda").addEventListener("submit",e=>{e.preventDefault();salvarForm("vendas");});
$("#cpCancelar").addEventListener("click",()=>limparForm("compras")); $("#vdCancelar").addEventListener("click",()=>limparForm("vendas"));
[["#tblCompras","compras"],["#tblVendas","vendas"]].forEach(([sel,tipo])=>$(sel).addEventListener("click",e=>{
  const ed=e.target.closest("[data-leditar]"), ex=e.target.closest("[data-lexcluir]"), vi=e.target.closest("[data-lvincular]");
  if(ed)editarForm(tipo,ed.dataset.leditar);
  if(ex)excluirDaLista(tipo,ex.dataset.lexcluir);
  if(vi){ if(tipo==="vendas"){vnLimpar();vnCarregarVenda(vi.dataset.lvincular);}
    else{ vnLimpar(); vn.compraPendente=vi.dataset.lvincular; const c=compras.find(x=>x.id===vn.compraPendente);
      $("#vnEscolhaVenda").innerHTML=`<p class="note">Agora puxe a venda para vincular a compra <b>${esc(c.numero||"s/ nº")}</b> (${esc(c.produtor)}, ${PNAME[c.produto]}).</p>`; }
    show("vincular"); if(!vn.venda)setTimeout(()=>$("#vnVendaBusca").focus(),50); }
}));
$("#vnPuxarVenda").addEventListener("click",vnPuxarVenda);
$("#vnVendaBusca").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();vnPuxarVenda();}});
$("#vnVendaBusca").addEventListener("change",()=>{const v=vendas.find(x=>rotuloVenda(x)===$("#vnVendaBusca").value);if(v)vnCarregarVenda(v.id);});
$("#vnTrocarVenda").addEventListener("click",vnLimpar);
$("#vnPuxarCompra").addEventListener("click",vnPuxarCompra);
$("#vnCompraBusca").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();vnPuxarCompra();}});
$("#vnCompraBusca").addEventListener("change",()=>{const c=compras.find(x=>rotuloCompra(x)===$("#vnCompraBusca").value);if(c)vnAdicionarCompra(c.id);});
$("#vnCompras").addEventListener("input",e=>{const tr=e.target.closest("tr[data-i]");if(!tr)return;const l=vn.linhas[+tr.dataset.i];
  if(e.target.classList.contains("vnKg")){l.volumeKg=parseBR(e.target.value);tr.children[6].textContent=isN(l.volumeKg)?N2(sc(l.volumeKg,vendas.find(x=>x.id===vn.venda).produto)):"";}
  if(e.target.classList.contains("vnFrete"))l.fretePrev=parseBR(e.target.value);
  vnSaldoEPrevia();});
$("#vnCompras").addEventListener("change",e=>{if(e.target.classList.contains("vnKg"))setTimeout(vnAtualizar,0);});
$("#vnCompras").addEventListener("click",e=>{const b=e.target.closest(".vnDel");if(!b)return;vn.linhas.splice(+b.closest("tr").dataset.i,1);vnAtualizar();});
$("#vnSalvar").addEventListener("click",vnSalvar);
$("#vnCancelar").addEventListener("click",()=>{vnLimpar();show("contratos");});
limparForm("compras"); limparForm("vendas");

/* ---------------- parâmetros ---------------- */
function renderParams(){
  $("#paramTbl tbody").innerHTML=PRODS.map(p=>`<tr><td>${prodTag(p)}</td><td><input type="text" data-k="${p}" class="pKg"${ehAdmin()?"":" disabled"} value="${toBR(kgS(p),0)}" style="width:100px"></td><td><input type="text" data-k="${p}" class="pCr"${ehAdmin()?"":" disabled"} value="${toBR(crd(p)*100,2)}" style="width:100px"></td></tr>`).join("");
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
function show(v){
  if(v==="vincular"&&!podeEditar())v="contratos";
  document.querySelectorAll(".view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));[...$("#nav").children].forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  $("#posicao").hidden=!["contratos","compras","vendas"].includes(v);
  if(v==="param")renderParams(); if(v==="usuarios")carregarUsuarios();
  if(v==="contratos"){renderKpis();renderTable();} if(v==="compras")renderCompras(); if(v==="vendas")renderVendas();
  window.scrollTo(0,0);}
function renderAll(){renderPosicao();renderKpis();renderTable();renderCompras();renderVendas();renderDatalists();
  if($("#v-vincular").classList.contains("on"))vnAtualizar();}

$("#nav").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.v==="vincular"&&!vn.venda)vnLimpar();show(b.dataset.v);});
$("#fProd").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;fProd=b.dataset.p;[...$("#fProd").children].forEach(x=>x.classList.toggle("on",x===b));renderKpis();renderTable();});
$("#fStatus").addEventListener("change",renderTable); $("#fBusca").addEventListener("input",renderTable);
$("#btnCopy").addEventListener("click",copyTable);
$("#tbl").addEventListener("click",e=>{
  const ed=e.target.closest("[data-edit]"), dl=e.target.closest("[data-del]");
  if(ed){vnCarregarVenda(ed.dataset.edit);show("vincular");}
  if(dl){const c=contratos.find(x=>x.id===dl.dataset.del);if(!c)return;
    dialogo({titulo:"Desvincular contrato?",html:`A venda <b>${esc(c.numero||"s/ nº")}</b> (${esc(c.comprador)}) e as ${c.vendedores.length} compra(s) vinculadas a ela voltam para as abas <b>Vendas</b> e <b>Compras</b>. Nenhum contrato é apagado.${c.vendedores.some(v=>v.freteReal!=null)?"<br><br><b>Atenção:</b> os fretes realizados lançados nesses vínculos serão perdidos.":""}`,ok:"Desvincular",perigo:true})
      .then(async ok=>{ if(!ok)return; try{await api.salvarVinculos(c.id,[]); await recarregar(); toast("Contratos desvinculados.");}catch(e){toast(e.message);} });}
});
$("#tbl").addEventListener("change",e=>{if(e.target.classList.contains("frIn"))saveFreteInline(e.target);});
$("#tbl").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.classList.contains("frIn")){e.preventDefault();saveFreteInline(e.target);
  const all=[...$("#tbl").querySelectorAll("input.frIn")],i=all.indexOf(e.target);if(all[i+1])all[i+1].focus();}});
$("#mNo").addEventListener("click",()=>$("#modal").classList.remove("on"));
$("#btnParam").addEventListener("click",saveParams);

/* ---------------- dados e login ---------------- */
async function recarregar(){
  const [ps,dados]=await Promise.all([api.carregarParametros(),api.carregarTudo()]);
  params=ps; vendas=dados.vendas; compras=dados.compras; vinculos=dados.vinculos; montar(); loaded=true; renderAll();
  if($("#v-param").classList.contains("on"))renderParams();
}
function aplicarPerfil(){
  document.body.classList.remove("perfil-admin","perfil-comercial","perfil-consulta");
  if(perfil)document.body.classList.add("perfil-"+perfil);
  const t=$("#userPerfil"); t.textContent=perfil?api.NOME_PERFIL[perfil]:""; t.className="tag perfil-tag "+(perfil||"");
  const ativo=document.querySelector("#nav button.on");
  if(ativo&&getComputedStyle(ativo).display==="none")show("contratos");
}
let sessaoUserId=null;
async function iniciarSessao(sessao){
  usuario=sessao?sessao.user:null;
  if(!usuario){ sessaoUserId=null; perfil=null; aplicarPerfil(); $("#login").hidden=false; $("#userBox").hidden=true; if(pararTempoReal){pararTempoReal();pararTempoReal=null;} contratos=[]; vendas=[]; compras=[]; vinculos=[]; loaded=false; renderAll(); return; }
  if(sessaoUserId===usuario.id)return;          // só renovação de sessão
  sessaoUserId=usuario.id;
  let p=null;
  try{ p=await api.meuPerfil(usuario.id); }catch(e){ p=null; }
  if(!p||!p.ativo){
    await api.sair();
    const msg=$("#loginMsg"); msg.className="note err";
    msg.textContent=p?"Seu usuário está inativo. Fale com o administrador.":"Seu usuário ainda não tem perfil de acesso. Fale com o administrador.";
    return;
  }
  perfil=p.perfil; aplicarPerfil();
  $("#login").hidden=true; $("#userBox").hidden=false; $("#userEmail").textContent=p.nome||usuario.email||"";
  banner("");
  try{ await recarregar(); }
  catch(e){ loaded=true; banner(esc(e.message||"Não foi possível carregar os contratos.")); renderAll(); }
  if(!pararTempoReal) pararTempoReal=api.acompanharMudancas(()=>recarregar().catch(()=>{}));
}

/* ---------------- diálogo genérico ---------------- */
function dialogo({titulo,html,ok="Salvar",perigo=false,validar}){
  return new Promise(res=>{
    $("#mTitle").textContent=titulo; $("#mText").innerHTML=html;
    const yes=$("#mYes"), no=$("#mNo"), txt=yes.textContent;
    yes.textContent=ok; yes.classList.toggle("danger",perigo); yes.classList.toggle("pri",!perigo);
    $("#modal").classList.add("on");
    const primeiro=$("#mText").querySelector("input"); if(primeiro)setTimeout(()=>primeiro.focus(),50);
    const fim=v=>{$("#modal").classList.remove("on");yes.textContent=txt;yes.classList.add("danger");yes.classList.remove("pri");yes.onclick=null;no.onclick=null;res(v);};
    yes.onclick=()=>{ const r=validar?validar():true; if(r===false)return; fim(r); };
    no.onclick=()=>fim(null);
  });
}
const campoSenha=(id,ph)=>`<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="${id}" placeholder="${ph}" autocomplete="new-password" style="flex:1;font:inherit;padding:8px;border:1px solid var(--line);border-radius:7px"><button type="button" class="btn sm" onclick="document.getElementById('${id}').value=window.__gerarSenha()">Gerar</button></div>`;
function gerarSenha(){
  const A="ABCDEFGHJKLMNPQRSTUVWXYZ", a="abcdefghijkmnopqrstuvwxyz", n="23456789", e="@#$%&*!";
  const todos=A+a+n+e, r=new Uint32Array(12); crypto.getRandomValues(r);
  let s=A[r[0]%A.length]+a[r[1]%a.length]+n[r[2]%n.length]+e[r[3]%e.length];
  for(let i=4;i<12;i++)s+=todos[r[i]%todos.length];
  return s.split("").sort(()=>Math.random()-.5).join("");
}
window.__gerarSenha=gerarSenha;
function pedirNovaSenha(titulo="Definir nova senha"){
  return dialogo({titulo,html:campoSenha("novaSenha","nova senha (mín. 8 caracteres)")+`<p class="note" style="margin:8px 0 0">Anote a senha antes de salvar.</p>`,ok:"Salvar",
    validar:()=>{const v=$("#novaSenha").value; if(v.length<8){toast("A senha precisa ter pelo menos 8 caracteres.");return false;} return v;}});
}

/* ---------------- usuários (admin) ---------------- */
const fmtDataHora=s=>{ if(!s)return"nunca"; const d=new Date(s); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); };
async function carregarUsuarios(){
  if(!ehAdmin())return;
  const t=$("#tblUsuarios"); t.innerHTML=`<tr><td class="empty">Carregando…</td></tr>`;
  try{ usuarios=(await api.adminUsuarios("listar")).usuarios||[]; renderUsuarios(); }
  catch(e){ t.innerHTML=`<tr><td class="empty prej">${esc(e.message)}</td></tr>`; }
}
function renderUsuarios(){
  const t=$("#tblUsuarios");
  if(!usuarios.length){t.innerHTML=`<tr><td class="empty">Nenhum usuário.</td></tr>`;return;}
  t.innerHTML=`<thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>`+
    usuarios.map(u=>`<tr data-uid="${esc(u.user_id)}">
      <td><b>${esc(u.nome||"—")}</b>${u.sou_eu?' <span class="tag pill-l">você</span>':""}</td>
      <td>${esc(u.email)}</td>
      <td><select class="uPerfilSel"${u.sou_eu?" disabled title=\"Você não pode mudar o seu próprio perfil\"":""}>
        ${["admin","comercial","consulta"].map(p=>`<option value="${p}"${u.perfil===p?" selected":""}>${api.NOME_PERFIL[p]}</option>`).join("")}
        ${u.perfil?"":`<option value="" selected>sem perfil</option>`}</select></td>
      <td>${u.ativo?'<span class="st-on">Ativo</span>':'<span class="st-off">Inativo</span>'}</td>
      <td class="note">${fmtDataHora(u.ultimo_acesso)}</td>
      <td><div class="actions">
        <button class="btn sm" data-ua="nome">Renomear</button>
        <button class="btn sm" data-ua="senha">Redefinir senha</button>
        <button class="btn sm" data-ua="link">Enviar link por e-mail</button>
        ${u.sou_eu?"":`<button class="btn sm" data-ua="ativo">${u.ativo?"Desativar":"Reativar"}</button><button class="btn sm danger" data-ua="excluir">Excluir</button>`}
      </div></td></tr>`).join("")+"</tbody>";
}
async function acaoUsuario(fn,okMsg){
  try{ await fn(); toast(okMsg); await carregarUsuarios(); }
  catch(e){ toast(e.message); await carregarUsuarios(); }
}
$("#tblUsuarios").addEventListener("change",e=>{
  const sel=e.target.closest(".uPerfilSel"); if(!sel||!sel.value)return;
  const u=usuarios.find(x=>x.user_id===sel.closest("tr").dataset.uid);
  acaoUsuario(()=>api.adminUsuarios("atualizar",{user_id:u.user_id,perfil:sel.value}),`Perfil de ${u.nome||u.email} alterado para ${api.NOME_PERFIL[sel.value]}.`);
});
$("#tblUsuarios").addEventListener("click",async e=>{
  const b=e.target.closest("[data-ua]"); if(!b)return;
  const u=usuarios.find(x=>x.user_id===b.closest("tr").dataset.uid); if(!u)return; const quem=esc(u.nome||u.email);
  const a=b.dataset.ua;
  if(a==="nome"){
    const v=await dialogo({titulo:"Renomear usuário",html:`<input type="text" id="novoNome" value="${esc(u.nome)}" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:7px">`,validar:()=>$("#novoNome").value.trim()||false});
    if(v)acaoUsuario(()=>api.adminUsuarios("atualizar",{user_id:u.user_id,nome:v}),"Nome alterado.");
  }
  if(a==="senha"){
    const v=await pedirNovaSenha(`Nova senha para ${u.nome||u.email}`);
    if(v)acaoUsuario(()=>api.adminUsuarios("redefinir_senha",{user_id:u.user_id,senha:v}),"Senha redefinida. Passe a nova senha para a pessoa.");
  }
  if(a==="link"){
    const ok=await dialogo({titulo:"Enviar link de redefinição",html:`Será enviado para <b>${esc(u.email)}</b> um e-mail com um link para a pessoa criar uma nova senha.`,ok:"Enviar"});
    if(ok)acaoUsuario(()=>api.adminUsuarios("enviar_link",{email:u.email,redirect_to:location.origin+location.pathname}),"E-mail enviado.");
  }
  if(a==="ativo"){
    const ok=await dialogo({titulo:u.ativo?"Desativar usuário?":"Reativar usuário?",html:u.ativo?`${quem} não conseguirá mais entrar no sistema. Os lançamentos feitos por ele continuam.`:`${quem} voltará a entrar com o mesmo perfil.`,ok:u.ativo?"Desativar":"Reativar",perigo:u.ativo});
    if(ok)acaoUsuario(()=>api.adminUsuarios("atualizar",{user_id:u.user_id,ativo:!u.ativo}),u.ativo?"Usuário desativado.":"Usuário reativado.");
  }
  if(a==="excluir"){
    const ok=await dialogo({titulo:"Excluir usuário?",html:`${quem} (${esc(u.email)}) será apagado de vez. Se for só para bloquear o acesso, prefira <b>Desativar</b>.`,ok:"Excluir",perigo:true});
    if(ok)acaoUsuario(()=>api.adminUsuarios("excluir",{user_id:u.user_id}),"Usuário excluído.");
  }
});
$("#uGerar").addEventListener("click",()=>{$("#uSenha").value=gerarSenha();});
$("#uAtualizar").addEventListener("click",carregarUsuarios);
$("#formUsuario").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=$("#uMsg"), b=$("#uCriar");
  const dados={nome:$("#uNome").value.trim(),email:$("#uEmail").value.trim(),senha:$("#uSenha").value,perfil:$("#uPerfil").value};
  if(dados.senha.length<8){msg.innerHTML='<span class="prej">A senha precisa ter pelo menos 8 caracteres.</span>';return;}
  b.disabled=true; msg.textContent="Criando…";
  try{ await api.adminUsuarios("criar",dados);
    msg.innerHTML=`<span class="lucro">Usuário criado: ${esc(dados.email)} · senha <b>${esc(dados.senha)}</b> (anote!)</span>`;
    $("#formUsuario").reset(); $("#uPerfil").value="comercial"; await carregarUsuarios(); }
  catch(err){ msg.innerHTML=`<span class="prej">${esc(err.message)}</span>`; }
  finally{ b.disabled=false; }
});
$("#btnMinhaSenha").addEventListener("click",async()=>{
  const v=await pedirNovaSenha("Trocar minha senha");
  if(v){ try{await api.definirNovaSenha(v);toast("Sua senha foi alterada.");}catch(e){toast(e.message);} }
});

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

vnLimpar(); renderAll();

if(!api.configurado){
  loaded=true; renderAll();
  banner("Supabase ainda não configurado: preencha <b>js/config.js</b> com a URL e a chave anon do projeto (veja o README).");
}else{
  let recuperacao=location.hash.includes("type=recovery");
  api.aoMudarSessao((sessao,evento)=>{
    if(evento==="PASSWORD_RECOVERY")recuperacao=true;
    // não chamar o Supabase direto dentro deste aviso (evita travar a sessão)
    setTimeout(async()=>{
      if(recuperacao&&sessao){
        recuperacao=false; history.replaceState(null,"",location.pathname);
        const nova=await pedirNovaSenha("Crie sua nova senha"); if(nova){ try{await api.definirNovaSenha(nova);toast("Senha alterada.");}catch(e){toast(e.message);} }
      }
      iniciarSessao(sessao);
    },0);
  });
}

