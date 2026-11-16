// =====================================================================
//  Regras de cálculo (sem dependência de tela ou banco — testáveis).
//  Mesma lógica da planilha "Vinculações de Contratos Futuros".
// =====================================================================

export const PRODUTOS = ["milho", "soja", "sorgo"];
export const NOME_PRODUTO = { milho: "Milho", soja: "Soja", sorgo: "Sorgo" };

export function parametrosPadrao() {
  return {
    kgSaca: { milho: 60, soja: 60, sorgo: 60 },
    credito: { milho: 0.024, soja: 0.024, sorgo: 0.024 },
  };
}

export const isN = (v) => typeof v === "number" && isFinite(v);

export const kgSaca = (params, produto) =>
  (params && params.kgSaca && params.kgSaca[produto]) || 60;

export const creditoPresumido = (params, produto) =>
  params && params.credito && isN(params.credito[produto]) ? params.credito[produto] : 0.024;

/**
 * Lê número digitado no padrão brasileiro.
 * "1.234,56" → 1234.56 · "120.000" → 120000 · "12,5" → 12.5 · "" → null · "abc" → NaN
 */
export function parseBR(s) {
  if (s == null) return null;
  s = String(s).replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

/**
 * Calcula um contrato (comprador + vendedores).
 * Contrato no formato da tela:
 *   { produto, volumeKg, preco|null, vendedores:[{volumeKg, preco|null, fretePrev|null, freteReal|null, ...}] }
 *
 * Por vendedor:
 *   sacas            = kg ÷ kg por saca
 *   diferença        = preço comprador − preço vendedor
 *   lucro previsto   = (diferença − frete previsto)  × sacas
 *   lucro realizado  = (diferença − frete realizado) × sacas
 *   crédito          = sacas × preço vendedor × % crédito
 *   frete prev − real= (frete previsto − frete realizado) × sacas
 */
export function calcularContrato(c, params) {
  const kg = kgSaca(params, c.produto);
  const cr = creditoPresumido(params, c.produto);
  const Pb = isN(c.preco) ? c.preco : null;

  const vs = (c.vendedores || []).map((v) => {
    const sc = (v.volumeKg || 0) / kg;
    const P = isN(v.preco) ? v.preco : null;
    const valor = P != null ? sc * P : null;
    const dif = P != null && Pb != null ? Pb - P : null;
    const fp = isN(v.fretePrev) ? v.fretePrev : 0;
    const res = dif != null ? dif - fp : null;
    const resTot = res != null ? res * sc : null;
    const cred = valor != null ? valor * cr : null;
    const resCred = res != null && sc ? res + cred / sc : null;
    const fr = isN(v.freteReal) ? v.freteReal : null;
    const resReal = dif != null && fr != null ? dif - fr : null;
    const resRealTot = resReal != null ? resReal * sc : null;
    const final = resRealTot != null ? resRealTot + (cred || 0) : null;
    const desvio = fr != null ? (fp - fr) * sc : null;
    const fretePrevTot = fp * sc;
    const freteRealTot = fr != null ? fr * sc : null;
    return { v, sc, P, valor, dif, fp, res, resTot, cred, resCred, fr, resReal, resRealTot, final, desvio, fretePrevTot, freteRealTot };
  });

  const sum = (a, k) => a.reduce((s, x) => s + (isN(x[k]) ? x[k] : 0), 0);
  const any = (a, k) => a.some((x) => isN(x[k]));

  const kgT = vs.reduce((s, x) => s + (x.v.volumeKg || 0), 0);
  const scT = sum(vs, "sc");
  const scPriced = vs.filter((x) => x.P != null).reduce((s, x) => s + x.sc, 0);
  const valorT = any(vs, "valor") ? sum(vs, "valor") : null;
  const precoM = valorT != null && scPriced ? valorT / scPriced : null;
  const difM = precoM != null && Pb != null ? Pb - precoM : null;
  const freteM = scT ? vs.reduce((s, x) => s + x.fp * x.sc, 0) / scT : 0;
  const resM = difM != null ? difM - freteM : null;
  const resTotT = any(vs, "resTot") ? sum(vs, "resTot") : null;
  const credT = any(vs, "cred") ? sum(vs, "cred") : null;
  const resCredM = resM != null && scT ? resM + (credT || 0) / scT : null;

  const comFr = vs.filter((x) => x.fr != null);
  const nReal = comFr.length;
  const scReal = comFr.reduce((s, x) => s + x.sc, 0);
  const freteRealM = scReal ? comFr.reduce((s, x) => s + x.fr * x.sc, 0) / scReal : null;
  const resRealTotT = any(vs, "resRealTot") ? sum(vs, "resRealTot") : null;
  const finalT = any(vs, "final") ? sum(vs, "final") : null;
  const fretePrevTot = nReal ? comFr.reduce((s, x) => s + x.fp * x.sc, 0) : null;
  const freteRealTot = nReal ? comFr.reduce((s, x) => s + x.fr * x.sc, 0) : null;
  const desvioT = nReal ? fretePrevTot - freteRealTot : null;

  return {
    kg, cr, Pb,
    bSc: (c.volumeKg || 0) / kg,
    bValor: Pb != null ? ((c.volumeKg || 0) / kg) * Pb : null,
    vs,
    r: { kgT, scT, valorT, precoM, difM, freteM, resM, resTotT, credT, resCredM, nReal, freteRealM, resRealTotT, finalT, fretePrevTot, freteRealTot, desvioT },
    saldoKg: (c.volumeKg || 0) - kgT,
  };
}

// =====================================================================
//  Compras, vendas e vínculos independentes
// =====================================================================

/** Quanto (kg) já está vinculado de cada venda e de cada compra. */
export function vinculadoPorContrato(vinculos) {
  const venda = new Map(), compra = new Map();
  for (const l of vinculos) {
    venda.set(l.vendaId, (venda.get(l.vendaId) || 0) + (l.volumeKg || 0));
    compra.set(l.compraId, (compra.get(l.compraId) || 0) + (l.volumeKg || 0));
  }
  return { venda, compra };
}

/**
 * Monta, para cada venda que tem vínculo, o objeto no formato da tabela
 * de contratos: { ...venda, vendedores: [{ id(vínculo), compraId, nome, numero, data, cidade,
 * volumeKg(do vínculo), preco(da compra), fretePrev, freteReal }] }
 */
export function montarContratosVinculados(vendas, compras, vinculos) {
  const porCompra = new Map(compras.map((c) => [c.id, c]));
  const porVenda = new Map();
  for (const l of vinculos) {
    if (!porVenda.has(l.vendaId)) porVenda.set(l.vendaId, []);
    porVenda.get(l.vendaId).push(l);
  }
  return vendas
    .filter((v) => porVenda.has(v.id))
    .map((v) => ({
      ...v,
      vendedores: porVenda
        .get(v.id)
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((l) => {
          const c = porCompra.get(l.compraId) || {};
          return {
            id: l.id, compraId: l.compraId, nome: c.produtor || "?", numero: c.numero || "", data: c.data || "",
            cidade: c.cidade || "", volumeKg: l.volumeKg, preco: isN(c.preco) ? c.preco : null,
            fretePrev: l.fretePrev, freteReal: l.freteReal,
          };
        }),
    }));
}

/**
 * Posição por produto, em sacas:
 *   comprado            = soma dos contratos de compra
 *   vendido             = soma dos contratos de venda
 *   compradoSemVenda    = soma dos saldos (não vinculados) das compras
 *   vendidoSemCompra    = soma dos saldos (não vinculados) das vendas
 *   excesso             = kg vinculados além do volume do contrato (dado a corrigir)
 */
export function calcularPosicao(vendas, compras, vinculos, params) {
  const { venda: vVenda, compra: vCompra } = vinculadoPorContrato(vinculos);
  const linhas = {};
  for (const p of PRODUTOS) linhas[p] = { comprado: 0, vendido: 0, compradoSemVenda: 0, vendidoSemCompra: 0, nCompras: 0, nVendas: 0, excesso: 0 };
  for (const c of compras) {
    const L = linhas[c.produto]; if (!L) continue;
    const kg = kgSaca(params, c.produto), saldo = (c.volumeKg || 0) - (vCompra.get(c.id) || 0);
    L.comprado += (c.volumeKg || 0) / kg;
    if (saldo > 0) { L.compradoSemVenda += saldo / kg; L.nCompras++; } else if (saldo < 0) L.excesso += -saldo / kg;
  }
  for (const v of vendas) {
    const L = linhas[v.produto]; if (!L) continue;
    const kg = kgSaca(params, v.produto), saldo = (v.volumeKg || 0) - (vVenda.get(v.id) || 0);
    L.vendido += (v.volumeKg || 0) / kg;
    if (saldo > 0) { L.vendidoSemCompra += saldo / kg; L.nVendas++; } else if (saldo < 0) L.excesso += -saldo / kg;
  }
  const total = { comprado: 0, vendido: 0, compradoSemVenda: 0, vendidoSemCompra: 0, nCompras: 0, nVendas: 0, excesso: 0 };
  for (const p of PRODUTOS) for (const k in total) total[k] += linhas[p][k];
  return { porProduto: linhas, total };
}
