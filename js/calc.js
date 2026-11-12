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
