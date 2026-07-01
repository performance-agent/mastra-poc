import assert from "node:assert/strict";
import test from "node:test";
import { runRuleInputNode } from "../src/index.js";

test("puts valid rules in runnableRules", () => {
  const result = runRuleInputNode({
    rules: [
      {
        name: "Trazabilidad del trabajo",
        description: "Evaluar si el trabajo declarado tiene evidencia asociada.",
        valuation: 10,
      },
    ],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.runnableRules.length, 1);
  assert.equal(result.runnableRules[0]?.rule.name, "Trazabilidad del trabajo");
  assert.equal(result.runnableRules[0]?.rule.valuation, 10);
  assert.deepEqual(result.skippedRules, []);
  assert.deepEqual(result.errors, []);
});

test("puts rules without name in skippedRules", () => {
  const rawRule = { valuation: 8 };
  const result = runRuleInputNode({ rules: [rawRule] });

  assert.equal(result.status, "invalid");
  assert.equal(result.runnableRules.length, 0);
  assert.equal(result.skippedRules.length, 1);
  assert.equal(result.skippedRules[0]?.rawRule, rawRule);
  assert.equal(result.skippedRules[0]?.errors[0]?.path, "rules.0.name");
});

test("puts rules with valuation outside 1-10 in skippedRules", () => {
  const result = runRuleInputNode({
    rules: [
      { name: "Participacion relativa", valuation: 0 },
      { name: "Calidad del trabajo", valuation: 11 },
    ],
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.runnableRules.length, 0);
  assert.equal(result.skippedRules.length, 2);
  assert.equal(result.skippedRules[0]?.errors[0]?.path, "rules.0.valuation");
  assert.equal(result.skippedRules[1]?.errors[0]?.path, "rules.1.valuation");
});

test("keeps valid rules runnable and invalid rules skipped in the same batch", () => {
  const result = runRuleInputNode({
    rules: [
      { name: "Eficiencia de campañas", valuation: 9 },
      { name: "", valuation: 7 },
      { name: "Cumplimiento de tiempos", valuation: 6 },
    ],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.runnableRules.length, 2);
  assert.equal(result.skippedRules.length, 1);
  assert.equal(result.skippedRules[0]?.ruleIndex, 1);
});

test("does not treat semantic ambiguity as a rule-input error", () => {
  const result = runRuleInputNode({
    rules: [{ name: "Evaluar rendimiento", valuation: 10 }],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.runnableRules.length, 1);
  assert.deepEqual(result.skippedRules, []);
});

test("rejects input without a non-empty rules array", () => {
  const missingRules = runRuleInputNode({});
  const emptyRules = runRuleInputNode({ rules: [] });

  assert.equal(missingRules.status, "invalid");
  assert.equal(missingRules.errors[0]?.path, "rules");
  assert.equal(emptyRules.status, "invalid");
  assert.equal(emptyRules.errors[0]?.path, "rules");
});

test("trims valid rule strings without mutating the original input", () => {
  const input = {
    rules: [{
      name: "  Participacion relativa  ",
      description: "  Comparar contribucion frente al equipo.  ",
      valuation: 7,
    }],
  };

  const result = runRuleInputNode(input);

  assert.equal(result.runnableRules[0]?.rule.name, "Participacion relativa");
  assert.equal(result.runnableRules[0]?.rule.description, "Comparar contribucion frente al equipo.");
  assert.equal(input.rules[0]?.name, "  Participacion relativa  ");
  assert.equal(input.rules[0]?.description, "  Comparar contribucion frente al equipo.  ");
});
