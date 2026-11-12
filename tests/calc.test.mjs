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
