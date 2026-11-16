// Testes das regras de cálculo. Rodar com:  node --test tests/
// Conferem o sistema contra os totais da planilha original (nomes trocados por códigos;
// volumes e preços são os da planilha).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcularContrato, parametrosPadrao, parseBR } from "../js/calc.js";

const contratos = JSON.parse(readFileSync(new URL("./planilha-original.json", import.meta.url), "utf8"));
const params = parametrosPadrao();
const r2 = (v) => Math.round(v * 100) / 100;

test("totais batem com a planilha (resultado R$ 1.207.449,73 e crédito R$ 307.712,69)", () => {
  let resultado = 0, credito = 0;
  for (const c of contratos) {
    const k = calcularContrato(c, params);
    resultado += k.r.resTotT || 0;
    credito += k.r.credT || 0;
  }
  assert.equal(r2(resultado), 1207449.73);
  assert.equal(r2(credito), 307712.69);
});

test("Contrato 0000520286: frete R$ 10 → resultado R$ 2,74/sc e R$ 5,87/sc com crédito", () => {
  const k = calcularContrato(contratos[0], params);
  assert.equal(r2(k.r.resM), 2.74);
  assert.equal(r2(k.r.resTotT), 5480);
  assert.equal(r2(k.r.resCredM), 5.87);
});

test("Contrato 3697413726: preço a fixar, saldo de 34.200 kg e preço médio R$ 128,15", () => {
  const c = contratos.find((x) => x.numero === "3697413726");
  const k = calcularContrato(c, params);
  assert.equal(k.saldoKg, 34200);
  assert.equal(r2(k.r.precoM), 128.15);
  assert.equal(k.r.resTotT, null);
  assert.equal(r2(k.r.credT), 30264.28);
});

test("frete realizado acima do previsto gera prejuízo no frete", () => {
  const c = structuredClone(contratos[0]);
  c.vendedores[0].freteReal = 12; // previsto 10
  const k = calcularContrato(c, params);
  assert.equal(r2(k.r.desvioT), -4000);          // (10 − 12) × 2.000 sc
  assert.equal(r2(k.r.resRealTotT), 1480);       // (143 − 130,26 − 12) × 2.000
  assert.equal(r2(k.vs[0].final), 1480 + 6252.48);
});

test("parseBR lê números no padrão brasileiro", () => {
  assert.equal(parseBR("1.234,56"), 1234.56);
  assert.equal(parseBR("120.000"), 120000);
  assert.equal(parseBR("R$ 12,5"), 12.5);
  assert.equal(parseBR("130.26"), 130.26);
  assert.equal(parseBR(""), null);
  assert.ok(Number.isNaN(parseBR("abc")));
});

// ---------------------------------------------------------------------
// Compras e vendas independentes
// ---------------------------------------------------------------------
import { calcularPosicao, montarContratosVinculados, vinculadoPorContrato } from "../js/calc.js";

function exemplo() {
  const vendas = [
    { id: "v1", produto: "soja", numero: "V1", comprador: "A", volumeKg: 300000, preco: 150 },
    { id: "v2", produto: "soja", numero: "V2", comprador: "B", volumeKg: 120000, preco: 151 },   // sem compra
    { id: "v3", produto: "milho", numero: "V3", comprador: "C", volumeKg: 60000, preco: 70 },
  ];
  const compras = [
    { id: "c1", produto: "soja", numero: "C1", produtor: "P1", volumeKg: 180000, preco: 130 },
    { id: "c2", produto: "soja", numero: "C2", produtor: "P2", volumeKg: 240000, preco: 131 },  // 120.000 vinculado
    { id: "c3", produto: "milho", numero: "C3", produtor: "P3", volumeKg: 90000, preco: 60 },  // sem venda
  ];
  const vinculos = [
    { id: "l1", vendaId: "v1", compraId: "c1", ordem: 0, volumeKg: 180000, fretePrev: 10, freteReal: null },
    { id: "l2", vendaId: "v1", compraId: "c2", ordem: 1, volumeKg: 120000, fretePrev: 12, freteReal: 13 },
  ];
  return { vendas, compras, vinculos };
}

test("posição por produto: comprado, vendido, sem venda, sem compra", () => {
  const { vendas, compras, vinculos } = exemplo();
  const p = calcularPosicao(vendas, compras, vinculos, params);
  assert.deepEqual(
    [p.porProduto.soja.comprado, p.porProduto.soja.vendido, p.porProduto.soja.compradoSemVenda, p.porProduto.soja.vendidoSemCompra],
    [7000, 7000, 2000, 2000]                        // sc: 420t/60, 420t/60, c2 120t, v2 120t
  );
  assert.deepEqual(
    [p.porProduto.milho.comprado, p.porProduto.milho.vendido, p.porProduto.milho.compradoSemVenda, p.porProduto.milho.vendidoSemCompra],
    [1500, 1000, 1500, 1000]
  );
  assert.equal(p.total.comprado, 8500);
  assert.equal(p.total.compradoSemVenda, 3500);
  assert.equal(p.total.nCompras, 2);
  assert.equal(p.total.excesso, 0);
});

test("vínculo acima do volume aparece como excesso, não como saldo negativo", () => {
  const { vendas, compras, vinculos } = exemplo();
  vinculos.push({ id: "l3", vendaId: "v3", compraId: "c3", volumeKg: 66000 }); // venda v3 tem 60.000
  const p = calcularPosicao(vendas, compras, vinculos, params);
  assert.equal(p.porProduto.milho.vendidoSemCompra, 0);
  assert.equal(p.porProduto.milho.excesso, 100);    // 6.000 kg = 100 sc
});

test("contratos vinculados usam preço da compra e volume do vínculo", () => {
  const { vendas, compras, vinculos } = exemplo();
  const cs = montarContratosVinculados(vendas, compras, vinculos);
  assert.equal(cs.length, 1);
  assert.deepEqual(cs[0].vendedores.map((v) => [v.nome, v.volumeKg, v.preco]), [["P1", 180000, 130], ["P2", 120000, 131]]);
  const k = calcularContrato(cs[0], params);
  assert.equal(k.saldoKg, 0);
  assert.equal(Math.round(k.r.resTotT * 100) / 100, 3000 * 10 + 2000 * 7);   // (150−130−10)×3000 + (150−131−12)×2000
  const vv = vinculadoPorContrato(vinculos);
  assert.equal(vv.compra.get("c2"), 120000);
});
